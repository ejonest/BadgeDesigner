-- Plaque designer: columns + storage for production assets.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- Run in Supabase SQL Editor for the project matching SUPABASE_URL.
--
-- After this succeeds, tell the app to persist print_svg_url:
--   app/lib/designers/orderItemsStorage.ts → INCLUDE_PRINT_SVG_URL_IN_DB = true
--
-- Buckets (must match app/config/designers.ts):
--   plaque-images  → thumbnails, design.svg, print.svg, user uploads
--   plaque-pdfs    → proof PDFs

-- ---------------------------------------------------------------------------
-- plaque_designs (design library / autosave / cart / ordered milestones)
-- Your table already has most columns; this adds production asset URLs.
-- ---------------------------------------------------------------------------

ALTER TABLE public.plaque_designs
  ADD COLUMN IF NOT EXISTS full_image_url TEXT;

ALTER TABLE public.plaque_designs
  ADD COLUMN IF NOT EXISTS uploaded_image_url TEXT;

ALTER TABLE public.plaque_designs
  ADD COLUMN IF NOT EXISTS print_svg_url TEXT;

ALTER TABLE public.plaque_designs
  ADD COLUMN IF NOT EXISTS pdf_url TEXT;

COMMENT ON COLUMN public.plaque_designs.thumbnail_url IS
  'PNG/JPEG mockup thumbnail (wood + plate) for the design library gallery.';

COMMENT ON COLUMN public.plaque_designs.full_image_url IS
  'Proof / design.svg — full wood mockup SVG (customer-facing / review).';

COMMENT ON COLUMN public.plaque_designs.print_svg_url IS
  'Print-ready SVG — metal plate only (brushed fill + image/icon + text + 0.05″ bleed). No wood.';

COMMENT ON COLUMN public.plaque_designs.pdf_url IS
  'Proof PDF (lower-quality mockup + order details) when saved with the design.';

COMMENT ON COLUMN public.plaque_designs.uploaded_image_url IS
  'Public URL of the user upload on the metal plate: attached = photo/image, detached = icon. '
  'Stored in bucket plaque-images under {designId}/user-logo-*. '
  'Per-plaque logos for multi-item designs also live in design_data JSON (badge.logo.src).';

-- Constraints / indexes (no-op if already present from your create)
ALTER TABLE public.plaque_designs
  DROP CONSTRAINT IF EXISTS plaque_designs_save_kind_check;
ALTER TABLE public.plaque_designs
  ADD CONSTRAINT plaque_designs_save_kind_check
  CHECK (
    save_kind IS NULL
    OR save_kind IN ('autosave', 'manual', 'cart', 'ordered')
  );

ALTER TABLE public.plaque_designs
  DROP CONSTRAINT IF EXISTS plaque_designs_status_check;
ALTER TABLE public.plaque_designs
  ADD CONSTRAINT plaque_designs_status_check
  CHECK (
    status IN ('draft', 'saved', 'ordered', 'archived')
  );

CREATE UNIQUE INDEX IF NOT EXISTS plaque_designs_design_id_key
  ON public.plaque_designs USING btree (design_id);

CREATE INDEX IF NOT EXISTS idx_plaque_designs_shop_id
  ON public.plaque_designs USING btree (shop_id);

CREATE INDEX IF NOT EXISTS idx_plaque_designs_user_id
  ON public.plaque_designs USING btree (user_id);

CREATE INDEX IF NOT EXISTS idx_plaque_designs_user_shop_updated
  ON public.plaque_designs USING btree (user_id, shop_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_plaque_designs_user_shop_save_kind
  ON public.plaque_designs USING btree (user_id, shop_id, save_kind);

-- ---------------------------------------------------------------------------
-- plaque_order_items (checkout / paid order line snapshots)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.plaque_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  design_id TEXT NOT NULL,
  plaque_id TEXT NOT NULL,
  shopify_order_id TEXT,
  shopify_order_number TEXT,
  shopify_customer_id TEXT,
  status TEXT DEFAULT 'draft',
  quantity INTEGER DEFAULT 1,
  thumbnail_url TEXT,
  full_image_url TEXT,
  uploaded_image_url TEXT,
  print_svg_url TEXT,
  pdf_url TEXT,
  background_color TEXT,
  line_1_text TEXT,
  line_1_font TEXT,
  line_1_font_size INTEGER,
  line_1_bold BOOLEAN,
  line_1_underline BOOLEAN,
  line_1_italicize BOOLEAN,
  line_1_color TEXT,
  line_1_alignment TEXT,
  line_2_text TEXT,
  line_2_font TEXT,
  line_2_font_size INTEGER,
  line_2_bold BOOLEAN,
  line_2_underline BOOLEAN,
  line_2_italicize BOOLEAN,
  line_2_color TEXT,
  line_2_alignment TEXT,
  line_3_text TEXT,
  line_3_font TEXT,
  line_3_font_size INTEGER,
  line_3_bold BOOLEAN,
  line_3_underline BOOLEAN,
  line_3_italicize BOOLEAN,
  line_3_color TEXT,
  line_3_alignment TEXT,
  line_4_text TEXT,
  line_4_font TEXT,
  line_4_font_size INTEGER,
  line_4_bold BOOLEAN,
  line_4_underline BOOLEAN,
  line_4_italicize BOOLEAN,
  line_4_color TEXT,
  line_4_alignment TEXT,
  line_5_text TEXT,
  line_5_font TEXT,
  line_5_font_size INTEGER,
  line_5_bold BOOLEAN,
  line_5_underline BOOLEAN,
  line_5_italicize BOOLEAN,
  line_5_color TEXT,
  line_5_alignment TEXT,
  line_6_text TEXT,
  line_6_font TEXT,
  line_6_font_size INTEGER,
  line_6_bold BOOLEAN,
  line_6_underline BOOLEAN,
  line_6_italicize BOOLEAN,
  line_6_color TEXT,
  line_6_alignment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (design_id, plaque_id)
);

ALTER TABLE public.plaque_order_items
  ADD COLUMN IF NOT EXISTS uploaded_image_url TEXT;

ALTER TABLE public.plaque_order_items
  ADD COLUMN IF NOT EXISTS print_svg_url TEXT;

ALTER TABLE public.plaque_order_items
  ADD COLUMN IF NOT EXISTS pdf_url TEXT;

ALTER TABLE public.plaque_order_items
  ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1;

COMMENT ON COLUMN public.plaque_order_items.full_image_url IS
  'Proof design.svg (full wood mockup).';

COMMENT ON COLUMN public.plaque_order_items.print_svg_url IS
  'Print-ready metal-plate SVG (no wood) for manufacturing.';

COMMENT ON COLUMN public.plaque_order_items.uploaded_image_url IS
  'User plate upload for this line (attached image or detached icon).';

CREATE INDEX IF NOT EXISTS idx_plaque_order_items_design_id
  ON public.plaque_order_items (design_id);

CREATE INDEX IF NOT EXISTS idx_plaque_order_items_shopify_order_id
  ON public.plaque_order_items (shopify_order_id);

-- ---------------------------------------------------------------------------
-- Storage buckets + policies
-- Server uploads use SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).
-- Public SELECT is required for getPublicUrl() in the browser.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('plaque-images', 'plaque-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('plaque-pdfs', 'plaque-pdfs', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read plaque-images" ON storage.objects;
CREATE POLICY "Public read plaque-images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'plaque-images');

DROP POLICY IF EXISTS "Public read plaque-pdfs" ON storage.objects;
CREATE POLICY "Public read plaque-pdfs"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'plaque-pdfs');

-- Optional: browser uploads with anon + authenticated (Remix routes use service role by default).
DROP POLICY IF EXISTS "Authenticated upload plaque-images" ON storage.objects;
CREATE POLICY "Authenticated upload plaque-images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'plaque-images'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Authenticated upload plaque-pdfs" ON storage.objects;
CREATE POLICY "Authenticated upload plaque-pdfs"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'plaque-pdfs'
    AND auth.role() = 'authenticated'
  );
