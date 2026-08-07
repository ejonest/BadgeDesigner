-- Replace badge-style background_color / backing_type on desk_sign_order_items
-- with desk-sign-specific manufacturing columns.
--
-- finish: "Acrylic · Clear · 2×8\"" / "Rosewood · Brushed Gold · 2×10\"" /
--         "Traditional · Black · 2×8\"" (material · colored finish · size)
-- attachment_method: "none" (acrylic/rosewood) | "desk" | "wall" (traditional)
--
-- Run in Supabase SQL Editor. Safe to re-run.

ALTER TABLE public.desk_sign_order_items
  ADD COLUMN IF NOT EXISTS finish TEXT NULL;

ALTER TABLE public.desk_sign_order_items
  ADD COLUMN IF NOT EXISTS attachment_method TEXT NULL;

COMMENT ON COLUMN public.desk_sign_order_items.finish IS
  'Material · colored finish · size (e.g. Acrylic · Clear · 2×8").';

COMMENT ON COLUMN public.desk_sign_order_items.attachment_method IS
  'none for acrylic/rosewood; desk or wall for traditional (plastic) mounts.';

ALTER TABLE public.desk_sign_order_items
  DROP COLUMN IF EXISTS background_color;

ALTER TABLE public.desk_sign_order_items
  DROP COLUMN IF EXISTS backing_type;
