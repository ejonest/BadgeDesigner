# Cart display: thumbnail image and limited badge details

Use these so the cart shows (1) the badge thumbnail as an **image** to the left of the product title, and (2) only **text lines 1–4**, **price**, **attachment option**, and **background color** (no Design ID, Gadget Design ID, Badge Index, Custom Thumbnail URL, etc.).

## 1. Add the snippets to your theme

In your Shopify theme (**Edit code**):

1. Under **Snippets**, create a new snippet named `badge-cart-thumbnail`.
2. Paste in the contents of `snippets/badge-cart-thumbnail.liquid` from this repo.
3. Create another snippet named `badge-cart-details`.
4. Paste in the contents of `snippets/badge-cart-details.liquid` from this repo.

## 2. Use them in your cart section

Your cart is built by a **section** (e.g. `main-cart-items.liquid` or similar). You need to edit the part that loops over `cart.items` and renders each row.

### Thumbnail (image to the left of the product title)

- Find the **media / image** cell for each cart item (often the first `<td>` or first column).
- Many themes only output this cell when `item.image` exists. For custom badges the product may have no image, so the thumbnail is in `item.properties['Custom Thumbnail']`.
- **Change the condition** so the media cell is shown when there is **either** a custom thumbnail **or** `item.image`, and inside the cell render the snippet:

```liquid
{%- assign custom_thumb = item.properties['Custom Thumbnail'] | default: item.properties._custom_thumbnail -%}
{%- if custom_thumb != blank or item.image -%}
  <td class="cart-item__media">
    {% render 'badge-cart-thumbnail', item: item %}
  </td>
{%- endif -%}
```

So: always show the media cell when the item has a custom thumbnail or a product image, and use `badge-cart-thumbnail` so the URL is rendered as an `<img>` (preview to the left of "Custom 1x3 Badge").

### Details (only the info you want)

- Find where **line item properties** are output (often a `<dl>` with a loop over `item.properties`, or a list of property names/values).
- For items that are **custom badges** (`item.properties['Custom Badge Design'] == 'Yes'`), **replace** that full property list with the snippet so only the chosen fields show:

```liquid
{%- if item.properties['Custom Badge Design'] == 'Yes' -%}
  {% render 'badge-cart-details', item: item %}
{%- else -%}
  {%- comment -%} Your theme's default: options, selling plan, or generic property list {%- endcomment -%}
  {%- for property in item.properties -%}
    {%- if property.first == 'Custom Thumbnail' or property.first == 'Design ID' or property.first == 'Gadget Design ID' or property.first == 'Badge Index' or property.first == 'Custom Badge Design' -%}
      {%- continue -%}
    {%- endif -%}
    <div class="product-option">
      <dt>{{ property.first }}:</dt>
      <dd>{{ property.last }}</dd>
    </div>
  {%- endfor -%}
{%- endif -%}
```

If you prefer to **only** show our snippet for custom badges and not output any other properties for them, use:

```liquid
{%- if item.properties['Custom Badge Design'] == 'Yes' -%}
  {% render 'badge-cart-details', item: item %}
{%- elsif item.properties.size > 0 -%}
  {%- for property in item.properties -%}
    {%- if property.last != blank and property.first[0] != '_' -%}
      <div class="product-option"><dt>{{ property.first }}:</dt><dd>{{ property.last }}</dd></div>
    {%- endif -%}
  {%- endfor -%}
{%- endif -%}
```

## Summary

| Goal | What to do |
|------|------------|
| Thumbnail as image to the left of title | Show the media cell when `Custom Thumbnail` is present or `item.image` exists; put `{% render 'badge-cart-thumbnail', item: item %}` inside that cell. |
| Only 4 lines, price, attachment, background | For custom badge items, render `{% render 'badge-cart-details', item: item %}` instead of looping over all `item.properties`. |

The snippets live in this repo under `snippets/`. Copy them into your theme’s **Snippets** folder, then wire them into your cart section as above.
