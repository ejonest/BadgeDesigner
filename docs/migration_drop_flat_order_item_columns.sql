-- Optional cleanup after deploying JSON-first order-item writes.
-- App no longer writes flat line_* / background_color / backing_type columns
-- (see INCLUDE_FLAT_MANUFACTURING_COLUMNS in orderItemsStorage.ts). Order-slip
-- PDF and cart-edit read badge_json / data_json.
--
-- Run only after confirming:
-- 1. Deploy with JSON-first writes is live
-- 2. No external SQL / ops reports query these columns
-- 3. Recent in_cart / order_placed rows have badge_json / data_json populated
--
-- Keeps: design_id, line id, status, quantity, asset URLs, shopify_*,
--        badge_json/data_json, design_meta, finish/attachment_method (desk sign).

DO $$
DECLARE
  t text;
  cols text[] := ARRAY[
    'line_1_text', 'line_1_font', 'line_1_font_size', 'line_1_bold',
    'line_1_underline', 'line_1_italicize', 'line_1_color', 'line_1_alignment',
    'line_2_text', 'line_2_font', 'line_2_font_size', 'line_2_bold',
    'line_2_underline', 'line_2_italicize', 'line_2_color', 'line_2_alignment',
    'line_3_text', 'line_3_font', 'line_3_font_size', 'line_3_bold',
    'line_3_underline', 'line_3_italicize', 'line_3_color', 'line_3_alignment',
    'line_4_text', 'line_4_font', 'line_4_font_size', 'line_4_bold',
    'line_4_underline', 'line_4_italicize', 'line_4_color', 'line_4_alignment',
    'line_5_text', 'line_5_font', 'line_5_font_size', 'line_5_bold',
    'line_5_underline', 'line_5_italicize', 'line_5_color', 'line_5_alignment',
    'line_6_text', 'line_6_font', 'line_6_font_size', 'line_6_bold',
    'line_6_underline', 'line_6_italicize', 'line_6_color', 'line_6_alignment',
    'background_color', 'backing_type'
  ];
  c text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'badge_order_items',
    'sign_order_items',
    'plaque_order_items',
    'desk_sign_order_items'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    FOREACH c IN ARRAY cols
    LOOP
      -- Desk signs never had background_color / backing_type / lines 3–6;
      -- IF EXISTS keeps this idempotent.
      EXECUTE format(
        'ALTER TABLE public.%I DROP COLUMN IF EXISTS %I',
        t,
        c
      );
    END LOOP;
  END LOOP;
END $$;
