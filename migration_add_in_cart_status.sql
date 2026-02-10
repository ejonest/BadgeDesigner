-- Allow status 'in_cart' on badge_order_items (set when user clicks Add to Cart).
-- Run in Supabase: SQL Editor -> New query -> paste and Run.

ALTER TABLE public.badge_order_items
  DROP CONSTRAINT IF EXISTS badge_order_items_status_check;

ALTER TABLE public.badge_order_items
  ADD CONSTRAINT badge_order_items_status_check CHECK (
    status = ANY (ARRAY['draft'::text, 'in_cart'::text, 'order_placed'::text, 'fulfilled'::text])
  );
