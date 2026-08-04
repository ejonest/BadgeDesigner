-- desk_sign_designs — mirrors public.badge_designs (indexes, checks, trigger).
-- Extra vs badges: uploaded_image_url (user logo), same as sign/plaque designs.
--
-- Safe to re-run. If the table already exists from migration_create_desk_sign_tables.sql,
-- this adds any missing indexes/constraints and columns.
--
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.desk_sign_designs (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  design_id TEXT NOT NULL,
  product_id TEXT NOT NULL DEFAULT ''::text,
  shop_id TEXT NOT NULL,
  user_id TEXT NULL,
  background_color TEXT NULL,
  backing_price DOUBLE PRECISION NULL,
  backing_type TEXT NULL,
  base_price DOUBLE PRECISION NULL,
  total_price DOUBLE PRECISION NULL,
  design_data JSONB NULL,
  thumbnail_url TEXT NULL,
  full_image_url TEXT NULL,
  uploaded_image_url TEXT NULL,
  status TEXT NOT NULL DEFAULT 'saved'::text,
  created_at TIMESTAMPTZ NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NULL DEFAULT now(),
  save_kind TEXT NULL,
  CONSTRAINT desk_sign_designs_pkey PRIMARY KEY (id),
  CONSTRAINT desk_sign_designs_save_kind_check CHECK (
    (
      (save_kind IS NULL)
      OR (
        save_kind = ANY (
          ARRAY[
            'autosave'::text,
            'manual'::text,
            'cart'::text,
            'ordered'::text
          ]
        )
      )
    )
  ),
  CONSTRAINT desk_sign_designs_status_check CHECK (
    (
      status = ANY (
        ARRAY[
          'draft'::text,
          'saved'::text,
          'ordered'::text,
          'archived'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

-- Align columns if an older create left them missing / differently typed.
ALTER TABLE public.desk_sign_designs
  ADD COLUMN IF NOT EXISTS uploaded_image_url TEXT NULL;

ALTER TABLE public.desk_sign_designs
  ADD COLUMN IF NOT EXISTS save_kind TEXT NULL;

-- Unique design_id (optional for upserts; same as badge_designs_design_id_key).
CREATE UNIQUE INDEX IF NOT EXISTS desk_sign_designs_design_id_key
  ON public.desk_sign_designs USING btree (design_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_user_shop_updated
  ON public.desk_sign_designs USING btree (user_id, shop_id, updated_at DESC) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_user_shop_save_kind
  ON public.desk_sign_designs USING btree (user_id, shop_id, save_kind) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_user_id
  ON public.desk_sign_designs USING btree (user_id) TABLESPACE pg_default
  WHERE (user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_shop_id
  ON public.desk_sign_designs USING btree (shop_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_status
  ON public.desk_sign_designs USING btree (status) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_desk_sign_designs_updated_at
  ON public.desk_sign_designs USING btree (updated_at DESC) TABLESPACE pg_default;

-- Named status / save_kind checks (drop loose inline checks from older create if present).
ALTER TABLE public.desk_sign_designs
  DROP CONSTRAINT IF EXISTS desk_sign_designs_status_check;
ALTER TABLE public.desk_sign_designs
  ADD CONSTRAINT desk_sign_designs_status_check CHECK (
    (
      status = ANY (
        ARRAY[
          'draft'::text,
          'saved'::text,
          'ordered'::text,
          'archived'::text
        ]
      )
    )
  );

ALTER TABLE public.desk_sign_designs
  DROP CONSTRAINT IF EXISTS desk_sign_designs_save_kind_check;
ALTER TABLE public.desk_sign_designs
  ADD CONSTRAINT desk_sign_designs_save_kind_check CHECK (
    (
      (save_kind IS NULL)
      OR (
        save_kind = ANY (
          ARRAY[
            'autosave'::text,
            'manual'::text,
            'cart'::text,
            'ordered'::text
          ]
        )
      )
    )
  );

DROP TRIGGER IF EXISTS update_desk_sign_designs_updated_at ON public.desk_sign_designs;
CREATE TRIGGER update_desk_sign_designs_updated_at
  BEFORE UPDATE ON public.desk_sign_designs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.desk_sign_designs IS
  'Desk sign designer design library / milestones (parallel to badge_designs).';

COMMENT ON COLUMN public.desk_sign_designs.uploaded_image_url IS
  'Optional user-uploaded logo URL for this saved design.';
