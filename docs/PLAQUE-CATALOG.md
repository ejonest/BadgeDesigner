# Plaque design catalog

The iframe reads published designs from `GET /api/plaque-catalog`. Photos stay in the `plaque-images` bucket under `catalog/{slug}/{frame}-{plate}.jpg`. Format JSON stays in `plaque_catalog_designs`. The checked-in seed at `app/data/plaqueCatalog.seed.json` is the fallback until that table has published rows, and it does not contain the image bytes.

## Import

1. Put new photos in `app/temp/Plaque Preview Images/{Design folder}/`.
2. Add the folder to `DESIGNS` in `scripts/plaque-catalog/buildManifest.mjs`. The format may only use borders and dividers the renderer already draws.
3. Review the dry run:

```bash
node scripts/plaque-catalog/buildManifest.mjs
```

4. Apply `docs/migration_create_plaque_catalog.sql` in the Supabase SQL editor once per project.
5. Publish photos and rows:

```bash
node scripts/plaque-catalog/buildManifest.mjs --apply
```

`--apply` uploads every photo, then upserts `status = published`. It stops before writing anything when a design is missing its default photo or has two photos for the same plate and frame. Re-running replaces that design’s variant rows. Archive a design by setting `status` to `archived`; do not delete or rename a slug that orders already reference.

Customer drafts and order items store `plaqueCatalogSlug`, `plaqueCatalogSchemaVersion`, and `plaqueFormatSnapshot`. Print rendering uses that snapshot, then the built-in format list. A later catalog edit does not change an order that was already placed.

## Admin editing

The import script is the publishing tool for now. A later admin screen can create, reorder, and archive designs, but it has to be a server route checked with the existing Shopify admin session (`verifyAdminSessionToken`). The iframe only calls the read-only catalog route. It must not receive the Supabase service-role key, and catalog writes must not trust `shop` or `userId` from the query string.

## Full catalog

The same tables can cover the rest of the plaque range. Add `show_in_attached_picker` only for designs that belong on the attached-plate step. Photo layouts stay on their current portrait and landscape cards. When a Shopify product should open a specific design, store `design_key` on the product and pass it to the iframe as `catalogSlug`. Supabase remains the source of the design; the product only points at the slug.
