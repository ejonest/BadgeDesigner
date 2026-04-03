# Sign store: wire checkout → Vercel (Gadget framework v1.7+)

Your **badge** Gadget app works because **`on_order_paid`** has a **Shopify webhooks** trigger on **`orders/paid`**.  
Your **sign** app’s **`on_order_paid_sign`** only had **Generated API endpoint** — so Shopify never ran that action at checkout. **No trigger = no POST to Vercel = no Supabase update.** Extra models are not required for that POST.

This matches [Gadget’s docs: Shopify webhooks within global actions](https://docs.gadget.dev/guides/plugins/shopify/shopify-webhooks) (v1.7 uses the Triggers UI + `shopify.app.toml`; do not paste pre-1.7 `webhooks: ["orders/paid"]` snippets by hand).

---

## 1. Add the same trigger the badge app has

1. Open the **sign** Gadget project (`signs-by-lita-connection`).
2. Open **`api/actions/on_order_paid_sign.ts`** (or whatever your global action file is named).
3. In the right sidebar, open the **TRIGGERS** panel.
4. Click **`+`**.
5. Choose **Shopify** (Shopify data / webhook trigger — the same type badge uses).
6. Select topic **`orders/paid`** (same as badge). If your dev store never fires `orders/paid`, add **`orders/create`** as well until you see the action run in logs.
7. **Save** the action. In **v1.7+**, Gadget updates **`shopify.app.toml`** with a `[[webhooks.subscriptions]]` entry and links the action via a **`triggerKey`** — let the editor manage that; don’t duplicate old `options.triggers.shopify.webhooks` arrays from pre-1.7 samples.

## 2. Confirm Shopify connection & scopes

- The sign app’s **Shopify connection** must be installed on **Sign-Dev-Store** (or your real sign shop).
- **`orders/paid`** requires order read access (e.g. `read_orders` / whatever your connection exposes for orders). If the topic isn’t offered in the picker, fix **scopes** on the connection and **re-authenticate** the dev store.

## 3. After saving: re-register webhooks (dev)

Per Gadget: on **development**, you may need to **register webhooks** after changing topics (e.g. **Shopify connection → Installs / register webhooks**). Production deploys usually register automatically.

## 4. Environment variables (sign Gadget app)

Set in **Gadget → Settings → Environment variables** for the environment that serves that store (often **Development** for Sign-Dev-Store):

| Variable | Value |
|----------|--------|
| `VERCEL_LINK_ORDER_URL` | `https://<your-vercel-app>.vercel.app/api/link-order-sign-to-supabase` |
| `LINK_ORDER_SECRET` | Same string as Vercel **`LINK_ORDER_SECRET_SIGN`** (or **`LINK_ORDER_SECRET`** if you only use one secret) |

Your action must send:

`Authorization: Bearer <LINK_ORDER_SECRET>`

## 5. Verify

1. **Gadget → Logs**: after a test checkout, you should see your action run (add `logger.info` at the top of `run` if needed).
2. **Vercel → Logs**: **`POST /api/link-order-sign-to-supabase`** around the same time.
3. **Supabase** `sign_order_items`: `shopify_order_id` / `status` updated.

## 6. Access control panel

**Unchecking all roles** under Access control does **not** remove **Shopify webhook** execution — webhooks run as the platform. Those roles matter for **calling the action via the public API**. Your badge app can show the same unchecked state and still work via webhook.

---

## Parity checklist (badge vs sign)

| Piece | Badge app | Sign app |
|-------|-----------|----------|
| Global action with `fetch` to Vercel | `on_order_paid` → `…/api/link-order-to-supabase` | `on_order_paid_sign` → `…/api/link-order-sign-to-supabase` |
| TRIGGERS: Shopify **`orders/paid`** | Yes | **Must be added** |
| Vercel secret in Gadget | `LINK_ORDER_SECRET` | Same pattern; URL must be **sign** route |
| Supabase | `badge_order_items` | `sign_order_items` |

Optional: **Gadget `SignDesign` model** only affects **`/api/save-sign`** (GraphQL). It is **not** what makes **`link-order-sign-to-supabase`** run; the **webhook trigger** is.
