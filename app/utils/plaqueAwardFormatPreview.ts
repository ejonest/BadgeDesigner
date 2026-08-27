import type { Badge } from "~/types/badge";
import {
  buildInitialLinesForPlaqueAwardFormat,
  DEFAULT_PLAQUE_ATTACHED_FORMAT_ID,
  getPlaqueAwardFormatById,
  plaqueAwardFormatUserLineCount,
  type BadgeLineShape,
} from "~/constants/plaqueFormats";
import { ATTACHED_PLAQUE_MAX_TEXT_LINES } from "~/constants/plaqueLayouts";
import { PLAQUE_DEFAULT_BRUSH_GOLD_HEX } from "~/utils/plaqueRender";

/** Generic image tile for format thumbnails (data URL, CORS-free in SVG-as-img plaque previews). */
const PREVIEW_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect x="7" y="9" width="186" height="186" fill="#000000" fill-opacity="0.09"/>
  <rect width="186" height="186" fill="#f1f1f3"/>
  <circle cx="93" cy="71" r="28" fill="#d2d2d7"/>
  <ellipse cx="93" cy="134" rx="56" ry="28" fill="#dedee2"/>
  <text x="93" y="74" text-anchor="middle"
    font-family="Arial, Helvetica, sans-serif" font-size="31" font-weight="700"
    fill="#000000">
    <tspan x="93" dy="0">YOUR</tspan>
    <tspan x="93" dy="32">IMAGE</tspan>
    <tspan x="93" dy="32">HERE</tspan>
  </text>
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
  const lineCount = Math.min(
    ATTACHED_PLAQUE_MAX_TEXT_LINES,
    Math.max(params.maxLines, userSlots),
  );
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

/** Sample award copy for detached photo plaques (attached uses the award-format preset instead). */
const DETACHED_LAYOUT_PREVIEW_TEXT: readonly {
  text: string;
  bold?: boolean;
  italic?: boolean;
}[] = [
  { text: "Presented to", italic: true },
  { text: "YOUR NAME", bold: true },
  { text: "Your custom text here" },
  { text: "Date here" },
];

/**
 * Deterministic badge for “Choose layout” thumbnails so each layout shows a realistic plaque:
 * brushed-gold plate, sample award copy, and the image placeholder.
 */
export function buildPlaqueLayoutPreviewBadge(params: {
  layoutId: string;
  templateId: string;
  defaultLineShape: BadgeLineShape;
  /** Defaults to {@link PLAQUE_DEFAULT_BRUSH_GOLD_HEX}. */
  plateBackgroundHex?: string;
}): Badge | null {
  if (params.layoutId === "plaque-attached") {
    return buildPlaqueAwardFormatPreviewBadge({
      formatId: DEFAULT_PLAQUE_ATTACHED_FORMAT_ID,
      templateId: params.templateId,
      maxLines: ATTACHED_PLAQUE_MAX_TEXT_LINES,
      defaultLineShape: params.defaultLineShape,
      plateBackgroundHex: params.plateBackgroundHex,
    });
  }

  return {
    id: `plaque-layout-preview-${params.layoutId}`,
    templateId: params.templateId,
    backgroundColor: params.plateBackgroundHex ?? PLAQUE_DEFAULT_BRUSH_GOLD_HEX,
    backing: "magnetic",
    lines: DETACHED_LAYOUT_PREVIEW_TEXT.map((entry, i) => ({
      ...params.defaultLineShape,
      id: `${params.layoutId}-preview-${i}`,
      text: entry.text,
      bold: entry.bold ?? false,
      italic: entry.italic ?? false,
    })),
  };
}
