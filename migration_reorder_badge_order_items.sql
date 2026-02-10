-- Reorder badge_order_items columns by moving data into a new table.
-- Prerequisite: existing table was renamed to badge_order_items2.
-- Run this in Supabase SQL Editor in one go, or run Step 1 then Step 2 then Step 3.

-- ========== STEP 1: Rename constraints and indexes on badge_order_items2 ==========
-- (so they don't conflict with the new table's names)

ALTER TABLE public.badge_order_items2
  RENAME CONSTRAINT badge_order_items_pkey TO badge_order_items2_pkey;

ALTER TABLE public.badge_order_items2
  RENAME CONSTRAINT badge_order_items_status_check TO badge_order_items2_status_check;

ALTER INDEX IF EXISTS idx_badge_order_items_status RENAME TO idx_badge_order_items2_status;
ALTER INDEX IF EXISTS idx_badge_order_items_design_id RENAME TO idx_badge_order_items2_design_id;
ALTER INDEX IF EXISTS idx_badge_order_items_shopify_customer_id RENAME TO idx_badge_order_items2_shopify_customer_id;
ALTER INDEX IF EXISTS idx_badge_order_items_shopify_order_id RENAME TO idx_badge_order_items2_shopify_order_id;
ALTER INDEX IF EXISTS idx_badge_order_items_unique RENAME TO idx_badge_order_items2_unique;
ALTER INDEX IF EXISTS idx_badge_order_items_badge_id RENAME TO idx_badge_order_items2_badge_id;

ALTER TRIGGER update_badge_order_items_updated_at ON public.badge_order_items2
  RENAME TO update_badge_order_items2_updated_at;

-- ========== STEP 2: Create new badge_order_items with desired column order ==========
-- (same as tempSQLDef.txt)

create table public.badge_order_items (
  id uuid not null default gen_random_uuid (),
  design_id text not null,
  shopify_order_id text null,
  shopify_customer_id text null,
  shopify_order_number text null,
  badge_id text null,
  thumbnail_url text null,
  full_image_url text null,
  pdf_url text null,
  background_color text null,
  status text not null default 'draft'::text,
  line_1_text text null,
  line_1_font_size integer null,
  line_1_font text null,
  line_1_bold boolean null default false,
  line_1_underline boolean null default false,
  line_1_italicize boolean null default false,
  line_1_color text null,
  line_1_alignment text null,
  line_2_text text null,
  line_2_font_size integer null,
  line_2_font text null,
  line_2_bold boolean null default false,
  line_2_underline boolean null default false,
  line_2_italicize boolean null default false,
  line_2_color text null,
  line_2_alignment text null,
  line_3_text text null,
  line_3_font_size integer null,
  line_3_font text null,
  line_3_bold boolean null default false,
  line_3_underline boolean null default false,
  line_3_italicize boolean null default false,
  line_3_color text null,
  line_3_alignment text null,
  line_4_text text null,
  line_4_font_size integer null,
  line_4_font text null,
  line_4_bold boolean null default false,
  line_4_underline boolean null default false,
  line_4_italicize boolean null default false,
  line_4_color text null,
  line_4_alignment text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint badge_order_items_pkey primary key (id),
  constraint badge_order_items_status_check check (
    (
      status = any (
        array[
          'draft'::text,
          'order_placed'::text,
          'fulfilled'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_badge_order_items_status on public.badge_order_items using btree (status) TABLESPACE pg_default
where
  (status = 'draft'::text);

create index IF not exists idx_badge_order_items_design_id on public.badge_order_items using btree (design_id) TABLESPACE pg_default;

create index IF not exists idx_badge_order_items_shopify_customer_id on public.badge_order_items using btree (shopify_customer_id) TABLESPACE pg_default
where
  (shopify_customer_id is not null);

create index IF not exists idx_badge_order_items_shopify_order_id on public.badge_order_items using btree (shopify_order_id) TABLESPACE pg_default
where
  (shopify_order_id is not null);

create unique INDEX IF not exists idx_badge_order_items_unique on public.badge_order_items using btree (design_id, badge_id) TABLESPACE pg_default
where
  (badge_id is not null);

create index IF not exists idx_badge_order_items_badge_id on public.badge_order_items using btree (badge_id) TABLESPACE pg_default
where
  (badge_id is not null);

create trigger update_badge_order_items_updated_at BEFORE
update on badge_order_items for EACH row
execute FUNCTION update_updated_at_column ();

-- ========== STEP 3: Copy data from badge_order_items2 into badge_order_items ==========

INSERT INTO public.badge_order_items (
  id,
  design_id,
  shopify_order_id,
  shopify_customer_id,
  shopify_order_number,
  badge_id,
  thumbnail_url,
  full_image_url,
  pdf_url,
  background_color,
  status,
  line_1_text,
  line_1_font_size,
  line_1_font,
  line_1_bold,
  line_1_underline,
  line_1_italicize,
  line_1_color,
  line_1_alignment,
  line_2_text,
  line_2_font_size,
  line_2_font,
  line_2_bold,
  line_2_underline,
  line_2_italicize,
  line_2_color,
  line_2_alignment,
  line_3_text,
  line_3_font_size,
  line_3_font,
  line_3_bold,
  line_3_underline,
  line_3_italicize,
  line_3_color,
  line_3_alignment,
  line_4_text,
  line_4_font_size,
  line_4_font,
  line_4_bold,
  line_4_underline,
  line_4_italicize,
  line_4_color,
  line_4_alignment,
  created_at,
  updated_at
)
SELECT
  id,
  design_id,
  shopify_order_id,
  shopify_customer_id,
  shopify_order_number,
  badge_id,
  thumbnail_url,
  full_image_url,
  pdf_url,
  background_color,
  status,
  line_1_text,
  line_1_font_size,
  line_1_font,
  line_1_bold,
  line_1_underline,
  line_1_italicize,
  line_1_color,
  line_1_alignment,
  line_2_text,
  line_2_font_size,
  line_2_font,
  line_2_bold,
  line_2_underline,
  line_2_italicize,
  line_2_color,
  line_2_alignment,
  line_3_text,
  line_3_font_size,
  line_3_font,
  line_3_bold,
  line_3_underline,
  line_3_italicize,
  line_3_color,
  line_3_alignment,
  line_4_text,
  line_4_font_size,
  line_4_font,
  line_4_bold,
  line_4_underline,
  line_4_italicize,
  line_4_color,
  line_4_alignment,
  created_at,
  updated_at
FROM public.badge_order_items2;

-- ========== STEP 4: Drop the old table ==========

DROP TABLE public.badge_order_items2;
