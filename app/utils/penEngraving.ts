/**
 * Shared text layout for pen engravings.
 *
 * The live preview and the production artwork both call this so that a message
 * breaks into the same lines at the same relative size in both places. Widths
 * are estimated from an average glyph ratio rather than measured, which is
 * accurate enough for layout and keeps the helper usable on the server.
 */

export interface EngravingArea {
  /** Usable width of the engraving area, in that surface's own units. */
  width: number;
  /** Usable height of the engraving area, in that surface's own units. */
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
    const byWidth = area.width / Math.max(1, longest.length * glyphRatio);
    const byHeight = area.height / (1 + (count - 1) * lineHeight);
    const fontSize = Math.min(options.maxFontSize, byWidth, byHeight);
    if (!best || fontSize > best.fontSize) {
      best = { lines, fontSize, lineSpacing: fontSize * lineHeight };
    }
  }

  return best ?? { lines: [text], fontSize: options.maxFontSize, lineSpacing: 0 };
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
