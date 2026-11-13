-- Plaque design catalog (published artwork + format metadata for the iframe).
-- Safe to re-run. Apply in the Supabase SQL Editor for the project in SUPABASE_URL.
--
-- Photos live in the existing public bucket plaque-images under catalog/{slug}/{frame}-{plate}.jpg.
-- shop_id '' means the row is available to every store. A store-specific row uses the
-- same slug and replaces the global row for that shop.
-- Rows are archived, never deleted, so saved orders can keep their format snapshot.

CREATE TABLE IF NOT EXISTS public.plaque_catalog_designs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL,
  shop_id TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  sort INTEGER NOT NULL DEFAULT 0,
  layout_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  schema_version INTEGER NOT NULL DEFAULT 1,
  default_plate TEXT NOT NULL,
  default_frame TEXT NOT NULL DEFAULT 'wood',
  show_in_attached_picker BOOLEAN NOT NULL DEFAULT false,
  format JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plaque_catalog_designs_shop_slug_key UNIQUE (shop_id, slug),
  CONSTRAINT plaque_catalog_designs_status_check CHECK (
    status IN ('draft', 'published', 'archived')
  ),
  CONSTRAINT plaque_catalog_designs_plate_check CHECK (
    default_plate IN ('black-white', 'white-black', 'gold', 'silver', 'full-color')
  ),
  CONSTRAINT plaque_catalog_designs_frame_check CHECK (
    default_frame IN ('wood', 'black')
  )
);

CREATE INDEX IF NOT EXISTS idx_plaque_catalog_designs_published
  ON public.plaque_catalog_designs (status, sort);

CREATE TABLE IF NOT EXISTS public.plaque_catalog_variants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  design_id UUID NOT NULL REFERENCES public.plaque_catalog_designs (id) ON DELETE CASCADE,
  plate TEXT NOT NULL,
  frame TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  image_url TEXT NOT NULL,
  width INTEGER NOT NULL DEFAULT 400,
  height INTEGER NOT NULL DEFAULT 400,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT plaque_catalog_variants_design_plate_frame_key UNIQUE (design_id, plate, frame),
  CONSTRAINT plaque_catalog_variants_plate_check CHECK (
    plate IN ('black-white', 'white-black', 'gold', 'silver', 'full-color')
  ),
  CONSTRAINT plaque_catalog_variants_frame_check CHECK (
    frame IN ('wood', 'black')
  )
);

ALTER TABLE public.plaque_catalog_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plaque_catalog_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plaque_catalog_designs_public_read ON public.plaque_catalog_designs;
CREATE POLICY plaque_catalog_designs_public_read
  ON public.plaque_catalog_designs
  FOR SELECT
  TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS plaque_catalog_variants_public_read ON public.plaque_catalog_variants;
CREATE POLICY plaque_catalog_variants_public_read
  ON public.plaque_catalog_variants
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.plaque_catalog_designs AS design
      WHERE design.id = design_id
        AND design.status = 'published'
    )
  );

COMMENT ON TABLE public.plaque_catalog_designs IS
  'Published plaque designs for the designer iframe. Customer saves store a format snapshot and do not read this row again at print time.';
COMMENT ON COLUMN public.plaque_catalog_designs.shop_id IS
  'Empty string is the global catalog. A non-empty shop overrides that slug for one store.';
COMMENT ON COLUMN public.plaque_catalog_designs.format IS
  'Renderer-supported award format JSON (border, divider, and text slots).';
COMMENT ON TABLE public.plaque_catalog_variants IS
  'Finished product photos for one design, keyed by plate finish and frame.';
