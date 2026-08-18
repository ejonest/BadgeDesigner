# How to Add a New Tool Profile

This framework is split into two layers:

- **`core/`** — tool-agnostic. Knows how to click, fill, and walk
  through a generic "review → add to cart → checkout → verify" tail.
  Never edit this to accommodate a specific tool's quirks — if you find
  yourself wanting to, that's a sign something profile-specific leaked
  in here by mistake.
- **`profiles/<tool-name>/`** — everything specific to one tool: its
  design steps, its selectors, its option lists, its pricing.

Adding a second tool means writing a new profile folder. You should
**not** need to touch anything in `core/`.

## Step-by-step

### 1. Create the folder

```
profiles/<tool-name>/
```

### 2. List the tool's options — `dimensions.js`

Same shape as `profiles/aqb-badge-tool/dimensions.js`: one array per
configurable option.

```js
module.exports = {
  stampShape: ['round', 'rectangle', 'oval'],
  inkColor: ['black', 'blue', 'red'],
  // ...
};
```

### 3. Map out the real selectors — `selectors.js`

**Do this with `npm run codegen` open against the real tool**, not by
guessing from screenshots — every hour spent guessing here is an hour
your webmaster spends fixing it later. Click through one full design
by hand; Playwright's recorder shows you the actual selector for
everything you touch.

### 4. Describe the design flow declaratively — `config.js`

This is the file `core/` actually consumes. Build a `steps` array using
the step types documented at the top of `core/flow-runner.js`
(`click`, `clickOptional`, `fill`, `fillOptional`, `selectDropdown`).

```js
steps: [
  { type: 'click', field: 'stampShape', selector: selectors.shapeOption },
  { type: 'click', field: 'inkColor', selector: selectors.inkOption },
  { type: 'fill', field: 'textLine1', selector: selectors.textInput },
],
```

Also fill in `checkout` (selectors for the review/cart/checkout tail —
these tend to look similar across Shopify stores, but confirm with
codegen rather than assuming), and `expectedPrice` via
`makePriceChecker()` from `core/checks.js` with that tool's real base
price and surcharges.

If the tool doesn't have a bulk-upload path, just omit `bulkUpload`
entirely — `core/flow-runner.js` skips it automatically when a test
case has no `bulkQuantity`.

### 5. Generate pairwise test cases

Copy `profiles/aqb-badge-tool/generate-cases.js`, change the profile
path, done — `core/pairwise.js` doesn't care which tool it's covering.

### 6. Write named scenarios (optional but recommended)

Copy the shape of `profiles/aqb-badge-tool/scenarios.js` — a short list
of real, specific orders worth locking in permanently, using this
tool's own field names.

### 7. Write the test spec files

Copy `tests/aqb-badge-tool.spec.js` and
`tests/aqb-badge-tool.personas.spec.js`, swap the profile import path.
The actual test bodies barely change — they're mostly calling into
`core/flow-runner.js` and `core/persona-behaviors.js`, which don't know
or care which tool they're driving.

## What to genuinely reconsider, not just copy

- **Sample data generators** (like AQB's `sample-data.js` with its
  Name,Title CSV builder) are deliberately kept at the profile level,
  not core — a different tool's bulk-upload format might not look like
  Name,Title rows at all. Write a fresh one that matches reality rather
  than forcing a mismatched shape to fit.
- **Extra leak patterns** — check `core/checks.js`'s
  `DEFAULT_LEAKED_FIELD_PATTERNS` list first; only add to a profile's
  `extraLeakPatterns` for things genuinely specific to that tool's own
  data model.

## When something in `core/` genuinely needs to change

If adding a second tool reveals that a "generic" assumption in
`core/` was actually AQB-specific (this will happen — the first
generalization pass is always a guess), fix it in `core/` so **both**
profiles benefit, rather than working around it in the new profile
alone. That's the entire point of this split.
