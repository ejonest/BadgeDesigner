-- Gavel designer: Storage buckets + read policies.
-- Names must match app/config/designers.ts (gavel.imageBucket, gavel.pdfBucket).
--
-- Run in Supabase SQL Editor (same project as SUPABASE_URL). Safe to re-run.

INSERT INTO storage.buckets (id, name, public)
VALUES ('gavel-images', 'gavel-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('gavel-pdfs', 'gavel-pdfs', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read gavel-images" ON storage.objects;
CREATE POLICY "Public read gavel-images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'gavel-images');

DROP POLICY IF EXISTS "Public read gavel-pdfs" ON storage.objects;
CREATE POLICY "Public read gavel-pdfs"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'gavel-pdfs');

DROP POLICY IF EXISTS "Authenticated upload gavel-images" ON storage.objects;
CREATE POLICY "Authenticated upload gavel-images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'gavel-images'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Authenticated upload gavel-pdfs" ON storage.objects;
CREATE POLICY "Authenticated upload gavel-pdfs"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'gavel-pdfs'
    AND auth.role() = 'authenticated'
  );
