/**
 * Sign trim / frame styles (Option A). v1: only `default` (paths still come from template SVG via loader).
 * Future: add entries to TRIM_FRAGMENTS and extend getSignBorderStyleOptionsForTemplate.
 *
 * Reserved style ids for future art: doubleLine, rope, scalloped, cornerBracket, beaded
 */

export type SignBorderStyleOption = { id: string; label: string };

/** Chip id for “no frame” (plate only). */
export const SIGN_BORDER_OPTION_NONE = "none" as const;

const TRIM_OVERLAY_PREFIXES = [
  "designer-",
  "classic-framed-",
  "fancy-",
  "square-",
  "standard-",
  "oval-",
  "portrait-",
  "victorian-",
  "notched-",
  "frontier-elegant-",
  "pill-",
  "arrow-",
  "door-hanger-",
  "headstone-basic-",
  "vintage-",
  "western-elegant-",
] as const;

export function signTemplateIdHasTrimOverlay(
  templateId: string | undefined,
): boolean {
  if (!templateId) return false;
  return TRIM_OVERLAY_PREFIXES.some((p) => templateId.startsWith(p));
}

/** Used to keep border step selection when only the size changes within the same trim family. */
export function signTemplateBorderFamilyKey(
  templateId: string | undefined,
): string {
  if (!templateId) return "";
  if (templateId.startsWith("designer-")) return "designer";
  if (templateId.startsWith("classic-framed-")) return "classic-framed";
  if (templateId.startsWith("fancy-")) return "fancy";
  if (templateId.startsWith("square-")) return "square";
  if (templateId.startsWith("standard-")) return "standard";
  if (templateId.startsWith("oval-")) return "oval";
  if (templateId.startsWith("portrait-")) return "portrait";
  if (templateId.startsWith("victorian-")) return "victorian";
  if (templateId.startsWith("notched-")) return "notched";
  if (templateId.startsWith("frontier-elegant-")) return "frontier-elegant";
  if (templateId.startsWith("pill-")) return "pill";
  if (templateId.startsWith("arrow-")) return "arrow";
  if (templateId.startsWith("door-hanger-")) return "door-hanger";
  if (templateId.startsWith("headstone-basic-")) return "headstone-basic";
  if (templateId.startsWith("vintage-")) return "vintage";
  if (templateId.startsWith("western-elegant-")) return "western-elegant";
  return templateId.replace(/-[^-]+$/, "") || templateId;
}

/** `${templateId}::${styleId}` → SVG inner markup (same space as LoadedTemplate.overlayElement). */
const TRIM_FRAGMENTS = new Map<string, string>();

export function getSignTrimOverlayFragment(
  templateId: string,
  styleId: string,
): string | null {
  if (styleId === "default") return null;
  return TRIM_FRAGMENTS.get(`${templateId}::${styleId}`) ?? null;
}

const DEFAULT_STYLE: SignBorderStyleOption = {
  id: "default",
  label: "Standard",
};

export function getSignBorderStyleOptionsForTemplate(
  templateId: string | undefined,
): SignBorderStyleOption[] {
  if (!templateId || !signTemplateIdHasTrimOverlay(templateId)) {
    return [DEFAULT_STYLE];
  }
  return [DEFAULT_STYLE];
}

/** Options shown in the border step (includes “No border” then framed styles). */
export function getSignBorderStepChipOptions(
  templateId: string | undefined,
): SignBorderStyleOption[] {
  const framed = getSignBorderStyleOptionsForTemplate(templateId);
  return [
    { id: SIGN_BORDER_OPTION_NONE, label: "No border" },
    ...framed.map((o) =>
      o.id === "default" ? { ...o, label: "Standard frame" } : o,
    ),
  ];
}
