-- Migration: Add shopify_order_number to badge_order_items
-- Used by api.link-order-to-supabase when Gadget calls after order paid (Option A).
-- Human-readable order number (e.g. #1001) for manufacturing/fulfillment.

BEGIN;

ALTER TABLE public.badge_order_items
  ADD COLUMN IF NOT EXISTS shopify_order_number TEXT;

COMMENT ON COLUMN public.badge_order_items.shopify_order_number IS 'Human-readable Shopify order number (e.g. #1001) from Gadget link-order flow';

COMMIT;
