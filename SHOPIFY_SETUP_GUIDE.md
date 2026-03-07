# Shopify Integration Setup Guide

## Step 1: Create Shopify Partners Account & Development Store

### 1.1 Create Shopify Partners Account (Free)
1. Go to https://partners.shopify.com/
2. Click "Sign up" or "Join now"
3. Fill out the form:
   - Email address
   - Password
   - Company name (can be your name)
   - Accept terms
4. Verify your email

### 1.2 Create a Development Store
1. Once logged into Partners dashboard, click "Stores" in the left sidebar
2. Click "Add store" → "Development store"
3. Fill in:
   - Store name: e.g., "Badge Designer Test Store"
   - Store URL: e.g., "badge-designer-test" (will be `badge-designer-test.myshopify.com`)
   - Password: Set a password for your store
4. Click "Create development store"

### 1.3 Access Your Store
1. You'll be redirected to your store admin
2. Store URL format: `https://your-store-name.myshopify.com/admin`
3. Note your store domain: `your-store-name.myshopify.com`

## Step 2: Get Your Vercel URL

1. Go to your Vercel dashboard
2. Find your deployed project
3. Copy the production URL (e.g., `https://your-project.vercel.app`)
4. This is your badge designer iframe URL

## Step 3: Add Iframe to Shopify Product Page

### Option A: Using Shopify Theme Customizer (Easiest for Testing)

1. In your Shopify admin, go to **Online Store** → **Themes**
2. Click **Customize** on your current theme
3. Navigate to a product page
4. Add a custom HTML block or use the theme's app embed section
5. Add this code:

```html
<div style="width: 100%; min-height: 800px;">
  <iframe 
    src="https://YOUR-VERCEL-URL.vercel.app/?product={{ product.id }}&shop={{ shop.permanent_domain }}{% if customer %}&customerId={{ customer.id }}{% endif %}"
    width="100%" 
    height="800px" 
    frameborder="0"
    style="border: none;">
  </iframe>
</div>
```

Replace `YOUR-VERCEL-URL.vercel.app` with your actual Vercel URL.

**customerId (optional but recommended):** When the store has Customer Accounts enabled and the visitor is logged in, include `&customerId={{ customer.id }}` in the iframe URL. This enables:
- **Save Design** – users can save their current badge set (one set per user; saving again replaces the previous).
- **Load previous design** – on the next visit, they are asked whether to load their saved design.
Without `customerId`, the Save Design button will ask users to sign in.

### Option B: Using a Shopify App (For Production)

For production, you'll want to create a Shopify app that embeds the iframe. This requires:
- Shopify App development setup
- App proxy or app embed
- OAuth authentication

We can set this up in Step 2 of the integration plan.

## Step 4: Embed Snippet and Multi-Badge Cart

For **multiple badges** (designing several badges and adding them all to the cart in one go), the theme must use the full badge designer embed snippet that handles `add-to-cart-multiple` messages. The snippet listens for messages from the iframe and calls Shopify’s Cart API (`/cart/add.js`) with an `items` array, then redirects to `/cart`.

- Copy `shopify-badge-designer-embed.liquid` into your theme’s **snippets** folder and render it on the product page (e.g. `{% render 'badge-designer-embed' %}`). The snippet includes the script that:
  - Handles **add-to-cart-multiple**: adds each badge as a separate cart line item via `cart/add.js`, then redirects to the cart.
  - For a single badge, the iframe redirects to `cart/add` itself; no theme change required.

Without this snippet (or an equivalent listener for `add-to-cart-multiple`), only single-badge add-to-cart will work; multi-badge will send the items to the parent but the theme must add them to the cart.

### Cart line item properties

Each badge line item in the cart includes these properties (your cart template can use them):

- **Custom Thumbnail** – Public URL of the badge thumbnail image (Supabase storage). Use this in your cart/cart item template to show the design image (e.g. `item.properties['Custom Thumbnail']`).
- **Badge Index** – Zero-based index of the badge in the design (0, 1, 2, …). Used by the order-paid pipeline to map each cart line to the correct badge in the shared design.
- **Design ID**, **Gadget Design ID** – Shared design identifiers for linking the order to Gadget and Supabase.
- **Badge Text Line 1–4**, **Background Color**, **Font Family**, **Backing Type**, **Price** – Per-badge design and price details.

Ensure your cart template (e.g. `updated-cart-template.liquid` or `final-cart-template-for-shopify.liquid`) is in use if you want thumbnails and badge details to display.

## Step 5: Test the Iframe

1. Go to a product page in your store
2. You should see the badge designer iframe
3. Try designing a badge (single or multiple)
4. Test the "Add to Cart" button – with the embed snippet, multiple badges should appear as separate line items, each with a thumbnail

## Step 6: What Information I Need

To proceed with the full integration (Step 2: Gadget webhook integration), I'll need:

1. **Shopify Store Domain**: `your-store-name.myshopify.com`
2. **Vercel URL**: `https://your-project.vercel.app`
3. **Gadget Setup** (if using Gadget for webhooks):
   - Confirm if you want to use Gadget webhooks (recommended)
   - Or if you prefer direct Shopify API polling

## Save Design and Load Previous (Supabase)

- **Save Design** stores the current badge set in Supabase with status `saved`, keyed by Shopify customer id and shop. Only one saved set is kept per user per shop; saving again replaces the previous.
- **Load previous design:** When a logged-in customer opens the designer and a saved design exists, they see a modal: “Load previous design?” with **Load** / **No thanks**.
- **Requirement:** The iframe URL must include `customerId` when the customer is logged in (e.g. `&customerId={{ customer.id }}` in Liquid). See the embed snippet in [docs/IFRAME_AND_GADGET_SETUP.md](docs/IFRAME_AND_GADGET_SETUP.md) for a full example that already passes `customerId`.

## Customer Accounts and Promotional Emails

- **Customer Accounts:** In **Shopify Admin → Settings → Customer accounts**, set to **Optional** (or **Required**) so customers can log in on the storefront. The theme or app that embeds the badge designer must then pass the logged-in customer’s id in the iframe URL as `customerId` so Save Design and Load previous work.
- **Promotional emails** (e.g. cart abandonment, drafts, sales): Configure these in **Shopify Admin** under **Marketing** and **Notifications**, or via third-party apps. Shopify’s flows use the customer’s email and consent. To tie opt-in to “saving a design,” use Shopify’s standard checkout/account marketing consent or Customer Account settings; document the desired behavior for your marketing/ops team.

## Troubleshooting: Save design / Add to cart popup but no redirect or cart update

If you see the confirmation popup when clicking **Save Design** or **Add to cart** but nothing happens (no redirect to sign-in, cart not updated):

1. **New Vercel URL**  
   The theme snippet only accepts postMessages when the iframe’s origin matches `badge_designer_url`. If you use a **new Vercel link** (new project or new deployment URL), update the snippet so it uses that URL:
   - In your theme: open the snippet that contains the badge designer embed (e.g. `shopify-badge-designer-embed.liquid` or your copy).
   - Set `badge_designer_url` to your **exact** Vercel app URL (e.g. `https://your-app-xyz.vercel.app`), with no trailing slash.
   - Save and re-publish the theme. The iframe `src` and the `event.origin` check in the script must both use this same URL.

2. **redirect-to-login**  
   The snippet must handle the `redirect-to-login` action so that when the user clicks Save design without being logged in, the store redirects to the login page. Ensure your embed script includes that handler (see `shopify-badge-designer-embed.liquid` or [docs/IFRAME_AND_GADGET_SETUP.md](docs/IFRAME_AND_GADGET_SETUP.md)).

Changing **Gadget credentials** or the other store’s config does not affect this behavior; the redirect and add-to-cart flow is between the iframe (your Vercel app) and the **Shopify store page** that embeds it.

## Next Steps After Setup

Once you have the iframe working, we'll proceed with:
- Setting up Gadget webhooks to detect orders
- Automatically saving orders to Supabase with all badge data (one row per cart line when Badge Index is present)
