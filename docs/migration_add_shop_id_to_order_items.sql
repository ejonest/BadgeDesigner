-- Scope production-order Admin card lookups to the Shopify store that owns them.
-- Safe to run repeatedly and safe when a future designer table does not exist.

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'badge_order_items',
    'sign_order_items',
    'plaque_order_items',
    'stamp_order_items',
    'nameplate_order_items',
    'desk_sign_order_items',
    'gavel_order_items',
    'pen_order_items'
  ]
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS shop_id text',
        table_name
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON public.%I (shop_id, shopify_order_id)',
        'idx_' || table_name || '_shop_order',
        table_name
      );
    END IF;
  END LOOP;
END
$$;
