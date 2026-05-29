/** Shopify line item property name/value max length. */
export const SHOPIFY_LINE_ITEM_PROPERTY_MAX = 255;

export type CartLineItemPayload = {
  variantId: string;
  quantity: number;
  properties: Record<string, string>;
};

const CART_PROPERTY_OMIT_KEYS = new Set(["Proof PDF URL"]);

/**
 * Prepare line item properties for Shopify cart/add.js.
 * Drops proof PDF (stored in Supabase by Design ID) and skips URL props that exceed Shopify limits.
 */
export function prepareCartLineItemPropertiesForShopify(
  properties: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (CART_PROPERTY_OMIT_KEYS.has(key)) continue;
    const k = key.slice(0, SHOPIFY_LINE_ITEM_PROPERTY_MAX);
    const v = String(value ?? "").trim();
    if (!v) continue;
    if (v.length > SHOPIFY_LINE_ITEM_PROPERTY_MAX) {
      // Long thumbnail URLs break cart/add.js; order rows still have thumbnails by Design ID.
      if (key === "Custom Thumbnail") continue;
      out[k] = v.slice(0, SHOPIFY_LINE_ITEM_PROPERTY_MAX);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** @deprecated Use prepareCartLineItemPropertiesForShopify */
export function sanitizeCartLineItemProperties(
  properties: Record<string, string>,
): Record<string, string> {
  return prepareCartLineItemPropertiesForShopify(properties);
}

export function sanitizeCartLineItems(
  items: CartLineItemPayload[],
): CartLineItemPayload[] {
  return items.map((item) => ({
    ...item,
    variantId: String(item.variantId).trim(),
    properties: prepareCartLineItemPropertiesForShopify(item.properties),
  }));
}

/** True when the designer runs inside the Shopify product iframe. */
export function isDesignerEmbeddedInStorefront(): boolean {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  if (params.get("embedded") === "1") return true;
  try {
    return window.parent !== window;
  } catch {
    return false;
  }
}

export function resolveShopifyStoreUrl(): string {
  if (typeof window === "undefined") return "badgesonly.myshopify.com";
  const urlParams = new URLSearchParams(window.location.search);
  return (
    (window as Window & { SHOPIFY_STORE_URL?: string }).SHOPIFY_STORE_URL ||
    urlParams.get("storeUrl")?.trim() ||
    urlParams.get("shop")?.trim() ||
    "badgesonly.myshopify.com"
  );
}

const CART_ADD_ACK_TIMEOUT_MS = 20_000;

export type CartAddResult = {
  success: boolean;
  message: string;
  cartData?: { redirectUrl?: string };
  badgeData?: CartLineItemPayload;
};

/** Wait for parent theme to confirm cart/add.js result (embedded flow). */
export function waitForStorefrontCartAddAck(
  requestId: string,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve({
        success: false,
        error:
          "The store did not confirm the cart update. Update the badge-designer-embed snippet in your Shopify theme.",
      });
    }, CART_ADD_ACK_TIMEOUT_MS);

    const onMessage = (event: MessageEvent) => {
      const data = event.data;
      if (
        !data ||
        data.action !== "add-to-cart-result" ||
        data.requestId !== requestId
      ) {
        return;
      }
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      resolve({
        success: Boolean(data.success),
        error: typeof data.error === "string" ? data.error : undefined,
      });
    };

    window.addEventListener("message", onMessage);
  });
}
