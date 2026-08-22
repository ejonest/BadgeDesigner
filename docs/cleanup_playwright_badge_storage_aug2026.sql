-- Preview orphaned Playwright files in badge-images / badge-pdfs
-- (Aug 13–14 2026 UTC, design_* folders that are no longer in badge_order_items).
--
-- This SQL is PREVIEW ONLY. Deleting storage.objects here does NOT free
-- bucket space — use scripts/purge-orphaned-badge-storage.mjs for that.
--
-- HOW TO RUN (Supabase Dashboard → SQL Editor):
--   1. Run the counts/size preview.
--   2. Glance at the KEEP check (Madison / #1096 folder must NOT appear below).
--   3. If counts look right, from the repo:
--        node --env-file=.env scripts/purge-orphaned-badge-storage.mjs --dry-run
--        node --env-file=.env scripts/purge-orphaned-badge-storage.mjs
--
-- DONE — this Aug 2026 cleanup has already been run. For ongoing use prefer
-- the general versions, which cover every designer bucket and every date:
--   node --env-file=.env scripts/inspect-supabase-storage.mjs          (read only)
--   node --env-file=.env scripts/purge-orphaned-designer-storage.mjs --dry-run
--   node --env-file=.env scripts/purge-orphaned-designer-storage.mjs

-- ========== COUNTS + SIZE ==========
SELECT
  b.name AS bucket,
  count(*) AS files,
  pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0)) AS approx_size
FROM storage.objects o
JOIN storage.buckets b ON b.id = o.bucket_id
WHERE b.name IN ('badge-images', 'badge-pdfs')
  AND o.created_at >= '2026-08-13 00:00:00+00'
  AND o.created_at <  '2026-08-15 00:00:00+00'
  AND split_part(o.name, '/', 1) LIKE 'design_%'
  AND split_part(o.name, '/', 1) NOT IN (
    SELECT design_id FROM badge_order_items WHERE design_id IS NOT NULL
  )
GROUP BY b.name
ORDER BY b.name;

-- Real order's files that MUST stay (should return rows, not empty):
SELECT b.name AS bucket, o.name, o.created_at
FROM storage.objects o
JOIN storage.buckets b ON b.id = o.bucket_id
WHERE b.name IN ('badge-images', 'badge-pdfs')
  AND o.name LIKE 'design_1786625374290_k2gqcwidk/%'
ORDER BY b.name, o.name;
