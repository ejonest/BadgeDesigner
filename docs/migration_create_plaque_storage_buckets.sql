-- Plaque designer: Storage buckets + read policies.
-- Names must match app/config/designers.ts (plaque.imageBucket, plaque.pdfBucket).
--
-- Run in Supabase SQL Editor (same project as SUPABASE_URL). Safe to re-run: buckets use
-- ON CONFLICT DO NOTHING; policies are dropped then recreated.
--
-- Server-side uploads use SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). Public URLs in the
-- browser still need SELECT access — use public buckets + policies below.

INSERT INTO storage.buckets (id, name, public)
VALUES ('plaque-images', 'plaque-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('plaque-pdfs', 'plaque-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow anyone to read objects via public URL (matches badge-images pattern in supabase-schema.sql).
DROP POLICY IF EXISTS "Public read plaque-images" ON storage.objects;
CREATE POLICY "Public read plaque-images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'plaque-images');

DROP POLICY IF EXISTS "Public read plaque-pdfs" ON storage.objects;
CREATE POLICY "Public read plaque-pdfs"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'plaque-pdfs');

-- Optional: direct browser uploads with the anon key + logged-in user (not used by default Remix routes).
DROP POLICY IF EXISTS "Authenticated upload plaque-images" ON storage.objects;
CREATE POLICY "Authenticated upload plaque-images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'plaque-images'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Authenticated upload plaque-pdfs" ON storage.objects;
CREATE POLICY "Authenticated upload plaque-pdfs"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'plaque-pdfs'
    AND auth.role() = 'authenticated'
  );
