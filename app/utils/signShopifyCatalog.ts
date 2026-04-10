/**
 * Shopify Online Store exposes published products as JSON at
 * `https://{shop}.myshopify.com/products/{handle}.js` (no auth).
 * We proxy that via `/api/shopify-product` for CORS and SSRF control.
 */

export interface ShopifyProductJsVariant {
  id: number;
  title?: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  /** Shopify `/products/*.js` usually sends a decimal string ("20.99"); some locales use "20,99". */
  price: string | number;
  sku?: string | null;
  available?: boolean;
}

export interface ShopifyProductJs {
  id: number;
  title: string;
  handle: string;
  variants: ShopifyProductJsVariant[];
  options?: string[];
}

function normOpt(s: string | null | undefined): string {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * Parse Shopify variant `price` for display/sums. Must not strip commas before deciding decimal
 * position — e.g. European "20,99" would become "2099" → 2099.00 instead of 20.99.
 */
export function parseShopifyMoney(price: string | number): number {
  if (typeof price === "number") {
    if (!Number.isFinite(price)) return 0;
    // JSON sometimes sends minor units (cents) as an integer; dollar amounts are usually floats.
    if (Number.isInteger(price) && price >= 100) {
      return price / 100;
    }
    return price;
  }

  const raw = String(price).trim().replace(/\s/g, "");
  if (!raw) return 0;

  let s = raw;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > lastDot) {
    // Decimal comma, optional thousands dots: 1.234,56
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastComma !== -1 && lastDot === -1) {
    // Only comma: 20,99
    s = s.replace(",", ".");
  } else if (lastDot !== -1 && lastComma !== -1) {
    // US-style thousands: 1,234.56
    s = s.replace(/,/g, "");
  }

  const n = parseFloat(s.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(n)) return 0;

  // Plain digit string without decimal sep is sometimes minor units (e.g. "2099" → $20.99).
  // Require 4+ digits so "100" still means $100, not $1.00.
  if (!/[.,]/.test(raw) && /^\d{4,}$/.test(raw) && n >= 1000) {
    return n / 100;
  }

  return n;
}

/**
 * Match variant by Shape + Size. Tries option1/option2 in both orders (Shopify option order
 * follows the merchant’s product setup, not always Shape then Size).
 */
export function findSignVariantByShapeAndSize(
  product: ShopifyProductJs,
  shape: string,
  size: string,
): ShopifyProductJsVariant | null {
  const ns = normOpt(shape);
  const nz = normOpt(size);
  for (const v of product.variants) {
    const o1 = normOpt(v.option1);
    const o2 = normOpt(v.option2);
    if (
      (o1 === ns && o2 === nz) ||
      (o1 === nz && o2 === ns && ns !== nz)
    ) {
      return v;
    }
  }
  return null;
}

export function resolveSignVariantIdAndPrice(
  product: ShopifyProductJs | null,
  shape: string,
  size: string,
): { variantId: string; price: number } | null {
  if (!product) return null;
  const v = findSignVariantByShapeAndSize(product, shape, size);
  if (!v) return null;
  return { variantId: String(v.id), price: parseShopifyMoney(v.price) };
}

/** Minimal check for JSON from Shopify `/products/{handle}.js` (parent postMessage or API proxy). */
export function isShopifyProductJsPayload(x: unknown): x is ShopifyProductJs {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (!Array.isArray(o.variants) || o.variants.length === 0) return false;
  return o.variants.every((v) => {
    if (!v || typeof v !== "object") return false;
    const id = (v as { id?: unknown }).id;
    return typeof id === "number";
  });
}
