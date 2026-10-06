/**
 * Shopify cart line-item properties for designer products.
 *
 * Properties whose names start with `_` are stored on the line item but hidden
 * from customer-facing checkout / order summary. Keep only human-useful copy
 * (ordered text and an uploaded-logo acknowledgement) without the underscore
 * prefix.
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
  gavelTextLine4: "Gavel Text Line 4",
  trophyTextLine1: "Trophy Text Line 1",
  trophyTextLine2: "Trophy Text Line 2",
  trophyTextLine3: "Trophy Text Line 3",
  trophyTextLine4: "Trophy Text Line 4",
  penCaseBandText: "Case Band Text",
  penCapText: "Pen Cap Text",
  uploadedLogo: "Uploaded Logo",
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
  /** Customer-facing filename or acknowledgement for an uploaded logo. */
  uploadedLogo?: string | null;
  /** Extra hidden props (desk-sign material, etc.) — keys should already be underscore-prefixed. */
  extraHidden?: Record<string, string>;
  includeBackingType?: boolean;
};

export type ProductionCartTextLine = {
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  sizeNorm?: number;
  color?: string;
  align?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type ProductionLinePropertyOptions = {
  /** Store line text too (used for secondary surfaces without the standard visible text keys). */
  includeText?: boolean;
  /** Use `_Case Band Font` instead of `_Case Band Line 1 Font`. */
  omitLineNumberWhenSingle?: boolean;
  /** Human-readable sizes when the designer uses presets rather than numeric font sizes. */
  fontSizeLabels?: Array<string | undefined>;
};

function formatProductionFontSize(
  line: ProductionCartTextLine,
  explicitLabel?: string,
): string | undefined {
  const label = explicitLabel?.trim();
  if (label) return label;
  if (typeof line.fontSize === "number" && Number.isFinite(line.fontSize)) {
    return `${Math.round(line.fontSize * 100) / 100}px`;
  }
  if (typeof line.sizeNorm === "number" && Number.isFinite(line.sizeNorm)) {
    return `${Math.round(line.sizeNorm * 10_000) / 100}% of design height`;
  }
  return undefined;
}

/**
 * Hidden Shopify properties used by production/Trello to reconstruct artwork.
 * Values stay on the order while `_` keeps them out of customer-facing themes.
 */
export function buildProductionLineProperties(
  prefix: string,
  lines: readonly ProductionCartTextLine[],
  options: ProductionLinePropertyOptions = {},
): Record<string, string> {
  const properties: Record<string, string> = {};
  const useBarePrefix =
    options.omitLineNumberWhenSingle && lines.length === 1;

  lines.forEach((line, index) => {
    const text = line.text?.trim();
    if (!text) return;

    const stem = useBarePrefix ? prefix : `${prefix} Line ${index + 1}`;
    const set = (label: string, value: string | undefined) => {
      const normalized = value?.trim();
      if (normalized) properties[`_${stem} ${label}`] = normalized;
    };

    if (options.includeText) set("Text", text);
    set("Font", line.fontFamily || "Arial");
    set(
      "Font Size",
      formatProductionFontSize(line, options.fontSizeLabels?.[index]),
    );
    set("Color", line.color);
    set("Alignment", line.align);
    set("Bold", line.bold ? "Yes" : "No");
    set("Italic", line.italic ? "Yes" : "No");
    set("Underline", line.underline ? "Yes" : "No");
  });

  return properties;
}

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
  const isPen = input.designerId === "pen";
  const isTrophy = input.designerId === "trophy";
  const firstLineProperty = isGavel
    ? CART_PROP.gavelTextLine1
    : isPen
      ? CART_PROP.penCaseBandText
      : isTrophy
        ? CART_PROP.trophyTextLine1
        : CART_PROP.textLine1;
  const secondLineProperty = isGavel
    ? CART_PROP.gavelTextLine2
    : isPen
      ? CART_PROP.penCapText
      : isTrophy
        ? CART_PROP.trophyTextLine2
        : CART_PROP.textLine2;
  const properties: Record<string, string> = {
    [firstLineProperty]: input.lines[0]?.text || "",
    [secondLineProperty]: input.lines[1]?.text || "",
    [isGavel
      ? CART_PROP.gavelTextLine3
      : isTrophy
        ? CART_PROP.trophyTextLine3
        : CART_PROP.textLine3]: input.lines[2]?.text || "",
    [isGavel
      ? CART_PROP.gavelTextLine4
      : isTrophy
        ? CART_PROP.trophyTextLine4
        : CART_PROP.textLine4]: input.lines[3]?.text || "",
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
  const uploadedLogo = (input.uploadedLogo ?? "").trim();
  if (uploadedLogo) {
    properties[CART_PROP.uploadedLogo] = uploadedLogo;
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
