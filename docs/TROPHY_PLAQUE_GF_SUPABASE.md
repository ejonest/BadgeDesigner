# Trophy + plaque: Gavels Fast Supabase, webhooks, order sheet

Plaque already has Remix APIs (`/api/save-draft-plaque`, `/api/send-plaque-to-supabase`, `/api/link-order-plaque-to-supabase`). Trophy now uses the same JSON-first pattern as gavel/pen.

## 1. Supabase

In the project used by `SUPABASE_URL`, run:

1. **Trophy (new):** [`migration_create_trophy_designer.sql`](migration_create_trophy_designer.sql)
2. **Plaque (if not already applied):** [`migration_create_plaque_tables.sql`](migration_create_plaque_tables.sql), then [`migration_plaque_assets_columns_and_buckets.sql`](migration_plaque_assets_columns_and_buckets.sql) (or [`migration_create_plaque_storage_buckets.sql`](migration_create_plaque_storage_buckets.sql))
3. Optional: [`migration_add_shop_id_to_order_items.sql`](migration_add_shop_id_to_order_items.sql) — production Admin card scopes by shop. Trophy’s create script already includes `shop_id`.

No new `SUPABASE_*` keys. Server writes use `SUPABASE_SERVICE_ROLE_KEY`.

| Designer | Tables | Buckets |
| --- | --- | --- |
| Trophy | `trophy_designs`, `trophy_order_items` | `trophy-images`, `trophy-pdfs` |
| Plaque | `plaque_designs`, `plaque_order_items` | `plaque-images`, `plaque-pdfs` |

## 2. Vercel secrets

Existing shared values are enough:

| Variable | Role |
| --- | --- |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Tables + storage |
| `LINK_ORDER_SECRET` | Bearer used when the native webhook calls link-order internally |
| `SHOPIFY_WEBHOOK_SECRET_GAVEL` | HMAC for `POST /api/shopify-order-webhook-gavel` |

Optional overrides (only if you want designer-specific Bearer secrets):

- `LINK_ORDER_SECRET_TROPHY`
- `LINK_ORDER_SECRET_PLAQUE`
- `LINK_ORDER_SECRET_GAVEL`

Gadget models are **not** required. Trophy/plaque save-to-Gadget is best-effort and falls back locally. Paid-order linking on Gavels Fast is the native Shopify webhook.

## 3. Shopify `orders/paid` webhook (Gavels Fast)

Keep the existing webhook:

- Event: **Order payment**
- URL: `https://all-quality-design-tool.vercel.app/api/shopify-order-webhook-gavel`
- Secret in Vercel: `SHOPIFY_WEBHOOK_SECRET_GAVEL`

That route now links **gavel, pen, trophy, and plaque** lines (`_Designer` on the cart line). Do **not** point Gavels Fast at `/api/shopify-order-webhook-plaque` (that is Signs by Lita).

If Gadget `on_order_paid` is still installed, paste the updated [`gadget-on-order-paid-gavel.ts`](gadget-on-order-paid-gavel.ts) so it POSTs trophy/plaque as well. Native Shopify + Gadget both calling link-order is idempotent on `(design_id, trophy_id)` / `(design_id, plaque_id)`.

## 4. Production-order Admin block

The custom block on the Shopify order page loads `/api/production/order`. It already queries every designer table in `DESIGNER_IDS`. After trophy tables exist and paid orders are linked (`status = order_placed`, `shopify_order_id` set), trophy and plaque lines show with text, specs, thumbnail, print SVG, and proof PDF.

Requires `SHOPIFY_ADMIN_GF_CLIENT_SECRET` (already used for gavel/pen).

## 5. Verify

1. Add a trophy (and a plaque) to cart from the Gavels Fast product pages.
2. Confirm `trophy_order_items` / `plaque_order_items` rows at `in_cart` with `data_json` and image/PDF URLs.
3. Check out.
4. Vercel logs: `[gavel-webhook] … trophy` / `plaque`.
5. Rows become `order_placed` with `shopify_order_id`.
6. Open the order in Admin and confirm the production card.
