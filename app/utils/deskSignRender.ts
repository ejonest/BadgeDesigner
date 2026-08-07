import type { DeskSignMaterial } from "~/constants/designerVariants";
import type { Badge } from "~/types/badge";
import type { LoadedTemplate } from "~/utils/templates";
import {
  FEATURED_BRUSHED_BLACK_HEX,
  FEATURED_BRUSHED_GOLD_HEX,
  FEATURED_BRUSHED_SILVER_HEX,
} from "~/constants/colors";

export const DESK_SIGN_ACRYLIC_PREVIEW_FILL = "#FFFFFF";
/** Fixed UV-print preview text on acrylic (customers can’t pick a print color). */
export const DESK_SIGN_ACRYLIC_TEXT_COLOR = "#1A1A1A";

export type DeskSignAcrylicFinishId = "clear" | "frosted" | "black";

/** Placeholder preview treatments; product photos can replace these swatches later. */
export const DESK_SIGN_ACRYLIC_FINISHES: readonly {
  id: DeskSignAcrylicFinishId;
  label: string;
  plateColor: string;
  textColor: string;
  description: string;
  imageSrc: string;
}[] = [
  {
    id: "clear",
    label: "Clear",
    plateColor: "#FFFFFF",
    textColor: "#1A1A1A",
    description: "Polished clear acrylic with sharp UV print",
    imageSrc: "/images/desk-sign/ClearAcrylic.jpg?v=1",
  },
  {
    id: "frosted",
    label: "Frosted",
    plateColor: "#E5E7EB",
    textColor: "#1A1A1A",
    description: "Soft frosted acrylic with crisp UV print",
    imageSrc: "/images/desk-sign/FrostedAcrylic.jpg?v=1",
  },
  {
    id: "black",
    label: "Black",
    plateColor: "#171717",
    textColor: "#FFFFFF",
    description: "Gloss black acrylic with bright UV print",
    imageSrc: "/images/desk-sign/BlackAcrylic.jpg?v=1",
  },
] as const;

export type DeskSignMountType = "desk-stand" | "wall-mount";
export type DeskSignAluminumColorId =
  | "black"
  | "silver"
  | "gold"
  | "rose-gold";

export const DESK_SIGN_ALUMINUM_COLORS: readonly {
  id: DeskSignAluminumColorId;
  label: string;
  color: string;
  /** Desk-stand product photo. */
  imageSrc: string;
  /** Wall-mount product photo. */
  wallImageSrc: string;
}[] = [
  {
    id: "silver",
    label: "Silver",
    color: "#B8BDC4",
    imageSrc: "/images/desk-sign/DeskFrameSilver.png?v=1",
    wallImageSrc: "/images/desk-sign/WallFrameSilver.png?v=1",
  },
  {
    id: "gold",
    label: "Gold",
    color: "#C9A66B",
    imageSrc: "/images/desk-sign/DeskFrameGold.png?v=1",
    wallImageSrc: "/images/desk-sign/WallFrameGold.png?v=1",
  },
  {
    id: "black",
    label: "Black",
    color: "#1A1A1A",
    imageSrc: "/images/desk-sign/DeskFrameBlack.png?v=1",
    wallImageSrc: "/images/desk-sign/WallFrameBlack.png?v=1",
  },
  {
    id: "rose-gold",
    label: "Rose Gold",
    color: "#A87C6A",
    imageSrc: "/images/desk-sign/DeskFrameRoseGold.png?v=1",
    wallImageSrc: "/images/desk-sign/WallFrameRoseGold.png?v=1",
  },
] as const;

export function findDeskSignAluminumColor(
  id: string | undefined | null,
): (typeof DESK_SIGN_ALUMINUM_COLORS)[number] | null {
  const normalized = normalizeDeskSignAluminumColor(id);
  return (
    DESK_SIGN_ALUMINUM_COLORS.find((finish) => finish.id === normalized) ?? null
  );
}

export function normalizeDeskSignAluminumColor(
  id: string | undefined | null,
): DeskSignAluminumColorId | undefined {
  if (!id) return undefined;
  if (id === "white") return "rose-gold";
  if (
    id === "black" ||
    id === "silver" ||
    id === "gold" ||
    id === "rose-gold"
  ) {
    return id;
  }
  return undefined;
}

export function findDeskSignAcrylicFinish(
  id: string | undefined | null,
): (typeof DESK_SIGN_ACRYLIC_FINISHES)[number] | null {
  return DESK_SIGN_ACRYLIC_FINISHES.find((finish) => finish.id === id) ?? null;
}

export function applyDeskSignAcrylicFinish(
  badge: Badge,
  finishId: DeskSignAcrylicFinishId,
): Badge {
  const finish =
    findDeskSignAcrylicFinish(finishId) ?? DESK_SIGN_ACRYLIC_FINISHES[0];
  return {
    ...badge,
    deskSignAcrylicFinish: finish.id,
    backgroundColor: finish.plateColor,
    lines: badge.lines.map((line) => ({
      ...line,
      color: finish.textColor,
    })),
  };
}

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
  imageSrc: string;
}[] = [
  {
    id: "brushed-gold",
    label: "Brushed Gold",
    plateColor: FEATURED_BRUSHED_GOLD_HEX,
    textColor: "#1A1A1A",
    description: "Brushed gold plate with UV-printed black text",
    imageSrc: "/images/desk-sign/RWGold.png?v=1",
  },
  {
    id: "brushed-silver",
    label: "Brushed Silver",
    plateColor: FEATURED_BRUSHED_SILVER_HEX,
    textColor: "#1A1A1A",
    description: "Brushed silver plate with UV-printed black text",
    imageSrc: "/images/desk-sign/RWSilver.png?v=1",
  },
  {
    id: "black-gold",
    label: "Black Gold",
    plateColor: FEATURED_BRUSHED_BLACK_HEX,
    textColor: DESK_SIGN_BLACK_GOLD_TEXT_HEX,
    description: "Brushed black plate with UV-printed gold text",
    imageSrc: "/images/desk-sign/RWBlackGold.png?v=1",
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
    // Preview-only default (brushed silver). Colors step still requires an
    // explicit plate-color pick via hasChosenBackgroundColor.
    backgroundColor: "#B8BDC4",
    standColor: "#B8BDC4",
    textColor: "#1A1A1A",
  },
};

/**
 * Traditional (plastic) plate colors — display order matches the color picker.
 */
export const DESK_SIGN_PLASTIC_PLATE_FINISHES: readonly {
  id: string;
  label: string;
  plateColor: string;
  textColor: string;
}[] = [
  { id: "silver", label: "Silver", plateColor: "#B8BDC4", textColor: "#1A1A1A" },
  { id: "gold", label: "Gold", plateColor: "#C9A66B", textColor: "#1A1A1A" },
  { id: "white", label: "White", plateColor: "#FFFFFF", textColor: "#1A1A1A" },
  { id: "black", label: "Black", plateColor: "#1A1A1A", textColor: "#FFFFFF" },
  { id: "red", label: "Red", plateColor: "#C62828", textColor: "#FFFFFF" },
  { id: "blue", label: "Blue", plateColor: "#0D47A1", textColor: "#FFFFFF" },
  { id: "ivory", label: "Ivory", plateColor: "#F5F0E6", textColor: "#1A1A1A" },
  { id: "brown", label: "Brown", plateColor: "#4A2C1A", textColor: "#FFFFFF" },
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
    DESK_SIGN_PLASTIC_PLATE_FINISHES.find((f) => f.id === "silver") ??
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
    deskSignSize: undefined,
    deskSignAcrylicFinish: undefined,
    deskSignMountType: undefined,
    deskSignAluminumColor: undefined,
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
    if (template.id.includes("plastic")) {
      return (
        badge.backgroundColor?.trim() ||
        DESK_SIGN_DEFAULT_COLORS.plastic.backgroundColor
      );
    }
    return badge.backgroundColor?.trim() || FEATURED_BRUSHED_GOLD_HEX;
  }
  if (material === "acrylic") {
    return (
      findDeskSignAcrylicFinish(badge.deskSignAcrylicFinish)?.plateColor ??
      DESK_SIGN_ACRYLIC_PREVIEW_FILL
    );
  }
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
  // Preview/design window shows the printed plate only (no wood/stand behind it).
  if (template.id.startsWith("desk-rosewood")) {
    return null;
  }
  if (template.id.startsWith("desk-plastic")) {
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
  material: DeskSignMaterial | null,
  hasChosenPlateColor: boolean,
  _hasChosenStandColor?: boolean,
): boolean {
  if (!material) return false;
  if (
    material === "acrylic" ||
    material === "rosewood" ||
    material === "plastic"
  ) {
    return hasChosenPlateColor;
  }
  return true;
}

/** Manufacturing summary for desk_sign_order_items.finish */
export function formatDeskSignOrderFinish(badge: Badge): string | undefined {
  const material = badge.deskSignMaterial;
  if (!material) return undefined;

  const materialLabel =
    material === "acrylic"
      ? "Acrylic"
      : material === "rosewood"
        ? "Rosewood"
        : "Traditional";

  let colorLabel = "";
  if (material === "acrylic") {
    colorLabel =
      findDeskSignAcrylicFinish(badge.deskSignAcrylicFinish)?.label ?? "";
  } else if (material === "rosewood") {
    colorLabel =
      findDeskSignRosewoodPlateFinish(badge.backgroundColor)?.label ?? "";
  } else {
    colorLabel =
      findDeskSignPlasticPlateFinish(badge.backgroundColor)?.label ?? "";
  }

  const sizeLabel =
    badge.deskSignSize === "2x8"
      ? '2×8"'
      : badge.deskSignSize === "2x10"
        ? '2×10"'
        : "";

  return [materialLabel, colorLabel, sizeLabel].filter(Boolean).join(" · ");
}

/**
 * desk_sign_order_items.attachment_method:
 * - acrylic / rosewood → "none"
 * - traditional wall-mount → "wall"
 * - traditional desk-stand → "desk"
 */
export function formatDeskSignAttachmentMethod(
  badge: Badge,
): "none" | "desk" | "wall" | undefined {
  const material = badge.deskSignMaterial;
  if (!material) return undefined;
  if (material === "acrylic" || material === "rosewood") return "none";
  if (badge.deskSignMountType === "wall-mount") return "wall";
  if (badge.deskSignMountType === "desk-stand") return "desk";
  return "none";
}
