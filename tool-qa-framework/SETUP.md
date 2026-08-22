# Tool QA Framework — setup and run notes

Location: `tool-qa-framework/` at the repo root (tracked in git; `node_modules` and Playwright run artifacts are ignored).

## What this suite drives, and where it stops

It runs against the **local dev designer** at `/badge-designer-redesign` — not the
production storefront. Two consequences worth knowing before reading any result:

- **There is no iframe.** The dev route renders the designer as the page itself.
  (Production embeds the same app in `#badge-designer-iframe`; this suite does not
  go near that.)
- **A run ends at the PDF proof, on purpose.** The dev server starts with
  `GADGET_API_KEY: 'NOT SET'`, so it has no Shopify wiring and cannot complete an
  add-to-cart. Every test walks the full customer path, verifies the PDF proof
  actually renders, ticks the acknowledgement, presses **Confirm and Add to Cart**,
  and then asserts that it stayed put. Reaching a real cart or checkout is treated
  as a **failure**, because it would mean the dev build is writing into the live store.

Everything a customer experiences up to and including the proof is verified.
Nothing past it is simulated.

## One-time setup

```bash
cd tool-qa-framework
npm install
npx playwright install
npm run generate-cases:aqb-badge-tool   # 166 pairwise cases (committed)
```

Browsers install to `~/Library/Caches/ms-playwright`. If `npx playwright install`
was run in a restricted environment, re-run it from a normal terminal.

## Run tests

The dev server starts automatically (`webServer` in `playwright.config.js`) and an
already-running one is reused. To point at a server yourself, set `QA_BASE_URL`.

```bash
npm run test:scenarios       # 5 named real-order scenarios (~1.5 min) — best smoke check
npm run test:personas        # 4 behavioral personas (~2 min)
npm run test:chrome          # full pairwise + personas, desktop Chrome
npm test                     # all browsers / all projects — long
npm run report               # open last HTML report
```

## Realistic timing

Measured on desktop Chrome against the local dev server, 2 workers:

| Path | Healthy time |
|------|--------------|
| Single badge to proof | ~24–27s |
| Bulk CSV (10–50 rows) to proof | ~30–53s |
| Failure from a wrong selector | ~10–25s |

Design steps themselves are well under a second each. The long pole is PDF proof
generation. The test ceiling is 180s to accommodate Backtracking Betty, which
generates the proof twice; anything else running past ~90s is stuck, not slow.

## How the dev tool actually behaves

These were read off the running DOM, and the profile depends on each of them:

1. **Steps appear as you go.** `1b Pick a Style` only mounts after a shape is
   chosen, and only for the two rounded shapes — **Oval and House have no style
   step at all**. `2b Add an Icon` only mounts after a colour is chosen.
2. **The icon step has no default.** It requires an explicit **No** or **Yes**;
   answering "Yes" without then picking an icon leaves the design incomplete and
   silently disables add-to-cart. (This is the Issue 17 friction point in
   `golden-path.md`.)
3. **Picking a backing opens "Ready to checkout…?"** That modal's **Checkout**
   button is what generates the proof; **Add more** is the route into bulk CSV.
   Coming back via **Back to Edit** can re-show it, so `openProof` handles either.
4. **Sticky panels genuinely cover controls.** The "Your order" panel overlaps the
   backing selector at 1440x900. Rather than hide this, `core/interactions.js`
   records what covered what and reports it as an `obscured-control` annotation.
5. **Two add-to-cart buttons exist.** A hidden mobile bar and the visible desktop
   panel button; the profile targets `button.aqb-atc-btn--panel`. An `--inactive`
   class means the tool still considers the design unfinished.
6. **Text colour** offers four quick swatches (`#0D1B2A`, `#C8962A`, `#C0392B`,
   `#1A5C8E`); "same as background" is rendered but permanently disabled.
7. **Line limits vary by shape** — the 1x3 plate caps at 2 lines, the 1.5x3 shapes
   allow 3.

## Reading the results

Annotations on a passing test carry the interesting findings:

- `obscured-control` — a control that had to be clicked around a sticky overlay
- `behavior-note` — an option the tool did not offer for that combination
- `blocking-alert` — a `window.alert()` the tool raised mid-flow
- `price-shown` — the price displayed to the customer for that configuration
- `stopped-at` — confirmation the run ended at the proof, as intended

## Bugs this suite has already caught

**Merriweather never loaded (fixed).** The first runs filled the dev log with 404s
for `/Fonts/Merriweather/static/Merriweather-Regular.ttf` and a console
`RangeError: Maximum call stack size exceeded` during proof rendering. Google Fonts
now ships Merriweather only as optical-size variants, so that filename does not
exist and badges using it silently fell back to another font — including on the
printed proof. `app/utils/fontLoader.ts` now points at
`Merriweather_36pt-Regular.ttf`. Every other font in that map was verified present.

If you add a font, check the mapped file actually exists; a missing one fails
quietly rather than erroring visibly.

## Cleaning up Playwright rows in Supabase

The suite still writes draft / `in_cart` rows during proof generation (Shopify
add-to-cart is blocked, but the Supabase draft path is not). Those runs filled
`badge_order_items` on Aug 13–14 2026.

**One-time cleanup (run in Supabase → SQL Editor):**

1. Preview + delete script:
   [`docs/cleanup_playwright_badge_order_items_aug2026.sql`](../docs/cleanup_playwright_badge_order_items_aug2026.sql)
2. That deletes Aug 13–14 rows with **no** `shopify_order_id`, and keeps real
   orders (e.g. Madison Flewellen / #1096) plus everything outside that window.
3. Expect ~1,400 deletes and ~207 rows left (based on the CSV export).

**Going forward — `is_qa_test` flag:**

1. Run once: [`docs/migration_add_is_qa_test_to_order_items.sql`](../docs/migration_add_is_qa_test_to_order_items.sql)
   — **required**, the cleanup below does nothing until the column exists.
2. Playwright opens `/badge-designer-redesign?qaTest=1`, which marks every new
   row with `is_qa_test = true`.
3. After a local run, clear the rows *and* their images/PDFs:
   ```bash
   npm run cleanup:dry     # from tool-qa-framework/
   npm run cleanup
   ```
4. Dashboards / admin views should filter `WHERE coalesce(is_qa_test, false) = false`.

Rows carrying a `shopify_order_id` are never deleted, so a mis-set flag on a
real order cannot remove customer data.

Note the nightly GitHub run has **no** Supabase credentials, so the app uploads
nothing there and only local runs accumulate data. The workflow still calls the
cleanup as a safety net in case those secrets are added later.

**Storage buckets.** Deleting rows does not free the images and PDFs — those
live in Supabase Storage and have to be removed through the Storage API.
Deleting from `storage.objects` in SQL only drops catalog rows and leaves the
blobs behind, so use the scripts:

```bash
node --env-file=.env scripts/inspect-supabase-storage.mjs            # read-only inventory
node --env-file=.env scripts/purge-orphaned-designer-storage.mjs --dry-run
node --env-file=.env scripts/purge-orphaned-designer-storage.mjs
```

The purge covers every designer bucket and keeps any `design_*` folder still
referenced by its order-items table. Files newer than 7 days are left alone
(`--min-age-days=`) so an in-progress draft is never caught. The Aug 2026 run
took storage from ~1.9 GB to 285 MB.

**Thumbnail size.** Thumbnails used to be rasterised as full-scale PNG, which
produced 5–6 MB files for something displayed at a few hundred pixels. Both
designers now use `DRAFT_FULL_BADGE_IMAGE_OPTIONS` (JPEG, 2x scale, q0.88), and
the server derives the stored extension and content type from the uploaded
blob. To re-compress anything already stored:

```bash
node --env-file=.env scripts/recompress-oversized-thumbnails.mjs --dry-run
node --env-file=.env scripts/recompress-oversized-thumbnails.mjs
node --env-file=.env scripts/repair-thumbnail-urls.mjs   # after, to verify
```

`repair-thumbnail-urls.mjs` finds rows whose `thumbnail_url` points at a file
that is no longer in the bucket and repoints them at the sibling that is. Run
it after any conversion; a clean run reports 0 repointed and 0 missing.

Note that Supabase enforces the storage quota on the **billing-period average**
(GB-Hrs), not live size, so deleting files lowers the reported number gradually
rather than immediately.

## Nightly CI on GitHub (non-blocking)

Workflow file: `.github/workflows/nightly-qa.yml`

**What it does**
- Runs **once per night** on a schedule (09:00 UTC ≈ 2–3am Pacific)
- Checks out **`main`**, boots the Remix app, runs the **desktop Chrome** suite
- Can also be started manually from the Actions tab (`workflow_dispatch`)
- Uploads the HTML report + failure screenshots/traces as artifacts (14 days)

**What it deliberately does not do**
- It does **not** run on `push` or pull requests
- Merging to `main` and deploying is **never blocked** by this job
- Do **not** add this workflow as a required status check in branch protection

### Steps to turn it on

1. Commit and merge to `main` (at least):
   - `.github/workflows/nightly-qa.yml`
   - `tool-qa-framework/` (the Playwright suite)
2. On GitHub: **Settings → Actions → General** → allow Actions for the repo
   (default is fine for a private repo you own).
3. Confirm under **Actions** that **Nightly QA (desktop Chrome)** appears.
4. Optional smoke test: Actions → that workflow → **Run workflow** →
   choose `chrome-smoke` (fast) or `chrome-full`.
5. Leave it alone for nightly — the schedule fires once a day.
6. Read results: open the run → green/red summary → download
   `playwright-report-chrome` (and `playwright-failures-chrome` if red).

### Local smoke while CI does the heavy lifting

```bash
cd tool-qa-framework
npm run test:scenarios    # ~1.5–2 min — use this before a quick patch
```
