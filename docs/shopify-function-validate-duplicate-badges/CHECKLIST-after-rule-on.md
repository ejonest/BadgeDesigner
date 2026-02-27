# After the Checkout Rule Is Turned On and Saved

Once you can successfully add the **validate-duplicate-badges-function** rule and click **Turn on** + **Save**, here’s what’s left to fully set up the duplicate-badge upsell and enforcement.

---

## 1. Restore full validation (if you used the minimal version)

If you used the minimal GraphQL/JS only to get the rule created:

- In your **badge-designer** extension project, replace the minimal files with the **full** versions from this repo:
  - `docs/shopify-function-validate-duplicate-badges/run.graphql` → `extensions/validate-duplicate-badges-function/src/cart_validations_generate_run.graphql`
  - `docs/shopify-function-validate-duplicate-badges/run.js` → `extensions/validate-duplicate-badges-function/src/cart_validations_generate_run.js`
- Run `shopify app deploy` and release the new version.
- The rule you already created will now run the **full** logic:
  - Every line with **Duplicate Set** = "Yes" must have a matching original (same **Design ID**, duplicate qty ≤ original qty).
  - Total quantity of **Duplicate Set** lines must not exceed **5** per order.

If redeploy with the full query fails or the rule stops working, the Cart/Checkout Validation API may not support `attribute(key: "Design ID")` / `attribute(key: "Duplicate Set")` on lines. In that case keep the minimal function (no enforcement) until Shopify supports those fields, or contact Partner support to confirm the schema.

---

## 2. Confirm store setup (product + theme)

| Item | What to check |
|------|----------------|
| **Duplicate product** | Create (or confirm) an unlisted product in Shopify, e.g. **Custom 1x3 Badge (duplicate)** with handle `custom-1x3-badge-duplicate`, priced $2 less per badge than the main custom badge. Pin / Magnetic / Adhesive variants must exist. |
| **Theme Liquid** | Your product page uses the badge designer embed that passes duplicate variant IDs in the iframe URL (`variantIdPinDuplicate`, `variantIdMagneticDuplicate`, `variantIdAdhesiveDuplicate`) and that the snippet uses `all_products['custom-1x3-badge-duplicate']` (or your handle). |
| **Cart/add.js** | The embed script that handles `add-to-cart-multiple` must send each item with `properties` to `/cart/add.js` (e.g. `{ items: [{ id, quantity, properties }] }`). Your `tempLiquid.txt` / `shopify-badge-designer-embed.liquid` already does this with `item.properties`, so **Design ID** and **Duplicate Set** are on the line in the cart. |

No code changes are needed here if the duplicate product exists and the theme matches the repo’s embed (passes duplicate variant IDs and forwards properties).

---

## 3. App / BadgeDesigner behavior (already implemented)

- **Proof modal**: When the customer has 1–5 badges and duplicate variant IDs are present, the checkbox “Add duplicate set for $X off?” is shown; `proofAddDuplicates` controls it.
- **Add to cart**: On confirm, the app adds **2×N** lines: first N original badges (main product), then N duplicate badges (duplicate product) with property **"Duplicate Set": "Yes"** and the same **"Design ID"** as the originals.
- **Enforcement**: The validation function (once full version is deployed) blocks checkout if:
  - There are duplicate lines without a matching original (same Design ID) or with duplicate qty &gt; original qty, or
  - Total duplicate quantity across the cart is &gt; 5.

So no further app changes are required for the “duplicate at lower rate when ≤5 badges” flow or the “no stacking in small quantities” rule—only the function and store setup above.

---

## 4. Testing

After the rule is on and (if applicable) the full function is deployed:

| Scenario | Expected result |
|----------|------------------|
| Add 3 badges, check “Add duplicate set”, confirm | Cart has 6 lines (3 original + 3 duplicate); checkout succeeds. |
| Manually add 6+ duplicate-only items (or duplicate qty &gt; original) | At checkout, validation error: e.g. “Maximum 5 reduced-price duplicate badges per order” or “Duplicate set must be purchased with the original set.” |
| Add duplicate set without original (e.g. direct link to duplicate product, qty 1) | Checkout blocked: “Duplicate set must be purchased with the original set.” |

---

## Summary

- **Already done:** Theme passes duplicate variant IDs and line item properties; BadgeDesigner shows the upsell and adds original + duplicate lines with Design ID and Duplicate Set; validation logic is written and documented.
- **After rule is on:** (1) Restore full run.graphql/run.js in the extension and redeploy, (2) Ensure the duplicate product exists and the embed is on the product page, (3) Test the three scenarios above. No other steps are required for the “≤5 badges get duplicate at lower rate” and “no abuse with many small duplicate orders” behavior.
