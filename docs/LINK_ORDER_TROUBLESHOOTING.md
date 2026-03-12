# Link order to Supabase – troubleshooting

When a customer checks out, **shopify_order_id**, **shopify_order_number**, **status**, and **updated_at** on `badge_order_items` are updated by this flow:

| Step | Who          | What                                                                                                                |
| ---- | ------------ | ------------------------------------------------------------------------------------------------------------------- |
| 1    | **Shopify**  | Sends `orders/paid` webhook after checkout                                                                          |
| 2    | **Gadget**   | Global Action (e.g. `on_order_paid`) runs; reads line item properties ("Design ID", "Badge Index"); POSTs to Vercel |
| 3    | **Vercel**   | `api.link-order-to-supabase` receives POST, checks `LINK_ORDER_SECRET`, updates Supabase                            |
| 4    | **Supabase** | Table `badge_order_items` rows are updated (shopify_order_id, shopify_order_number, status, updated_at)             |

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

## How to verify the request reached Vercel

1. **Do a test checkout** (or use the last time you checked out).
2. **Vercel** → your project → **Deployments** → open the deployment → **Functions** or **Runtime Logs**.
3. **Filter by the time of checkout** (e.g. last 1 hour) and search for: **`link-order-to-supabase`**.

**What you’ll see:**

| Log message | Meaning |
|-------------|--------|
| **`[BadgeDesigner] api.link-order-to-supabase request received`** | Request reached this Vercel app. |
| **`link-order-to-supabase unauthorized`** | `LINK_ORDER_SECRET` in Vercel does not match the value in Gadget. |
| **`link-order-to-supabase authorized, processing body`** | Secret matched; body is being processed. |
| **`[BadgeDesigner] link-order payload:`** | Payload received (shopifyOrderId, lineItemCount, firstItem). |
| **`[BadgeDesigner] link-order-to-supabase result`** with **`updatedCount: N`** | Update ran; N rows were updated (0 = no matching rows). |

- If there is **no** log line containing `link-order-to-supabase` at checkout time, the request never hit this Vercel project (Gadget didn’t call it, wrong URL, or webhook/action didn’t run).
- If you see **unauthorized**, fix **LINK_ORDER_SECRET** (must be identical in Gadget and Vercel).
- If you see **result** with **updatedCount: 0**, the request succeeded but no Supabase rows matched (see “Rows must exist and match” above).

**Gadget logs** (optional): In Gadget → Logs for the `on_order_paid` run, look for “on_order_paid: linked order to Supabase” (success) or “on_order_paid: Vercel API error” / “fetch failed” (failure).

---

## Gadget side: was it ever called?

If Vercel never receives a **POST** to `link-order-to-supabase` at checkout time, the break is **before** Vercel: either Shopify did not send the webhook to Gadget, or Gadget did not run the action, or the action did not send the request. Check Gadget as follows.

### 1. Which Gadget environment receives the webhook?

- **Dev store** (dev Shopify app / dev CLID) → webhook goes to **Gadget development** (`...--development.gadget.app`).
- **Production store** (prod Shopify app / prod CLID) → webhook goes to **Gadget production** (`...gadget.app` without `--development`).

Open the Gadget environment that matches the store you used for checkout (development or production).

### 2. Confirm the webhook was received

- In **Gadget**: go to **Logs** (or **API** / **Runs**).
- Filter by the **time of your test checkout** (e.g. last 1–2 hours).
- Search for: **`orders/paid`** or **`shopify`** or **`webhook`**.

If the Shopify plugin is logging webhooks, you should see an entry when an order is paid. If there is **no** webhook log at that time, Shopify may not be sending `orders/paid` to this Gadget app (wrong app, wrong store, or webhook not registered for this environment).

You can also check **Shopify** (Partners → your app → **Webhooks** or **Event subscriptions**) and confirm `orders/paid` is subscribed and the destination URL matches this Gadget environment webhook URL (e.g. `https://all-quality-badge-designer.gadget.app/api/webhooks/shopify` for production).

### 3. Confirm the Global Action ran

- In **Gadget** → **Actions** (or **Global Actions** / **API**), open the action that runs on `orders/paid` (e.g. **onOrderPaid** / **on_order_paid**).
- Check that it has a **trigger** for **Shopify webhooks → orders/paid** (or orders/create). If there is no trigger, the action will never run when an order is paid.
- In **Logs**, search for the action name (e.g. **`on_order_paid`** or **`onOrderPaid`**) around the time of checkout.

**What you might see:**

| Log message | Meaning |
|-------------|--------|
| **`on_order_paid: no order in params/trigger/record`** | Action ran but could not find the order in the payload. Trigger or payload shape may be wrong. |
| **`on_order_paid: no badge line items (no Design ID), skipping`** | Action ran; order had no line items with a "Design ID" property, so it never called Vercel. |
| **`on_order_paid: LINK_ORDER_SECRET not set`** | Action ran but env var is missing in this Gadget environment. |
| **`on_order_paid: Vercel API error`** | Action ran and called Vercel; Vercel returned an error (e.g. 401). |
| **`on_order_paid: fetch failed`** | Action ran but the HTTP request to Vercel failed (network, wrong URL, etc.). |
| **`on_order_paid: linked order to Supabase`** | Action ran and Vercel responded successfully. |

If you see **no** log lines containing **`on_order_paid`** at checkout time, then either the webhook did not fire, the action is not triggered by `orders/paid`, or the action is in a different environment than the one receiving the webhook.

### 4. If the action runs but "no badge line items"

The action only sends line items that have a **"Design ID"** (and optionally "Gadget Design ID", "Badge Index") in the line item **properties**. If the cart was built without those properties (e.g. theme or app not adding them), the action exits early and never POSTs to Vercel. Confirm in Shopify that the order line items have **properties** including **Design ID** (and **Badge Index**). Your add-to-cart flow should set these when redirecting to cart or when the theme adds the item.

---

## Quick checklist

- [ ] Gadget env: **VERCEL_LINK_ORDER_URL** = `https://all-quality-design-tool.vercel.app/api/link-order-to-supabase` (or your real Vercel URL).
- [ ] Gadget and Vercel: **LINK_ORDER_SECRET** identical.
- [ ] Vercel env: **SUPABASE_URL**, **SUPABASE_SERVICE_ROLE_KEY** set.
- [ ] Supabase: table is named **`badge_order_items`** and has the required columns.
- [ ] Cart line items include **Design ID** and **Badge Index** (add-to-cart sets these).
- [ ] Gadget logs: “linked order to Supabase” and **updatedCount > 0** (or investigate the error).
- [ ] Vercel logs: “link-order-to-supabase result” and **updatedCount** (or 401/500 error).
