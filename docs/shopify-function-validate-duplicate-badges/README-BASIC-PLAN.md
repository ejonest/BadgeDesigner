# Duplicate badges on Basic (no checkout validation)

On **Basic** development stores (and any store without Shopify Plus), custom checkout rules are not available. This doc describes how we use the duplicate-badge feature **without** checkout validation.

## What we do

- **Same UX:** When a customer has 1–5 badges, the proof modal offers “Add duplicate set for $X off?”. If they check it and confirm, the app adds both the original lines and the duplicate lines (reduced price) to the cart.
- **No rule:** We **do not** add or enable the `validate-duplicate-badges-function` checkout rule. The duplicate upsell and add-to-cart behavior work without it; checkout is normal Shopify with no server-side validation of duplicate rules.

## Accepted risk

There is **no server-side enforcement** on Basic:

- Customers could find the cheaper duplicate product (e.g. via search or a direct link) and add it without buying the original.
- Customers could add original + duplicate via the designer, then remove the original lines in the cart and checkout with only the reduced-price duplicates.

We rely on the duplicate product being unlisted and not linked anywhere except through the badge designer, and accept that some users might discover the workaround.

## Options for stakeholders

1. **Remove the feature** – Disable or hide the duplicate upsell when the store cannot use checkout validation.
2. **Pay for Plus** – Use a Plus plan or Plus dev store so the checkout rule can be enabled; then deploy the function, add and turn on the rule, and follow the validation checklist.
3. **Leave as-is** – Keep the duplicate offer live without validation and accept the risk that a few customers may abuse it.

## When you have Plus

To turn on enforcement:

1. Deploy the validation function (see [README.md](README.md)) and add the rule in **Settings → Checkout → Checkout rules**.
2. If the rule failed to create on Basic, you may have used the minimal GraphQL/JS to test; restore the full [run.graphql](run.graphql) and [run.js](run.js) in your extension and redeploy.
3. Follow [CHECKLIST-after-rule-on.md](CHECKLIST-after-rule-on.md) for store setup and testing.

All validation logic and docs (run.graphql, run.js, [README-minimal.md](README-minimal.md), CHECKLIST-after-rule-on.md) remain in this folder for Plus implementation.
