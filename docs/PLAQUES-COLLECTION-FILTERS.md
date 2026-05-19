# Plaques collection filters

Client-side filters on the **Plaques collection grid** section. Works immediately using product titles and types; accuracy improves when you add product tags.

## Upload / update (Shopify theme)

| File | Theme path |
|------|------------|
| `shopify-theme/templates/collection.plaques.liquid` | `templates/` (replace) |
| `shopify-theme/sections/plaques-collection-toolbar.liquid` | `sections/` (new) |
| `shopify-theme/sections/plaques-collection-sidebar.liquid` | `sections/` (new) |
| `shopify-theme/snippets/plaque-collection-filter-attrs.liquid` | `snippets/` |
| `shopify-theme/snippets/plaques-collection-filters-bar.liquid` | `snippets/` |
| `shopify-theme/sections/plaques-collection-grid.liquid` | `sections/` (replace) |

## Ella-style layout (sidebar + toolbar)

The plaques template now uses:

- **Left column:** `plaques-collection-sidebar` section (assign a Navigation menu in Customize)
- **Right column:** Collection title → **View as** / **Items per page** / **Sort by** → plaque filters → product grid

### Configure the sidebar (one-time)

1. **Customize** → **Plaques** collection (template **plaques**)
2. Click **Plaques sidebar**
3. **Menu** → choose the same menu as Room Signs / your catalog (often **Main menu** from **Online Store → Navigation**)
4. Save

If your Ella theme uses a different sidebar section on other collections, check **Edit code → sections** for a file like `sidebar.liquid` and tell us the filename — you can swap it in `collection.plaques.liquid` if you prefer the theme’s native sidebar.

### Toolbar section

**Plaques collection toolbar** supports:

- **View as** — 2 / 3 / 4 column grid (saved in browser)
- **Items per page** — 12, 24, 36, 50 (via `?limit=` URL)
- **Sort by** — Shopify sort options (Featured, Price, A–Z, Best selling, etc.)

Set **Default items per page** to **50** in the toolbar section to match your previous setup.

In **Customize → Plaques collection grid**, enable **Enable product filters** and choose which filter groups to show.

## Filter groups

| Filter | Values (examples) |
|--------|-------------------|
| **Plaque type** | Award, Decorative / wall, Photo, Attached |
| **Award / theme** | Sports, Church, Academic, Corporate, Competitions, General |
| **Mount** | Easel, Wall |
| **Material** | Wooden, Acrylic |
| **Size** | Auto-filled when products have a **Size** option (e.g. `7 x 5"`) |

Filters use **AND** logic across groups (e.g. Easel + Sports).

## How products are classified

1. **Product tags** (best) — if present, these win:
   - `plaque-type:award`
   - `plaque-category:sports`
   - `plaque-mount:easel`
   - `plaque-material:wooden`
   - `plaque-size:7x5` (handleized size)
   - `plaque-filter:<slug>` — adds any custom slug

2. **Fallback** — title and product type (same rules as your export analysis).

Your current export has **no tags**, so filters use titles until you add tags.

## Suggested tags from CSV

From repo root:

```bash
node scripts/suggest-plaque-product-tags.mjs "app/temp/products_export 2.csv"
```

Creates `app/temp/products_export 2-suggested-tags.csv`. Merge **Suggested filter tags** into each product in Shopify (bulk edit or import).

## Pagination note

Shopify shows up to **50 products per page** in the theme. Filters apply to products **on the current page**. Use pagination to browse more, or add tags and later enable **Shopify Search & Discovery** collection filters for full-catalog filtering.

## Optional: Shopify Search & Discovery

For storefront-native filters (sidebar, URL filters, all pages):

1. **Apps → Search & Discovery → Filters**
2. Add filters on **Tags** or metafields
3. Use the same tag naming above

This works alongside the custom filter bar; you can disable the custom bar in section settings if you prefer only native filters.
