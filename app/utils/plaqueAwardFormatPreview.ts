import type { Badge } from "~/types/badge";
import {
  buildInitialLinesForPlaqueAwardFormat,
  getPlaqueAwardFormatById,
  plaqueAwardFormatUserLineCount,
  type BadgeLineShape,
} from "~/constants/plaqueFormats";
import { PLAQUE_DEFAULT_BRUSH_GOLD_HEX } from "~/utils/plaqueRender";

/** Generic “logo” tile for format thumbnails (data URL, CORS-free in SVG-as-img plaque previews). */
const PREVIEW_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#ffffff" stroke="#d4d4d8" stroke-width="4" rx="4"/>
  <rect x="36" y="56" width="128" height="88" rx="6" fill="#f4f4f5"/>
  <circle cx="100" cy="96" r="22" fill="#d4d4d8"/>
  <rect x="56" y="128" width="88" height="10" rx="2" fill="#e4e4e7"/>
</svg>`;

const PLAQUE_AWARD_FORMAT_PREVIEW_LOGO_SRC = `data:image/svg+xml,${encodeURIComponent(
  PREVIEW_LOGO_SVG,
)}`;

/**
 * Deterministic badge for “Choose award format” thumbnails: brushed-gold plate, sample copy, placeholder logo.
 */
export function buildPlaqueAwardFormatPreviewBadge(params: {
  formatId: string;
  templateId: string;
  maxLines: number;
  defaultLineShape: BadgeLineShape;
  /** Defaults to {@link PLAQUE_DEFAULT_BRUSH_GOLD_HEX}. */
  plateBackgroundHex?: string;
}): Badge | null {
  const fmt = getPlaqueAwardFormatById(params.formatId);
  if (!fmt) return null;
  const userSlots = plaqueAwardFormatUserLineCount(fmt);
  const lineCount = Math.max(params.maxLines, userSlots);
  const linesRaw = buildInitialLinesForPlaqueAwardFormat(
    fmt,
    params.defaultLineShape,
    lineCount,
  );
  /** Shorter than slot placeholders so thumbnails stay inside the inner border at small preview scale. */
  const lines = linesRaw.map((line, i) =>
    i === 0 ? { ...line, text: "YOUR NAME" } : line,
  );
  return {
    id: "plaque-award-format-preview",
    templateId: params.templateId,
    lines,
    backgroundColor: params.plateBackgroundHex ?? PLAQUE_DEFAULT_BRUSH_GOLD_HEX,
    backing: "magnetic",
    plaqueFormatId: params.formatId,
    logo: {
      src: PLAQUE_AWARD_FORMAT_PREVIEW_LOGO_SRC,
      placement: "top",
      intrinsicWidth: 200,
      intrinsicHeight: 200,
    },
  };
}
