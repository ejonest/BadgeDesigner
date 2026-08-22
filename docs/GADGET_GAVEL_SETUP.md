# Gavel designer: new Gadget app + Supabase tables

The Remix app is already wired (`/gavel-designer`, `gavel_designs` / `gavel_order_items`, `/api/save-gavel`, `/api/link-order-gavel-to-supabase`). This checklist creates the **Gadget** app and applies **Supabase** schema.

Use a **new Gadget app** (do not add `GavelDesign` to All Quality Badges). Signs-by-Lita already has its own app; Gavels Fast should too.

---

## 1. Supabase (same project as `SUPABASE_URL`)

In **SQL Editor**, run in order:

1. [`docs/migration_create_gavel_tables.sql`](migration_create_gavel_tables.sql) — two tables, JSON-first
2. [`docs/migration_create_gavel_storage_buckets.sql`](migration_create_gavel_storage_buckets.sql) — `gavel-images`, `gavel-pdfs`
3. [`docs/migration_add_is_qa_test_to_order_items.sql`](migration_add_is_qa_test_to_order_items.sql) — if you have not already (now includes `gavel_order_items`)

### Tables

| Table | Role |
|--------|------|
| `gavel_designs` | Saved-library / autosave. Full state in `design_data` JSONB (includes `gavelBandColor` / `gavelPlateColor`). Shopify shopper in `user_id`, shop in `shop_id`. `total_price` only (no `base_price` / backing). `created_at` / `updated_at`. Optional `thumbnail_url` / `full_image_url`. |
| `gavel_order_items` | Cart + paid line snapshots. Shopify `shopify_customer_id`, `shopify_order_id`, `shopify_order_number`. Mockup JPG `thumbnail_url`, proof SVG `full_image_url`, print SVG `print_svg_url`, proof PDF `pdf_url`. Designer JSON in `data_json` (not `badge_json` / not `line_*`). `created_at` / `updated_at`. |

Server writes use `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS).

---

## 2. Create the Gadget app

1. [gadget.new](https://gadget.new) → **Create app**.
2. Suggested slug: `gavels-fast-connection` (API URL becomes `https://gavels-fast-connection--development.gadget.app`).
3. Framework **v1.7+**.
4. **Connections → Shopify** → install on the **Gavels Fast** store.
   - Scopes: read orders (needed for `orders/paid` / `orders/create`).
   - Re-authenticate after changing scopes.
5. Copy an **API key** from Gadget **Settings → API keys** (server key for Vercel).

### Model `gavelDesign` (JSON-first)

Create a model with API identifier **`gavelDesign`** (GraphQL: `createGavelDesign`, input `CreateGavelDesignInput`, selection `gavelDesign`).

| Field | Type | Notes |
|--------|------|--------|
| `designId` | string | Unique. Matches cart `_Design ID`. |
| `shopId` | string | Shop domain or Shopify shop id. |
| `productId` | string | Optional. |
| `userId` | string | Shopify **customer** id when logged in. |
| `status` | enum | `draft` / `saved` / `ordered` (or string). |
| `designData` | json | Full designer payload (`allBadges`, gavel options). **No `textLines` / line_* fields.** |

Enable **Create** (and Update if you want upserts later) with an **API trigger** so Vercel can call GraphQL with the API key.

Access control: the **API key** role must be allowed to create `gavelDesign`.

CLI (after `ggt login` and `ggt add` targeting this app):

```bash
ggt add model gavelDesign designId:string shopId:string productId:string userId:string status:string designData:json
```

Then unique-index `designId` in the Gadget editor if you want lookups by cart design id.

### Global action `on_order_paid`

1. **Actions → New global action** named `on_order_paid` (or `on_order_paid_gavel`).
2. **TRIGGERS → + → Shopify → `orders/paid`**. If that topic never fires on this store, add **`orders/create`** as a second trigger (same as signs).
3. Paste [`docs/gadget-on-order-paid-gavel.ts`](gadget-on-order-paid-gavel.ts) into the action (keep Gadget’s `run` / `logger` imports if the editor already generated them).
4. Save. Let Gadget update `shopify.app.toml`. On **development**, register webhooks on the Shopify connection if the editor asks.

### Gadget environment variables

| Variable | Value |
|----------|--------|
| `VERCEL_LINK_ORDER_GAVEL_URL` | `https://<your-vercel-app>.vercel.app/api/link-order-gavel-to-supabase` |
| `LINK_ORDER_SECRET_GAVEL` | Same random secret as Vercel (or omit and set `LINK_ORDER_SECRET` on both) |

Generate: `openssl rand -hex 32`

---

## 3. Vercel / local env

| Variable | Purpose |
|----------|---------|
| `GADGET_GAVEL_API_URL` | e.g. `https://gavels-fast-connection--development.gadget.app` |
| `GADGET_GAVEL_API_KEY` | Server API key |
| `LINK_ORDER_SECRET_GAVEL` | Must match Gadget |

If these are unset, gavel save **falls back** to the badge `GADGET_API_URL` / `GADGET_API_KEY`, which will **not** have `createGavelDesign`. Add-to-cart still works (Gadget save is non-blocking); checkout linking **requires** the webhook + secret.

Existing: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## 4. Shopify theme

Theme snippet [`shopify-theme-gavelsfast/snippets/gavel-designer-embed.liquid`](../shopify-theme-gavelsfast/snippets/gavel-designer-embed.liquid) must point `gavel_designer_origin` at this Vercel app. Iframe should pass `shop` and `customerId` so `user_id` / `shopify_customer_id` populate.

Cart lines include `_Designer=gavel`, `_Design ID`, `_Gadget Design ID`, `_Gavel Index`.

---

## 5. Verify

1. **Add to cart** with the designer: `gavel_order_items` row (`status` `in_cart`), `data_json` present, thumbnail + print SVG URLs, `gavel-images` / `gavel-pdfs` objects.
2. **Gadget** `gavelDesign` record with `designData` JSON (if API key is set).
3. **Test checkout**: Gadget logs `on_order_paid`; Vercel logs `link-order-gavel-to-supabase`; row gets `shopify_order_id`, `shopify_customer_id`, `status` `order_placed`.

If Vercel never receives the POST, the Shopify trigger is missing — same diagnosis as [`docs/GADGET_1.7_SIGN_ORDER_WEBHOOK.md`](GADGET_1.7_SIGN_ORDER_WEBHOOK.md).
