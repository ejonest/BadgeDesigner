/**
 * Maps a gavel configuration to the Shopify variant that prices it.
 *
 * The Gavels Fast products carry the price scheme as options: the gavel is
 * `Wood` × `Sound block`, the gavel-and-stand product is `Wood` only. Matching
 * is done on option *names* rather than option1/option2 positions, because the
 * position depends on how the product was set up in the admin.
 *
 * The suede bag is not an option — it has no price in the sheet per wood, so it
 * rides along as its own cart line (see SUEDE_BAG_PRODUCT_HANDLE).
 */

import type {
  GavelProductType,
  GavelSoundBlockId,
  GavelSoundBlockShapeId,
  GavelStyleId,
} from "~/constants/gavelStyles";
import {
  parseShopifyMoney,
  type ShopifyProductJs,
  type ShopifyProductJsVariant,
} from "~/utils/signShopifyCatalog";

export const GAVEL_WOOD_OPTION_NAME = "Wood";
export const GAVEL_SOUND_BLOCK_OPTION_NAME = "Sound block";

/** Option values exactly as configured on the store. */
const WOOD_OPTION_VALUES: Record<GavelStyleId, string> = {
  rubberwood: "Hardwood",
  walnut: "American Walnut",
  ebony: "Ebony",
};

const SOUND_BLOCK_OPTION_VALUES: Record<GavelSoundBlockId, string> = {
  none: "Gavel only",
  plain: "+ Sound block, plain",
  engraved: "+ Sound block, personalized",
};

/**
 * The round block is its own option value on the store rather than a third
 * option, so the shape collapses into the sound-block value here. Only the
 * plain round block is priced (see isGavelRoundSoundBlockAvailable).
 */
const ROUND_SOUND_BLOCK_OPTION_VALUE = "+ Round sound block, plain";

export const GAVEL_PRODUCT_HANDLES: Record<GavelProductType, string> = {
  gavel: "custom-wooden-gavel",
  stand: "custom-wooden-gavel-stand",
};

export const SUEDE_BAG_PRODUCT_HANDLE = "suede-gavel-bag";

export type GavelVariantSelection = {
  productType: GavelProductType;
  styleId: GavelStyleId;
  soundBlock: GavelSoundBlockId;
  soundBlockShape?: GavelSoundBlockShapeId;
};

export type GavelVariantMatch = {
  variantId: string;
  price: number;
  title: string;
};

function normOptionText(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * `/products/{handle}.js` sends options either as objects (`{name, position,
 * values}`) or, on older themes, as a bare array of names.
 */
function readOptionNames(product: ShopifyProductJs): string[] {
  const raw = (product as { options?: unknown }).options;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const name = (entry as { name?: unknown }).name;
      if (typeof name === "string") return name;
    }
    return "";
  });
}

/** Positional option value off a variant (option1/option2/option3). */
function variantOptionAt(
  variant: ShopifyProductJsVariant,
  index: number,
): string | null {
  if (index === 0) return variant.option1;
  if (index === 1) return variant.option2;
  if (index === 2) return variant.option3;
  return null;
}

function variantOptionByName(
  product: ShopifyProductJs,
  variant: ShopifyProductJsVariant,
  optionName: string,
): string | null {
  const names = readOptionNames(product);
  const index = names.findIndex(
    (name) => normOptionText(name) === normOptionText(optionName),
  );
  if (index < 0) return null;
  return variantOptionAt(variant, index);
}

export function gavelWoodOptionValue(styleId: GavelStyleId): string {
  return WOOD_OPTION_VALUES[styleId];
}

export function gavelSoundBlockOptionValue(
  soundBlock: GavelSoundBlockId,
  shape: GavelSoundBlockShapeId = "square",
): string {
  if (soundBlock !== "none" && shape === "round") {
    return ROUND_SOUND_BLOCK_OPTION_VALUE;
  }
  return SOUND_BLOCK_OPTION_VALUES[soundBlock];
}

/**
 * The variant for one configuration, or null when the store has no such
 * combination (callers fall back to the variant the embed passed in).
 */
export function findGavelVariant(
  product: ShopifyProductJs | null,
  selection: GavelVariantSelection,
): ShopifyProductJsVariant | null {
  if (!product || !Array.isArray(product.variants)) return null;

  const optionNames = readOptionNames(product);
  const hasWood = optionNames.some(
    (name) => normOptionText(name) === normOptionText(GAVEL_WOOD_OPTION_NAME),
  );
  if (!hasWood) return null;

  const wantWood = normOptionText(gavelWoodOptionValue(selection.styleId));
  // The stand product has no sound-block option; only constrain what exists.
  const hasSoundBlock = optionNames.some(
    (name) =>
      normOptionText(name) === normOptionText(GAVEL_SOUND_BLOCK_OPTION_NAME),
  );
  const wantSoundBlock = normOptionText(
    gavelSoundBlockOptionValue(
      selection.productType === "stand" ? "none" : selection.soundBlock,
      selection.soundBlockShape ?? "square",
    ),
  );

  for (const variant of product.variants) {
    const wood = normOptionText(
      variantOptionByName(product, variant, GAVEL_WOOD_OPTION_NAME),
    );
    if (wood !== wantWood) continue;
    if (hasSoundBlock) {
      const block = normOptionText(
        variantOptionByName(product, variant, GAVEL_SOUND_BLOCK_OPTION_NAME),
      );
      if (block !== wantSoundBlock) continue;
    }
    return variant;
  }
  return null;
}

export function resolveGavelVariant(
  product: ShopifyProductJs | null,
  selection: GavelVariantSelection,
): GavelVariantMatch | null {
  const variant = findGavelVariant(product, selection);
  if (!variant) return null;
  return {
    variantId: String(variant.id),
    price: parseShopifyMoney(variant.price),
    title: variant.title ?? "",
  };
}

/** First (only) variant of the suede bag add-on product. */
export function resolveSuedeBagVariant(
  product: ShopifyProductJs | null,
): GavelVariantMatch | null {
  const variant = product?.variants?.[0];
  if (!variant) return null;
  return {
    variantId: String(variant.id),
    price: parseShopifyMoney(variant.price),
    title: variant.title ?? "",
  };
}
