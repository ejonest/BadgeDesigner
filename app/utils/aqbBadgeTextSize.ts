import type { Badge, BadgeLine } from "~/types/badge";
import { resolveBlankBadgePhoto } from "~/utils/badgeBlankPhotos";
import { getBadgeIconTextInsetPx } from "~/utils/badgeIconRender";
import { measureTextWidth } from "~/utils/textMeasurement";

export const AQB_BADGE_SIZE_PRESETS = [
  { label: "Large", px: 100 },
  { label: "Medium", px: 80 },
  { label: "Small", px: 60 },
] as const;

export type AqbBadgeSizePreset = (typeof AQB_BADGE_SIZE_PRESETS)[number];
export type AqbBadgeSizeLabel = AqbBadgeSizePreset["label"];

/** Shown when a preset is disabled in the size picker. */
export const AQB_PRESET_TOO_LARGE_TOOLTIP =
  "Text size is too large for the current design";

/** Shown under the line input when no more text fits at the current size. */
export const AQB_LINE_CHAR_LIMIT_MESSAGE =
  "You have reached the text limit for this line.";

export function aqbLineTypography(line: BadgeLine): {
  fontFamily: string;
  bold: boolean;
  italic: boolean;
} {
  return {
    fontFamily: line.fontFamily || "Arial",
    bold: line.bold || false,
    italic: line.italic || false,
  };
}

export function aqbLineTextFitsAtPresetPx(
  text: string,
  presetPx: number,
  fontFamily: string,
  bold: boolean,
  italic: boolean,
  maxTextWidth: number,
): boolean {
  if (typeof document === "undefined") return true;
  return lineFitsAtPresetPx({
    text,
    fontFamily,
    bold,
    italic,
    presetPx,
    maxTextWidth,
  });
}

/** Trim text to the longest prefix that fits at the current preset width. */
export function truncateAqbLineTextToFit(
  text: string,
  presetPx: number,
  fontFamily: string,
  bold: boolean,
  italic: boolean,
  maxTextWidth: number,
): string {
  if (!text || typeof document === "undefined") return text;
  if (
    aqbLineTextFitsAtPresetPx(
      text,
      presetPx,
      fontFamily,
      bold,
      italic,
      maxTextWidth,
    )
  ) {
    return text;
  }

  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = text.slice(0, mid);
    if (
      aqbLineTextFitsAtPresetPx(
        candidate,
        presetPx,
        fontFamily,
        bold,
        italic,
        maxTextWidth,
      )
    ) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo);
}

/** True when typed/pasted input had to be shortened to fit at the preset width. */
export function aqbLineTextInputWasTruncated(
  attempted: string,
  fitted: string,
): boolean {
  return attempted !== fitted;
}

export function aqbPresetToSizeNorm(
  px: number,
  designBoxHeight: number,
): number {
  return px / designBoxHeight;
}

export function aqbSizeNormToPx(
  sizeNorm: number,
  designBoxHeight: number,
): number {
  return Math.round(sizeNorm * designBoxHeight);
}

export function nearestAqbSizePreset(px: number): AqbBadgeSizePreset {
  return AQB_BADGE_SIZE_PRESETS.reduce((best, preset) =>
    Math.abs(preset.px - px) < Math.abs(best.px - px) ? preset : best,
  );
}

export function aqbPresetIndex(label: AqbBadgeSizeLabel): number {
  return AQB_BADGE_SIZE_PRESETS.findIndex((p) => p.label === label);
}

/** Line 1 defaults to Large; line 2+ default to Medium in the redesigned badge tool. */
export function getDefaultAqbSizePresetForLine(
  lineIndex: number,
): AqbBadgeSizePreset {
  return lineIndex === 0
    ? AQB_BADGE_SIZE_PRESETS[0]
    : AQB_BADGE_SIZE_PRESETS[1];
}

/**
 * Text bounds for preset fit checks and layout.
 * Photo `textRectNorm` / `textWithIconRectNorm` boxes are already calibrated — use them as-is.
 * Vector templates only reserve space for a left icon overlay when applicable.
 */
export function aqbBadgeTextBounds(
  designBox: { width: number; height: number },
  badge: Pick<Badge, "backgroundColor" | "badgeIconId">,
  templateId?: string,
): { maxTextWidth: number; maxTextHeight: number } {
  const photo =
    templateId != null
      ? resolveBlankBadgePhoto(templateId, badge.backgroundColor)
      : null;

  if (photo) {
    return {
      maxTextWidth: designBox.width,
      maxTextHeight: designBox.height,
    };
  }

  const iconInset = getBadgeIconTextInsetPx(
    designBox,
    badge.badgeIconId,
    templateId,
  );
  return {
    maxTextWidth: Math.max(1, designBox.width - iconInset),
    maxTextHeight: designBox.height,
  };
}

export function aqbBadgeMaxTextWidth(
  designBox: { width: number; height: number },
  badge: Pick<Badge, "backgroundColor" | "badgeIconId">,
  templateId?: string,
): number {
  return aqbBadgeTextBounds(designBox, badge, templateId).maxTextWidth;
}

function presetIndexFromSizeNorm(
  sizeNorm: number,
  designBoxHeight: number,
): number {
  const px = aqbSizeNormToPx(sizeNorm, designBoxHeight);
  return aqbPresetIndex(nearestAqbSizePreset(px).label);
}

export function totalAqbLinesHeightPx(
  lines: BadgeLine[],
  designBoxHeight: number,
): number {
  const lineSpacing = designBoxHeight * 0.07;
  return lines.reduce((sum, line, index) => {
    sum += aqbSizeNormToPx(line.sizeNorm ?? 0.15, designBoxHeight);
    if (index < lines.length - 1) {
      sum += lineSpacing;
    }
    return sum;
  }, 0);
}

function lineFitsAtPresetPx(args: {
  text: string;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  presetPx: number;
  maxTextWidth: number;
}): boolean {
  const { text, fontFamily, bold, italic, presetPx, maxTextWidth } = args;
  if (!text.trim()) return true;
  return (
    measureTextWidth(text, presetPx, fontFamily, bold, italic) <= maxTextWidth
  );
}

export function linesFitAqbHeight(
  lines: BadgeLine[],
  designBox: { height: number },
): boolean {
  return totalAqbLinesHeightPx(lines, designBox.height) <= designBox.height;
}

/** Whether a preset can be chosen for one line given siblings and the calibrated text box. */
export function canUseAqbPresetForLine(
  lines: BadgeLine[],
  lineIndex: number,
  presetIndex: number,
  designBox: { width: number; height: number },
  badge: Pick<Badge, "backgroundColor" | "badgeIconId">,
  templateId?: string,
): boolean {
  const preset = AQB_BADGE_SIZE_PRESETS[presetIndex];
  if (!preset) return false;

  const { maxTextWidth, maxTextHeight } = aqbBadgeTextBounds(
    designBox,
    badge,
    templateId,
  );
  const line = lines[lineIndex];
  if (!line) return false;

  const widthOk = lineFitsAtPresetPx({
    text: line.text || "",
    fontFamily: line.fontFamily || "Arial",
    bold: line.bold || false,
    italic: line.italic || false,
    presetPx: preset.px,
    maxTextWidth,
  });

  const testLines = lines.map((l, i) =>
    i === lineIndex
      ? {
          ...l,
          sizeNorm: aqbPresetToSizeNorm(preset.px, designBox.height),
        }
      : l,
  );
  const heightOk =
    totalAqbLinesHeightPx(testLines, designBox.height) <= maxTextHeight;

  return widthOk && heightOk;
}

export function getAqbPresetAvailabilityForLine(
  lines: BadgeLine[],
  lineIndex: number,
  designBox: { width: number; height: number },
  badge: Pick<Badge, "backgroundColor" | "badgeIconId">,
  templateId?: string,
): Array<{ preset: AqbBadgeSizePreset; available: boolean }> {
  return AQB_BADGE_SIZE_PRESETS.map((preset, index) => ({
    preset,
    available: canUseAqbPresetForLine(
      lines,
      lineIndex,
      index,
      designBox,
      badge,
      templateId,
    ),
  }));
}

/** Step down preset levels (Large → Medium → Small) until text fits width. */
export function fitAqbLineToPresetWidth(args: {
  text: string;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  maxTextWidth: number;
  designBoxHeight: number;
  startPresetIndex: number;
}): number {
  const {
    text,
    fontFamily,
    bold,
    italic,
    maxTextWidth,
    designBoxHeight,
    startPresetIndex,
  } = args;

  const startIdx = Math.max(
    0,
    Math.min(startPresetIndex, AQB_BADGE_SIZE_PRESETS.length - 1),
  );

  for (let i = startIdx; i < AQB_BADGE_SIZE_PRESETS.length; i++) {
    const preset = AQB_BADGE_SIZE_PRESETS[i];
    if (!text.trim()) {
      return aqbPresetToSizeNorm(preset.px, designBoxHeight);
    }
    if (
      lineFitsAtPresetPx({
        text,
        fontFamily,
        bold,
        italic,
        presetPx: preset.px,
        maxTextWidth,
      })
    ) {
      return aqbPresetToSizeNorm(preset.px, designBoxHeight);
    }
  }

  const smallest = AQB_BADGE_SIZE_PRESETS[AQB_BADGE_SIZE_PRESETS.length - 1];
  return aqbPresetToSizeNorm(smallest.px, designBoxHeight);
}

/** Step all lines down one preset level at a time until they fit vertically. */
function fitAqbLinesToHeight(
  lines: BadgeLine[],
  designBox: { height: number },
  maxTextHeight: number,
): BadgeLine[] {
  let result = lines.map((line) => ({ ...line }));

  while (totalAqbLinesHeightPx(result, designBox.height) > maxTextHeight) {
    let stepped = false;
    result = result.map((line) => {
      const idx = presetIndexFromSizeNorm(
        line.sizeNorm ?? 0.15,
        designBox.height,
      );
      if (idx >= AQB_BADGE_SIZE_PRESETS.length - 1) {
        return line;
      }
      stepped = true;
      const next = AQB_BADGE_SIZE_PRESETS[idx + 1];
      return {
        ...line,
        sizeNorm: aqbPresetToSizeNorm(next.px, designBox.height),
      };
    });
    if (!stepped) break;
  }

  return result;
}

/** Fit every line to width (preset step-down) then stack height (preset step-down). */
export function fitAqbBadgeLinesToPresets(
  lines: BadgeLine[],
  designBox: { width: number; height: number },
  badge: Pick<Badge, "backgroundColor" | "badgeIconId">,
  templateId?: string,
  changedLineIndex?: number,
  explicitPresetIndex?: number,
): BadgeLine[] {
  const { maxTextWidth, maxTextHeight } = aqbBadgeTextBounds(
    designBox,
    badge,
    templateId,
  );
  const designBoxHeight = designBox.height;

  const widthFitted = lines.map((line, index) => {
    const text = line.text || "";
    const fontFamily = line.fontFamily || "Arial";
    const bold = line.bold || false;
    const italic = line.italic || false;

    let startIdx = presetIndexFromSizeNorm(
      line.sizeNorm ?? 0.15,
      designBoxHeight,
    );
    if (changedLineIndex === index && typeof explicitPresetIndex === "number") {
      startIdx = explicitPresetIndex;
    }

    return {
      ...line,
      sizeNorm: fitAqbLineToPresetWidth({
        text,
        fontFamily,
        bold,
        italic,
        maxTextWidth,
        designBoxHeight,
        startPresetIndex: startIdx,
      }),
    };
  });

  return fitAqbLinesToHeight(widthFitted, designBox, maxTextHeight);
}

export type AqbPresetTextLayoutItem = {
  line: BadgeLine;
  x: number;
  y: number;
  fontSize: number;
  anchor: "start" | "middle" | "end";
  familyRaw: string;
  fontWeight: string;
  fontStyle: string;
};

/**
 * Place lines at exact preset pixel sizes inside the calibrated text box.
 * Matches editor fit math so preview does not re-shrink via calculateTextLayout.
 */
export function layoutAqbPresetTextLines(
  lines: BadgeLine[],
  designBox: { x: number; y: number; width: number; height: number },
  fontMappings?: Map<string, string>,
): AqbPresetTextLayoutItem[] {
  if (lines.length === 0) return [];

  const lineSpacing = designBox.height * 0.07;
  const sizes = lines.map((line) =>
    aqbSizeNormToPx(line.sizeNorm ?? 0.15, designBox.height),
  );
  const totalHeight =
    sizes.reduce((sum, px) => sum + px, 0) +
    lineSpacing * Math.max(0, lines.length - 1);

  let currentY = designBox.y + (designBox.height - totalHeight) / 2;

  return lines.map((line, index) => {
    const fontSize = sizes[index];
    const alignment = line.align || "center";
    const anchor =
      alignment === "left"
        ? "start"
        : alignment === "right"
          ? "end"
          : "middle";

    let x: number;
    if (anchor === "middle") {
      x = designBox.x + designBox.width / 2;
    } else if (anchor === "start") {
      x = designBox.x;
    } else {
      x = designBox.x + designBox.width;
    }

    const y = currentY + fontSize / 2;
    currentY += fontSize + (index < lines.length - 1 ? lineSpacing : 0);

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
