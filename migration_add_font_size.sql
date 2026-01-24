-- Migration script to add font_size columns to badge_order_items table
-- Adds line_1_font_size, line_2_font_size, line_3_font_size, line_4_font_size as INTEGER

BEGIN;

-- Add font_size columns for each line
ALTER TABLE public.badge_order_items
  ADD COLUMN IF NOT EXISTS line_1_font_size INTEGER,
  ADD COLUMN IF NOT EXISTS line_2_font_size INTEGER,
  ADD COLUMN IF NOT EXISTS line_3_font_size INTEGER,
  ADD COLUMN IF NOT EXISTS line_4_font_size INTEGER;

COMMIT;
