/**
 * Shopify cart line-item properties for designer products.
 *
 * Properties whose names start with `_` are stored on the line item but hidden
 * from customer-facing checkout / order summary. Keep only human-useful copy
 * (badge text lines) without the underscore prefix.
 */

export const CART_PROP = {
  /** Visible in checkout */
  textLine1: "Badge Text Line 1",
  textLine2: "Badge Text Line 2",
  textLine3: "Badge Text Line 3",
  textLine4: "Badge Text Line 4",
  gavelTextLine1: "Gavel Text Line 1",
  gavelTextLine2: "Gavel Text Line 2",
  gavelTextLine3: "Gavel Text Line 3",
  gavelStyle: "_Gavel Style",
  bandFinish: "_Band Finish",

  /** Hidden internals (underscore = Shopify “do not display”) */
  customDesign: "_Custom Badge Design",
  designer: "_Designer",
  backgroundColor: "_Background Color",
  fontFamily: "_Font Family",
  backingType: "_Backing Type",
  designId: "_Design ID",
  gadgetDesignId: "_Gadget Design ID",
  customThumbnail: "_Custom Thumbnail",
  /** Legacy alias some theme snippets already look for */
  customThumbnailLegacy: "_custom_thumbnail",
  proofPdfUrl: "_Proof PDF URL",
  price: "_Price",
  badgeCount: "_Badge count",
  orderQuantity: "_Order quantity",
  material: "_Material",
  size: "_Size",
  acrylicFinish: "_Acrylic Finish",
  mountType: "_Mount Type",
  aluminumFrame: "_Aluminum Frame",
} as const;

/** Index keys written on every designer line (all hidden). */
export function cartIndexPropertyName(label: string): string {
  return label.startsWith("_") ? label : `_${label}`;
}

export type DesignerCartLinePropertyInput = {
  designerId: string;
  designId: string;
  lineIndex: number;
  indexPropertyPrimary: string;
  indexPropertyFallbacks: string[];
  lines: Array<{ text?: string; fontFamily?: string } | undefined>;
  backgroundColor?: string;
  backing?: string;
  /** Absolute unit price string already formatted like "12.00" (no $). */
  linePrice: string;
  thumbnailUrl?: string;
  gadgetDesignId?: string | null;
  pdfUrl?: string | null;
  orderQuantity?: number;
  badgeCount?: number;
  /** Extra hidden props (desk-sign material, etc.) — keys should already be underscore-prefixed. */
  extraHidden?: Record<string, string>;
  includeBackingType?: boolean;
};

/**
 * Build cart properties: text lines visible; everything else `_`-prefixed.
 */
export function buildDesignerCartLineProperties(
  input: DesignerCartLinePropertyInput,
): Record<string, string> {
  const indexStr = String(input.lineIndex);
  const indexProps: Record<string, string> = {
    [cartIndexPropertyName(input.indexPropertyPrimary)]: indexStr,
  };
  for (const k of input.indexPropertyFallbacks) {
    indexProps[cartIndexPropertyName(k)] = indexStr;
  }

  const thumb = (input.thumbnailUrl ?? "").trim();
  const isGavel = input.designerId === "gavel";
  const properties: Record<string, string> = {
    [isGavel ? CART_PROP.gavelTextLine1 : CART_PROP.textLine1]:
      input.lines[0]?.text || "",
    [isGavel ? CART_PROP.gavelTextLine2 : CART_PROP.textLine2]:
      input.lines[1]?.text || "",
    [isGavel ? CART_PROP.gavelTextLine3 : CART_PROP.textLine3]:
      input.lines[2]?.text || "",
    ...(isGavel
      ? {}
      : { [CART_PROP.textLine4]: input.lines[3]?.text || "" }),
    [CART_PROP.customDesign]: "Yes",
    [CART_PROP.designer]: input.designerId,
    [CART_PROP.backgroundColor]: input.backgroundColor || "",
    [CART_PROP.fontFamily]: input.lines[0]?.fontFamily || "Arial",
    [CART_PROP.designId]: input.designId,
    [CART_PROP.price]: `$${input.linePrice}`,
    ...indexProps,
    ...(input.includeBackingType && input.backing
      ? { [CART_PROP.backingType]: input.backing }
      : {}),
    ...(input.extraHidden ?? {}),
  };

  if (thumb) {
    properties[CART_PROP.customThumbnail] = thumb;
    properties[CART_PROP.customThumbnailLegacy] = thumb;
  }
  if (input.gadgetDesignId) {
    properties[CART_PROP.gadgetDesignId] = input.gadgetDesignId;
  }
  if (input.pdfUrl) {
    properties[CART_PROP.proofPdfUrl] = input.pdfUrl;
  }
  if (input.orderQuantity != null) {
    properties[CART_PROP.orderQuantity] = String(input.orderQuantity);
  }
  if (input.badgeCount != null) {
    properties[CART_PROP.badgeCount] = String(input.badgeCount);
  }

  return properties;
}

/** Read a cart/order property whether stored as `Name` or `_Name`. */
export function readCartProperty(
  props: Record<string, unknown> | null | undefined,
  name: string,
): string | undefined {
  if (!props) return undefined;
  const bare = name.startsWith("_") ? name.slice(1) : name;
  const hidden = `_${bare}`;
  const v = props[hidden] ?? props[bare] ?? props[name];
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}
