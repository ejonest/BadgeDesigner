-- First-party, store-wide Shopify customer journey events (no PII).
-- Run in the same Supabase project used by the designer event endpoint.
-- Inserts are server-side with the service role; browser access stays disabled.

CREATE TABLE IF NOT EXISTS storefront_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  client_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL,
  page_path TEXT,
  referrer_host TEXT,
  referrer_path TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  product_id TEXT,
  variant_id TEXT,
  cart_id TEXT,
  checkout_token TEXT,
  order_id TEXT,
  currency CHAR(3),
  value NUMERIC(14, 2),
  item_count INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_storefront_events_client_journey
  ON storefront_events (client_id, occurred_at);

CREATE INDEX IF NOT EXISTS idx_storefront_events_name_time
  ON storefront_events (event_name, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_storefront_events_order
  ON storefront_events (order_id)
  WHERE order_id IS NOT NULL;

ALTER TABLE storefront_events ENABLE ROW LEVEL SECURITY;
