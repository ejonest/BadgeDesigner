# Reusable Shopify product tagging

This tool classifies Shopify products with deterministic, reviewable rules. It
never writes during `propose`, and `apply` only writes rows explicitly approved
in the generated CSV.

The Signs ByLITA taxonomy lives in
`config/product-taxonomies/signs-bylita.json`. The engine is store-agnostic, so
another store can use a different taxonomy file and managed tag prefix.

## Shopify access

Set these environment variables without committing them:

```bash
export SHOPIFY_ADMIN_SHOP="your-store.myshopify.com"
export SHOPIFY_ADMIN_ACCESS_TOKEN="shpat_..."
export SHOPIFY_ADMIN_API_VERSION="2026-07"
```

The proposal step needs `read_products`. Applying approved changes also needs
`write_products`. Use a dedicated custom app with only those scopes. The access
token is sent only to the configured `*.myshopify.com` Admin GraphQL endpoint
and is never included in output.

## First full run

```bash
npm run product-tags -- propose
```

Output is written beneath `product-tagging-output/<shop>/<timestamp>/`:

- `review.csv`: one row per product, including proposed tags and match reasons
- `unresolved.csv`: products no deterministic rule could classify
- `search-synonym-gaps.csv`: suggested synonym groups for Shopify Search &
  Discovery
- `manifest.json`: inputs, counts, API version, and checkpoint timestamp

Managed tags use the `sbl:` prefix. Existing tags outside that prefix are
preserved. Category tags are structured (for example,
`sbl:category:restroom-hygiene`), while `sbl:search:*` aliases make important
catalog vocabulary available to Shopify's product search. Keep broad synonym
relationships in Shopify Search & Discovery rather than adding unlimited tags.

Review `Matched Rules` and `Reasons`, correct taxonomy rules when a pattern is
wrong, then rerun. Set `Approved` to `yes` only on rows that should be applied.
Unclassified products intentionally require review.

## Safe apply flow

First run without confirmation. This re-reads current Shopify tags, validates
the approved rows, and writes a rollback CSV, but makes no Shopify changes:

```bash
npm run product-tags -- apply \
  --review product-tagging-output/<shop>/<timestamp>/review.csv
```

After checking the summary and rollback artifact:

```bash
npm run product-tags -- apply \
  --review product-tagging-output/<shop>/<timestamp>/review.csv \
  --confirm APPLY_APPROVED_TAGS
```

Immediately before applying, the tool fetches current tags and merges the
approved managed tags into them. This avoids overwriting unrelated tags added
after the review was generated. The write uses Shopify's staged upload and bulk
mutation APIs and saves mutation results to the apply run directory. Approved
updates are split into sequential JSONL batches below Shopify's 100 MB bulk
mutation file limit.

The rollback CSV records the exact current tag array captured before the write.
It is an audit artifact; restoring it should still be reviewed before any
subsequent write.

## Incremental and filtered runs

Use the saved successful checkpoint:

```bash
npm run product-tags -- propose --incremental
```

Or choose a timestamp explicitly:

```bash
npm run product-tags -- propose --since 2026-10-01T00:00:00Z
```

Additional Shopify search syntax and status filtering are available:

```bash
npm run product-tags -- propose \
  --query "vendor:'LITA Sign'" \
  --include-status ACTIVE,DRAFT
```

Changing `taxonomyVersion` intentionally prevents an old incremental checkpoint
from being reused. Run a full proposal after a taxonomy change so existing
products are reconsidered.

## Cron example

Schedule only the read-only proposal command. Keep approval and apply as a human
step:

```cron
15 2 * * * cd /path/to/project && /usr/bin/env npm run product-tags -- propose --incremental >> /var/log/product-tags.log 2>&1
```

The scheduler must provide the environment variables securely. Shopify 2026-07
allows up to five bulk queries and five bulk mutations per app and shop, but
this tool processes its write batches sequentially and scheduled runs should
still avoid unnecessary overlap. Alert on non-zero exit status and retain run
artifacts.

For another site, copy the taxonomy JSON, choose a unique `managedPrefix`,
change its rules and synonym groups, and pass it with
`--taxonomy config/product-taxonomies/other-site.json`.

## Rule maintenance

Rules consider title, HTML-stripped description, product type, vendor, and
existing tags. Title matches carry the most weight; description-only matches
are not enough by default. Add recurring approved exceptions as precise
keywords or exclusions. Avoid generic single words that create false
positives.

Shopify currently allows up to 250 tags per product and tags up to 255
characters; the tool refuses proposals or applies that exceed those bounds.

Run the focused test suite after changing rules:

```bash
npm run product-tags:test
```

References:

- [Shopify bulk operations](https://shopify.dev/docs/api/usage/bulk-operations/queries)
- [`bulkOperationRunQuery`](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/bulkOperationRunQuery)
- [`bulkOperationRunMutation`](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/bulkOperationRunMutation)
- [`stagedUploadsCreate`](https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/stagedUploadsCreate)
