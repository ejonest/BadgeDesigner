/**
 * Badge left-icon layout on the metal plate (template pixel space).
 *
 * Every icon is drawn at the same width; height follows each asset’s aspect ratio.
 * Calibrated so praying-hands matches the previous ~46% plate-height sizing.
 *
 * Tweak {@link BADGE_ICON_DRAW_WIDTH_FRAC} to scale the whole set up or down.
 */
export const BADGE_ICON_DRAW_WIDTH_FRAC = 0.36;

/** Left inset before the icon on 1.5×3 plates (fraction of plate height). */
export const BADGE_ICON_LEFT_PAD_FRAC = 0.075;

/** Extra inset for 1×3 plates — nudges icons slightly right vs 1.5×3. */
export const BADGE_ICON_LEFT_PAD_FRAC_1X3 = 0.15;

/** Gap between icon and text (fraction of plate height). */
export const BADGE_ICON_TEXT_GAP_FRAC = 0.055;

/** True for 3×1″ name-badge templates (not 1.5×3). */
export function isBadgeTemplate1x3(templateId?: string): boolean {
  if (!templateId) return true;
  const id = templateId.toLowerCase();
  if (id.includes("1_5x3") || id.includes("1.5x3")) return false;
  return id.includes("1x3");
}

export function badgeIconLeftPadFrac(templateId?: string): number {
  return isBadgeTemplate1x3(templateId)
    ? BADGE_ICON_LEFT_PAD_FRAC_1X3
    : BADGE_ICON_LEFT_PAD_FRAC;
}

/** Badge shape with built-in decorative artwork — no optional left pictogram. */
export const BADGE_DESIGNER_TEMPLATE_ID = "designer-1x3";

export function badgeTemplateSupportsIcon(templateId?: string): boolean {
  return templateId !== BADGE_DESIGNER_TEMPLATE_ID;
}
