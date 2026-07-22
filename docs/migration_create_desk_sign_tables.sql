-- Desk sign designer: library + order items (mirror sign_designs / sign_order_items).
-- Run in Supabase SQL Editor after review.
-- Storage: create public buckets `desk-sign-images` and `desk-sign-pdfs` with policies matching sign buckets.

CREATE TABLE IF NOT EXISTS public.desk_sign_designs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  design_id TEXT NOT NULL,
  product_id TEXT NOT NULL DEFAULT '',
  shop_id TEXT NOT NULL,
  user_id TEXT,
  background_color TEXT,
  backing_price DECIMAL(10, 2) DEFAULT 0,
  backing_type TEXT,
  base_price DECIMAL(10, 2) DEFAULT 9.99,
  total_price DECIMAL(10, 2),
  design_data JSONB,
  thumbnail_url TEXT,
  full_image_url TEXT,
  uploaded_image_url TEXT,
  save_kind TEXT,
  status TEXT DEFAULT 'draft' CHECK (
    status IN ('draft', 'saved', 'ordered', 'archived')
  ),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS desk_sign_designs_design_id_key
  ON public.desk_sign_designs (design_id);

CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_shop_id
  ON public.desk_sign_designs (shop_id);
CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_user_id
  ON public.desk_sign_designs (user_id);
CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_design_id
  ON public.desk_sign_designs (design_id);

ALTER TABLE public.desk_sign_designs
  DROP CONSTRAINT IF EXISTS desk_sign_designs_save_kind_check;
ALTER TABLE public.desk_sign_designs
  ADD CONSTRAINT desk_sign_designs_save_kind_check
  CHECK (
    save_kind IS NULL OR save_kind IN ('autosave', 'manual', 'cart', 'ordered')
  );

CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_user_shop_updated
  ON public.desk_sign_designs (user_id, shop_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_user_shop_save_kind
  ON public.desk_sign_designs (user_id, shop_id, save_kind);

CREATE TABLE IF NOT EXISTS public.desk_sign_order_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  design_id TEXT NOT NULL,
  desk_sign_id TEXT NOT NULL,
  shopify_order_id TEXT,
  shopify_order_number TEXT,
  shopify_customer_id TEXT,
  status TEXT DEFAULT 'draft',
  quantity INTEGER DEFAULT 1,
  thumbnail_url TEXT,
  full_image_url TEXT,
  uploaded_image_url TEXT,
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
  UNIQUE (design_id, desk_sign_id)
);

CREATE INDEX IF NOT EXISTS idx_desk_sign_order_items_design_id
  ON public.desk_sign_order_items (design_id);
CREATE INDEX IF NOT EXISTS idx_desk_sign_order_items_shopify_order_id
  ON public.desk_sign_order_items (shopify_order_id);

COMMENT ON TABLE public.desk_sign_designs IS 'Desk sign designer design library / milestones.';
COMMENT ON TABLE public.desk_sign_order_items IS 'Desk sign designer order line snapshots.';
