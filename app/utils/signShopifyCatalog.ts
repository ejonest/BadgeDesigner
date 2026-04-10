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

/** Match variant by Shape (option1) and Size (option2) per custom-sign CSV import. */
export function findSignVariantByShapeAndSize(
  product: ShopifyProductJs,
  shape: string,
  size: string,
): ShopifyProductJsVariant | null {
  const ns = normOpt(shape);
  const nz = normOpt(size);
  for (const v of product.variants) {
    if (normOpt(v.option1) === ns && normOpt(v.option2) === nz) {
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
