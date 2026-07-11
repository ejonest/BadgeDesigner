-- Print-ready SVG for CorelDRAW (text + icon + registration shape; no background art).
-- Stored separately from full_image_url (proof/production preview SVG with backgrounds).

ALTER TABLE public.badge_order_items
  ADD COLUMN IF NOT EXISTS print_svg_url TEXT;

COMMENT ON COLUMN public.badge_order_items.print_svg_url IS
  'CorelDRAW print SVG: colored text, icon, and die registration only (no plate fill or background photo).';

ALTER TABLE public.sign_order_items
  ADD COLUMN IF NOT EXISTS print_svg_url TEXT;

ALTER TABLE public.plaque_order_items
  ADD COLUMN IF NOT EXISTS print_svg_url TEXT;

ALTER TABLE public.desk_sign_order_items
  ADD COLUMN IF NOT EXISTS print_svg_url TEXT;
