-- Medal designer tables and public proof/image storage. Safe to re-run.

CREATE TABLE IF NOT EXISTS public.medal_designs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
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
  CONSTRAINT medal_designs_save_kind_check CHECK (
    save_kind IS NULL OR save_kind = ANY (ARRAY['autosave', 'manual', 'cart', 'ordered'])
  ),
  CONSTRAINT medal_designs_status_check CHECK (
    status = ANY (ARRAY['draft', 'saved', 'ordered', 'archived'])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS medal_designs_design_id_key
  ON public.medal_designs (design_id);
CREATE INDEX IF NOT EXISTS idx_medal_designs_user_shop_updated
  ON public.medal_designs (user_id, shop_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.medal_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  design_id TEXT NOT NULL,
  shopify_order_id TEXT NULL,
  shopify_customer_id TEXT NULL,
  shopify_order_number TEXT NULL,
  shop_id TEXT NULL,
  medal_id TEXT NULL,
  thumbnail_url TEXT NULL,
  full_image_url TEXT NULL,
  print_svg_url TEXT NULL,
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
  CONSTRAINT medal_order_items_status_check CHECK (
    status = ANY (ARRAY['draft', 'in_cart', 'order_placed', 'fulfilled'])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_medal_order_items_unique
  ON public.medal_order_items (design_id, medal_id);
CREATE INDEX IF NOT EXISTS idx_medal_order_items_design_id
  ON public.medal_order_items (design_id);
CREATE INDEX IF NOT EXISTS idx_medal_order_items_shopify_order_id
  ON public.medal_order_items (shopify_order_id)
  WHERE shopify_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_medal_order_items_status
  ON public.medal_order_items (status);

ALTER TABLE public.medal_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medal_order_items ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('medal-images', 'medal-images', true),
  ('medal-pdfs', 'medal-pdfs', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read medal images'
  ) THEN
    CREATE POLICY "Public read medal images"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'medal-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read medal pdfs'
  ) THEN
    CREATE POLICY "Public read medal pdfs"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'medal-pdfs');
  END IF;
END
$$;
