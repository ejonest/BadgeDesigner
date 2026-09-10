# Pen designer production setup

The application and AQB theme are already wired for the pen designer:

- Vercel route: `/pen-designer`
- draft API: `/api/save-draft-pen`
- finalization API: `/api/finalize-draft`
- paid-order link API: `/api/link-order-pen-to-supabase`
- Shopify template: `shopify-theme-aqb/templates/product.pen-designer.json`
- iframe embed: `shopify-theme-aqb/snippets/badge-designer-embed.liquid`

This checklist supplies the external Supabase, Vercel, and Shopify pieces.

## 1. Supabase

In the same Supabase project used by `SUPABASE_URL`, open **SQL Editor** and
run [`migration_create_pen_designer.sql`](migration_create_pen_designer.sql).
The migration is idempotent and creates:

- `pen_designs`: saved-design library and autosaves
- `pen_order_items`: draft, cart, and paid-order manufacturing snapshots
- `pen-images`: public thumbnails, printable case-band SVGs, printable
  pen-cap SVGs, and original uploaded artwork
- `pen-pdfs`: public proof PDFs

The tables have RLS enabled with no client policies. All table writes and
reads go through the server-side service-role client. Storage objects are
public because Shopify cart properties and the production-order Admin
extension open their URLs directly.

Do not put `SUPABASE_SERVICE_ROLE_KEY` in any `VITE_*` variable or theme code.

## 2. Vercel environment

The shared production project needs these existing server variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | yes for the current shared client | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Tables and storage; server-only |

Because the pen uses the same storefront, Supabase project, and paid-order
webhook as the existing designers, it normally needs no new Vercel variables.
The shared `LINK_ORDER_SECRET` and `SHOPIFY_WEBHOOK_SECRET_AQB` continue to be
used. `LINK_ORDER_SECRET_PEN` is supported only as an optional override.

After changing Vercel variables, redeploy Production so server functions load
the new values.

## 3. Paid-order linking

The draft row becomes `order_placed` when the existing AQB `orders/paid`
webhook posts the Shopify order and its pen line properties back to Vercel.

The shared `/api/shopify-order-webhook-aqb` route now accepts pen lines as
well as badges and desk signs. If the AQB `orders/paid` webhook is already
registered, no new Shopify webhook is needed.

Keep its existing `SHOPIFY_WEBHOOK_SECRET_AQB` (or generic
`SHOPIFY_WEBHOOK_SECRET`) in Vercel. The pen link handler also needs
`LINK_ORDER_SECRET_PEN`; if the shared `LINK_ORDER_SECRET` already exists, the
code uses that as a fallback and no pen-specific secret is needed.

## 4. Shopify storefront

1. Deploy `shopify-theme-aqb`.
2. In Shopify Admin, assign product template **`pen-designer`** to the custom
   pen product.
3. Ensure the product has an available variant. The theme passes that variant
   id and Shopify price into the iframe; without it, add-to-cart is blocked.
4. Confirm the embed origin remains
   `https://all-quality-design-tool.vercel.app`.

The iframe passes `shop`, `product`, `variantId`, `price`, and (for signed-in
customers) `customerId`.

## 5. End-to-end verification

1. Customize both surfaces and add one pen to the Shopify cart.
2. Confirm one `pen_order_items` row:
   - `status = in_cart`
   - `pen_id = pen-0`
   - `data_json` populated
   - `thumbnail_url`, `full_image_url`, `print_svg_url`,
     `secondary_svg_url`, and `pdf_url` populated
3. Confirm the corresponding objects exist in `pen-images` and `pen-pdfs`.
4. Place a test order.
5. Confirm the paid-order handler reaches Vercel and updates:
   - `status = order_placed`
   - `shopify_order_id`, `shopify_order_number`, `shopify_customer_id`, and
     `shop_id`
6. Open the production-order Admin card and verify both printable SVG links
   and the proof PDF.

