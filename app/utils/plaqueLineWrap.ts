/** A wording line wraps onto another row once it passes this many characters. */
export const PLAQUE_LINE_WRAP_AT = 26;

/** A single wording line can run onto at most this many rows. */
export const PLAQUE_LINE_MAX_ROWS = 3;

/**
 * The longest start of `text` that still fits in {@link PLAQUE_LINE_MAX_ROWS} rows.
 * Typing or pasting past that point drops the extra characters instead of adding rows.
 */
export function capPlaqueLineRows(
  text: string,
  limit = PLAQUE_LINE_WRAP_AT,
  maxRows = PLAQUE_LINE_MAX_ROWS,
): string {
  if (wrapPlaqueLine(text, limit).length <= maxRows) return text;
  for (let end = text.length - 1; end > 0; end -= 1) {
    if (wrapPlaqueLine(text.slice(0, end), limit).length <= maxRows) return text.slice(0, end);
  }
  return "";
}

/**
 * Break a plaque line onto extra rows near {@link PLAQUE_LINE_WRAP_AT} characters.
 * Words stay whole unless one word is longer than the limit. A trailing space is kept
 * so the next character the customer types still belongs to the line.
 */
export function wrapPlaqueLine(text: string, limit = PLAQUE_LINE_WRAP_AT): string[] {
  const clean = text.replace(/\s+/g, " ").replace(/^\s/, "");
  if (!clean) return [];
  if (clean.length <= limit) return [clean];
  const lines: string[] = [];
  let current = "";
  for (const word of clean.split(" ")) {
    if (!current) {
      current = takeOversized(word, limit, lines);
      continue;
    }
    const next = `${current} ${word}`;
    if (next.length <= limit) {
      current = next;
      continue;
    }
    lines.push(current);
    current = takeOversized(word, limit, lines);
  }
  if (current) lines.push(current);
  return lines;
}

function takeOversized(word: string, limit: number, lines: string[]): string {
  if (word.length <= limit) return word;
  let rest = word;
  while (rest.length > limit) {
    lines.push(rest.slice(0, limit));
    rest = rest.slice(limit);
  }
  return rest;
}

/** Extra visual rows on the first two wording lines — the ones under the emblem. */
export function plaqueTopLineExtraRows(lines: readonly string[]): number {
  return [0, 1].reduce((sum, index) => {
    const rows = wrapPlaqueLine(lines[index] ?? "").length;
    return sum + Math.max(0, rows - 1);
  }, 0);
}

/**
 * How far the emblem can move down, as a percent of the plate photo.
 * The engraved “presented to” sits just under the emblem, so the drop stops short of it.
 */
export function plaqueSymbolDropPercent(extraRows: number): number {
  if (extraRows <= 0) return 0;
  // One extra row uses most of the gap under the emblem. A second row stops just above “presented to”.
  return extraRows === 1 ? 2.4 : 2.8;
}

/** Same drop in plate pixels, for the printed emblem. */
export function plaqueSymbolDropPx(plateHeight: number, extraRows: number): number {
  if (extraRows <= 0 || !(plateHeight > 0)) return 0;
  return (plaqueSymbolDropPercent(extraRows) / 100) * plateHeight;
}

