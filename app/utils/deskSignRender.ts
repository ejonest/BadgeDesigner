import type { DeskSignMaterial } from "~/constants/designerVariants";
import type { Badge } from "~/types/badge";
import type { LoadedTemplate } from "~/utils/templates";

export const DESK_SIGN_ACRYLIC_PREVIEW_FILL = "rgba(220, 235, 250, 0.22)";

/** Fixed rosewood stand; not user-configurable. */
export const DESK_SIGN_ROSEWOOD_STAND_COLOR = "#4A2C1A";

export const DESK_SIGN_DEFAULT_COLORS: Record<
  DeskSignMaterial,
  { backgroundColor: string; standColor: string; textColor: string }
> = {
  acrylic: {
    backgroundColor: "transparent",
    standColor: "transparent",
    textColor: "#1A1A1A",
  },
  rosewood: {
    backgroundColor: "#1A1A1A",
    standColor: DESK_SIGN_ROSEWOOD_STAND_COLOR,
    textColor: "#C9A227",
  },
  plastic: {
    backgroundColor: "#1B2A4A",
    standColor: "#1A1A1A",
    textColor: "#C9A227",
  },
};

/** Attachable / insert plate — rosewood (one picker) and plastic insert. */
export const DESK_SIGN_PLATE_COLORS: readonly {
  value: string;
  name: string;
}[] = [
  { value: "#1A1A1A", name: "Black" },
  { value: "#2B2B2B", name: "Charcoal" },
  { value: "#1B2A4A", name: "Navy" },
  { value: "#3D2817", name: "Brown" },
  { value: "#C9A227", name: "Gold" },
  { value: "#C0C0C0", name: "Silver" },
  { value: "#FFFFFF", name: "White" },
  { value: "#8B0000", name: "Burgundy" },
];

/** Plastic desk sign stand / holder only. */
export const DESK_SIGN_PLASTIC_STAND_COLORS: readonly {
  value: string;
  name: string;
}[] = [
  { value: "#1A1A1A", name: "Black" },
  { value: "#2B2B2B", name: "Charcoal" },
  { value: "#4A2C1A", name: "Rosewood tone" },
  { value: "#3D2817", name: "Espresso" },
  { value: "#6B4423", name: "Cherry" },
  { value: "#5C3D2E", name: "Walnut" },
];

export function applyDeskSignMaterialDefaults(
  badge: Badge,
  material: DeskSignMaterial,
): Badge {
  const colors = DESK_SIGN_DEFAULT_COLORS[material];
  return {
    ...badge,
    deskSignMaterial: material,
    backgroundColor: colors.backgroundColor,
    borderColor: colors.standColor,
    signBorderEnabled: false,
    signBorderOptionId: "none",
    lines: badge.lines.map((line, i) => ({
      ...line,
      color: line.color || colors.textColor,
      text:
        line.text ||
        (i === 0 ? "Your Name" : i === 1 ? "Your Title" : line.text),
    })),
  };
}

export function isDeskSignTemplateId(templateId: string): boolean {
  return templateId.startsWith("desk-");
}

export function deskSignInnerFillForRender(
  badge: Badge,
  template: LoadedTemplate,
): string {
  const material = badge.deskSignMaterial;
  if (!material && isDeskSignTemplateId(template.id)) {
    if (template.id.includes("acrylic")) return DESK_SIGN_ACRYLIC_PREVIEW_FILL;
    if (template.id.includes("plastic")) {
      return (
        badge.backgroundColor?.trim() ||
        DESK_SIGN_DEFAULT_COLORS.plastic.backgroundColor
      );
    }
    return badge.backgroundColor?.trim() || "#FFFFFF";
  }
  if (material === "acrylic") return DESK_SIGN_ACRYLIC_PREVIEW_FILL;
  const raw = badge.backgroundColor?.trim();
  if (!raw || raw === "transparent") {
    return DESK_SIGN_DEFAULT_COLORS[material ?? "plastic"].backgroundColor;
  }
  return raw;
}

export function deskSignStandFillForRender(
  badge: Badge,
  template: LoadedTemplate,
): string | null {
  if (template.id.startsWith("desk-rosewood")) {
    return DESK_SIGN_ROSEWOOD_STAND_COLOR;
  }
  if (template.id.startsWith("desk-plastic")) {
    return (
      badge.borderColor?.trim() ||
      DESK_SIGN_DEFAULT_COLORS.plastic.standColor
    );
  }
  return null;
}

export function buildDeskSignStandMarkup(
  template: LoadedTemplate,
  badge: Badge,
): string {
  const fill = deskSignStandFillForRender(badge, template);
  if (!fill) return "";
  return `<rect x="0" y="0" width="${template.widthPx}" height="${template.heightPx}" fill="${fill}" />`;
}

export function deskSignColorsStepComplete(
  material: DeskSignMaterial,
  hasChosenPlateColor: boolean,
  hasChosenStandColor: boolean,
): boolean {
  if (material === "acrylic") return true;
  if (material === "rosewood") return hasChosenPlateColor;
  if (material === "plastic") return hasChosenPlateColor && hasChosenStandColor;
  return true;
}
