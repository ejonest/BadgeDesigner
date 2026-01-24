-- Migration script to update badge_order_items table
-- Changes:
-- 1. Rename order_design_id to shopify_order_id
-- 2. Remove badge_data JSONB column
-- 3. Add background_color column
-- 4. Add line columns for lines 1-4 (text, font, bold, underline, italicize, color, alignment)

BEGIN;

-- Step 1: Add new columns
ALTER TABLE public.badge_order_items
  ADD COLUMN IF NOT EXISTS background_color TEXT,
  ADD COLUMN IF NOT EXISTS line_1_text TEXT,
  ADD COLUMN IF NOT EXISTS line_1_font TEXT,
  ADD COLUMN IF NOT EXISTS line_1_font_size INTEGER,
  ADD COLUMN IF NOT EXISTS line_1_bold BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS line_1_underline BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS line_1_italicize BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS line_1_color TEXT,
  ADD COLUMN IF NOT EXISTS line_1_alignment TEXT,
  ADD COLUMN IF NOT EXISTS line_2_text TEXT,
  ADD COLUMN IF NOT EXISTS line_2_font TEXT,
  ADD COLUMN IF NOT EXISTS line_2_font_size INTEGER,
  ADD COLUMN IF NOT EXISTS line_2_bold BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS line_2_underline BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS line_2_italicize BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS line_2_color TEXT,
  ADD COLUMN IF NOT EXISTS line_2_alignment TEXT,
  ADD COLUMN IF NOT EXISTS line_3_text TEXT,
  ADD COLUMN IF NOT EXISTS line_3_font TEXT,
  ADD COLUMN IF NOT EXISTS line_3_font_size INTEGER,
  ADD COLUMN IF NOT EXISTS line_3_bold BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS line_3_underline BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS line_3_italicize BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS line_3_color TEXT,
  ADD COLUMN IF NOT EXISTS line_3_alignment TEXT,
  ADD COLUMN IF NOT EXISTS line_4_text TEXT,
  ADD COLUMN IF NOT EXISTS line_4_font TEXT,
  ADD COLUMN IF NOT EXISTS line_4_font_size INTEGER,
  ADD COLUMN IF NOT EXISTS line_4_bold BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS line_4_underline BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS line_4_italicize BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS line_4_color TEXT,
  ADD COLUMN IF NOT EXISTS line_4_alignment TEXT;

-- Step 2: Migrate existing data from badge_data JSONB (if any exists)
-- Extract background_color and line data from badge_data
UPDATE public.badge_order_items
SET
  background_color = COALESCE(badge_data->>'backgroundColor', NULL),
  line_1_text = COALESCE(badge_data->'lines'->0->>'text', NULL),
  line_1_font = COALESCE(badge_data->'lines'->0->>'fontFamily', NULL),
  line_1_font_size = COALESCE((badge_data->'lines'->0->>'fontSize')::integer, NULL),
  line_1_bold = COALESCE((badge_data->'lines'->0->>'bold')::boolean, FALSE),
  line_1_underline = COALESCE((badge_data->'lines'->0->>'underline')::boolean, FALSE),
  line_1_italicize = COALESCE((badge_data->'lines'->0->>'italic')::boolean, FALSE),
  line_1_color = COALESCE(badge_data->'lines'->0->>'color', NULL),
  line_1_alignment = COALESCE(badge_data->'lines'->0->>'align', NULL),
  line_2_text = COALESCE(badge_data->'lines'->1->>'text', NULL),
  line_2_font = COALESCE(badge_data->'lines'->1->>'fontFamily', NULL),
  line_2_font_size = COALESCE((badge_data->'lines'->1->>'fontSize')::integer, NULL),
  line_2_bold = COALESCE((badge_data->'lines'->1->>'bold')::boolean, FALSE),
  line_2_underline = COALESCE((badge_data->'lines'->1->>'underline')::boolean, FALSE),
  line_2_italicize = COALESCE((badge_data->'lines'->1->>'italic')::boolean, FALSE),
  line_2_color = COALESCE(badge_data->'lines'->1->>'color', NULL),
  line_2_alignment = COALESCE(badge_data->'lines'->1->>'align', NULL),
  line_3_text = COALESCE(badge_data->'lines'->2->>'text', NULL),
  line_3_font = COALESCE(badge_data->'lines'->2->>'fontFamily', NULL),
  line_3_font_size = COALESCE((badge_data->'lines'->2->>'fontSize')::integer, NULL),
  line_3_bold = COALESCE((badge_data->'lines'->2->>'bold')::boolean, FALSE),
  line_3_underline = COALESCE((badge_data->'lines'->2->>'underline')::boolean, FALSE),
  line_3_italicize = COALESCE((badge_data->'lines'->2->>'italic')::boolean, FALSE),
  line_3_color = COALESCE(badge_data->'lines'->2->>'color', NULL),
  line_3_alignment = COALESCE(badge_data->'lines'->2->>'align', NULL),
  line_4_text = COALESCE(badge_data->'lines'->3->>'text', NULL),
  line_4_font = COALESCE(badge_data->'lines'->3->>'fontFamily', NULL),
  line_4_font_size = COALESCE((badge_data->'lines'->3->>'fontSize')::integer, NULL),
  line_4_bold = COALESCE((badge_data->'lines'->3->>'bold')::boolean, FALSE),
  line_4_underline = COALESCE((badge_data->'lines'->3->>'underline')::boolean, FALSE),
  line_4_italicize = COALESCE((badge_data->'lines'->3->>'italic')::boolean, FALSE),
  line_4_color = COALESCE(badge_data->'lines'->3->>'color', NULL),
  line_4_alignment = COALESCE(badge_data->'lines'->3->>'align', NULL)
WHERE badge_data IS NOT NULL;

-- Step 3: Drop the foreign key constraint on order_design_id (if it exists)
ALTER TABLE public.badge_order_items
  DROP CONSTRAINT IF EXISTS badge_order_items_order_design_id_fkey;

-- Step 4: Rename order_design_id to shopify_order_id
ALTER TABLE public.badge_order_items
  RENAME COLUMN order_design_id TO shopify_order_id;

-- Step 5: Change shopify_order_id from UUID to TEXT (since it's a Shopify order ID, likely a string)
ALTER TABLE public.badge_order_items
  ALTER COLUMN shopify_order_id TYPE TEXT;

-- Step 6: Drop the badge_data column
ALTER TABLE public.badge_order_items
  DROP COLUMN IF EXISTS badge_data;

-- Step 7: Update indexes
-- Drop old index on order_design_id
DROP INDEX IF EXISTS public.idx_badge_order_items_order_design_id;

-- Create new index on shopify_order_id
CREATE INDEX IF NOT EXISTS idx_badge_order_items_shopify_order_id 
  ON public.badge_order_items USING btree (shopify_order_id) 
  TABLESPACE pg_default
  WHERE shopify_order_id IS NOT NULL;

COMMIT;
