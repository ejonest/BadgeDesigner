# All Quality Badges storefront journey tracking

This is separate from the existing designer-step tracking. It records Shopify's
standard customer events in Supabase and does not send additional events to
GA4, Google Ads, or Google Tag Manager.

It does not modify or deploy the Shopify theme, pages, templates, images,
products, navigation, or storefront content.

## 1. Create the Supabase table

Run [`migration_create_storefront_events.sql`](migration_create_storefront_events.sql)
in the Supabase SQL editor for the project used by the Vercel app.

The table has row-level security enabled and no browser insert policy. Events
are validated by the Vercel API and inserted server-side.

## 2. Deploy the Vercel app

Deploy the repository version containing:

- `app/routes/api.track-storefront-event.tsx`
- the `trackStorefrontEventBodySchema` addition in `app/utils/validation.ts`

Verify that `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are still configured
in Vercel. The pixel endpoint is:

`https://all-quality-design-tool.vercel.app/api/track-storefront-event`

## 3. Add the All Quality Badges custom pixel

In the **All Quality Badges** Shopify admin:

1. Go to **Settings → Customer events**.
2. Click **Add custom pixel**.
3. Name it `AQB Supabase Storefront Journey`.
4. Paste the complete contents of
   [`AQB_STOREFRONT_TRACKING_PIXEL.js`](AQB_STOREFRONT_TRACKING_PIXEL.js).
5. Save and connect the pixel.
6. Set its privacy purpose to analytics and keep it governed by the store's
   customer privacy/consent settings.

Do not paste this into `theme.liquid`, checkout Additional scripts, or the
existing GA4 designer-events pixel.

## 4. Test without placing an order

Open a private browser window after granting analytics consent, then:

1. Visit the home page.
2. Open a collection and a product.
3. Add the product to the cart.
4. Open the cart and begin checkout.

In Supabase, run:

```sql
SELECT
  client_id,
  event_name,
  page_path,
  product_id,
  value,
  currency,
  occurred_at
FROM storefront_events
ORDER BY occurred_at DESC
LIMIT 50;
```

Events from one browser journey should share a `client_id`. After that passes,
place one test order and confirm a `checkout_completed` row has an `order_id`.

## Data intentionally excluded

The pixel does not send customer names, customer IDs, email addresses, phone
numbers, postal addresses, page titles, free-form search queries, or arbitrary
URL query parameters. Only `utm_source`, `utm_medium`, and `utm_campaign` are
kept from the query string.
