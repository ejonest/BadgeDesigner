# Plaques page — match Room Signs / Stamps layout (Liquid only)

Your store uses **Liquid templates and Liquid sections** (`.liquid` files in Edit code).  
We should copy from a collection page that already looks correct, then add the plaques hero on top.

## What we need from you (one time)

Please paste these files into `app/temp/` (or send their full contents in chat):

1. **Collection template** used by Room Signs (or Stamps)  
   - **Products → Collections → Room Signs** → scroll to **Theme template** (note the exact name, e.g. `json`, `default`, `list_product`, etc.)  
   - **Online Store → Themes → Edit code → Templates**  
   - Open the file that matches that name:
     - If the template is **`json`** → open **`collection.json`** (not a `.liquid` file). Copy the whole file.
     - Otherwise → open **`collection.[name].liquid`** (e.g. `collection.default.liquid`) and copy the whole file.
   - Save as `app/temp/collection.reference.liquid` (or `collection.reference.json` if it was JSON).

### Do not use these as the reference (common mix-up)

| File you may have found | What it actually is |
|-------------------------|------------------------|
| `collection.list_product.liquid` (17 lines, starts with `{% layout none %}`) | **AJAX partial** — only outputs product grid cells when the customer changes “View as” or page size. **Not** the full page with sidebar + toolbar. |
| `collection.signage.liquid` | **Signage** marketing layout (`mini-header-signage`, `collections-signage`, etc.). **No** left Categories column like Room Signs. |

2. **Optional but helpful** — in Edit code → **Sections**, search for files whose names contain:
   - `sidebar`
   - `collection`
   - `toolbar`  
   List the filenames (e.g. `collection-template.liquid`, `sidebar-style-1.liquid`).

With `collection.reference.liquid`, we can set `collection.plaques.liquid` to:

```liquid
{% section 'plaques-collection-hero' %}
…your real collection layout (unchanged)…
```

That gives you the **same** categories column, toolbar, and product grid as Room Signs.

## Categories menu (not in Theme Editor)

The left **Categories** list is a **Navigation menu** in Shopify admin, not a separate “plaques menu” in the theme.

1. **Shopify admin → Online Store → Navigation**
2. Use **Main menu** (or duplicate it → **Catalog menu**)
3. Ensure links include **Plaques** and any sub-collections you want
4. **Customize** → Plaques collection → if you still use **Plaques sidebar** section → **Menu** → pick that menu

Once we use your native collection template, the sidebar comes from **that** template’s section (same as Room Signs), not our custom sidebar.

## Remove “Filter plaques” box

That box is from our custom **Plaques collection grid** section. The updated `collection.plaques.liquid` in the repo **no longer loads** custom toolbar, sidebar, or grid — only hero + your native body (placeholder uses `collections-signage` until you paste the real template).

After you paste the reference template, delete or ignore uploads of:

- `plaques-collection-toolbar.liquid`
- `plaques-collection-sidebar.liquid`
- `plaques-collection-grid.liquid` (or leave in theme but unused)

## Custom hero

Keep **`plaques-collection-hero.liquid`** — it stays as the only plaques-specific section at the top.

## Done: reference matched

`collection.liquid` (Default collection) only picks a snippet from **Theme settings → Collection page layout** (`category_layout`). Room Signs uses the left-sidebar layout via `snippets/collection-default.liquid`.

`collection.plaques.liquid` is now:

```liquid
{% section 'plaques-collection-hero' %}
…same if/elsif chain as collection.liquid…
```

No custom toolbar, sidebar, or grid sections needed.
