-- Pen designer: saved design library, order-item snapshots, and storage buckets.
-- Run in the Supabase SQL editor after review.

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

CREATE UNIQUE INDEX IF NOT EXISTS pen_designs_design_id_key
  ON public.pen_designs (design_id);
CREATE INDEX IF NOT EXISTS idx_pen_designs_user_shop_updated
  ON public.pen_designs (user_id, shop_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pen_designs_user_shop_save_kind
  ON public.pen_designs (user_id, shop_id, save_kind);

DROP TRIGGER IF EXISTS update_pen_designs_updated_at ON public.pen_designs;
CREATE TRIGGER update_pen_designs_updated_at
  BEFORE UPDATE ON public.pen_designs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.pen_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  design_id TEXT NOT NULL,
  shopify_order_id TEXT NULL,
  shopify_customer_id TEXT NULL,
  shopify_order_number TEXT NULL,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_pen_order_items_unique
  ON public.pen_order_items (design_id, pen_id)
  WHERE pen_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pen_order_items_design_id
  ON public.pen_order_items (design_id);
CREATE INDEX IF NOT EXISTS idx_pen_order_items_shopify_order_id
  ON public.pen_order_items (shopify_order_id)
  WHERE shopify_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pen_order_items_status
  ON public.pen_order_items (status);

DROP TRIGGER IF EXISTS update_pen_order_items_updated_at ON public.pen_order_items;
CREATE TRIGGER update_pen_order_items_updated_at
  BEFORE UPDATE ON public.pen_order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON COLUMN public.pen_order_items.print_svg_url IS
  'Print-ready SVG for the presentation-case metal band.';
COMMENT ON COLUMN public.pen_order_items.secondary_svg_url IS
  'Print-ready SVG for pen-cap engraving.';
COMMENT ON COLUMN public.pen_order_items.data_json IS
  'Full pen designer state used for cart editing and production context.';

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('pen-images', 'pen-images', true),
  ('pen-pdfs', 'pen-pdfs', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public read pen images" ON storage.objects;
CREATE POLICY "Public read pen images"
ON storage.objects FOR SELECT
USING (bucket_id = 'pen-images');

DROP POLICY IF EXISTS "Public read pen pdfs" ON storage.objects;
CREATE POLICY "Public read pen pdfs"
ON storage.objects FOR SELECT
USING (bucket_id = 'pen-pdfs');
