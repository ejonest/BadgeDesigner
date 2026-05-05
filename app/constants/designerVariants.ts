/**
 * Designer variant configuration: badge vs sign.
 * Drives maxLines, backing, size step, border, labels, templates, and help content.
 */
import { BACKGROUND_COLORS, EXTENDED_BACKGROUND_COLORS } from "./colors";
import type { PlaqueLayoutOption } from "./plaqueLayouts";
import { PLAQUE_LAYOUT_OPTIONS as PLAQUE_LAYOUT_OPTIONS_CONST } from "./plaqueLayouts";

export type DesignerVariant = "badge" | "sign" | "plaque";

/**
 * Sign/plaque template grid + plaque live preview: non-scaling outline so trim stays visible
 * when scaled down; pair plaque live preview with svgMarkupToImageSrc for correct wood filters.
 */
export const SIGN_LIKE_TEMPLATE_THUMB_RENDER_OPTS = {
  showOutline: true as const,
  outlineStrokeWidth: "1.5",
  outlineNonScalingStroke: true as const,
};

/** Same template/workflow as sign (multi-line, borders, Shopify catalog, etc.). */
export function isSignLikeVariant(
  variant: DesignerVariant,
): variant is "sign" | "plaque" {
  return variant === "sign" || variant === "plaque";
}

export interface BackgroundColorOption {
  value: string;
  name: string;
  ring?: string;
}

export interface BackgroundTextureOption {
  value: string;
  name: string;
  previewUrl?: string;
}

export interface BorderOption {
  value: string;
  label: string;
  previewUrl?: string;
}

export interface SizeOption {
  value: string;
  label: string;
}

export interface DesignerVariantConfig {
  maxLines: number;
  hasBacking: boolean;
  hasBorder: boolean;
  hasSizeStep: boolean;
  sizeOptions: readonly SizeOption[];
  labelProduct: string;
  labelProductPlural: string;
  templatesKey: "badge" | "sign" | "plaque";
  backgroundColors: readonly BackgroundColorOption[];
  backgroundTextures: readonly BackgroundTextureOption[];
  borderOptions: readonly BorderOption[];
  helpContent: "badge" | "sign";
}

/** Plaque designer: layout families (step 2); sizes are suffixes on template ids in plaque-templates.local.json. */
export const PLAQUE_LAYOUT_OPTIONS: readonly PlaqueLayoutOption[] =
  PLAQUE_LAYOUT_OPTIONS_CONST;

const badgeBackgroundColors: readonly BackgroundColorOption[] = [
  ...BACKGROUND_COLORS,
  ...EXTENDED_BACKGROUND_COLORS,
];

const signBackgroundColors: readonly BackgroundColorOption[] = [
  ...BACKGROUND_COLORS,
  ...EXTENDED_BACKGROUND_COLORS,
];

export const DESIGNER_VARIANT_CONFIG: Record<
  DesignerVariant,
  DesignerVariantConfig
> = {
  plaque: {
    maxLines: 6,
    hasBacking: false,
    hasBorder: false,
    hasSizeStep: false,
    sizeOptions: [],
    labelProduct: "Plaque",
    labelProductPlural: "Plaques",
    templatesKey: "plaque",
    backgroundColors: signBackgroundColors,
    backgroundTextures: [],
    borderOptions: [],
    helpContent: "sign",
  },
  badge: {
    maxLines: 4,
    hasBacking: true,
    hasBorder: false,
    hasSizeStep: false,
    sizeOptions: [],
    labelProduct: "Badge",
    labelProductPlural: "Badges",
    templatesKey: "badge",
    backgroundColors: badgeBackgroundColors,
    backgroundTextures: [],
    borderOptions: [],
    helpContent: "badge",
  },
  sign: {
    maxLines: 6,
    hasBacking: false,
    hasBorder: true,
    hasSizeStep: true,
    sizeOptions: [
      { value: "small", label: "Small" },
      { value: "medium", label: "Medium" },
      { value: "large", label: "Large" },
    ],
    labelProduct: "Sign",
    labelProductPlural: "Signs",
    templatesKey: "sign",
    backgroundColors: signBackgroundColors,
    backgroundTextures: [], // Placeholder – add wood etc. later
    borderOptions: [], // Placeholder – add border assets later
    helpContent: "sign",
  },
};

export function getDesignerVariantConfig(
  variant: DesignerVariant,
): DesignerVariantConfig {
  return DESIGNER_VARIANT_CONFIG[variant];
}

/** Sign only: template types (Classic framed, Standard, Fancy, Designer, etc.) and their size variants for step 2. */
export interface SignTemplateSizeOption {
  templateId: string;
  label: string;
  sizeText: string;
}

export interface SignTemplateType {
  id: string;
  name: string;
  sizes: SignTemplateSizeOption[];
  /**
   * When `false`, the SVG has no border trim overlay — hide border color UI and treat the border step as complete.
   * Omit or `true` for designs with a configurable border.
   */
  hasBorderTrim?: boolean;
}

/** Main Step 1 grid: four shapes only; more variants live in ALL_SIGN_TEMPLATE_TYPES / "more templates". */
export const SIGN_TEMPLATE_TYPES: SignTemplateType[] = [
  {
    id: "classic-framed",
    name: "Classic framed",
    sizes: [
      { templateId: "classic-framed-4x6", label: "Small", sizeText: '4×6"' },
      { templateId: "classic-framed-5x7", label: "Medium", sizeText: '5×7"' },
      { templateId: "classic-framed-6x8", label: "Large", sizeText: '6×8"' },
      {
        templateId: "classic-framed-7x10",
        label: "Extra large",
        sizeText: '7×10"',
      },
    ],
  },
  {
    id: "standard",
    name: "Standard",
    sizes: [
      { templateId: "standard-2x6-small", label: "Small", sizeText: '2×6"' },
      {
        templateId: "standard-2_75x7-medium",
        label: "Medium",
        sizeText: '2.75×7"',
      },
      { templateId: "standard-3x9-large", label: "Large", sizeText: '3×9"' },
      {
        templateId: "standard-4x12-xl",
        label: "Extra large",
        sizeText: '4×12"',
      },
    ],
  },
  {
    id: "fancy",
    name: "Fancy",
    sizes: [
      { templateId: "fancy-6x3", label: "Small", sizeText: '6×3"' },
      { templateId: "fancy-7x3_5", label: "Medium", sizeText: '7×3.5"' },
      { templateId: "fancy-9x4_5", label: "Large", sizeText: '9×4.5"' },
    ],
  },
  {
    id: "designer-heart",
    name: "Designer",
    sizes: [
      { templateId: "designer-2x5", label: "Small", sizeText: '2×5"' },
      { templateId: "designer-2_8x7", label: "Medium", sizeText: '2.8×7"' },
      { templateId: "designer-4x9", label: "Large", sizeText: '4×9"' },
      {
        templateId: "designer-4_25x11",
        label: "Extra large",
        sizeText: '4.25×11"',
      },
    ],
  },
];

/** Sign only: all template types (main four + Basic + more). Main grid uses SIGN_TEMPLATE_TYPES only (4 cards). */
export const ALL_SIGN_TEMPLATE_TYPES: SignTemplateType[] = [
  ...SIGN_TEMPLATE_TYPES,
  {
    id: "basic",
    name: "Basic",
    hasBorderTrim: false,
    sizes: [
      { templateId: "basic-2x6", label: "Small", sizeText: '2×6"' },
      { templateId: "basic-2_5x7", label: "Medium", sizeText: '2.5×7"' },
      { templateId: "basic-3x9", label: "Large", sizeText: '3×9"' },
    ],
  },
  {
    id: "circle",
    name: "Circle",
    hasBorderTrim: false,
    sizes: [
      { templateId: "circle-4x4", label: "Small", sizeText: '4×4"' },
      { templateId: "circle-6x6", label: "Medium", sizeText: '6×6"' },
      { templateId: "circle-8x8", label: "Large", sizeText: '8×8"' },
      { templateId: "circle-10x10", label: "Extra large", sizeText: '10×10"' },
    ],
  },
  {
    id: "square",
    name: "Square",
    sizes: [
      { templateId: "square-4x4-small", label: "Small", sizeText: '4×4"' },
      { templateId: "square-6x6-medium", label: "Medium", sizeText: '6×6"' },
      { templateId: "square-8x8-large", label: "Large", sizeText: '8×8"' },
      {
        templateId: "square-10x10-xl",
        label: "Extra large",
        sizeText: '10×10"',
      },
    ],
  },
  {
    id: "oval",
    name: "Oval",
    sizes: [
      { templateId: "oval-2x5-small", label: "Small", sizeText: '2×5"' },
      {
        templateId: "oval-2_8x7-medium",
        label: "Medium",
        sizeText: '2.8×7"',
      },
      { templateId: "oval-3_6x9-large", label: "Large", sizeText: '3.6×9"' },
      { templateId: "oval-4x10-xl", label: "Extra large", sizeText: '4×10"' },
    ],
  },
  {
    id: "portrait",
    name: "Portrait",
    sizes: [
      {
        templateId: "portrait-round-4x6",
        label: "Small",
        sizeText: '4×6"',
      },
      {
        templateId: "portrait-round-5x7",
        label: "Medium",
        sizeText: '5×7"',
      },
      { templateId: "portrait-6x8", label: "Large", sizeText: '6×8"' },
      {
        templateId: "portrait-7x10",
        label: "Extra large",
        sizeText: '7×10"',
      },
    ],
  },
  {
    id: "victorian",
    name: "Victorian",
    sizes: [
      { templateId: "victorian-3x6-small", label: "Small", sizeText: '3×6"' },
      {
        templateId: "victorian-4x8-medium",
        label: "Medium",
        sizeText: '4×8"',
      },
      {
        templateId: "victorian-5x10-large",
        label: "Large",
        sizeText: '5×10"',
      },
    ],
  },
  {
    id: "notched",
    name: "Notched",
    sizes: [
      {
        templateId: "notched-6x3_5-small",
        label: "Small",
        sizeText: '6×3.5"',
      },
      {
        templateId: "notched-7x4_25-medium",
        label: "Medium",
        sizeText: '7×4.25"',
      },
      { templateId: "notched-9x5-large", label: "Large", sizeText: '9×5"' },
    ],
  },
  {
    id: "frontier-elegant",
    name: "Frontier elegant",
    sizes: [
      {
        templateId: "frontier-elegant-7x3-small",
        label: "Small",
        sizeText: '7×3"',
      },
      {
        templateId: "frontier-elegant-8x3_5-medium",
        label: "Medium",
        sizeText: '8×3.5"',
      },
      {
        templateId: "frontier-elegant-10x4_5-large",
        label: "Large",
        sizeText: '10×4.5"',
      },
      {
        templateId: "frontier-elegant-11x5_5-xlarge",
        label: "Extra large",
        sizeText: '11×5.5"',
      },
    ],
  },
  {
    id: "pill",
    name: "Pill",
    sizes: [
      {
        templateId: "pill-7_9x2_9",
        label: "One size",
        sizeText: '7.9×2.9"',
      },
    ],
  },
  {
    id: "arrow",
    name: "Arrow",
    sizes: [
      {
        templateId: "arrow-24x12",
        label: "One size",
        sizeText: '24×12"',
      },
    ],
  },
  {
    id: "door-hanger",
    name: "Door hanger",
    sizes: [
      {
        templateId: "door-hanger-4x8",
        label: "One size",
        sizeText: '4×8"',
      },
    ],
  },
  {
    id: "headstone-basic",
    name: "Headstone basic",
    sizes: [
      {
        templateId: "headstone-basic-5x6-small",
        label: "Small",
        sizeText: '5×6"',
      },
      {
        templateId: "headstone-basic-6x7-medium",
        label: "Medium",
        sizeText: '6×7"',
      },
      {
        templateId: "headstone-basic-7x8-large",
        label: "Large",
        sizeText: '7×8"',
      },
      {
        templateId: "headstone-basic-8x9-xlarge",
        label: "Extra large",
        sizeText: '8×9"',
      },
    ],
  },
  {
    id: "vintage",
    name: "Vintage",
    sizes: [
      {
        templateId: "vintage-6_5x4_5-small",
        label: "Small",
        sizeText: '6.5×4.5"',
      },
      {
        templateId: "vintage-7_5x5_5-medium",
        label: "Medium",
        sizeText: '7.5×5.5"',
      },
      {
        templateId: "vintage-8_5x6_5-large",
        label: "Large",
        sizeText: '8.5×6.5"',
      },
    ],
  },
  {
    id: "western-elegant",
    name: "Western elegant",
    sizes: [
      {
        templateId: "western-elegant-6_75x4_5-small",
        label: "Small",
        sizeText: '6.75×4.5"',
      },
      {
        templateId: "western-elegant-7_75x5_5-medium",
        label: "Medium",
        sizeText: '7.75×5.5"',
      },
      {
        templateId: "western-elegant-8_75x6_5-large",
        label: "Large",
        sizeText: '8.75×6.5"',
      },
      {
        templateId: "western-elegant-9_75x7_5-xlarge",
        label: "Extra large",
        sizeText: '9.75×7.5"',
      },
    ],
  },
];

/**
 * Scale applied in the sign template picker and `BadgeSvgRenderer` when plate art
 * sits in a large Corel viewBox (lots of empty margin). One value keeps families consistent.
 */
export const SIGN_SPARSE_PLATE_UI_SCALE = 1.62;

/** Optional per-id overrides (wins over prefix rules below). */
export const SIGN_TEMPLATE_UI_CONTENT_SCALE: Readonly<
  Record<string, number>
> = {};

const SPARSE_SIGN_TEMPLATE_ID_PREFIXES = [
  "arrow-",
  "headstone-basic-",
  "vintage-",
  "western-elegant-",
] as const;

export function getSignTemplateUiContentScale(templateId: string): number {
  const override = SIGN_TEMPLATE_UI_CONTENT_SCALE[templateId];
  if (
    typeof override === "number" &&
    Number.isFinite(override) &&
    override > 0
  ) {
    return override;
  }
  for (const prefix of SPARSE_SIGN_TEMPLATE_ID_PREFIXES) {
    if (templateId.startsWith(prefix)) return SIGN_SPARSE_PLATE_UI_SCALE;
  }
  return 1;
}

/** Sign: whether the selected template family shows the border color step (false for Circle, Basic, etc.). */
export function signTemplateTypeShowsBorderStep(
  typeId: string | null,
): boolean {
  if (!typeId) return true;
  const t = ALL_SIGN_TEMPLATE_TYPES.find((x) => x.id === typeId);
  return t?.hasBorderTrim !== false;
}

/** Map universal template id → sign shape row + size (for sync / restore). */
export function findSignTypeAndSizeForUniversalTemplate(
  templateId: string,
): { typeId: string; sizeTemplateId: string } | null {
  for (const type of ALL_SIGN_TEMPLATE_TYPES) {
    const hit = type.sizes.find((s) => s.templateId === templateId);
    if (hit) {
      return {
        typeId: type.id,
        sizeTemplateId: hit.templateId,
      };
    }
  }
  return null;
}
