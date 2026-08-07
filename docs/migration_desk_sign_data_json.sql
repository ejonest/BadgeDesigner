-- If you already renamed badge_json → data_json in the Table Editor, you can skip this.
-- Ensures desk_sign_order_items has data_json (and migrates any leftover badge_json).

ALTER TABLE public.desk_sign_order_items
  ADD COLUMN IF NOT EXISTS data_json JSONB;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'desk_sign_order_items'
      AND column_name = 'badge_json'
  ) THEN
    UPDATE public.desk_sign_order_items
    SET data_json = badge_json
    WHERE data_json IS NULL AND badge_json IS NOT NULL;
    ALTER TABLE public.desk_sign_order_items DROP COLUMN IF EXISTS badge_json;
  END IF;
END $$;

COMMENT ON COLUMN public.desk_sign_order_items.data_json IS
  'Full designer state for this desk-sign line; used to reopen a cart item for editing.';
