-- Migration script to remove badge_index and update color format
-- Changes:
-- 1. Remove badge_index column (badge_id serves the same purpose)
-- 2. Update color columns to store "ColorName #hexcode" format

BEGIN;

-- Step 1: Drop the unique index that includes badge_index
DROP INDEX IF EXISTS public.idx_badge_order_items_unique;

-- Step 2: Drop the index on badge_index
DROP INDEX IF EXISTS public.idx_badge_order_items_badge_index;

-- Step 3: Remove badge_index column
ALTER TABLE public.badge_order_items
  DROP COLUMN IF EXISTS badge_index;

-- Step 4: Create new unique index on (design_id, badge_id) instead
CREATE UNIQUE INDEX IF NOT EXISTS idx_badge_order_items_unique 
  ON public.badge_order_items USING btree (design_id, badge_id) 
  TABLESPACE pg_default
  WHERE badge_id IS NOT NULL;

-- Step 5: Create index on badge_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_badge_order_items_badge_id 
  ON public.badge_order_items USING btree (badge_id) 
  TABLESPACE pg_default
  WHERE badge_id IS NOT NULL;

COMMIT;
