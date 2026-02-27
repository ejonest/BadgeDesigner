# Minimal validation (for rule creation)

If the full version fails with "An error occurred when creating validate-duplicate-badges-function", use the minimal version below so the rule can be created.

**Steps:**
1. In your **badge-designer** project, open `extensions/validate-duplicate-badges-function/src/cart_validations_generate_run.graphql` and replace its contents with the minimal GraphQL below.
2. Open `extensions/validate-duplicate-badges-function/src/cart_validations_generate_run.js` and replace its contents with the minimal run.js below.
3. From badge-designer project root: `shopify app deploy`
4. In Shopify: Settings → Checkout → Add rule → validate-duplicate-badges-function → Save (and Turn on if it becomes available).

This minimal version does **not** read "Design ID" or "Duplicate Set", so it cannot enforce the duplicate rules—it only allows the function to be created. Once the rule is created, you can try switching back to the full run.graphql/run.js and redeploying to see if the API accepts the attribute query after the rule exists.

---

**Minimal cart_validations_generate_run.graphql:**
```
query CartValidationsGenerateRunInput {
  cart {
    lines {
      id
      quantity
    }
  }
}
```

**Minimal cart_validations_generate_run.js:**
```
// Minimal - no line attributes; allows rule to be created.
export function cartValidationsGenerateRun(input) {
  return { operations: [] };
}
```
