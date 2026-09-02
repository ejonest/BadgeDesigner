// All Quality Badges first-party journey tracking.
// Shopify Admin: Settings > Customer events > Add custom pixel.
// This sends no names, email addresses, phone numbers, postal addresses,
// page titles, free-form search text, or unrestricted query parameters.

const ENDPOINT =
  "https://all-quality-design-tool.vercel.app/api/track-storefront-event";

// Only the guaranteed sandbox globals are used: fetch, JSON, and core
// ECMAScript objects. URL and URLSearchParams are parsed by hand because the
// pixel sandbox does not guarantee them.
function queryParam(search, key) {
  if (!search) {
    return null;
  }
  const pairs = search.charAt(0) === "?" ? search.slice(1) : search;
  const parts = pairs.split("&");
  for (let i = 0; i < parts.length; i++) {
    const separator = parts[i].indexOf("=");
    if (separator === -1) {
      continue;
    }
    if (decodeURIComponent(parts[i].slice(0, separator)) === key) {
      const raw = parts[i].slice(separator + 1).replace(/\+/g, " ");
      return decodeURIComponent(raw) || null;
    }
  }
  return null;
}

function referrerHost(referrer) {
  const match = /^https?:\/\/([^/?#]+)/.exec(referrer || "");
  return match ? match[1] : null;
}

function referrerPath(referrer) {
  const match = /^https?:\/\/[^/?#]+([^?#]*)/.exec(referrer || "");
  if (!match) {
    return null;
  }
  return match[1] || "/";
}

function finiteOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function buildPayload(event) {
  const data = event.data || {};
  const documentSnapshot = event.context ? event.context.document : null;
  const location = documentSnapshot ? documentSnapshot.location : null;
  const referrer = documentSnapshot ? documentSnapshot.referrer : null;
  const search = location ? location.search : null;

  const productVariant = data.productVariant || null;
  const cartLine = data.cartLine || null;
  const merchandise = cartLine ? cartLine.merchandise : null;
  const cart = data.cart || null;
  const checkout = data.checkout || null;

  const variant = productVariant || merchandise || null;
  const product = variant ? variant.product : null;

  const lineTotal = cartLine && cartLine.cost ? cartLine.cost.totalAmount : null;
  const cartTotal = cart && cart.cost ? cart.cost.totalAmount : null;
  const checkoutTotal = checkout ? checkout.totalPrice : null;
  const variantPrice = productVariant ? productVariant.price : null;
  const money = checkoutTotal || cartTotal || lineTotal || variantPrice || null;

  let itemCount = null;
  if (checkout && Array.isArray(checkout.lineItems)) {
    let total = 0;
    for (let i = 0; i < checkout.lineItems.length; i++) {
      const quantity = checkout.lineItems[i].quantity;
      total += typeof quantity === "number" ? quantity : 0;
    }
    itemCount = total;
  } else if (cart && typeof cart.totalQuantity === "number") {
    itemCount = cart.totalQuantity;
  } else if (cartLine && typeof cartLine.quantity === "number") {
    itemCount = cartLine.quantity;
  } else if (productVariant) {
    itemCount = 1;
  }

  let currency = checkout ? checkout.currencyCode : null;
  if (!currency && money) {
    currency = money.currencyCode;
  }

  return {
    event_id: event.id,
    client_id: event.clientId,
    event_name: event.name,
    occurred_at: event.timestamp,
    page_path: location ? location.pathname : null,
    referrer_host: referrerHost(referrer),
    referrer_path: referrerPath(referrer),
    utm_source: queryParam(search, "utm_source"),
    utm_medium: queryParam(search, "utm_medium"),
    utm_campaign: queryParam(search, "utm_campaign"),
    product_id: product ? product.id : null,
    variant_id: variant ? variant.id : null,
    cart_id: cart ? cart.id : null,
    checkout_token: checkout ? checkout.token : null,
    order_id: checkout && checkout.order ? checkout.order.id : null,
    currency: currency || null,
    value: money ? finiteOrNull(money.amount) : null,
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

// Each subscription is written out with an inline callback. Shopify's pixel
// validator inspects these calls statically and does not accept shared
// references or subscriptions created in a loop.
analytics.subscribe("page_viewed", function (event) {
  send(event);
});
analytics.subscribe("product_viewed", function (event) {
  send(event);
});
analytics.subscribe("collection_viewed", function (event) {
  send(event);
});
analytics.subscribe("search_submitted", function (event) {
  send(event);
});
analytics.subscribe("product_added_to_cart", function (event) {
  send(event);
});
analytics.subscribe("product_removed_from_cart", function (event) {
  send(event);
});
analytics.subscribe("cart_viewed", function (event) {
  send(event);
});
analytics.subscribe("checkout_started", function (event) {
  send(event);
});
analytics.subscribe("checkout_contact_info_submitted", function (event) {
  send(event);
});
analytics.subscribe("checkout_address_info_submitted", function (event) {
  send(event);
});
analytics.subscribe("checkout_shipping_info_submitted", function (event) {
  send(event);
});
analytics.subscribe("payment_info_submitted", function (event) {
  send(event);
});
analytics.subscribe("checkout_completed", function (event) {
  send(event);
});
