-- One-time cleanup: Playwright QA rows that flooded badge_order_items
-- (Aug 13–14 2026 UTC local/CI runs against the redesign sandbox).
--
-- HOW TO RUN (Supabase Dashboard → SQL Editor):
--   1. Run the PREVIEW queries first and sanity-check the counts.
--   2. Run the DELETE only if the preview looks right.
--
-- SAFETY:
--   - Keeps every row with a real shopify_order_id (including the Aug 13
--     order_placed design for Madison Flewellen / #1096).
--   - Keeps everything created outside Aug 13–14 UTC.
--   - Does NOT delete Storage objects (thumbnails/PDFs). For those, see
--     docs/cleanup_playwright_badge_storage_aug2026.sql and
--     scripts/purge-orphaned-badge-storage.mjs.
--
-- From the CSV export this targets ~1,400 rows and leaves ~207.

-- ========== PREVIEW ==========
SELECT status, count(*) AS n
FROM badge_order_items
WHERE created_at >= '2026-08-13 00:00:00+00'
  AND created_at <  '2026-08-15 00:00:00+00'
  AND shopify_order_id IS NULL
GROUP BY status
ORDER BY n DESC;

-- Rows that WILL BE KEPT from that window (should include the real order):
SELECT id, design_id, status, shopify_order_id, shopify_order_number,
       shopify_customer_id, created_at
FROM badge_order_items
WHERE created_at >= '2026-08-13 00:00:00+00'
  AND created_at <  '2026-08-15 00:00:00+00'
  AND shopify_order_id IS NOT NULL;

-- ========== DELETE ==========
-- Uncomment to execute:
-- DELETE FROM badge_order_items
-- WHERE created_at >= '2026-08-13 00:00:00+00'
--   AND created_at <  '2026-08-15 00:00:00+00'
--   AND shopify_order_id IS NULL;
