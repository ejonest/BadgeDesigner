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

### Why this is a second pixel

The designer pixel loads `gtag` and forwards `aqb:*` events to GA4. This one
only writes to Supabase. Keeping them apart means the Supabase log can be
disconnected without touching GA4 or Google Ads reporting, an error in one
pixel cannot stop the other from firing, and the designer pixel keeps the
"`aqb:*` only" rule from the original brief so GA4 never double-counts
purchases or add-to-cart.

Both pixels see the same Shopify visitor ID in `event.clientId`, so splitting
them costs nothing when joining data later.

### Custom pixel editor constraints

The editor rejects code that the validator cannot statically analyse. Two
things it will not accept:

- `analytics.subscribe("page_viewed", send)` — a shared or named callback
  reference, or subscriptions created in a loop. Each subscription needs its
  own inline callback function.
- `new URL(...)` and `new URLSearchParams(...)` — not guaranteed sandbox
  globals. The pixel parses the path, referrer, and UTM values with string and
  regex helpers instead.

Only `fetch`, `JSON`, and core ECMAScript objects are used. There are no
references to `window`, `document`, `navigator`, or the DOM; page and referrer
values come from the `event.context.document` snapshot Shopify passes in.

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
