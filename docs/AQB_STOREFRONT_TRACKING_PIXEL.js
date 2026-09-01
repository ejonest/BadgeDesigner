// All Quality Badges first-party journey tracking.
// Shopify Admin: Settings > Customer events > Add custom pixel.
// This sends no names, email addresses, phone numbers, postal addresses,
// page titles, free-form search text, or unrestricted query parameters.

const ENDPOINT =
  "https://all-quality-design-tool.vercel.app/api/track-storefront-event";

function safeUrl(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch (_error) {
    return null;
  }
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildPayload(event) {
  const data = event.data || {};
  const documentSnapshot = event.context && event.context.document;
  const location = documentSnapshot && documentSnapshot.location;
  const referrer = safeUrl(documentSnapshot && documentSnapshot.referrer);
  const search = location && location.search
    ? new URLSearchParams(location.search)
    : new URLSearchParams();

  const productVariant = data.productVariant || null;
  const cartLine = data.cartLine || null;
  const merchandise = cartLine && cartLine.merchandise;
  const cart = data.cart || null;
  const checkout = data.checkout || null;
  const product = (productVariant && productVariant.product)
    || (merchandise && merchandise.product)
    || null;
  const variant = productVariant || merchandise || null;
  const lineTotal = cartLine && cartLine.cost && cartLine.cost.totalAmount;
  const cartTotal = cart && cart.cost && cart.cost.totalAmount;
  const checkoutTotal = checkout && checkout.totalPrice;
  const money = checkoutTotal || cartTotal || lineTotal
    || (productVariant && productVariant.price)
    || null;

  let itemCount = null;
  if (checkout && Array.isArray(checkout.lineItems)) {
    itemCount = checkout.lineItems.reduce(function (total, item) {
      return total + (typeof item.quantity === "number" ? item.quantity : 0);
    }, 0);
  } else if (cart && typeof cart.totalQuantity === "number") {
    itemCount = cart.totalQuantity;
  } else if (cartLine && typeof cartLine.quantity === "number") {
    itemCount = cartLine.quantity;
  } else if (productVariant) {
    itemCount = 1;
  }

  return {
    event_id: event.id,
    client_id: event.clientId,
    event_name: event.name,
    occurred_at: event.timestamp,
    page_path: location ? location.pathname : null,
    referrer_host: referrer ? referrer.hostname : null,
    referrer_path: referrer ? referrer.pathname : null,
    utm_source: search.get("utm_source"),
    utm_medium: search.get("utm_medium"),
    utm_campaign: search.get("utm_campaign"),
    product_id: product ? product.id : null,
    variant_id: variant ? variant.id : null,
    cart_id: cart ? cart.id : null,
    checkout_token: checkout ? checkout.token : null,
    order_id: checkout && checkout.order ? checkout.order.id : null,
    currency: checkout && checkout.currencyCode
      ? checkout.currencyCode
      : (money ? money.currencyCode : null),
    value: money ? numberOrNull(money.amount) : null,
    item_count: itemCount,
  };
}

function send(event) {
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify(buildPayload(event)),
    keepalive: true,
  }).catch(function () {
    // Analytics must never interrupt the customer's storefront or checkout.
  });
}

analytics.subscribe("page_viewed", send);
analytics.subscribe("product_viewed", send);
analytics.subscribe("collection_viewed", send);
analytics.subscribe("search_submitted", send);
analytics.subscribe("product_added_to_cart", send);
analytics.subscribe("product_removed_from_cart", send);
analytics.subscribe("cart_viewed", send);
analytics.subscribe("checkout_started", send);
analytics.subscribe("checkout_contact_info_submitted", send);
analytics.subscribe("checkout_address_info_submitted", send);
analytics.subscribe("checkout_shipping_info_submitted", send);
analytics.subscribe("payment_info_submitted", send);
analytics.subscribe("checkout_completed", send);
