# Checkout order summary: thumbnail and limited badge details

This guide makes the **checkout** order summary (upper right) match the cart: show the **preview thumbnail** and only **4 text lines** (when applicable), **price**, **attachment**, and **background color**—no Design ID, Badge Index, Custom Thumbnail URL, Font Family, etc.

## How it works

1. **Underscore-prefixed properties**  
   The Badge Designer app adds line item properties with a leading `_` (e.g. `_Custom Thumbnail`, `_Badge Text Line 1`). Shopify does **not** show these in the default checkout order summary, but they are still stored on the line and available to extensions.

2. **Checkout UI extension**  
   A Checkout UI extension runs on each line item and, for custom badges, renders:
   - The custom thumbnail image (from `_Custom Thumbnail`)
   - Up to 4 text lines
   - Price
   - Attachment (backing type)
   - Background color

So the default checkout no longer shows a long list of properties, and the extension shows the same concise info as the cart.

## 1. Use the updated app and cart

- The **Badge Designer app** (this repo) has been updated to send **underscore-prefixed** properties when adding to cart (e.g. `_Custom Thumbnail`, `_Badge Text Line 1`, `_Price`, `_Backing Type`, `_Background Color`).
- Your **cart theme** must use the updated snippets that support both `_` and non-`_` keys. Use the latest `snippets/badge-cart-thumbnail.liquid` and `snippets/badge-cart-details.liquid` from this repo, and wire them in as in [CART_DISPLAY_SETUP.md](./CART_DISPLAY_SETUP.md) (media cell for thumbnail, badge details for the 4 lines, price, attachment, background).

After this, the cart will still show thumbnails and the same limited details.

## 2. Add the Checkout UI extension

The checkout order summary is controlled by Shopify’s hosted checkout. To customize it you need a **Checkout UI extension** that’s part of a **Shopify app** and then enable it in your store’s checkout.

### Option A: Use an existing Shopify app

If you already have a Shopify app (e.g. for the badge designer or Gadget):

1. Copy the extension into your app’s `extensions/` folder:
   - Copy the whole folder:  
     `extensions/checkout-badge-summary/`  
     (contents: `shopify.extension.toml`, `package.json`, `src/CheckoutBadgeSummary.jsx`).

2. From your app directory (where `shopify.app.toml` lives), install and deploy:
   ```bash
   cd /path/to/your/shopify-app
   npm install
   cd extensions/checkout-badge-summary && npm install && cd ../..
   shopify app deploy
   ```

3. In the Shopify admin: **Settings → Checkout → Checkout editor** (or **Customize**), add the “Badge checkout summary” block to the order summary so it appears for line items.

### Option B: Create a new app for the extension only

1. Create a new Shopify app that will hold only this extension:
   ```bash
   npm init -y
   npx shopify app init
   ```
   When prompted, choose to add a **Checkout UI extension**; you can replace the generated extension with the one from this repo.

2. Copy the contents of `extensions/checkout-badge-summary/` from this repo into your new app’s `extensions/` directory (e.g. `extensions/checkout-badge-summary/`).

3. Deploy and enable:
   ```bash
   shopify app deploy
   ```
   Then in **Settings → Checkout** add the block to the order summary.

### Remote thumbnail images

The extension shows the thumbnail from the `_Custom Thumbnail` URL (e.g. Supabase). If your thumbnails are on a different domain:

- Ensure the extension has `network_access = true` in `shopify.extension.toml` (it does by default).
- If Shopify prompts for or allows domain allowlists for the extension, add your storage domain (e.g. `*.supabase.co` or your bucket domain).

## 3. What the checkout will show

For each **custom badge** line item, the order summary will show:

- **Thumbnail** (when `_Custom Thumbnail` is set)
- **Text lines 1–4** (when present)
- **Price**
- **Attachment** (e.g. Pin, Magnetic, Adhesive)
- **Background** (color value, e.g. hex)

All other properties (Design ID, Gadget Design ID, Badge Index, Font Family, Custom Badge Design flag, raw Custom Thumbnail URL, etc.) stay on the line for your backend but are not shown in the default checkout UI; only the extension’s block is shown for these items.

## Summary

| Goal | What to do |
|------|------------|
| Hide long property list on checkout | App sends properties with `_` prefix; Shopify does not display them. |
| Show thumbnail + limited details on checkout | Add and deploy the Checkout UI extension from `extensions/checkout-badge-summary/`, then add its block to the order summary in Checkout settings. |
| Keep cart unchanged | Use the updated cart snippets that read both `_` and non-`_` keys (see [CART_DISPLAY_SETUP.md](./CART_DISPLAY_SETUP.md)). |
