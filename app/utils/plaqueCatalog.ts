import type { PlaqueAwardFormatDefinition } from "~/constants/plaqueFormats";
import { FEATURED_BRUSHED_SILVER_HEX } from "~/constants/colors";
import { PLAQUE_DEFAULT_BRUSH_GOLD_HEX } from "~/utils/plaqueRender";

export const PLAQUE_CATALOG_SCHEMA_VERSION = 1;
export const PLAQUE_CATALOG_PLATES = [
  "black-white",
  "white-black",
  "gold",
  "silver",
  "full-color",
] as const;
export const PLAQUE_CATALOG_FRAMES = ["wood", "black"] as const;

export type PlaqueCatalogPlate = (typeof PLAQUE_CATALOG_PLATES)[number];
export type PlaqueCatalogFrame = (typeof PLAQUE_CATALOG_FRAMES)[number];

export type PlaqueCatalogVariant = {
  plate: PlaqueCatalogPlate;
  frame: PlaqueCatalogFrame;
  imageUrl: string;
  width: number;
  height: number;
};

/** One published design. Format JSON is what the customer customizes; photos are the picker artwork. */
export type PlaqueCatalogDesign = {
  slug: string;
  name: string;
  description: string;
  category: string;
  sort: number;
  layoutId: string;
  showInAttachedPicker: boolean;
  defaultPlate: PlaqueCatalogPlate;
  defaultFrame: PlaqueCatalogFrame;
  schemaVersion: number;
  format: PlaqueAwardFormatDefinition;
  variants: PlaqueCatalogVariant[];
};

export type PlaqueCatalogSeedVariant = PlaqueCatalogVariant & {
  sourceFile: string;
  storagePath: string;
};

export type PlaqueCatalogSeedDesign = Omit<PlaqueCatalogDesign, "variants"> & {
  variants: PlaqueCatalogSeedVariant[];
};

export type PlaqueCatalogSeed = {
  schemaVersion: number;
  designs: PlaqueCatalogSeedDesign[];
};

const PLATE_HEX: Record<Exclude<PlaqueCatalogPlate, "full-color">, string> = {
  gold: PLAQUE_DEFAULT_BRUSH_GOLD_HEX,
  silver: FEATURED_BRUSHED_SILVER_HEX,
  "black-white": "#000000",
  "white-black": "#FFFFFF",
};

export function hexForPlaqueCatalogPlate(plate: PlaqueCatalogPlate): string | null {
  if (plate === "full-color") return null;
  return PLATE_HEX[plate];
}

export function plaqueCatalogPlateForHex(hex: string): PlaqueCatalogPlate | null {
  const value = hex.trim().toLowerCase();
  for (const plate of Object.keys(PLATE_HEX) as Array<keyof typeof PLATE_HEX>) {
    if (PLATE_HEX[plate].toLowerCase() === value) return plate;
  }
  return null;
}

export function representativePlaqueCatalogVariant(
  design: Pick<PlaqueCatalogDesign, "defaultPlate" | "defaultFrame" | "variants">,
): PlaqueCatalogVariant | undefined {
  return (
    design.variants.find(
      (variant) => variant.plate === design.defaultPlate && variant.frame === design.defaultFrame,
    ) ?? design.variants[0]
  );
}

export const PLAQUE_CUSTOM_PLATE_SLUG = "custom";

/** Empty product photos for “Make your own”. Gold and silver stay on the live plate preview. */
const BLANK_PLATE_IMAGE: Partial<Record<PlaqueCatalogPlate, string>> = {
  "black-white": "/images/plaque/blank/wood-black-white.jpg",
  "white-black": "/images/plaque/blank/wood-white-black.jpg",
  gold: "/images/plaque/blank/wood-gold.jpg",
  silver: "/images/plaque/blank/wood-silver.jpg",
  "full-color": "/images/plaque/blank/wood-full-color.jpg",
};

export function blankPlaquePlateImage(plate: PlaqueCatalogPlate | null): string | undefined {
  if (!plate) return BLANK_PLATE_IMAGE["black-white"];
  return BLANK_PLATE_IMAGE[plate];
}

export function plaqueCatalogVariantForPlate(
  design: Pick<PlaqueCatalogDesign, "defaultFrame" | "variants">,
  plate: PlaqueCatalogPlate | null,
): PlaqueCatalogVariant | undefined {
  if (!plate) return undefined;
  return design.variants.find(
    (variant) => variant.plate === plate && variant.frame === design.defaultFrame,
  );
}
