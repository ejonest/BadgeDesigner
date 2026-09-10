/**
 * Shared text layout for pen engravings.
 *
 * The live preview and the production artwork both call this so that a message
 * breaks into the same lines at the same relative size in both places. Widths
 * are estimated from an average glyph ratio rather than measured, which is
 * accurate enough for layout and keeps the helper usable on the server.
 */

import type { PenLogoPlacement } from "~/constants/pen";

export interface EngravingArea {
  /** Usable width of the engraving area, in that surface's own units. */
  width: number;
  /** Usable height of the engraving area, in that surface's own units. */
  height: number;
}

/** A box inside an engraving area, in that surface's own units. */
export interface EngravingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EngravingLayoutOptions {
  /** Upper bound on font size, in the surface's units. */
  maxFontSize: number;
  maxLines?: number;
  /** Baseline-to-baseline spacing as a multiple of the font size. */
  lineHeight?: number;
  /** Average glyph advance as a fraction of the font size. */
  glyphRatio?: number;
  /** Additional tracking between glyphs, in ems. */
  letterSpacingEm?: number;
}

export interface EngravingLayout {
  lines: string[];
  fontSize: number;
  /** Baseline-to-baseline spacing, in the surface's units. */
  lineSpacing: number;
}

/** Greedily packs words into lines no longer than `limit` characters. */
function packWords(words: string[], limit: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (!current) current = word;
    else if (current.length + 1 + word.length <= limit) current += ` ${word}`;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Splits `words` into at most `count` lines while keeping the longest line as
 * short as possible, so a wrapped message stays visually balanced.
 */
function wrapInto(words: string[], count: number): string[] | null {
  if (count === 1) return [words.join(" ")];
  if (words.length < count) return null;

  const longestWord = words.reduce((a, b) => Math.max(a, b.length), 0);
  const total = words.join(" ").length;
  for (let limit = Math.max(longestWord, 1); limit <= total; limit++) {
    const lines = packWords(words, limit);
    if (lines.length <= count) return lines.length === count ? lines : null;
  }
  return null;
}

export function layoutEngraving(
  rawText: string,
  area: EngravingArea,
  options: EngravingLayoutOptions,
): EngravingLayout {
  const lineHeight = options.lineHeight ?? 1.22;
  const glyphRatio = options.glyphRatio ?? 0.58;
  const letterSpacingEm = options.letterSpacingEm ?? 0;
  const maxLines = Math.max(1, options.maxLines ?? 1);
  const text = rawText.trim().replace(/\s+/g, " ");

  if (!text) {
    return { lines: [], fontSize: options.maxFontSize, lineSpacing: 0 };
  }

  const words = text.split(" ");
  let best: EngravingLayout | null = null;

  for (let count = 1; count <= maxLines; count++) {
    const lines = wrapInto(words, count);
    if (!lines) break;
    const longest = lines.reduce((a, b) => (b.length > a.length ? b : a), "");
    const widthInEms =
      longest.length * glyphRatio +
      Math.max(0, longest.length - 1) * letterSpacingEm;
    const byWidth = area.width / Math.max(1, widthInEms);
    const byHeight = area.height / (1 + (count - 1) * lineHeight);
    const fontSize = Math.min(options.maxFontSize, byWidth, byHeight);
    if (!best || fontSize > best.fontSize) {
      best = { lines, fontSize, lineSpacing: fontSize * lineHeight };
    }
  }

  return best ?? { lines: [text], fontSize: options.maxFontSize, lineSpacing: 0 };
}

/**
 * Shrinks a layout until its widest line measures inside `maxWidth`.
 *
 * The sizing above estimates widths from an average glyph advance so it can
 * run on the server, and that estimate runs narrow for capitals. Callers that
 * can measure the real font pass `measure` and get a layout that stays inside
 * the engraving area, which the estimate alone does not guarantee.
 *
 * `measure` should report a line's advance width at `layout.fontSize` without
 * tracking, which is added here.
 */
export function fitMeasuredWidth(
  layout: EngravingLayout,
  maxWidth: number,
  measure: (line: string, fontSize: number) => number,
  letterSpacingEm = 0,
): EngravingLayout {
  if (!layout.lines.length) return layout;
  const measured = Math.max(
    ...layout.lines.map(
      (line) =>
        measure(line, layout.fontSize) +
        Math.max(0, line.length - 1) * letterSpacingEm * layout.fontSize,
    ),
  );
  if (!Number.isFinite(measured) || measured <= 0 || measured <= maxWidth) {
    return layout;
  }
  const factor = maxWidth / measured;
  return {
    ...layout,
    fontSize: layout.fontSize * factor,
    lineSpacing: layout.lineSpacing * factor,
  };
}

/** Height of a logo set beside text, as a share of the area's height. */
const LOGO_HEIGHT_SHARE = 0.78;
/** Gap between the logo and the text beside it, as a share of that height. */
const LOGO_GAP_SHARE = 0.16;
/** Ceiling on the logo's width, so a wide mark cannot crowd out the message. */
const LOGO_WIDTH_SHARE = 0.42;
/** Height of a logo stacked above text, as a share of the area's height. */
const LOGO_STACK_HEIGHT_SHARE = 0.4;
/** Gap between a stacked logo and the message under it. */
const LOGO_STACK_GAP_SHARE = 0.08;

/**
 * Places an uploaded mark against the message the way the vendor's own lockup
 * sits — above it on the case band, beside it on the cap — and reports the box
 * left over for the text so it can be laid out against that instead of the
 * whole area.
 *
 * `logoAspect` is width ÷ height of the trimmed art. With no logo the text
 * keeps the full area; with no text the logo is centred in it.
 */
export function penLockup(
  area: EngravingArea,
  options: {
    logoAspect?: number | null;
    hasText: boolean;
    placement?: PenLogoPlacement;
  },
): { logo: EngravingRect | null; text: EngravingRect } {
  const aspect =
    typeof options.logoAspect === "number" &&
    Number.isFinite(options.logoAspect) &&
    options.logoAspect > 0
      ? options.logoAspect
      : null;
  const fullArea: EngravingRect = {
    x: 0,
    y: 0,
    width: area.width,
    height: area.height,
  };
  if (!aspect) return { logo: null, text: fullArea };

  if (!options.hasText) {
    const height = Math.min(area.height, area.width / aspect);
    const width = height * aspect;
    return {
      logo: {
        x: (area.width - width) / 2,
        y: (area.height - height) / 2,
        width,
        height,
      },
      text: { ...fullArea, width: 0 },
    };
  }

  if (options.placement === "stacked") {
    let height = area.height * LOGO_STACK_HEIGHT_SHARE;
    let width = height * aspect;
    if (width > area.width) {
      width = area.width;
      height = width / aspect;
    }
    const gap = area.height * LOGO_STACK_GAP_SHARE;
    return {
      logo: { x: (area.width - width) / 2, y: 0, width, height },
      text: {
        x: 0,
        y: height + gap,
        width: area.width,
        height: Math.max(1, area.height - height - gap),
      },
    };
  }

  let height = area.height * LOGO_HEIGHT_SHARE;
  let width = height * aspect;
  const widthCap = area.width * LOGO_WIDTH_SHARE;
  if (width > widthCap) {
    width = widthCap;
    height = width / aspect;
  }
  const gap = area.height * LOGO_GAP_SHARE;
  return {
    logo: { x: 0, y: (area.height - height) / 2, width, height },
    text: {
      x: width + gap,
      y: 0,
      width: Math.max(1, area.width - width - gap),
      height: area.height,
    },
  };
}

/**
 * Vertical offsets from the block's centre to each line's baseline, so callers
 * can emit `<text>` elements with `dominant-baseline="middle"`.
 */
export function lineOffsets(layout: EngravingLayout): number[] {
  const { lines, lineSpacing } = layout;
  const first = -((lines.length - 1) * lineSpacing) / 2;
  return lines.map((_, index) => first + index * lineSpacing);
}
