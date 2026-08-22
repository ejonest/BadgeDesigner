-- Mark Playwright / local QA order-item rows so they can be filtered or
-- bulk-deleted without touching real customer drafts and orders.
--
-- Run in Supabase SQL Editor once per table you care about.
-- The app treats this column as optional until the migration is applied
-- (writes retry without it if the column is missing).

-- Only the badge suite is wired up today, but scripts/purge-qa-test-data.mjs
-- checks every designer table, so add the column to all of them. It costs
-- nothing on tables that never receive QA rows.

ALTER TABLE badge_order_items
  ADD COLUMN IF NOT EXISTS is_qa_test boolean NOT NULL DEFAULT false;
ALTER TABLE sign_order_items
  ADD COLUMN IF NOT EXISTS is_qa_test boolean NOT NULL DEFAULT false;
ALTER TABLE plaque_order_items
  ADD COLUMN IF NOT EXISTS is_qa_test boolean NOT NULL DEFAULT false;
ALTER TABLE desk_sign_order_items
  ADD COLUMN IF NOT EXISTS is_qa_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN badge_order_items.is_qa_test IS
  'True when the row was created by Playwright/local QA (URL ?qaTest=1). Safe to filter or delete.';

CREATE INDEX IF NOT EXISTS idx_badge_order_items_is_qa_test
  ON badge_order_items (is_qa_test)
  WHERE is_qa_test = true;
CREATE INDEX IF NOT EXISTS idx_sign_order_items_is_qa_test
  ON sign_order_items (is_qa_test)
  WHERE is_qa_test = true;
CREATE INDEX IF NOT EXISTS idx_plaque_order_items_is_qa_test
  ON plaque_order_items (is_qa_test)
  WHERE is_qa_test = true;
CREATE INDEX IF NOT EXISTS idx_desk_sign_order_items_is_qa_test
  ON desk_sign_order_items (is_qa_test)
  WHERE is_qa_test = true;

DO $$
BEGIN
  IF to_regclass('public.gavel_order_items') IS NOT NULL THEN
    ALTER TABLE public.gavel_order_items
      ADD COLUMN IF NOT EXISTS is_qa_test boolean NOT NULL DEFAULT false;
    CREATE INDEX IF NOT EXISTS idx_gavel_order_items_is_qa_test
      ON public.gavel_order_items (is_qa_test)
      WHERE is_qa_test = true;
  END IF;
END $$;

-- Going forward, wipe QA rows anytime with:
--   DELETE FROM badge_order_items WHERE is_qa_test = true;
-- Or soft-hide them in dashboards:
--   SELECT * FROM badge_order_items WHERE coalesce(is_qa_test, false) = false;
