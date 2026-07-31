-- REQUIRED for print-ready SVG persistence.
-- Run this in the Supabase SQL editor, then redeploy/restart the app.
-- App flag INCLUDE_PRINT_SVG_URL_IN_DB is true and writes this column on every
-- draft autosave and send-to-supabase.
--
-- print_svg_url: full bleed rectangle + plate art + text/icons (manufacturing).
-- full_image_url: customer proof SVG (what the shopper sees).
--
-- Each ALTER is guarded so missing optional tables (e.g. desk_sign_order_items)
-- do not abort the whole migration.

DO $$
BEGIN
  IF to_regclass('public.badge_order_items') IS NOT NULL THEN
    ALTER TABLE public.badge_order_items
      ADD COLUMN IF NOT EXISTS print_svg_url TEXT;
    COMMENT ON COLUMN public.badge_order_items.print_svg_url IS
      'Print-ready SVG: full bleed rectangle with plate art, text, and icons for manufacturing.';
  END IF;

  IF to_regclass('public.sign_order_items') IS NOT NULL THEN
    ALTER TABLE public.sign_order_items
      ADD COLUMN IF NOT EXISTS print_svg_url TEXT;
  END IF;

  IF to_regclass('public.plaque_order_items') IS NOT NULL THEN
    ALTER TABLE public.plaque_order_items
      ADD COLUMN IF NOT EXISTS print_svg_url TEXT;
  END IF;

  IF to_regclass('public.desk_sign_order_items') IS NOT NULL THEN
    ALTER TABLE public.desk_sign_order_items
      ADD COLUMN IF NOT EXISTS print_svg_url TEXT;
  END IF;
END $$;
