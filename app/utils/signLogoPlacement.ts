import type { SignLogoPlacement } from "~/types/badge";

/** Shapes with unreliable logo plate geometry: hide user image step until layout is path-based. */
const NO_USER_LOGO_SIGN_PREFIXES = [
  /^frontier-elegant-/i,
  /^arrow-/i,
  /^door-hanger-/i,
] as const;

/**
 * When false, the sign designer should not offer upload / show a user logo (exports omit logo).
 */
export function signTemplateSupportsUserLogoUpload(
  templateId: string | undefined,
): boolean {
  const id = templateId?.trim() ?? "";
  if (!id) return true;
  if (/^plaque-/i.test(id)) return true;
  return !NO_USER_LOGO_SIGN_PREFIXES.some((re) => re.test(id));
}

const ALL: readonly SignLogoPlacement[] = [
  "left",
  "right",
  "top",
  "bottom",
];

/**
 * Allowed logo placements for the current sign template.
 * - Designer / Arrow / Pill: horizontal only (no top/bottom).
 * - Door hanger: vertical only (top/bottom); default is bottom elsewhere in this module.
 */
export function getSignLogoPlacementOptionsForTemplate(
  templateId: string | undefined,
): readonly SignLogoPlacement[] {
  const id = templateId ?? "";
  if (/^plaque-detached$/i.test(id)) {
    return [];
  }
  if (/^plaque-attached$/i.test(id)) {
    return ["top"];
  }
  if (/^designer-/i.test(id) || /^arrow-/i.test(id) || /^pill-/i.test(id)) {
    return ["left", "right"];
  }
  if (/^door-hanger-/i.test(id)) {
    return ["top", "bottom"];
  }
  return ALL;
}

export function getDefaultSignLogoPlacementForTemplate(
  templateId: string | undefined,
): SignLogoPlacement {
  const id = templateId ?? "";
  if (/^plaque-attached$/i.test(id)) return "top";
  if (/^door-hanger-/i.test(id)) return "bottom";
  return "left";
}

export function normalizeSignLogoPlacementForTemplate(
  templateId: string | undefined,
  placement: SignLogoPlacement | undefined,
): SignLogoPlacement {
  const opts = getSignLogoPlacementOptionsForTemplate(templateId);
  const def = getDefaultSignLogoPlacementForTemplate(templateId);
  if (placement && opts.includes(placement)) return placement;
  return def;
}
