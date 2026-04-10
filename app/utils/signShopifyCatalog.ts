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
  price: string;
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

export function parseShopifyMoney(price: string): number {
  const n = parseFloat(String(price).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
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
