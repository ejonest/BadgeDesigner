# Shopify: Automatic discount for duplicate set (quantity 2)

When customers choose **“Add a duplicate set”** in the badge designer (for 1–5 badges), the app adds **one line per badge with quantity 2** and a **“Badge count”** line item property. This doc explains how to give **$2 off per line** when the line has quantity 2 or more using a Shopify **automatic discount**. No Shopify Plus or checkout functions are required.

---

## 1. Create the automatic discount in Shopify

1. In **Shopify Admin**, go to **Discounts** (or **Settings → Discounts**).
2. Click **Create discount**.
3. Choose **Automatic discount**.
4. **Name:** e.g. `Duplicate set – $2 off when you buy 2`.
5. **Discount type:** **Amount off** (fixed amount).
6. **Amount:** `2` (and select your store currency, e.g. **USD**).
7. **Applies to:**
   - **Specific products** → select your main custom badge product (e.g. **Custom 1x3 Badge**).  
   - Or **Product type** / **Collection** if you prefer, as long as it includes that product.
8. **Minimum quantity:** set to **2** (so the discount only applies when the line has at least 2 items).
9. **Customer eligibility:** usually **All customers**.
10. **Usage limits:** optional (e.g. one use per order if you want).
11. **Starts / Ends:** set as needed (or leave open).
12. Save the discount.

**Result:** Any line item that is (1) the selected product and (2) has **quantity ≥ 2** gets **$2 off that line**. Lines with quantity 1 are unchanged.

---

## 2. Optional: “Per line” vs “once per order”

- If your discount UI has an option like **“Applies to: Each line item”** or **“Per qualifying line”**, use that so **every** line with quantity ≥ 2 gets $2 off (e.g. 5 lines × qty 2 → $2 off on each of the 5 lines).
- If the discount applies **once per order**, you’ll only get $2 off total; in that case, either switch to a “per line” discount type or create a discount that gives a larger amount when quantity ≥ 2 (e.g. “$2 × quantity” if the engine supports it). In most Shopify plans, **Amount off** with **Minimum quantity 2** and **Applies to: Specific products** will apply per qualifying line; confirm in the discount preview.

---

## 3. Gadget: Pass quantity and Badge count to link-order

So that fulfillment (Supabase) gets **both** badge indices when a line has quantity 2, the Gadget **on_order_paid** action must send **quantity** and **Badge count** to the Vercel link-order API.

- **Quantity:** from the Shopify line item (`item.quantity`).
- **Badge count:** from the line item property **“Badge count”** (the app sets this when “Add duplicate set” is selected; it’s the number of badge lines, e.g. `5`).

The sample in **docs/gadget-on-order-paid-action.js** has been updated to include `quantity` and `badgeCount` in each payload entry. If you use that action (or your own), ensure each line item sent to **api/link-order-to-supabase** includes:

- `designId` (or `gadgetDesignId`)
- `badgeIndex` (0-based index for that line)
- `quantity` (from Shopify line item; will be 2 when duplicate set was added)
- `badgeCount` (from line item property **“Badge count”**; only set when duplicate set was added)

The Vercel API will then update **two** Supabase rows for that design when `quantity === 2` and `badgeCount` is set (badge index `i` and `i + badgeCount`).

---

## 4. Flow summary

| Step | What happens |
|------|----------------|
| Customer designs 1–5 badges, checks “Add duplicate set”, adds to cart | App adds **N lines**, each **quantity 2**, main product only; each line has **“Badge count”** = N. Supabase gets 2N badge rows. |
| Cart in Shopify | N line items, each with quantity 2. |
| Automatic discount | Each line with quantity ≥ 2 gets $2 off. |
| After payment | Gadget sends each line to link-order with `quantity` and `badgeCount`. Vercel updates both badge indices (e.g. 0 and N) for each line with quantity 2. |

No separate “duplicate” product or checkout validation function is required; the discount is driven only by **line quantity ≥ 2** on the main badge product.

---

## 5. Order-slip PDF and Quantity row

- **At add-to-cart:** The proof/order-slip PDF includes a **Quantity** row in the table for each badge (default 1; when "Add duplicate set" is selected, the uploaded PDF shows Quantity: 2 for each of the N sections).
- **After checkout:** When Gadget calls **api/link-order-to-supabase** with the same payload (including `quantity` per line), the API regenerates the order-slip PDF for each design using the **final quantities from the order**. So if the customer changed the cart (e.g. reduced a line from 2 to 1), the stored PDF is updated to reflect that. No extra call or configuration is required—link-order does this automatically after updating Supabase rows.
