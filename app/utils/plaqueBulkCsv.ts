import Papa from "papaparse";

export const PLAQUE_MAX_QUANTITY = 100;

export type PlaqueLineStyle = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Empty uses the plaque’s default font. */
  fontFamily: string;
  /** 1 matches the format or the usual line size. */
  sizeScale: number;
  /** When true, bold and italic replace the award format’s emphasis. */
  emphasisCustom: boolean;
};

export type PlaqueBulkRow = {
  id: string;
  lines: string[];
  quantity: number;
  /** Per-line emphasis. Copied from the designer, not the CSV. */
  lineStyles?: PlaqueLineStyle[];
};

export type PlaqueBulkCsvResult = {
  rows: PlaqueBulkRow[];
  warning: string;
};

const MAX_LINE_LENGTH = 80;

const SAMPLE_LINES = [
  "Avery Cole",
  "Outstanding Service",
  "West High School",
  "2026",
  "Varsity",
  "Coach",
];

function cell(value: string | undefined): string {
  return (value ?? "").trim();
}

function aliasesFor(labels: string[]): Record<string, string> {
  const aliases: Record<string, string> = {
    quantity: "quantity",
    qty: "quantity",
    name: "line1",
    "recipient name": "line1",
  };
  labels.forEach((label, index) => {
    const key = `line${index + 1}`;
    aliases[key] = key;
    aliases[`line ${index + 1}`] = key;
    const named = cell(label).toLowerCase();
    if (named) aliases[named] = key;
  });
  return aliases;
}

function columnKey(value: string, aliases: Record<string, string>): string {
  return aliases[cell(value).toLowerCase()] ?? "";
}

function looksLikeHeader(cells: string[], aliases: Record<string, string>): boolean {
  const filled = cells.map(cell).filter(Boolean);
  return filled.length > 0 && filled.every((value) => columnKey(value, aliases) !== "");
}

function padLines(values: string[], lineCount: number): string[] {
  return Array.from({ length: lineCount }, (_, index) => values[index] ?? "");
}

function makeRow(values: string[], quantity: number, lineCount: number, index: number): PlaqueBulkRow {
  return {
    id: `bulk-plaque-${index}-${Math.random().toString(36).slice(2, 8)}`,
    lines: padLines(values, lineCount),
    quantity,
  };
}

function looksLikePipeList(csv: string): boolean {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  return lines.every((line) => line.includes("|"));
}

function finishRows(rows: PlaqueBulkRow[], truncatedRows: number[]): PlaqueBulkCsvResult {
  const total = rows.reduce((sum, row) => sum + row.quantity, 0);
  if (total > PLAQUE_MAX_QUANTITY) {
    throw new Error(
      `This list totals ${total} plaques. Online pricing currently supports up to ${PLAQUE_MAX_QUANTITY}; contact us for a larger order.`,
    );
  }
  return {
    rows,
    warning:
      truncatedRows.length > 0
        ? `Rows ${truncatedRows.join(", ")} were longer than ${rows[0]?.lines.length ?? 0} lines or ${MAX_LINE_LENGTH} characters; extra text was removed.`
        : "",
  };
}

function splitQuantity(parts: string[], lineCount: number): { text: string[]; quantity: number } {
  if (parts.length > lineCount && /^\d+$/.test(parts[parts.length - 1] ?? "")) {
    return {
      text: parts.slice(0, -1),
      quantity: Number.parseInt(parts[parts.length - 1] ?? "1", 10),
    };
  }
  return { text: parts, quantity: 1 };
}

function parsePipeList(
  csv: string,
  lineCount: number,
  aliases: Record<string, string>,
): PlaqueBulkCsvResult {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const firstCells = (lines[0] ?? "").split("|");
  const data = looksLikeHeader(firstCells, aliases) ? lines.slice(1) : lines;
  const truncatedRows: number[] = [];
  const rows = data.map((line, index) => {
    const parts = line.split("|").map(cell);
    if (!parts[0]) throw new Error(`Row ${index + 1} needs line 1.`);
    const split = splitQuantity(parts, lineCount);
    if (!Number.isFinite(split.quantity) || split.quantity < 1) {
      throw new Error(`Row ${index + 1} has an invalid quantity.`);
    }
    if (split.text.length > lineCount || split.text.some((value) => value.length > MAX_LINE_LENGTH)) {
      truncatedRows.push(index + 1);
    }
    return makeRow(
      split.text.slice(0, lineCount).map((value) => value.slice(0, MAX_LINE_LENGTH)),
      split.quantity,
      lineCount,
      index,
    );
  });
  if (rows.length === 0) throw new Error("Add at least one row of plaque text.");
  return finishRows(rows, truncatedRows);
}

/**
 * Accepts the downloadable template, pasted comma or tab rows, or a bar list
 * (`Name | Award | School | 2026`) so a comma inside a name stays in one field.
 * Each row is one personalized plaque and may carry its own quantity.
 */
export function parsePlaqueBulkCsv(
  csv: string,
  lineCount: number,
  labels: string[],
): PlaqueBulkCsvResult {
  const count = Math.max(1, lineCount);
  const aliases = aliasesFor(labels.slice(0, count));
  if (looksLikePipeList(csv)) return parsePipeList(csv, count, aliases);

  const parsed = Papa.parse<string[]>(csv.trim(), {
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", "\t"],
  });
  const fatal = parsed.errors.find(
    (error) => error.type !== "FieldMismatch" && error.type !== "Delimiter",
  );
  if (fatal) throw new Error(fatal.message || "The CSV could not be read.");

  const allRows = parsed.data.filter((row) => row.some((value) => cell(value)));
  if (allRows.length === 0) throw new Error("Add at least one row of plaque text.");

  const truncatedRows: number[] = [];
  let rows: PlaqueBulkRow[];

  if (looksLikeHeader(allRows[0], aliases)) {
    const headers = allRows[0].map((value) => columnKey(value, aliases));
    const lineColumns = Array.from({ length: count }, (_, index) => headers.indexOf(`line${index + 1}`));
    if (lineColumns[0] < 0) {
      throw new Error(
        "That first row looks like column names, but it needs a Line 1 column. Or delete it and paste one plaque per line, such as Avery Cole | Outstanding Service | 2026.",
      );
    }
    const quantityColumn = headers.indexOf("quantity");
    rows = allRows.slice(1).flatMap((values, index): PlaqueBulkRow[] => {
      const lines = lineColumns.map((column) => (column >= 0 ? cell(values[column]) : ""));
      if (!lines[0]) throw new Error(`Row ${index + 2} needs line 1.`);
      const rawQuantity =
        quantityColumn >= 0
          ? Number.parseInt(cell(values[quantityColumn]) || "1", 10)
          : 1;
      if (!Number.isFinite(rawQuantity) || rawQuantity < 1) {
        throw new Error(`Row ${index + 2} has an invalid quantity.`);
      }
      if (lines.some((line) => line.length > MAX_LINE_LENGTH)) truncatedRows.push(index + 2);
      return [makeRow(lines.map((line) => line.slice(0, MAX_LINE_LENGTH)), rawQuantity, count, index)];
    });
    if (rows.length === 0) throw new Error("Add at least one plaque under the column names.");
  } else {
    rows = allRows.map((values, index) => {
      const normalized = values.map(cell);
      if (!normalized[0]) throw new Error(`Row ${index + 1} needs line 1.`);
      const split = splitQuantity(normalized, count);
      if (!Number.isFinite(split.quantity) || split.quantity < 1) {
        throw new Error(`Row ${index + 1} has an invalid quantity.`);
      }
      if (split.text.length > count || split.text.some((line) => line.length > MAX_LINE_LENGTH)) {
        truncatedRows.push(index + 1);
      }
      return makeRow(
        split.text.slice(0, count).map((line) => line.slice(0, MAX_LINE_LENGTH)),
        split.quantity,
        count,
        index,
      );
    });
  }

  return finishRows(rows, truncatedRows);
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function plaqueBulkCsvTemplate(labels: string[]): string {
  const header = [...labels.map((label) => csvCell(label)), "Quantity"].join(",");
  const sample = [
    ...labels.map((_, index) => csvCell(SAMPLE_LINES[index] ?? "")),
    "1",
  ].join(",");
  const second = [
    ...labels.map((_, index) => csvCell(index === 0 ? "Jordan Lee" : (SAMPLE_LINES[index] ?? ""))),
    "1",
  ].join(",");
  return `${header}\n${sample}\n${second}\n`;
}

export function plaqueBulkPasteExamples(labels: string[]): string[] {
  const first = labels.map((_, index) => SAMPLE_LINES[index] ?? "");
  const second = labels.map((_, index) => (index === 0 ? "Jordan Lee" : (SAMPLE_LINES[index] ?? "")));
  return [first.join(" | "), second.join(" | ")];
}
