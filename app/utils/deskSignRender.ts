import type { DeskSignMaterial } from "~/constants/designerVariants";
import type { Badge } from "~/types/badge";
import type { LoadedTemplate } from "~/utils/templates";
import {
  FEATURED_BRUSHED_BLACK_HEX,
  FEATURED_BRUSHED_GOLD_HEX,
  FEATURED_BRUSHED_SILVER_HEX,
} from "~/constants/colors";

export const DESK_SIGN_ACRYLIC_PREVIEW_FILL = "#FFFFFF";
/** Fixed engraving preview text on acrylic (customers can’t pick a print color). */
export const DESK_SIGN_ACRYLIC_TEXT_COLOR = "#1A1A1A";

/** Fixed rosewood stand; not shown in design preview (plate-only). */
export const DESK_SIGN_ROSEWOOD_STAND_COLOR = "#4A2C1A";

export const DESK_SIGN_BLACK_GOLD_TEXT_HEX = "#C9A227";

/**
 * Rosewood attachable plate finishes — preview shows the metal plate only.
 * “Black Gold” = brushed black metal plate with gold lettering.
 */
export const DESK_SIGN_ROSEWOOD_PLATE_FINISHES: readonly {
  id: "brushed-gold" | "brushed-silver" | "black-gold";
  label: string;
  plateColor: string;
  textColor: string;
  description: string;
}[] = [
  {
    id: "brushed-gold",
    label: "Brushed Gold",
    plateColor: FEATURED_BRUSHED_GOLD_HEX,
    textColor: "#1A1A1A",
    description: "Brushed gold plate with black text",
  },
  {
    id: "brushed-silver",
    label: "Brushed Silver",
    plateColor: FEATURED_BRUSHED_SILVER_HEX,
    textColor: "#1A1A1A",
    description: "Brushed silver plate with black text",
  },
  {
    id: "black-gold",
    label: "Black Gold",
    plateColor: FEATURED_BRUSHED_BLACK_HEX,
    textColor: DESK_SIGN_BLACK_GOLD_TEXT_HEX,
    description: "Brushed black plate with gold text",
  },
] as const;

export type DeskSignRosewoodPlateFinishId =
  (typeof DESK_SIGN_ROSEWOOD_PLATE_FINISHES)[number]["id"];

export function findDeskSignRosewoodPlateFinish(
  plateColor: string | undefined | null,
): (typeof DESK_SIGN_ROSEWOOD_PLATE_FINISHES)[number] | null {
  const raw = (plateColor || "").trim().toUpperCase();
  if (!raw) return null;
  return (
    DESK_SIGN_ROSEWOOD_PLATE_FINISHES.find(
      (f) => f.plateColor.toUpperCase() === raw,
    ) ?? null
  );
}

export const DESK_SIGN_DEFAULT_COLORS: Record<
  DeskSignMaterial,
  { backgroundColor: string; standColor: string; textColor: string }
> = {
  acrylic: {
    backgroundColor: DESK_SIGN_ACRYLIC_PREVIEW_FILL,
    standColor: "transparent",
    textColor: DESK_SIGN_ACRYLIC_TEXT_COLOR,
  },
  rosewood: {
    backgroundColor: FEATURED_BRUSHED_GOLD_HEX,
    standColor: DESK_SIGN_ROSEWOOD_STAND_COLOR,
    textColor: "#1A1A1A",
  },
  plastic: {
    backgroundColor: "#1A1A1A",
    standColor: "#1A1A1A",
    textColor: "#FFFFFF",
  },
  "wall-mount": {
    backgroundColor: "#1A1A1A",
    standColor: "transparent",
    textColor: "#FFFFFF",
  },
};

/**
 * Plastic insert finishes from the Signs By LITA engraving-plastic color set
 * (Amazon listing color fan). Pair plate + engraved core text color.
 * @see https://www.amazon.com/dp/B01N7GKHMS
 */
export const DESK_SIGN_PLASTIC_PLATE_FINISHES: readonly {
  id: string;
  label: string;
  plateColor: string;
  textColor: string;
}[] = [
  { id: "brown", label: "Brown", plateColor: "#4A2C1A", textColor: "#FFFFFF" },
  { id: "green", label: "Green", plateColor: "#2E7D32", textColor: "#FFFFFF" },
  { id: "black", label: "Black", plateColor: "#1A1A1A", textColor: "#FFFFFF" },
  { id: "almond", label: "Almond", plateColor: "#E8D5B7", textColor: "#1A1A1A" },
  { id: "red", label: "Red", plateColor: "#C62828", textColor: "#FFFFFF" },
  { id: "gray", label: "Gray", plateColor: "#B0B0B0", textColor: "#1A1A1A" },
  { id: "yellow", label: "Yellow", plateColor: "#F9A825", textColor: "#1A1A1A" },
  { id: "white", label: "White", plateColor: "#FFFFFF", textColor: "#1A1A1A" },
  { id: "blue", label: "Blue", plateColor: "#0D47A1", textColor: "#FFFFFF" },
  { id: "gold", label: "Gold", plateColor: "#C9A66B", textColor: "#1A1A1A" },
] as const;

export function findDeskSignPlasticPlateFinish(
  plateColor: string | undefined | null,
): (typeof DESK_SIGN_PLASTIC_PLATE_FINISHES)[number] | null {
  const raw = (plateColor || "").trim().toUpperCase();
  if (!raw) return null;
  return (
    DESK_SIGN_PLASTIC_PLATE_FINISHES.find(
      (f) => f.plateColor.toUpperCase() === raw,
    ) ?? null
  );
}

export function applyDeskSignPlasticPlateFinish(
  badge: Badge,
  finishId: string,
): Badge {
  const finish =
    DESK_SIGN_PLASTIC_PLATE_FINISHES.find((f) => f.id === finishId) ??
    DESK_SIGN_PLASTIC_PLATE_FINISHES.find((f) => f.id === "black") ??
    DESK_SIGN_PLASTIC_PLATE_FINISHES[0];
  return {
    ...badge,
    backgroundColor: finish.plateColor,
    lines: badge.lines.map((line) => ({
      ...line,
      color: finish.textColor,
    })),
  };
}

/** @deprecated Prefer DESK_SIGN_PLASTIC_PLATE_FINISHES */
export const DESK_SIGN_PLATE_COLORS: readonly {
  value: string;
  name: string;
}[] = DESK_SIGN_PLASTIC_PLATE_FINISHES.map((f) => ({
  value: f.plateColor,
  name: f.label,
}));

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
      color: colors.textColor,
      text:
        line.text ||
        (i === 0 ? "Your Name" : i === 1 ? "Your Title" : line.text),
    })),
  };
}

export function applyDeskSignRosewoodPlateFinish(
  badge: Badge,
  finishId: DeskSignRosewoodPlateFinishId,
): Badge {
  const finish =
    DESK_SIGN_ROSEWOOD_PLATE_FINISHES.find((f) => f.id === finishId) ??
    DESK_SIGN_ROSEWOOD_PLATE_FINISHES[0];
  return {
    ...badge,
    backgroundColor: finish.plateColor,
    lines: badge.lines.map((line) => ({
      ...line,
      color: finish.textColor,
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
    if (
      template.id.includes("plastic") ||
      template.id.includes("wall-mount")
    ) {
      return (
        badge.backgroundColor?.trim() ||
        DESK_SIGN_DEFAULT_COLORS.plastic.backgroundColor
      );
    }
    return badge.backgroundColor?.trim() || FEATURED_BRUSHED_GOLD_HEX;
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
  // Preview/design window shows the engraved plate only (no wood/stand behind it).
  if (template.id.startsWith("desk-rosewood")) {
    return null;
  }
  if (
    template.id.startsWith("desk-plastic") ||
    template.id.startsWith("desk-wall-mount")
  ) {
    return null;
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
  _hasChosenStandColor?: boolean,
): boolean {
  if (material === "acrylic") return true;
  if (
    material === "rosewood" ||
    material === "plastic" ||
    material === "wall-mount"
  ) {
    return hasChosenPlateColor;
  }
  return true;
}
