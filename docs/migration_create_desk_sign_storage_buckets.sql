-- Desk sign designer: Storage buckets + read policies.
-- Names must match app/config/designers.ts (desk-sign.imageBucket, desk-sign.pdfBucket).
--
-- Run in Supabase SQL Editor (same project as SUPABASE_URL). Safe to re-run: buckets use
-- ON CONFLICT DO NOTHING; policies are dropped then recreated.
--
-- Server-side uploads use SUPABASE_SERVICE_ROLE_KEY (bypasses RLS). Public URLs in the
-- browser still need SELECT access — use public buckets + policies below.

INSERT INTO storage.buckets (id, name, public)
VALUES ('desk-sign-images', 'desk-sign-images', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('desk-sign-pdfs', 'desk-sign-pdfs', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read desk-sign-images" ON storage.objects;
CREATE POLICY "Public read desk-sign-images"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'desk-sign-images');

DROP POLICY IF EXISTS "Public read desk-sign-pdfs" ON storage.objects;
CREATE POLICY "Public read desk-sign-pdfs"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'desk-sign-pdfs');

DROP POLICY IF EXISTS "Authenticated upload desk-sign-images" ON storage.objects;
CREATE POLICY "Authenticated upload desk-sign-images"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'desk-sign-images'
    AND auth.role() = 'authenticated'
  );

DROP POLICY IF EXISTS "Authenticated upload desk-sign-pdfs" ON storage.objects;
CREATE POLICY "Authenticated upload desk-sign-pdfs"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'desk-sign-pdfs'
    AND auth.role() = 'authenticated'
  );
