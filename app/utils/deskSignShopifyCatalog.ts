/**
 * Shopify Online Store exposes published products as JSON at
 * `https://{shop}.myshopify.com/products/{handle}.js` (no auth).
 * We proxy that via `/api/shopify-product` for CORS and SSRF control.
 */

import type {
  DeskSignMaterial,
  DeskSignSize,
} from "~/constants/designerVariants";
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

function normalizedDimensions(value: string | null | undefined): string {
  return normOpt(value)
    .replace(/[×]/g, "x")
    .replace(/["″'']/g, "")
    .replace(/\s+/g, "");
}

/** Match variant by material, and by size when Shopify exposes a size option. */
export function findDeskSignVariantByMaterial(
  product: ShopifyProductJs,
  material: DeskSignMaterial,
  size?: DeskSignSize | null,
): ShopifyProductJsVariant | null {
  const aliases =
    material === "acrylic"
      ? ["acrylic"]
      : material === "rosewood"
        ? ["rosewood"]
        : ["plastic"];
  const aliasSet = new Set(aliases.map(normOpt));
  const materialMatches = product.variants.filter((v) => {
    const opts = [v.option1, v.option2, v.option3].map(normOpt);
    return opts.some((o) => aliasSet.has(o));
  });
  if (size) {
    const sizeMatch = materialMatches.find((v) => {
      const values = [v.title, v.option1, v.option2, v.option3];
      return values.some((value) =>
        normalizedDimensions(value).includes(size),
      );
    });
    if (sizeMatch) return sizeMatch;
  }
  if (materialMatches[0]) return materialMatches[0];
  return product.variants[0] ?? null;
}

export function deskSignMaterialPrice(
  product: ShopifyProductJs,
  material: DeskSignMaterial,
  size?: DeskSignSize | null,
): number {
  const v = findDeskSignVariantByMaterial(product, material, size);
  if (!v) return 0;
  return parseShopifyMoney(v.price);
}
