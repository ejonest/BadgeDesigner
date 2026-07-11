/**
 * Shopify Online Store exposes published products as JSON at
 * `https://{shop}.myshopify.com/products/{handle}.js` (no auth).
 * We proxy that via `/api/shopify-product` for CORS and SSRF control.
 */

import type { DeskSignMaterial } from "~/constants/designerVariants";
import type {
  ShopifyProductJs,
  ShopifyProductJsVariant,
} from "~/utils/signShopifyCatalog";
import { parseShopifyMoney } from "~/utils/signShopifyCatalog";

export type { ShopifyProductJs, ShopifyProductJsVariant };

function normOpt(s: string | null | undefined): string {
  return (s ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Match variant by Material option (Acrylic / Rosewood / Plastic). */
export function findDeskSignVariantByMaterial(
  product: ShopifyProductJs,
  material: DeskSignMaterial,
): ShopifyProductJsVariant | null {
  const label =
    material === "acrylic"
      ? "acrylic"
      : material === "rosewood"
        ? "rosewood"
        : "plastic";
  const nm = normOpt(label);
  for (const v of product.variants) {
    const o1 = normOpt(v.option1);
    const o2 = normOpt(v.option2);
    const o3 = normOpt(v.option3);
    if (o1 === nm || o2 === nm || o3 === nm) {
      return v;
    }
  }
  return product.variants[0] ?? null;
}

export function deskSignMaterialPrice(
  product: ShopifyProductJs,
  material: DeskSignMaterial,
): number {
  const v = findDeskSignVariantByMaterial(product, material);
  if (!v) return 0;
  return parseShopifyMoney(v.price);
}
