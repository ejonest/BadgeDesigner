-- A gavel order line can have two engraved surfaces, not one:
--   * gavel + stand                -> band unwrap + stand plate
--   * gavel + engraved sound block -> band unwrap + sound block top
-- print_svg_url holds the band; this column holds the second surface.
--
-- Safe to run late: writes retry without this column while it is absent
-- (see OPTIONAL_ROW_COLUMNS in app/lib/designers/orderItemsStorage.ts), so a
-- deploy ahead of this migration saves the band only rather than failing.
--
-- Run in Supabase SQL Editor.

ALTER TABLE public.gavel_order_items
  ADD COLUMN IF NOT EXISTS secondary_svg_url TEXT NULL;

COMMENT ON COLUMN public.gavel_order_items.secondary_svg_url IS
  'Print-ready SVG for the second engraved surface: stand plate, or sound block top. Band unwrap stays in print_svg_url.';

COMMENT ON COLUMN public.gavel_order_items.print_svg_url IS
  'Print-ready SVG for the gavel band unwrap. Always the band; see secondary_svg_url.';

COMMENT ON COLUMN public.gavel_order_items.full_image_url IS
  'Proof SVG (band unwrap).';

-- Optional: refresh PostgREST schema cache if inserts still say "schema cache"
-- (Supabase Dashboard -> Project Settings -> API -> Reload schema, or wait ~1 min)
