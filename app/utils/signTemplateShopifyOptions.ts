import {
  ALL_SIGN_TEMPLATE_TYPES,
  type DesignerVariant,
} from "~/constants/designerVariants";
import { parsePlaqueTemplateId } from "~/constants/plaqueLayouts";

/**
 * Maps sign template *type* id (from ALL_SIGN_TEMPLATE_TYPES) to Shopify option1 "Shape"
 * values exactly as imported in the Custom Sign product CSV.
 */
export const SIGN_SHOPIFY_SHAPE_BY_TYPE_ID: Readonly<Record<string, string>> = {
  "classic-framed": "Classic Framed",
  standard: "Standard",
  fancy: "Fancy",
  "designer-heart": "Designer",
  basic: "Basic",
  circle: "Circle",
  square: "Square",
  oval: "Oval",
  portrait: "Portrait Round",
  victorian: "Victorian",
  notched: "Notched Standard",
  "frontier-elegant": "Frontier Elegant",
  arrow: "Arrow",
  "door-hanger": "Door Hanger",
  "headstone-basic": "Headstone",
  vintage: "Vintage",
  "western-elegant": "Western Elegant",
};

/** Designer size row label → Shopify option2 "Size" (CSV spelling). */
export function normalizeSignSizeOptionLabel(designerLabel: string): string {
  const key = designerLabel.trim().toLowerCase();
  switch (key) {
    case "one size":
      return "One Size";
    case "extra large":
      return "Extra Large";
    case "small":
      return "Small";
    case "medium":
      return "Medium";
    case "large":
      return "Large";
    default:
      return designerLabel.trim();
  }
}

/**
 * Resolve universal sign `templateId` (e.g. standard-3x9-large) to Shopify variant options.
 * Returns null if the template is unknown or the shape is not sold in Shopify.
 */
export function getSignShopifyShapeSizeForTemplateId(
  templateId: string,
): { shape: string; size: string } | null {
  for (const type of ALL_SIGN_TEMPLATE_TYPES) {
    const sizeRow = type.sizes.find((s) => s.templateId === templateId);
    if (!sizeRow) continue;
    const shape = SIGN_SHOPIFY_SHAPE_BY_TYPE_ID[type.id as string];
    if (!shape) return null;
    return {
      shape,
      size: normalizeSignSizeOptionLabel(sizeRow.label),
    };
  }
  return null;
}

/**
 * Plaque `templateId` (e.g. plaque-attached-medium) → Shopify variant option1 + option2.
 * Option strings must match the **custom-plaque** product in Shopify (matching is normalized).
 * Adjust {@link PLAQUE_SHOPIFY_OPTION1_BY_LAYOUT_ID} if your CSV uses different labels.
 */
const PLAQUE_SHOPIFY_OPTION1_BY_LAYOUT_ID: Readonly<Record<string, string>> = {
  "plaque-attached": "Attached Plate",
  "plaque-detached-portrait": "Photo Plaque Portrait",
  "plaque-detached-landscape": "Photo Plaque Landscape",
};

export function getPlaqueShopifyShapeSizeForTemplateId(
  templateId: string,
): { shape: string; size: string } | null {
  const parsed = parsePlaqueTemplateId(templateId);
  if (!parsed) return null;
  const shape = PLAQUE_SHOPIFY_OPTION1_BY_LAYOUT_ID[parsed.layoutId];
  if (!shape) return null;
  return {
    shape,
    size: normalizeSignSizeOptionLabel(parsed.size),
  };
}

/** Sign or plaque catalog row: Shape/Type × Size (Shopify option1 × option2). */
export function getSignLikeShopifyShapeSizeForTemplateId(
  variant: DesignerVariant,
  templateId: string,
): { shape: string; size: string } | null {
  if (variant === "plaque") {
    return getPlaqueShopifyShapeSizeForTemplateId(templateId);
  }
  if (variant === "sign") {
    return getSignShopifyShapeSizeForTemplateId(templateId);
  }
  return null;
}

/**
 * `getAllBadges` may leave `templateId` as badge defaults (e.g. rect-1x3). For pricing/cart,
 * use the badge id only when it maps to a real sign SKU; otherwise use the universal template
 * from the template/size steps.
 */
export function effectiveSignTemplateIdForBadge(
  badgeTemplateId: string | undefined,
  universalTemplateId: string,
): string {
  if (
    badgeTemplateId &&
    (getSignShopifyShapeSizeForTemplateId(badgeTemplateId) ||
      getPlaqueShopifyShapeSizeForTemplateId(badgeTemplateId))
  ) {
    return badgeTemplateId;
  }
  return universalTemplateId;
}
