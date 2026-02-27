# Shopify Function: Validate Duplicate Badges

This validation function enforces:

1. **Duplicate only with original:** Every line item with property `Duplicate Set` = `Yes` must have a matching original (same `Design ID`, quantity) in the cart.
2. **No duplicate-only cart:** If the customer removes originals, checkout is blocked.
3. **Cap 5 reduced-price badges:** Total quantity of line items with `Duplicate Set` = `Yes` must not exceed 5.

## Setup

1. In your Shopify app project, create a cart/checkout validation extension:
   ```bash
   shopify app generate extension --template cart_checkout_validation --name validate-duplicate-badges
   ```
2. Replace the generated `src/run.graphql` with the one in this folder.
3. Replace the generated `src/run.js` (or `run.ts`) with the one in this folder.
4. Run `shopify app function typegen` if using TypeScript/JavaScript.
5. Deploy and activate the validation in **Settings → Checkout → Checkout rules → Add rule**.

## Input query

The function requests cart lines with attributes `Design ID` and `Duplicate Set`. If your Shopify Functions API does not support line-level `attribute(key:)`, you may need to use cart-level attributes or a different approach; check the latest [Cart and Checkout Validation Function API](https://shopify.dev/docs/api/functions/reference/cart-checkout-validation/graphql).

## Error messages

- "Duplicate set must be purchased with the original set."
- "Maximum 5 reduced-price duplicate badges per order."
