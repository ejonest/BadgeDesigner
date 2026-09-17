-- Trophy designer: saved-design library, order-item snapshots, and storage buckets.
-- Run in the same Supabase project as SUPABASE_URL (SQL Editor). Safe to re-run.
--
-- update_updated_at_column() already exists from gavel / pen migrations.

CREATE TABLE IF NOT EXISTS public.trophy_designs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  design_id TEXT NOT NULL,
  product_id TEXT NOT NULL DEFAULT '',
  shop_id TEXT NOT NULL,
  user_id TEXT NULL,
  total_price DOUBLE PRECISION NULL,
  design_data JSONB NULL,
  thumbnail_url TEXT NULL,
  full_image_url TEXT NULL,
  uploaded_image_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'saved',
  save_kind TEXT NULL,
  created_at TIMESTAMPTZ NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NULL DEFAULT now(),
  CONSTRAINT trophy_designs_pkey PRIMARY KEY (id),
  CONSTRAINT trophy_designs_save_kind_check CHECK (
    save_kind IS NULL OR save_kind = ANY (ARRAY['autosave', 'manual', 'cart', 'ordered'])
  ),
  CONSTRAINT trophy_designs_status_check CHECK (
    status = ANY (ARRAY['draft', 'saved', 'ordered', 'archived'])
  )
);

ALTER TABLE public.trophy_designs
  ADD COLUMN IF NOT EXISTS product_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS user_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS total_price DOUBLE PRECISION NULL,
  ADD COLUMN IF NOT EXISTS design_data JSONB NULL,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS full_image_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS uploaded_image_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'saved',
  ADD COLUMN IF NOT EXISTS save_kind TEXT NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS trophy_designs_design_id_key
  ON public.trophy_designs (design_id);
CREATE INDEX IF NOT EXISTS idx_trophy_designs_user_shop_updated
  ON public.trophy_designs (user_id, shop_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_trophy_designs_user_shop_save_kind
  ON public.trophy_designs (user_id, shop_id, save_kind);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_trophy_designs_updated_at'
      AND tgrelid = 'public.trophy_designs'::regclass
  ) THEN
    CREATE TRIGGER update_trophy_designs_updated_at
      BEFORE UPDATE ON public.trophy_designs
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.trophy_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  design_id TEXT NOT NULL,
  shopify_order_id TEXT NULL,
  shopify_customer_id TEXT NULL,
  shopify_order_number TEXT NULL,
  shop_id TEXT NULL,
  trophy_id TEXT NULL,
  thumbnail_url TEXT NULL,
  full_image_url TEXT NULL,
  print_svg_url TEXT NULL,
  secondary_svg_url TEXT NULL,
  pdf_url TEXT NULL,
  uploaded_image_url TEXT NULL,
  finish TEXT NULL,
  attachment_method TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  data_json JSONB NULL,
  design_meta JSONB NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  is_qa_test BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NULL DEFAULT now(),
  CONSTRAINT trophy_order_items_pkey PRIMARY KEY (id),
  CONSTRAINT trophy_order_items_status_check CHECK (
    status = ANY (ARRAY['draft', 'in_cart', 'order_placed', 'fulfilled'])
  )
);

ALTER TABLE public.trophy_order_items
  ADD COLUMN IF NOT EXISTS shopify_order_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS shopify_customer_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS shopify_order_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS shop_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS trophy_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS full_image_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS print_svg_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS secondary_svg_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS uploaded_image_url TEXT NULL,
  ADD COLUMN IF NOT EXISTS finish TEXT NULL,
  ADD COLUMN IF NOT EXISTS attachment_method TEXT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS data_json JSONB NULL,
  ADD COLUMN IF NOT EXISTS design_meta JSONB NULL,
  ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_qa_test BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_trophy_order_items_unique
  ON public.trophy_order_items (design_id, trophy_id);
CREATE INDEX IF NOT EXISTS idx_trophy_order_items_design_id
  ON public.trophy_order_items (design_id);
CREATE INDEX IF NOT EXISTS idx_trophy_order_items_shopify_order_id
  ON public.trophy_order_items (shopify_order_id)
  WHERE shopify_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trophy_order_items_status
  ON public.trophy_order_items (status);
CREATE INDEX IF NOT EXISTS idx_trophy_order_items_shop_order
  ON public.trophy_order_items (shop_id, shopify_order_id);
CREATE INDEX IF NOT EXISTS idx_trophy_order_items_is_qa_test
  ON public.trophy_order_items (is_qa_test)
  WHERE is_qa_test = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_trophy_order_items_updated_at'
      AND tgrelid = 'public.trophy_order_items'::regclass
  ) THEN
    CREATE TRIGGER update_trophy_order_items_updated_at
      BEFORE UPDATE ON public.trophy_order_items
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

COMMENT ON TABLE public.trophy_designs IS
  'Trophy designer library / autosave (parallel to gavel_designs).';
COMMENT ON TABLE public.trophy_order_items IS
  'Trophy designer cart and paid-order line snapshots.';
COMMENT ON COLUMN public.trophy_order_items.data_json IS
  'Full trophy designer state for cart edit and the production-order Admin card.';
COMMENT ON COLUMN public.trophy_order_items.print_svg_url IS
  'Print-ready SVG of the engraved plate (text on the plate area).';
COMMENT ON COLUMN public.trophy_order_items.finish IS
  'Award · plate finish label (e.g. Star Trophy · Brushed Gold).';

ALTER TABLE public.trophy_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trophy_order_items ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('trophy-images', 'trophy-images', true),
  ('trophy-pdfs', 'trophy-pdfs', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read trophy images'
  ) THEN
    CREATE POLICY "Public read trophy images"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'trophy-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read trophy pdfs'
  ) THEN
    CREATE POLICY "Public read trophy pdfs"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'trophy-pdfs');
  END IF;
END
$$;
