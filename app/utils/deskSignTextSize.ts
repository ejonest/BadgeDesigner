/**
 * Desk sign text sizing (acrylic / rosewood / plastic).
 *
 * Tunable px caps below are the *maximum* for each layout; text shrinks down to
 * `DESK_SIGN_TEXT_MIN_PX` to fit the plate width. Past that, input is truncated
 * and the character-limit message is shown (same UX as the redesigned badge tool).
 *
 * Design boxes are roughly ~120–140px tall on a 2″ plate — adjust these freely.
 */
import type { BadgeLine } from "~/types/badge";
import { measureTextWidth } from "~/utils/textMeasurement";
import {
  AQB_LINE_CHAR_LIMIT_MESSAGE,
  aqbLineTypography,
  aqbPresetToSizeNorm,
  aqbSizeNormToPx,
} from "~/utils/aqbBadgeTextSize";

export { AQB_LINE_CHAR_LIMIT_MESSAGE as DESK_SIGN_LINE_CHAR_LIMIT_MESSAGE };

/** Hard cap on text lines for all desk sign materials. */
export const DESK_SIGN_MAX_TEXT_LINES = 2;

/**
 * Max font size (px in template/design-box space) when the customer has exactly 1 line.
 * Change this to make single-line text larger or smaller by default.
 */
export const DESK_SIGN_SINGLE_LINE_MAX_PX = 100;

/**
 * Max font sizes when the customer has 2 lines.
 * Line 1 is intentionally larger than line 2 (name vs title hierarchy).
 */
export const DESK_SIGN_TWO_LINE_FIRST_MAX_PX = 80;
export const DESK_SIGN_TWO_LINE_SECOND_MAX_PX = 60;

/**
 * Smallest font size before we stop shrinking and treat further typing as over the limit.
 */
export const DESK_SIGN_TEXT_MIN_PX = 14;

/** Vertical gap between lines as a fraction of design-box height. */
export const DESK_SIGN_LINE_SPACING_FRACTION = 0.08;

/** Horizontal inset so text doesn’t kiss the plate edge. */
export const DESK_SIGN_TEXT_WIDTH_INSET_PX = 8;

export function deskSignTargetMaxPx(
  lineIndex: number,
  lineCount: number,
): number {
  if (lineCount <= 1) return DESK_SIGN_SINGLE_LINE_MAX_PX;
  return lineIndex === 0
    ? DESK_SIGN_TWO_LINE_FIRST_MAX_PX
    : DESK_SIGN_TWO_LINE_SECOND_MAX_PX;
}

export function deskSignMaxTextWidth(designBoxWidth: number): number {
  return Math.max(1, designBoxWidth - DESK_SIGN_TEXT_WIDTH_INSET_PX * 2);
}

function lineWidthFits(
  text: string,
  fontPx: number,
  fontFamily: string,
  bold: boolean,
  italic: boolean,
  maxTextWidth: number,
): boolean {
  if (!text.trim()) return true;
  if (typeof document === "undefined") return true;
  return (
    measureTextWidth(text, fontPx, fontFamily, bold, italic) <= maxTextWidth
  );
}

function shrinkPxToFitWidth(args: {
  text: string;
  startPx: number;
  minPx: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  maxTextWidth: number;
}): number {
  const { text, startPx, minPx, fontFamily, bold, italic, maxTextWidth } = args;
  let px = Math.max(minPx, startPx);
  if (!text.trim()) return px;

  while (
    px > minPx &&
    !lineWidthFits(text, px, fontFamily, bold, italic, maxTextWidth)
  ) {
    px = Math.max(minPx, px * 0.95);
  }
  // Snap if still slightly over near min
  if (
    px > minPx &&
    !lineWidthFits(text, px, fontFamily, bold, italic, maxTextWidth)
  ) {
    px = minPx;
  }
  return Math.round(px);
}

function totalStackHeightPx(
  sizesPx: number[],
  designBoxHeight: number,
): number {
  if (sizesPx.length === 0) return 0;
  const gap = designBoxHeight * DESK_SIGN_LINE_SPACING_FRACTION;
  return (
    sizesPx.reduce((sum, px) => sum + px, 0) +
    gap * Math.max(0, sizesPx.length - 1)
  );
}

/**
 * Assign 1-line / 2-line target maxes, shrink each line to fit width down to min,
 * then scale the stack down if it overflows the plate height.
 */
export function fitDeskSignLines(
  lines: BadgeLine[],
  designBox: { width: number; height: number },
): BadgeLine[] {
  if (lines.length === 0) return lines;
  const H = designBox.height;
  if (!(H > 0)) return lines;

  const maxTextWidth = deskSignMaxTextWidth(designBox.width);
  const minPx = DESK_SIGN_TEXT_MIN_PX;
  const visibleIndexes = lines
    .map((line, index) => ((line.text || "").trim() ? index : -1))
    .filter((index) => index >= 0);
  const visibleCount = Math.max(1, visibleIndexes.length);
  const visibleRankByIndex = new Map(
    visibleIndexes.map((lineIndex, rank) => [lineIndex, rank]),
  );

  let sizesPx = lines.map((line, index) => {
    const visibleRank = visibleRankByIndex.get(index);
    if (visibleRank === undefined) {
      return aqbSizeNormToPx(line.sizeNorm ?? 0.15, H);
    }
    const typography = aqbLineTypography(line);
    const target = deskSignTargetMaxPx(visibleRank, visibleCount);
    return shrinkPxToFitWidth({
      text: line.text || "",
      startPx: target,
      minPx,
      fontFamily: typography.fontFamily,
      bold: typography.bold,
      italic: typography.italic,
      maxTextWidth,
    });
  });

  // Height squeeze: preserve relative hierarchy while scaling down to min floor.
  let guard = 0;
  while (
    totalStackHeightPx(
      visibleIndexes.map((index) => sizesPx[index]),
      H,
    ) > H &&
    visibleIndexes.some((index) => sizesPx[index] > minPx) &&
    guard < 80
  ) {
    guard += 1;
    sizesPx = sizesPx.map((px, index) =>
      visibleRankByIndex.has(index)
        ? Math.max(minPx, Math.round(px * 0.95))
        : px,
    );
  }

  return lines.map((line, index) => ({
    ...line,
    sizeNorm: aqbPresetToSizeNorm(sizesPx[index] ?? minPx, H),
  }));
}

export function deskSignLineFitsAtCurrentSize(
  line: BadgeLine,
  designBoxHeight: number,
  maxTextWidth: number,
): boolean {
  const text = line.text || "";
  if (!text.trim()) return true;
  const typography = aqbLineTypography(line);
  const px = aqbSizeNormToPx(line.sizeNorm ?? 0.15, designBoxHeight);
  return lineWidthFits(
    text,
    px,
    typography.fontFamily,
    typography.bold,
    typography.italic,
    maxTextWidth,
  );
}

export function deskSignHasTextOverflow(
  lines: BadgeLine[],
  designBox: { width: number; height: number },
): boolean {
  const maxTextWidth = deskSignMaxTextWidth(designBox.width);
  return lines.some(
    (line) =>
      (line.text || "").trim().length > 0 &&
      !deskSignLineFitsAtCurrentSize(line, designBox.height, maxTextWidth),
  );
}

/** Truncate a line to the longest prefix that fits at the given px size. */
export function truncateDeskSignLineTextToFit(
  text: string,
  fontPx: number,
  fontFamily: string,
  bold: boolean,
  italic: boolean,
  maxTextWidth: number,
): string {
  if (!text || typeof document === "undefined") return text;
  if (lineWidthFits(text, fontPx, fontFamily, bold, italic, maxTextWidth)) {
    return text;
  }
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid);
    if (
      lineWidthFits(candidate, fontPx, fontFamily, bold, italic, maxTextWidth)
    ) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo);
}

/**
 * Apply attempted typed text: fit (shrink) first; only truncate once already at min.
 */
export function clampDeskSignLineTextInput(args: {
  lines: BadgeLine[];
  lineIndex: number;
  attemptedText: string;
  designBox: { width: number; height: number };
}): { text: string; sizeNorm?: number; wasTruncated: boolean } {
  const { lines, lineIndex, attemptedText, designBox } = args;
  const tentative = lines.map((line, i) =>
    i === lineIndex ? { ...line, text: attemptedText } : line,
  );
  const fitted = fitDeskSignLines(tentative, designBox);
  const line = fitted[lineIndex];
  if (!line) return { text: attemptedText, wasTruncated: false };

  const typography = aqbLineTypography(line);
  const px = aqbSizeNormToPx(line.sizeNorm ?? 0.15, designBox.height);
  const maxTextWidth = deskSignMaxTextWidth(designBox.width);
  const truncated = truncateDeskSignLineTextToFit(
    attemptedText,
    px,
    typography.fontFamily,
    typography.bold,
    typography.italic,
    maxTextWidth,
  );
  return {
    text: truncated,
    sizeNorm: line.sizeNorm,
    wasTruncated: truncated !== attemptedText,
  };
}

export function getDefaultDeskSignSizeNorm(
  lineIndex: number,
  lineCount: number,
  designBoxHeight: number,
): number {
  return aqbPresetToSizeNorm(
    deskSignTargetMaxPx(lineIndex, lineCount),
    designBoxHeight,
  );
}

export type DeskSignTextLayoutItem = {
  line: BadgeLine;
  x: number;
  y: number;
  fontSize: number;
  anchor: "start" | "middle" | "end";
  familyRaw: string;
  fontWeight: string;
  fontStyle: string;
};

/** Place desk-sign lines at exact fitted px sizes (matches editor fit math). */
export function layoutDeskSignTextLines(
  lines: BadgeLine[],
  designBox: { x: number; y: number; width: number; height: number },
  fontMappings?: Map<string, string>,
): DeskSignTextLayoutItem[] {
  const visibleLines = lines.filter((line) => (line.text || "").trim());
  if (visibleLines.length === 0) return [];

  const lineSpacing = designBox.height * DESK_SIGN_LINE_SPACING_FRACTION;
  const sizes = visibleLines.map((line) =>
    aqbSizeNormToPx(line.sizeNorm ?? 0.15, designBox.height),
  );
  const totalHeight =
    sizes.reduce((sum, px) => sum + px, 0) +
    lineSpacing * Math.max(0, lines.length - 1);

  let currentY = designBox.y + (designBox.height - totalHeight) / 2;

  return visibleLines.map((line, index) => {
    const fontSize = sizes[index];
    const alignment = line.align || "center";
    const anchor =
      alignment === "left" ? "start" : alignment === "right" ? "end" : "middle";

    let x: number;
    if (anchor === "middle") {
      x = designBox.x + designBox.width / 2;
    } else if (anchor === "start") {
      x = designBox.x;
    } else {
      x = designBox.x + designBox.width;
    }

    const y = currentY + fontSize / 2;
    currentY +=
      fontSize + (index < visibleLines.length - 1 ? lineSpacing : 0);

    const originalFamily = line.fontFamily || "Arial";
    const familyRaw = fontMappings?.get(originalFamily) || originalFamily;

    return {
      line,
      x,
      y,
      fontSize,
      anchor,
      familyRaw,
      fontWeight: line.bold ? "bold" : "normal",
      fontStyle: line.italic ? "italic" : "normal",
    };
  });
}
