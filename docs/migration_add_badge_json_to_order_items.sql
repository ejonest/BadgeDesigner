-- REQUIRED for "edit design from cart".
-- Run this in the Supabase SQL editor, then redeploy/restart the app.
-- App flag INCLUDE_BADGE_JSON_IN_DB is true and writes these columns on every
-- draft autosave and send-to-supabase.
--
-- The per-line columns (line_1_text, background_color, ...) are a manufacturing
-- spec: they omit templateId, badgeIconId, customBadgeBackgroundId, line
-- geometry, logo placement, and the desk sign / plaque / sign border fields, so
-- a design cannot be rebuilt from them. badge_json stores the designer state.
--
-- badge_json:  full Badge object for that line (one row = one badge).
-- design_meta: design-level state that is not per-badge (sign type/size, plaque
--              layout/size). Written only on the index-0 row.
--
-- Each ALTER is guarded so missing optional tables (e.g. desk_sign_order_items)
-- do not abort the whole migration.

DO $$
BEGIN
  IF to_regclass('public.badge_order_items') IS NOT NULL THEN
    ALTER TABLE public.badge_order_items
      ADD COLUMN IF NOT EXISTS badge_json JSONB,
      ADD COLUMN IF NOT EXISTS design_meta JSONB;
    COMMENT ON COLUMN public.badge_order_items.badge_json IS
      'Full Badge designer state for this line; used to reopen a cart item for editing.';
    COMMENT ON COLUMN public.badge_order_items.design_meta IS
      'Design-level designer state (sign type/size, plaque layout/size); index-0 row only.';
  END IF;

  IF to_regclass('public.sign_order_items') IS NOT NULL THEN
    ALTER TABLE public.sign_order_items
      ADD COLUMN IF NOT EXISTS badge_json JSONB,
      ADD COLUMN IF NOT EXISTS design_meta JSONB;
  END IF;

  IF to_regclass('public.plaque_order_items') IS NOT NULL THEN
    ALTER TABLE public.plaque_order_items
      ADD COLUMN IF NOT EXISTS badge_json JSONB,
      ADD COLUMN IF NOT EXISTS design_meta JSONB;
  END IF;

  IF to_regclass('public.desk_sign_order_items') IS NOT NULL THEN
    ALTER TABLE public.desk_sign_order_items
      ADD COLUMN IF NOT EXISTS badge_json JSONB,
      ADD COLUMN IF NOT EXISTS design_meta JSONB;
  END IF;
END $$;
