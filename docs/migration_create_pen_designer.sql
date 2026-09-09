-- Pen designer: saved design library, order-item snapshots, and storage buckets.
-- Run in the Supabase SQL editor after review.

-- This runs in the same Supabase project as the gavel designer, so the shared
-- update_updated_at_column() trigger function already exists.

CREATE TABLE IF NOT EXISTS public.pen_designs (
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
  CONSTRAINT pen_designs_pkey PRIMARY KEY (id),
  CONSTRAINT pen_designs_save_kind_check CHECK (
    save_kind IS NULL OR save_kind = ANY (ARRAY['autosave', 'manual', 'cart', 'ordered'])
  ),
  CONSTRAINT pen_designs_status_check CHECK (
    status = ANY (ARRAY['draft', 'saved', 'ordered', 'archived'])
  )
);

-- CREATE TABLE IF NOT EXISTS does not add columns to an older partial table.
ALTER TABLE public.pen_designs
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

CREATE UNIQUE INDEX IF NOT EXISTS pen_designs_design_id_key
  ON public.pen_designs (design_id);
CREATE INDEX IF NOT EXISTS idx_pen_designs_user_shop_updated
  ON public.pen_designs (user_id, shop_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pen_designs_user_shop_save_kind
  ON public.pen_designs (user_id, shop_id, save_kind);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_pen_designs_updated_at'
      AND tgrelid = 'public.pen_designs'::regclass
  ) THEN
    CREATE TRIGGER update_pen_designs_updated_at
      BEFORE UPDATE ON public.pen_designs
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.pen_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  design_id TEXT NOT NULL,
  shopify_order_id TEXT NULL,
  shopify_customer_id TEXT NULL,
  shopify_order_number TEXT NULL,
  shop_id TEXT NULL,
  pen_id TEXT NULL,
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
  CONSTRAINT pen_order_items_pkey PRIMARY KEY (id),
  CONSTRAINT pen_order_items_status_check CHECK (
    status = ANY (ARRAY['draft', 'in_cart', 'order_placed', 'fulfilled'])
  )
);

-- Bring an older partial table up to the schema expected by the current
-- server. These additions are safe to repeat.
ALTER TABLE public.pen_order_items
  ADD COLUMN IF NOT EXISTS shopify_order_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS shopify_customer_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS shopify_order_number TEXT NULL,
  ADD COLUMN IF NOT EXISTS shop_id TEXT NULL,
  ADD COLUMN IF NOT EXISTS pen_id TEXT NULL,
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

-- A non-partial unique index is required for PostgREST/Supabase upsert with
-- onConflict=design_id,pen_id. PostgreSQL still permits multiple NULL pen_id
-- values, while normal designer rows always use pen-0, pen-1, etc.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pen_order_items_unique
  ON public.pen_order_items (design_id, pen_id);
CREATE INDEX IF NOT EXISTS idx_pen_order_items_design_id
  ON public.pen_order_items (design_id);
CREATE INDEX IF NOT EXISTS idx_pen_order_items_shopify_order_id
  ON public.pen_order_items (shopify_order_id)
  WHERE shopify_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pen_order_items_status
  ON public.pen_order_items (status);
CREATE INDEX IF NOT EXISTS idx_pen_order_items_shop_order
  ON public.pen_order_items (shop_id, shopify_order_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_pen_order_items_updated_at'
      AND tgrelid = 'public.pen_order_items'::regclass
  ) THEN
    CREATE TRIGGER update_pen_order_items_updated_at
      BEFORE UPDATE ON public.pen_order_items
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

COMMENT ON COLUMN public.pen_order_items.print_svg_url IS
  'Print-ready SVG for the presentation-case metal band.';
COMMENT ON COLUMN public.pen_order_items.secondary_svg_url IS
  'Print-ready SVG for pen-cap engraving.';
COMMENT ON COLUMN public.pen_order_items.data_json IS
  'Full pen designer state used for cart editing and production context.';

-- All database access is server-side through SUPABASE_SERVICE_ROLE_KEY.
-- RLS with no client policies prevents the anon key from reading customer and
-- order data; the service-role client bypasses RLS.
ALTER TABLE public.pen_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pen_order_items ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('pen-images', 'pen-images', true),
  ('pen-pdfs', 'pen-pdfs', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read pen images'
  ) THEN
    CREATE POLICY "Public read pen images"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'pen-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read pen pdfs'
  ) THEN
    CREATE POLICY "Public read pen pdfs"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'pen-pdfs');
  END IF;
END
$$;
