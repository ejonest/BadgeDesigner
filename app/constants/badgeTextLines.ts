/** Max text lines on 1.5×3 badge shapes. */
export const BADGE_MAX_TEXT_LINES_FULL = 3;

/** Max text lines on 1×3 rounded, square, and designer shapes. */
export const BADGE_MAX_TEXT_LINES_COMPACT = 2;

/** Round 1×3, Square 1×3, Designer 1×3 — two lines only. */
export const BADGE_TWO_LINE_TEMPLATE_IDS = [
  "rect-1x3",
  "square-1x3",
  "designer-1x3",
] as const;

/** Round 1.5×3, Oval, House, Square 1.5×3, Fancy — three lines. */
export const BADGE_THREE_LINE_TEMPLATE_IDS = [
  "rect-1_5x3",
  "oval-1_5x3",
  "house-1_5x3",
  "square-1_5x3",
  "fancy-1_5x3",
] as const;

const BADGE_TWO_LINE_SET = new Set<string>(BADGE_TWO_LINE_TEMPLATE_IDS);
const BADGE_THREE_LINE_SET = new Set<string>(BADGE_THREE_LINE_TEMPLATE_IDS);

export function getBadgeMaxTextLines(templateId?: string): number {
  if (!templateId) return BADGE_MAX_TEXT_LINES_FULL;
  if (BADGE_TWO_LINE_SET.has(templateId)) {
    return BADGE_MAX_TEXT_LINES_COMPACT;
  }
  if (BADGE_THREE_LINE_SET.has(templateId)) {
    return BADGE_MAX_TEXT_LINES_FULL;
  }
  return BADGE_MAX_TEXT_LINES_FULL;
}

export function truncateBadgeCsvRows(
  rows: string[][],
  maxLines: number,
): { rows: string[][]; truncatedRowNumbers: number[] } {
  const truncatedRowNumbers: number[] = [];
  const normalized = rows.map((row, index) => {
    if (row.length > maxLines) {
      truncatedRowNumbers.push(index + 1);
      return row.slice(0, maxLines);
    }
    return row;
  });
  return { rows: normalized, truncatedRowNumbers };
}

export function formatBadgeCsvLineTruncationWarning(
  truncatedRowNumbers: number[],
  maxLines: number,
  productLabel: string,
): string {
  if (truncatedRowNumbers.length === 0) return "";
  const rows = truncatedRowNumbers.join(", ");
  const rowLabel = truncatedRowNumbers.length > 1 ? "Rows" : "Row";
  const verb = truncatedRowNumbers.length > 1 ? "have" : "has";
  const extra =
    truncatedRowNumbers.length > 1 ? "extra lines" : "an extra line";
  return (
    `This badge shape allows up to ${maxLines} lines of text per ${productLabel}. ` +
    `${rowLabel} ${rows} ${verb} more than ${maxLines} — ${extra} will be removed to fit.`
  );
}
