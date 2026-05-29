/** Left-side pictogram options for the AQB name badge tool (order matches CDR sheet). */
export const BADGE_ICON_IDS = [
  "cross",
  "praying-hands",
  "stethoscope",
  "house-key",
  "coffee",
  "storefront",
  "tooth",
  "chef-hat",
  "utensils",
  "graduation-cap",
  "paw",
  "medical-cross",
  "baby-feet",
  "airplane",
  "apple",
] as const;

export type BadgeIconId = (typeof BADGE_ICON_IDS)[number];

export function isBadgeIconId(
  value: string | undefined | null,
): value is BadgeIconId {
  return value != null && (BADGE_ICON_IDS as readonly string[]).includes(value);
}

export const BADGE_ICON_LABELS: Record<BadgeIconId, string> = {
  cross: "Cross",
  "praying-hands": "Praying hands",
  stethoscope: "Stethoscope",
  "house-key": "House & key",
  coffee: "Coffee",
  storefront: "Storefront",
  tooth: "Tooth",
  "chef-hat": "Chef hat",
  utensils: "Knife & fork",
  "graduation-cap": "Graduation cap",
  paw: "Paw print",
  "medical-cross": "Medical cross",
  "baby-feet": "Baby feet",
  airplane: "Airplane",
  apple: "Apple",
};

/** Public path for picker thumbnails (full export uses embedded data URLs). */
export function badgeIconPublicSrc(id: BadgeIconId): string {
  return `/badge-icons/${id}.png`;
}
