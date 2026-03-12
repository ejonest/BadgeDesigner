-- Add quantity column to badge_order_items (and use same for sign_order_items / stamp_order_items when you add those tables).
-- Quantity is set to 1 when the user adds to cart; at checkout (link-order) we update it from the order line item quantity.
-- Run this in Supabase SQL Editor against your project.
-- See docs/QUANTITY_COLUMN_SETUP.md for full steps and future sign/stamp tables.

ALTER TABLE public.badge_order_items
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.badge_order_items.quantity IS 'Number of units for this design/badge; 1 at add-to-cart, updated from order line item at checkout.';
