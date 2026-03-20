/**
 * Designer variant configuration: badge vs sign.
 * Drives maxLines, backing, size step, border, labels, templates, and help content.
 */
import { BACKGROUND_COLORS, EXTENDED_BACKGROUND_COLORS } from "./colors";

export type DesignerVariant = "badge" | "sign";

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
  templatesKey: "badge" | "sign";
  backgroundColors: readonly BackgroundColorOption[];
  backgroundTextures: readonly BackgroundTextureOption[];
  borderOptions: readonly BorderOption[];
  helpContent: "badge" | "sign";
}

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

/** Sign only: template types (Circle, Classic framed, Designer, Fancy) and their size variants for step 2. */
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

export const SIGN_TEMPLATE_TYPES: SignTemplateType[] = [
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
    id: "designer",
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
  {
    id: "fancy",
    name: "Fancy",
    sizes: [
      { templateId: "fancy-6x3", label: "Small", sizeText: '6×3"' },
      { templateId: "fancy-7x3_5", label: "Medium", sizeText: '7×3.5"' },
      { templateId: "fancy-9x4_5", label: "Large", sizeText: '9×4.5"' },
    ],
  },
];

/** Sign only: all template types (best sellers + rest). Use in "more templates" modal; main grid uses SIGN_TEMPLATE_TYPES only. */
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
];

/** Sign: whether the selected template family shows the border color step (false for Circle, Basic, etc.). */
export function signTemplateTypeShowsBorderStep(
  typeId: string | null,
): boolean {
  if (!typeId) return true;
  const t = ALL_SIGN_TEMPLATE_TYPES.find((x) => x.id === typeId);
  return t?.hasBorderTrim !== false;
}
