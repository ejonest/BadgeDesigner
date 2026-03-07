# Link order to Supabase – troubleshooting

When a customer checks out, **shopify_order_id**, **shopify_order_number**, **status**, and **updated_at** on `badge_order_items` are updated by this flow:

| Step | Who | What |
|------|-----|------|
| 1 | **Shopify** | Sends `orders/paid` webhook after checkout |
| 2 | **Gadget** | Global Action (e.g. `on_order_paid`) runs; reads line item properties ("Design ID", "Badge Index"); POSTs to Vercel |
| 3 | **Vercel** | `api.link-order-to-supabase` receives POST, checks `LINK_ORDER_SECRET`, updates Supabase |
| 4 | **Supabase** | Table `badge_order_items` rows are updated (shopify_order_id, shopify_order_number, status, updated_at) |

So the process is: **Shopify → Gadget → Vercel → Supabase**. The table itself is only written by Vercel (and by add-to-cart); Gadget never talks to Supabase directly.

---

## If the table does not update after checkout

### 1. VERCEL_LINK_ORDER_URL and LINK_ORDER_SECRET (Gadget ↔ Vercel)

- **VERCEL_LINK_ORDER_URL** in Gadget must be your real Vercel app URL, for example:
  - `https://all-quality-design-tool.vercel.app/api/link-order-to-supabase`
  - No trailing slash on the domain; path is `/api/link-order-to-supabase`.
- **LINK_ORDER_SECRET** must be the same in **Gadget** and **Vercel**. If they differ, Vercel returns 401 and no update runs.

**Check:** In Gadget logs for the `on_order_paid` run, look for:
- “on_order_paid: linked order to Supabase” with `updatedCount > 0` → Vercel succeeded.
- “on_order_paid: Vercel API error” with status 401 → secret mismatch or wrong URL.
- “fetch failed” → wrong URL, network, or Vercel not receiving the request.

**Check:** In Vercel (Functions / Runtime Logs), look for:
- “[BadgeDesigner] api.link-order-to-supabase request received” → request reached your app.
- “link-order-to-supabase unauthorized” → secret mismatch.
- “link-order-to-supabase result” with `updatedCount` → how many rows were updated.

### 2. Supabase table name and structure

- The app updates the table named **`badge_order_items`** (in `public`).
- If you recreated the table as `badge_order_items_new`, you must **rename** it to `badge_order_items` after dropping the old one; otherwise the code is still updating the old (possibly empty) table or a missing table.
- Required columns for the link-order update: **design_id**, **badge_id**, **status**, **shopify_order_id**, **shopify_order_number** (optional), **updated_at**, and optionally **shopify_customer_id**. If any are missing, the update can fail (check Vercel logs for 500 and the error message).

### 3. Rows must exist and match (design_id, badge_id, status)

- At **add-to-cart**, your app (via `api.send-to-supabase`) inserts/upserts rows with `design_id`, `badge_id` = `badge-0`, `badge-1`, … and `status` = `'in_cart'` (or `'draft'`).
- At **checkout**, Gadget sends line items with properties **Design ID** and **Badge Index** (0-based). Vercel updates rows where:
  - `design_id` = that Design ID  
  - `badge_id` = `badge-0`, `badge-1`, … from Badge Index  
  - `status` IN (`'draft'`, `'in_cart'`).

If no row matches (e.g. different `design_id`, or `badge_id` not `badge-0`/`badge-1`, or status already `order_placed`), **updatedCount** will be 0 even if the request succeeds.

---

## Quick checklist

- [ ] Gadget env: **VERCEL_LINK_ORDER_URL** = `https://all-quality-design-tool.vercel.app/api/link-order-to-supabase` (or your real Vercel URL).
- [ ] Gadget and Vercel: **LINK_ORDER_SECRET** identical.
- [ ] Vercel env: **SUPABASE_URL**, **SUPABASE_SERVICE_ROLE_KEY** set.
- [ ] Supabase: table is named **`badge_order_items`** and has the required columns.
- [ ] Cart line items include **Design ID** and **Badge Index** (add-to-cart sets these).
- [ ] Gadget logs: “linked order to Supabase” and **updatedCount > 0** (or investigate the error).
- [ ] Vercel logs: “link-order-to-supabase result” and **updatedCount** (or 401/500 error).
