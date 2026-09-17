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

export type DeskSignArtworkType = "text-only" | "color-image";

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

function variantSearchText(variant: ShopifyProductJsVariant): string {
  return [variant.title, variant.option1, variant.option2, variant.option3]
    .map(normOpt)
    .filter(Boolean)
    .join(" ");
}

function variantMatchesMaterial(
  variant: ShopifyProductJsVariant,
  material: DeskSignMaterial,
): boolean {
  const text = variantSearchText(variant);
  const aliases =
    material === "acrylic"
      ? ["acrylic"]
      : material === "rosewood"
        ? ["rosewood"]
        : ["classic", "traditional", "plastic"];
  return aliases.some((alias) => text.includes(alias));
}

function variantArtworkType(
  variant: ShopifyProductJsVariant,
): DeskSignArtworkType | null {
  const text = variantSearchText(variant);
  if (text.includes("color image") || text.includes("colour image")) {
    return "color-image";
  }
  if (text.includes("text only") || text.includes("text-only")) {
    return "text-only";
  }
  return null;
}

/**
 * Match the live Shopify variant by size, finish/material, and whether the
 * design contains an uploaded color image. Supports both separate Shopify
 * options and the store's single combined option titles.
 */
export function findDeskSignVariantByMaterial(
  product: ShopifyProductJs,
  material: DeskSignMaterial,
  size?: DeskSignSize | null,
  artworkType?: DeskSignArtworkType | null,
): ShopifyProductJsVariant | null {
  let matches = product.variants.filter((variant) =>
    variantMatchesMaterial(variant, material),
  );

  if (size) {
    matches = matches.filter((variant) => {
      const values = [
        variant.title,
        variant.option1,
        variant.option2,
        variant.option3,
      ];
      return values.some((value) =>
        normalizedDimensions(value).includes(size),
      );
    });
  }

  if (artworkType) {
    const artworkMatch = matches.find(
      (variant) => variantArtworkType(variant) === artworkType,
    );
    if (artworkMatch) return artworkMatch;

    // Backward compatibility for a store that has one unsplit variant for a
    // size/material combination. Never guess when multiple priced variants exist.
    const unlabeledMatches = matches.filter(
      (variant) => variantArtworkType(variant) === null,
    );
    if (unlabeledMatches.length === 1 && matches.length === 1) {
      return unlabeledMatches[0] ?? null;
    }
    return null;
  }

  if (matches.length === 1) return matches[0] ?? null;

  // Older callers that do not specify artwork should prefer text-only, which
  // is the base product configuration and avoids an accidental image upcharge.
  const textOnlyMatch = matches.find(
    (variant) => variantArtworkType(variant) === "text-only",
  );
  if (textOnlyMatch) return textOnlyMatch;
  return null;
}

export function deskSignMaterialPrice(
  product: ShopifyProductJs,
  material: DeskSignMaterial,
  size?: DeskSignSize | null,
  artworkType?: DeskSignArtworkType | null,
): number {
  const v = findDeskSignVariantByMaterial(
    product,
    material,
    size,
    artworkType,
  );
  if (!v) return 0;
  return parseShopifyMoney(v.price);
}
