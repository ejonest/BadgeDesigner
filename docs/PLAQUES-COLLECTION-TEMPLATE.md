# Plaques collection template (Ella theme)

Custom **`plaques`** collection template with a full-width hero (background image + overlay card + CTAs) and the same product grid layout as your **Signage** collection.

## Liquid vs JSON templates

**Signs ByLITA / Ella 4.0.0** uses **legacy `.liquid` templates** (e.g. `collection.signage.liquid`), not `collection.signage.json`.

| Your theme has | Use |
|----------------|-----|
| `collection.signage.liquid` | **`collection.plaques.liquid`** (this repo) — copy/paste upload |
| `collection.signage.json` | `node scripts/build-plaques-collection-template.mjs` (JSON path) |

The file you saved in `app/temp/collection.signage.liquid` is the right reference; it will **not** work with the JSON build script.

Files in this repo:

| File | Upload to Shopify theme |
|------|-------------------------|
| `shopify-theme/sections/plaques-collection-hero.liquid` | `sections/plaques-collection-hero.liquid` |
| `shopify-theme/templates/collection.plaques.liquid` | `templates/collection.plaques.liquid` |
| `shopify-theme/sections/plaques-collection-grid.liquid` | `sections/plaques-collection-grid.liquid` |
| `shopify-theme/snippets/plaques-collection-grid-anchor.liquid` | `snippets/plaques-collection-grid-anchor.liquid` (optional) |

---

## Step 1 — Upload the hero section

1. **Online Store → Themes → … → Edit code**
2. **Sections → Add a new section** → name: `plaques-collection-hero`
3. Paste contents of `shopify-theme/sections/plaques-collection-hero.liquid`
4. **Save**

---

## Step 2 — Upload the product grid section

1. **Sections → Add a new section** → name: `plaques-collection-grid`
2. Paste `shopify-theme/sections/plaques-collection-grid.liquid`
3. **Save**

## Step 3 — Upload `collection.plaques.liquid` (your store)

1. **Edit code → Templates → Add a new template**
2. Choose type: **collection**
3. Name: **plaques**
4. Paste the contents of **`shopify-theme/templates/collection.plaques.liquid`**
5. **Save**

This mirrors your Signage template:

| Default / Signage | Plaques (`collection.plaques.liquid`) |
|-------------------|----------------------------------------|
| Product grid | `plaques-collection-grid` (lists `collection.products`) |
| Hero | `plaques-collection-hero` |

**Do not use** `home-custom-block-spotlight` on the collection template — that is a homepage section and will not list products.

### JSON templates only (other shops)

If you ever have `collection.signage.json`, use:

```bash
node scripts/build-plaques-collection-template.mjs /path/to/collection.signage.json
```

---

## Step 4 — Assign template to Plaques collection

1. **Products → Collections → Plaques**
2. **Theme template → plaques**
3. **Save**

---

## Step 5 — Hero image & buttons

1. **Products → Collections → Plaques → Image** — upload wide plaques photo (1920×600+ recommended). Used when the section image is empty.
2. **Customize theme** → open **Plaques** collection (template **plaques**)
3. Click **Plaques collection hero** section:
   - **Primary button link:** your Custom Plaque product URL (e.g. `/products/custom-plaque`)
   - **Secondary button label:** leave **blank** (stock plaques show in the grid below)
4. **Save**

### Scroll anchor for “Shop stock plaques”

In the theme customizer, open the main collection / product grid section on the **plaques** template and add at the top (if Ella has **Custom liquid**):

```liquid
{% render 'plaques-collection-grid-anchor' %}
```

Or add that render to the collection section’s top in **Edit code** (Ella `main-collection` / `product-collection` section) wrapped in:

```liquid
{% if template.suffix == 'plaques' %}
  {% render 'plaques-collection-grid-anchor' %}
{% endif %}
```

---

## Step 6 — Remove Custom Plaque from the grid

1. **Products → Collections → Plaques**
2. Remove **Custom Plaque Design** from the collection product list (× on the row)
3. **Save**

The designer stays on `/products/custom-plaque` and is linked from the hero only.

---

## Step 7 — Publish

Preview `/collections/plaques` (or your handle). Publish the theme when satisfied.

---

## Customization

All hero text, colors, ribbon, and image are editable in **Customize** under **Plaques collection hero** — no code changes needed for copy tweaks.

| Setting | Default |
|---------|---------|
| Primary CTA | Start designing → `/products/custom-plaque` |
| Secondary CTA | Shop stock plaques → `#plaques-collection-products` |
| Ribbon | PLAQUES (teal, Signage-style) |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Template **plaques** not in dropdown | Confirm `templates/collection.plaques.json` exists and JSON is valid |
| Hero missing | Confirm `sections/plaques-collection-hero.liquid` uploaded; section `type` is `plaques-collection-hero` |
| Two banners | Disable collection image in **collection-header** on plaques template |
| Products missing | Upload `plaques-collection-grid.liquid` and use `{% section 'plaques-collection-grid' %}` — not `home-custom-block-spotlight` |
| Product template warnings | `product-template-default.liquid` errors are unrelated to the collection page (see below) |

## Product template (`dev.txt` / `product-template-default.liquid`)

That file is the **product page** section (Custom Plaque designer embed), not the collection page. Theme-check may warn about deprecated `img_url` or `script_tag` — those do not block the plaques collection grid.

If the editor shows Liquid errors on **custom plaque / custom sign** product pages, ensure `option_selection.js` is not loaded for designer products (wrap in `{% unless is_plaque_designer_product or is_sign_designer_product %}`).
| Section type error on save | Section file name must be `plaques-collection-hero.liquid` (matches `"type": "plaques-collection-hero"`) |
