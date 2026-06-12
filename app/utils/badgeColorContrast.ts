/** Normalize user/API hex to uppercase #RRGGBB for contrast checks. */
export function normalizeContrastHex(
  color: string | undefined | null,
): string | null {
  const raw = (color ?? "").trim();
  if (!raw) return null;
  let hex = raw.startsWith("#") ? raw : `#${raw}`;
  hex = hex.toUpperCase();
  if (/^#[0-9A-F]{3}$/.test(hex)) {
    const h = hex.slice(1);
    hex = `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  if (!/^#[0-9A-F]{6}$/.test(hex)) return null;
  return hex;
}

/** Plate black (#2C2C2C) vs default text black (#000000) — same for contrast rules. */
const BADGE_BLACK_EQUIVALENTS = new Set(["#000000", "#2C2C2C"]);

/**
 * True when plate/background and text would be the same visible color
 * (exact hex match, or both in the badge black family).
 */
export function areBadgePlateAndTextSameColor(
  plateOrBackgroundColor: string,
  textColor: string,
): boolean {
  const bg = normalizeContrastHex(plateOrBackgroundColor);
  const text = normalizeContrastHex(textColor);
  if (!bg || !text) return false;
  if (bg === text) return true;
  return (
    BADGE_BLACK_EQUIVALENTS.has(bg) && BADGE_BLACK_EQUIVALENTS.has(text)
  );
}

export function badgeBackgroundConflictsWithTextColor(
  backgroundColor: string,
  lines: Array<{ color?: string }>,
): boolean {
  return lines.some(
    (line) =>
      Boolean(line.color) &&
      areBadgePlateAndTextSameColor(backgroundColor, line.color!),
  );
}

export function badgeTextColorConflictsWithBackground(
  textColor: string,
  backgroundColor: string | undefined,
): boolean {
  if (!backgroundColor) return false;
  return areBadgePlateAndTextSameColor(backgroundColor, textColor);
}
