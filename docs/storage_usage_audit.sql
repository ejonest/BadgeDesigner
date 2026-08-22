-- Why does the dashboard say we're over quota when the buckets are small?
--
-- Run these in Supabase Dashboard → SQL Editor and compare against the
-- recursive bucket walk (scripts/storage-usage-audit.mjs), which as of
-- 2026-08-21 reports 985 files / 284.5 MB across all buckets.
--
-- Query 1 is the number Supabase bills storage on. If it matches ~284 MB but
-- the usage page still says 1.3 GB, the buckets are fine and the usage metric
-- is just stale — it recomputes on a schedule, not on delete.
-- If it is much LARGER than 284 MB, there are catalog rows we cannot see over
-- the API, and query 2 shows which bucket they are in.


-- ========== 1. Storage total, as Supabase measures it ==========
SELECT
  count(*)                                                        AS files,
  pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0))   AS billed_size
FROM storage.objects;


-- ========== 2. Same, broken down per bucket ==========
SELECT
  b.name                                                            AS bucket,
  count(o.id)                                                       AS files,
  pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0))    AS billed_size
FROM storage.buckets b
LEFT JOIN storage.objects o ON o.bucket_id = b.id
GROUP BY b.name
ORDER BY coalesce(sum((o.metadata->>'size')::bigint), 0) DESC;


-- ========== 3. Rows with no size metadata ==========
-- These are usually failed or interrupted uploads. They occupy space in the
-- backing store but report as 0 bytes, so they hide from every size query.
SELECT b.name AS bucket, count(*) AS objects_missing_size
FROM storage.objects o
JOIN storage.buckets b ON b.id = o.bucket_id
WHERE o.metadata->>'size' IS NULL
GROUP BY b.name;


-- ========== 4. Abandoned multipart uploads ==========
-- A large upload that never completed leaves parts behind that are billed but
-- appear in no bucket listing. This is a common cause of a phantom gap.
SELECT count(*) AS in_flight_multipart_uploads
FROM storage.s3_multipart_uploads;

SELECT count(*) AS orphaned_parts,
       pg_size_pretty(coalesce(sum(size), 0)) AS parts_size
FROM storage.s3_multipart_uploads_parts;


-- ========== 5. Database size (a different quota from storage) ==========
-- If the 1.3 GB figure is the DATABASE line rather than the STORAGE line,
-- this is the number to watch. Deleting ~1,400 badge_order_items rows does
-- not shrink the table on its own.
SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size;

SELECT
  c.relname                                            AS table_name,
  pg_size_pretty(pg_total_relation_size(c.oid))        AS total_size,
  s.n_live_tup                                         AS live_rows,
  s.n_dead_tup                                         AS dead_rows,
  s.last_autovacuum
FROM pg_class c
JOIN pg_stat_user_tables s ON s.relid = c.oid
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 15;

-- If badge_order_items shows a large dead_rows, reclaim it with:
--   VACUUM FULL badge_order_items;
-- (brief exclusive lock on the table — run it outside business hours)


-- ========== 6. Find objects the listing API cannot see ==========
-- scripts/storage-usage-audit.mjs walks every bucket and found 985 files,
-- but storage.objects reports 1513 rows. The difference is billed to us and
-- is unreachable through the normal list()/remove() path, so it has to be
-- found and deleted in SQL.

-- 6a. The 30 largest objects overall — a hidden gigabyte will show up here.
SELECT
  b.name                                   AS bucket,
  o.name                                   AS path,
  pg_size_pretty((o.metadata->>'size')::bigint) AS size,
  o.created_at
FROM storage.objects o
JOIN storage.buckets b ON b.id = o.bucket_id
ORDER BY (o.metadata->>'size')::bigint DESC NULLS LAST
LIMIT 30;

-- 6b. Rows whose path metadata is malformed. These are the ones that go
-- missing from list() results: no path_tokens, an empty name, or a name that
-- ends in a slash (a directory marker left by a broken upload).
SELECT
  b.name AS bucket,
  count(*) AS bad_rows,
  pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0)) AS size
FROM storage.objects o
JOIN storage.buckets b ON b.id = o.bucket_id
WHERE o.path_tokens IS NULL
   OR array_length(o.path_tokens, 1) IS NULL
   OR o.name IS NULL
   OR o.name = ''
   OR o.name LIKE '%/'
GROUP BY b.name;

-- 6c. How deep do paths go? The walk only descends 6 levels, and the purge
-- script only 1, so anything deeper is invisible to both.
SELECT
  array_length(o.path_tokens, 1) AS depth,
  count(*)                       AS objects,
  pg_size_pretty(coalesce(sum((o.metadata->>'size')::bigint), 0)) AS size
FROM storage.objects o
GROUP BY 1
ORDER BY 1;
