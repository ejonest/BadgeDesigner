import Papa from "papaparse";
import { MEDAL_MAX_QUANTITY } from "~/constants/medalOptions";
import type { MedalLineStyle } from "~/utils/medalRender";

export type MedalBulkRow = {
  id: string;
  lines: [string, string, string];
  quantity: number;
  /** Per-line emphasis. Copied from the designer, not the CSV. */
  lineStyles?: MedalLineStyle[];
};

export type MedalBulkCsvResult = {
  rows: MedalBulkRow[];
  warning: string;
};

const HEADER_ALIASES: Record<string, string> = {
  line1: "line1",
  "line 1": "line1",
  name: "line1",
  line2: "line2",
  "line 2": "line2",
  title: "line2",
  line3: "line3",
  "line 3": "line3",
  organization: "line3",
  school: "line3",
  quantity: "quantity",
  qty: "quantity",
};

const MAX_LINE_LENGTH = 40;

function cell(value: string | undefined): string {
  return (value ?? "").trim();
}

function header(value: string): string {
  const normalized = cell(value).toLowerCase();
  return HEADER_ALIASES[normalized] ?? normalized;
}

function isColumnName(value: string): boolean {
  return HEADER_ALIASES[cell(value).toLowerCase()] !== undefined;
}

/**
 * A header is a row of column names, such as "Line 1, Line 2, Quantity".
 * A medal whose text happens to be "line2" is not a header.
 */
function looksLikeHeader(cells: string[]): boolean {
  const filled = cells.map(cell).filter(Boolean);
  return filled.length > 0 && filled.every(isColumnName);
}

function makeRow(values: string[], quantity: number, index: number): MedalBulkRow {
  return {
    id: `bulk-medal-${index}-${Math.random().toString(36).slice(2, 8)}`,
    lines: [values[0] ?? "", values[1] ?? "", values[2] ?? ""],
    quantity,
  };
}

function looksLikePipeList(csv: string): boolean {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  const first = lines[0].toLowerCase();
  const data =
    first.startsWith("line 1") || first.startsWith("line1") ? lines.slice(1) : lines;
  return data.length > 0 && data.every((line) => line.includes("|"));
}

function finishRows(rows: MedalBulkRow[], truncatedRows: number[]): MedalBulkCsvResult {
  const total = rows.reduce((sum, row) => sum + row.quantity, 0);
  if (total > MEDAL_MAX_QUANTITY) {
    throw new Error(
      `This list totals ${total} medals. Online pricing currently supports up to ${MEDAL_MAX_QUANTITY}; contact us for a larger order.`,
    );
  }
  return {
    rows,
    warning:
      truncatedRows.length > 0
        ? `Rows ${truncatedRows.join(", ")} exceeded three lines or ${MAX_LINE_LENGTH} characters; extra text was removed.`
        : "",
  };
}

function parsePipeList(csv: string): MedalBulkCsvResult {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const first = lines[0]?.toLowerCase() ?? "";
  const data =
    first.startsWith("line 1") || first.startsWith("line1") ? lines.slice(1) : lines;
  const truncatedRows: number[] = [];
  const rows = data.map((line, index) => {
    const parts = line.split("|").map(cell);
    if (!parts[0]) throw new Error(`Row ${index + 1} needs Line 1.`);
    let quantity = 1;
    let text = parts;
    if (parts.length >= 4 && /^\d+$/.test(parts[parts.length - 1] ?? "")) {
      quantity = Number.parseInt(parts[parts.length - 1] ?? "1", 10);
      text = parts.slice(0, -1);
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      throw new Error(`Row ${index + 1} has an invalid quantity.`);
    }
    if (text.length > 3 || text.some((value) => value.length > MAX_LINE_LENGTH)) {
      truncatedRows.push(index + 1);
    }
    return makeRow(
      text.slice(0, 3).map((value) => value.slice(0, MAX_LINE_LENGTH)),
      quantity,
      index,
    );
  });
  if (rows.length === 0) throw new Error("Add at least one row of medal text.");
  return finishRows(rows, truncatedRows);
}

/**
 * Accepts the downloadable template, pasted comma or tab rows, or a bar list
 * (`Name | Title | Year`) so a comma inside a name stays in one field.
 * Each row is one personalized medal and may carry its own quantity.
 */
export function parseMedalBulkCsv(csv: string): MedalBulkCsvResult {
  if (looksLikePipeList(csv)) return parsePipeList(csv);
  const parsed = Papa.parse<string[]>(csv.trim(), {
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", "\t"],
  });
  const fatal = parsed.errors.find(
    (error) => error.type !== "FieldMismatch" && error.type !== "Delimiter",
  );
  if (fatal) throw new Error(fatal.message || "The CSV could not be read.");

  const allRows = parsed.data.filter((row) => row.some((value) => cell(value)));
  if (allRows.length === 0) {
    throw new Error("Add at least one row of medal text.");
  }

  const hasHeader = looksLikeHeader(allRows[0]);
  const truncatedRows: number[] = [];
  let rows: MedalBulkRow[];

  if (hasHeader) {
    const headers = allRows[0].map(header);
    const lineColumns = [1, 2, 3].map((line) => headers.indexOf(`line${line}`));
    if (lineColumns[0] < 0) {
      throw new Error(
        "That first row looks like column names, but it needs a Line 1 column. Or delete it and paste one medal per line, such as Avery Cole | Captain | 2026.",
      );
    }
    const quantityColumn = headers.indexOf("quantity");
    rows = allRows.slice(1).flatMap((values, index): MedalBulkRow[] => {
      const lines = lineColumns.map((column) =>
        column >= 0 ? cell(values[column]) : "",
      );
      if (!lines[0]) throw new Error(`Row ${index + 2} needs Line 1.`);
      const rawQuantity =
        quantityColumn >= 0
          ? Number.parseInt(cell(values[quantityColumn]) || "1", 10)
          : 1;
      if (!Number.isFinite(rawQuantity) || rawQuantity < 1) {
        throw new Error(`Row ${index + 2} has an invalid quantity.`);
      }
      if (lines.some((line) => line.length > MAX_LINE_LENGTH)) truncatedRows.push(index + 2);
      return [
        makeRow(
          lines.map((line) => line.slice(0, MAX_LINE_LENGTH)),
          rawQuantity,
          index,
        ),
      ];
    });
    if (rows.length === 0) {
      throw new Error("Add at least one medal under the column names.");
    }
  } else {
    rows = allRows.map((values, index) => {
      const normalized = values.map(cell);
      if (!normalized[0]) throw new Error(`Row ${index + 1} needs Line 1.`);
      let quantity = 1;
      let lines = normalized;
      if (normalized.length >= 4 && /^\d+$/.test(normalized[3] ?? "")) {
        quantity = Number.parseInt(normalized[3] ?? "1", 10);
        lines = normalized.slice(0, 3);
      }
      if (!Number.isFinite(quantity) || quantity < 1) {
        throw new Error(`Row ${index + 1} has an invalid quantity.`);
      }
      if (lines.length > 3 || lines.some((line) => line.length > MAX_LINE_LENGTH)) {
        truncatedRows.push(index + 1);
      }
      return makeRow(
        lines.slice(0, 3).map((line) => line.slice(0, MAX_LINE_LENGTH)),
        quantity,
        index,
      );
    });
  }

  return finishRows(rows, truncatedRows);
}

export const MEDAL_BULK_CSV_TEMPLATE =
  "Line 1,Line 2,Line 3,Quantity\n" +
  "Avery Cole,Captain,2026,1\n" +
  "Jordan Lee,Team Captain,2026,1\n";

export const MEDAL_BULK_PASTE_EXAMPLES = [
  "Avery Cole | Captain | 2026",
  "Jordan Lee | Team Captain | 2026",
] as const;
