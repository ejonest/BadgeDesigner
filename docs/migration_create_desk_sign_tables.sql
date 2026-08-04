-- Desk sign designer: library + order items.
-- Run in Supabase SQL Editor after review.
--
-- Order items mirror badge_order_items column order / constraints, with:
--   - desk_sign_id instead of badge_id
--   - print_svg_url grouped with JPEG (thumbnail_url), proof SVG (full_image_url), and PDF
--   - up to 2 text lines (desk signs)
--
-- Also create storage buckets via docs/migration_create_desk_sign_storage_buckets.sql

-- ---------------------------------------------------------------------------
-- desk_sign_designs (saved design library / milestones)
-- Mirrors badge_designs; see also migration_create_desk_sign_designs.sql
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.desk_sign_designs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  design_id TEXT NOT NULL,
  product_id TEXT NOT NULL DEFAULT ''::text,
  shop_id TEXT NOT NULL,
  user_id TEXT NULL,
  background_color TEXT NULL,
  backing_price DOUBLE PRECISION NULL,
  backing_type TEXT NULL,
  base_price DOUBLE PRECISION NULL,
  total_price DOUBLE PRECISION NULL,
  design_data JSONB NULL,
  thumbnail_url TEXT NULL,
  full_image_url TEXT NULL,
  uploaded_image_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'saved'::text,
  created_at TIMESTAMPTZ NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NULL DEFAULT now(),
  save_kind TEXT NULL,
  CONSTRAINT desk_sign_designs_pkey PRIMARY KEY (id),
  CONSTRAINT desk_sign_designs_save_kind_check CHECK (
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
  CONSTRAINT desk_sign_designs_status_check CHECK (
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

CREATE UNIQUE INDEX IF NOT EXISTS desk_sign_designs_design_id_key
  ON public.desk_sign_designs USING btree (design_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_user_shop_updated
  ON public.desk_sign_designs USING btree (user_id, shop_id, updated_at DESC) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_user_shop_save_kind
  ON public.desk_sign_designs USING btree (user_id, shop_id, save_kind) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_user_id
  ON public.desk_sign_designs USING btree (user_id) TABLESPACE pg_default
  WHERE (user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_shop_id
  ON public.desk_sign_designs USING btree (shop_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_status
  ON public.desk_sign_designs USING btree (status) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_updated_at
  ON public.desk_sign_designs USING btree (updated_at DESC) TABLESPACE pg_default;

DROP TRIGGER IF EXISTS update_desk_sign_designs_updated_at ON public.desk_sign_designs;
CREATE TRIGGER update_desk_sign_designs_updated_at
  BEFORE UPDATE ON public.desk_sign_designs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.desk_sign_designs IS
  'Desk sign designer design library / milestones (parallel to badge_designs).';

COMMENT ON COLUMN public.desk_sign_designs.uploaded_image_url IS
  'Optional user-uploaded logo URL for this saved design.';

-- ---------------------------------------------------------------------------
-- desk_sign_order_items (checkout / paid order line snapshots)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.desk_sign_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  design_id TEXT NOT NULL,
  shopify_order_id TEXT NULL,
  shopify_customer_id TEXT NULL,
  shopify_order_number TEXT NULL,
  desk_sign_id TEXT NULL,
  thumbnail_url TEXT NULL,
  full_image_url TEXT NULL,
  print_svg_url TEXT NULL,
  pdf_url TEXT NULL,
  uploaded_image_url TEXT NULL,
  background_color TEXT NULL,
  backing_type TEXT NULL,
  status TEXT NOT NULL DEFAULT 'draft'::text,
  line_1_text TEXT NULL,
  line_1_font_size INTEGER NULL,
  line_1_font TEXT NULL,
  line_1_bold BOOLEAN NULL DEFAULT false,
  line_1_underline BOOLEAN NULL DEFAULT false,
  line_1_italicize BOOLEAN NULL DEFAULT false,
  line_1_color TEXT NULL,
  line_1_alignment TEXT NULL,
  line_2_text TEXT NULL,
  line_2_font_size INTEGER NULL,
  line_2_font TEXT NULL,
  line_2_bold BOOLEAN NULL DEFAULT false,
  line_2_underline BOOLEAN NULL DEFAULT false,
  line_2_italicize BOOLEAN NULL DEFAULT false,
  line_2_color TEXT NULL,
  line_2_alignment TEXT NULL,
  created_at TIMESTAMPTZ NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NULL DEFAULT now(),
  quantity INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT desk_sign_order_items_pkey PRIMARY KEY (id),
  CONSTRAINT desk_sign_order_items_status_check CHECK (
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

CREATE INDEX IF NOT EXISTS idx_desk_sign_order_items_status
  ON public.desk_sign_order_items USING btree (status) TABLESPACE pg_default
  WHERE (status = 'draft'::text);

CREATE INDEX IF NOT EXISTS idx_desk_sign_order_items_design_id
  ON public.desk_sign_order_items USING btree (design_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_desk_sign_order_items_shopify_customer_id
  ON public.desk_sign_order_items USING btree (shopify_customer_id) TABLESPACE pg_default
  WHERE (shopify_customer_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_desk_sign_order_items_shopify_order_id
  ON public.desk_sign_order_items USING btree (shopify_order_id) TABLESPACE pg_default
  WHERE (shopify_order_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS idx_desk_sign_order_items_unique
  ON public.desk_sign_order_items USING btree (design_id, desk_sign_id) TABLESPACE pg_default
  WHERE (desk_sign_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_desk_sign_order_items_desk_sign_id
  ON public.desk_sign_order_items USING btree (desk_sign_id) TABLESPACE pg_default
  WHERE (desk_sign_id IS NOT NULL);

DROP TRIGGER IF EXISTS update_desk_sign_order_items_updated_at ON public.desk_sign_order_items;
CREATE TRIGGER update_desk_sign_order_items_updated_at
  BEFORE UPDATE ON public.desk_sign_order_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.desk_sign_order_items IS
  'Desk sign designer order line snapshots (parallel to badge_order_items).';

COMMENT ON COLUMN public.desk_sign_order_items.thumbnail_url IS
  'JPEG mockup for cart / order slip preview.';

COMMENT ON COLUMN public.desk_sign_order_items.full_image_url IS
  'Proof / customer-facing SVG.';

COMMENT ON COLUMN public.desk_sign_order_items.print_svg_url IS
  'Print-ready SVG for manufacturing.';

COMMENT ON COLUMN public.desk_sign_order_items.pdf_url IS
  'Proof / order-slip PDF.';

COMMENT ON COLUMN public.desk_sign_order_items.uploaded_image_url IS
  'Optional user-uploaded logo for this line.';
