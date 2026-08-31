# Designer step tracking (GA4 + first-party)

Customer designer tools run in a Vercel iframe. Shopify’s Google & YouTube pixel cannot see inside that iframe. Events are forwarded: **iframe → theme `postMessage` → `Shopify.analytics.publish` → custom pixel → existing GA4**.

Do **not** add a second Google tag, checkout Additional scripts, or a GTM pixel that also fires purchase / add-to-cart / page_view.

## Part 1 — Google Ads / Google & YouTube (admin)

On **All Quality Badges** (and **Gavels Fast** if that store is in scope):

1. Keep **Google & YouTube** as the only Google tag. Link Google Ads and GA4 there. Enable Enhanced Conversions in that channel.
2. Remove leftover purchase snippets (old checkout scripts, extra `gtag` in `theme.liquid`, duplicate Pagefly measurement on designer product pages).
3. Treat Ads “Activate Google tag” as satisfied by the linked Google & YouTube / GA4 property — do not paste a new site-wide `gtag.js`.
4. Rename or archive the “Untitled tag” conversion source after the G&Y-linked action is clearly the live one.
5. Wait several days before judging purchase volume.

Checkout Additional scripts are retired and are **not** available as a tracking fix on Basic.

## Custom pixel (Shopify Admin → Settings → Customer events)

Add **one custom pixel per store** (AQB, and Gavels Fast if it has its own GA4). Connect it. Paste the following, replacing `G-XXXXXXXX` with **that store’s existing GA4 measurement ID** (the same property Google & YouTube already uses).

This pixel must **only** subscribe to `aqb:*` events. It must **not** subscribe to `page_viewed`, `product_added_to_cart`, `checkout_started`, or `checkout_completed`.

```javascript
const GA_MEASUREMENT_ID = "G-XXXXXXXX";

function loadGtag() {
  const script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_MEASUREMENT_ID;
  document.head.appendChild(script);
  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID, { send_page_view: false });
}

loadGtag();

function forwardToGa4(name, event) {
  var d = event.customData || {};
  var params = {
    tool: d.tool,
    session_id: d.session_id,
    step: d.step,
    entry: d.entry,
    duration_ms: d.duration_ms,
    error_code: d.error_code,
    page_path: d.page_path,
    page_url: d.page_url,
  };
  if (window.gtag) {
    window.gtag("event", name, params);
  }
}

// Keep these subscriptions explicit. Shopify's pixel validator does not
// recognize analytics.subscribe calls generated inside a loop.
analytics.subscribe("aqb:designer_opened", function (event) {
  forwardToGa4("designer_opened", event);
});
analytics.subscribe("aqb:customization_started", function (event) {
  forwardToGa4("customization_started", event);
});
analytics.subscribe("aqb:step_completed", function (event) {
  forwardToGa4("step_completed", event);
});
analytics.subscribe("aqb:preview_generated", function (event) {
  forwardToGa4("preview_generated", event);
});
analytics.subscribe("aqb:preview_error", function (event) {
  forwardToGa4("preview_error", event);
});
analytics.subscribe("aqb:add_to_cart_clicked", function (event) {
  forwardToGa4("add_to_cart_clicked", event);
});
analytics.subscribe("aqb:add_to_cart_confirmed", function (event) {
  forwardToGa4("add_to_cart_confirmed", event);
});
analytics.subscribe("aqb:add_to_cart_failed", function (event) {
  forwardToGa4("add_to_cart_failed", event);
});
```

While validating, you can add `debug_mode: true` to the gtag event params. The GA4 Chrome extension usually **cannot** see Shopify pixel sandboxes — use the Network tab (`google-analytics.com` / `google.com/ccm`) and GA4 Realtime.

After events flow:

- In GA4, mark `add_to_cart_confirmed` as a Key Event. Build funnels filtered by `tool` and `step`.
- Optionally import `add_to_cart_confirmed` as a Google Ads conversion. Leave existing G&Y Purchase / Add to cart goals unchanged so you can compare.

## First-party log (Supabase)

Run [`docs/migration_create_designer_events.sql`](migration_create_designer_events.sql) in the Supabase SQL editor. The iframe POSTs the same events to `/api/track-designer-event` for same-day drop-off and `duration_ms` queries.

## Theme deploy

Repo snippets are not live until copied into:

- AQB: `badge-designer-embed.liquid`
- Gavels Fast: `gavel-designer-embed.liquid`
