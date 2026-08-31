-- Gavel designer: library + order items.
-- Run in Supabase SQL Editor after review.
--
-- Also create storage buckets via docs/migration_create_gavel_storage_buckets.sql
--
-- Full designer state lives in data_json (no flat line_* columns).

-- ---------------------------------------------------------------------------
-- gavel_designs (saved design library / milestones)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gavel_designs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  design_id TEXT NOT NULL,
  product_id TEXT NOT NULL DEFAULT ''::text,
  shop_id TEXT NOT NULL,
  user_id TEXT NULL,
  total_price DOUBLE PRECISION NULL,
  design_data JSONB NULL,
  thumbnail_url TEXT NULL,
  full_image_url TEXT NULL,
  uploaded_image_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'saved'::text,
  created_at TIMESTAMPTZ NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NULL DEFAULT now(),
  save_kind TEXT NULL,
  CONSTRAINT gavel_designs_pkey PRIMARY KEY (id),
  CONSTRAINT gavel_designs_save_kind_check CHECK (
    (
      (save_kind IS NULL)
      OR (
        save_kind = ANY (
          ARRAY[
            'autosave'::text,
            'manual'::text,
            'cart'::text,
            'ordered'::text
          ]
        )
      )
    )
  ),
  CONSTRAINT gavel_designs_status_check CHECK (
    (
      status = ANY (
        ARRAY[
          'draft'::text,
          'saved'::text,
          'ordered'::text,
          'archived'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

CREATE UNIQUE INDEX IF NOT EXISTS gavel_designs_design_id_key
  ON public.gavel_designs USING btree (design_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_gavel_designs_user_shop_updated
  ON public.gavel_designs USING btree (user_id, shop_id, updated_at DESC) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_gavel_designs_user_shop_save_kind
  ON public.gavel_designs USING btree (user_id, shop_id, save_kind) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_gavel_designs_user_id
  ON public.gavel_designs USING btree (user_id) TABLESPACE pg_default
  WHERE (user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_gavel_designs_shop_id
  ON public.gavel_designs USING btree (shop_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_gavel_designs_status
  ON public.gavel_designs USING btree (status) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_gavel_designs_updated_at
  ON public.gavel_designs USING btree (updated_at DESC) TABLESPACE pg_default;

DROP TRIGGER IF EXISTS update_gavel_designs_updated_at ON public.gavel_designs;
CREATE TRIGGER update_gavel_designs_updated_at
  BEFORE UPDATE ON public.gavel_designs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.gavel_designs IS
  'Gavel designer design library / milestones (parallel to desk_sign_designs).';

COMMENT ON COLUMN public.gavel_designs.design_data IS
  'Full designer JSON. Band/plate colors live here (gavelBandColor, gavelPlateColor); not as table columns.';

COMMENT ON COLUMN public.gavel_designs.total_price IS
  'Quoted unit/line total for this design. No separate base_price or backing_price.';

COMMENT ON COLUMN public.gavel_designs.user_id IS
  'Shopify customer id when the shopper is logged in.';

COMMENT ON COLUMN public.gavel_designs.thumbnail_url IS
  'JPEG/PNG mockup for the design library.';

COMMENT ON COLUMN public.gavel_designs.full_image_url IS
  'Proof SVG (band / plate) for the saved design.';

-- ---------------------------------------------------------------------------
-- gavel_order_items (checkout / paid order line snapshots)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.gavel_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  design_id TEXT NOT NULL,
  shopify_order_id TEXT NULL,
  shopify_customer_id TEXT NULL,
  shopify_order_number TEXT NULL,
  gavel_id TEXT NULL,
  thumbnail_url TEXT NULL,
  full_image_url TEXT NULL,
  print_svg_url TEXT NULL,
  secondary_svg_url TEXT NULL,
  pdf_url TEXT NULL,
  uploaded_image_url TEXT NULL,
  finish TEXT NULL,
  attachment_method TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft'::text,
  data_json JSONB NULL,
  design_meta JSONB NULL,
  created_at TIMESTAMPTZ NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NULL DEFAULT now(),
  quantity INTEGER NOT NULL DEFAULT 1,
  is_qa_test BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT gavel_order_items_pkey PRIMARY KEY (id),
  CONSTRAINT gavel_order_items_status_check CHECK (
    (
      status = ANY (
        ARRAY[
          'draft'::text,
          'in_cart'::text,
          'order_placed'::text,
          'fulfilled'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_gavel_order_items_status
  ON public.gavel_order_items USING btree (status) TABLESPACE pg_default
  WHERE (status = 'draft'::text);

CREATE INDEX IF NOT EXISTS idx_gavel_order_items_design_id
  ON public.gavel_order_items USING btree (design_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_gavel_order_items_shopify_customer_id
  ON public.gavel_order_items USING btree (shopify_customer_id) TABLESPACE pg_default
  WHERE (shopify_customer_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_gavel_order_items_shopify_order_id
  ON public.gavel_order_items USING btree (shopify_order_id) TABLESPACE pg_default
  WHERE (shopify_order_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_gavel_order_items_unique
  ON public.gavel_order_items USING btree (design_id, gavel_id) TABLESPACE pg_default
  WHERE (gavel_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_gavel_order_items_gavel_id
  ON public.gavel_order_items USING btree (gavel_id) TABLESPACE pg_default
  WHERE (gavel_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_gavel_order_items_is_qa_test
  ON public.gavel_order_items USING btree (is_qa_test) TABLESPACE pg_default
  WHERE (is_qa_test = true);

DROP TRIGGER IF EXISTS update_gavel_order_items_updated_at ON public.gavel_order_items;
CREATE TRIGGER update_gavel_order_items_updated_at
  BEFORE UPDATE ON public.gavel_order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.gavel_order_items IS
  'Gavel designer order line snapshots (parallel to desk_sign_order_items).';

COMMENT ON COLUMN public.gavel_order_items.data_json IS
  'Full designer state for this gavel line; used to reopen a cart item for editing.';

COMMENT ON COLUMN public.gavel_order_items.finish IS
  'Style · band finish (e.g. Walnut · Gold band).';

COMMENT ON COLUMN public.gavel_order_items.thumbnail_url IS
  'JPEG/PNG mockup for cart / order slip.';

COMMENT ON COLUMN public.gavel_order_items.full_image_url IS
  'Proof SVG (band unwrap).';

COMMENT ON COLUMN public.gavel_order_items.print_svg_url IS
  'Print-ready SVG for manufacturing (band unwrap).';

COMMENT ON COLUMN public.gavel_order_items.secondary_svg_url IS
  'Print-ready SVG for the second engraved surface: stand plate, or sound block top.';

COMMENT ON COLUMN public.gavel_order_items.pdf_url IS
  'Proof / order-slip PDF.';

COMMENT ON COLUMN public.gavel_order_items.shopify_customer_id IS
  'Shopify customer id from the paid order (and from the iframe when logged in).';

COMMENT ON COLUMN public.gavel_order_items.is_qa_test IS
  'True when created by Playwright/local QA (?qaTest=1).';

-- If the table already existed from an earlier run, add columns skipped by CREATE TABLE IF NOT EXISTS.
ALTER TABLE public.gavel_order_items
  ADD COLUMN IF NOT EXISTS is_qa_test BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.gavel_order_items
  ADD COLUMN IF NOT EXISTS data_json JSONB NULL;
ALTER TABLE public.gavel_order_items
  ADD COLUMN IF NOT EXISTS design_meta JSONB NULL;
ALTER TABLE public.gavel_order_items
  ADD COLUMN IF NOT EXISTS print_svg_url TEXT NULL;
ALTER TABLE public.gavel_order_items
  ADD COLUMN IF NOT EXISTS secondary_svg_url TEXT NULL;
ALTER TABLE public.gavel_order_items
  ADD COLUMN IF NOT EXISTS full_image_url TEXT NULL;

-- Library table: colors and pricing live in design_data / total_price only.
ALTER TABLE public.gavel_designs DROP COLUMN IF EXISTS background_color;
ALTER TABLE public.gavel_designs DROP COLUMN IF EXISTS backing_price;
ALTER TABLE public.gavel_designs DROP COLUMN IF EXISTS backing_type;
ALTER TABLE public.gavel_designs DROP COLUMN IF EXISTS base_price;
