-- desk_sign_order_items is missing full_image_url (proof SVG).
-- ATC writes this column; without it PostgREST returns PGRST204.
-- Run in Supabase SQL Editor, then retry add-to-cart.

ALTER TABLE public.desk_sign_order_items
  ADD COLUMN IF NOT EXISTS full_image_url TEXT NULL;

COMMENT ON COLUMN public.desk_sign_order_items.full_image_url IS
  'Proof / customer-facing SVG (mockup). print_svg_url is manufacturing.';

-- Optional: refresh PostgREST schema cache if inserts still say "schema cache"
-- (Supabase Dashboard → Project Settings → API → Reload schema, or wait ~1 min)
