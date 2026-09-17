import Papa from "papaparse";
import { TROPHY_MAX_PRICED_QUANTITY } from "~/constants/trophyOptions";

export type TrophyBulkLineStyle = {
  size: "small" | "medium" | "large";
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export type TrophyBulkRow = {
  id: string;
  lines: [string, string, string];
  quantity: number;
  /** Per-line size and emphasis. Copied from the designer, not the CSV. */
  lineStyles?: TrophyBulkLineStyle[];
};

export type TrophyBulkCsvResult = {
  rows: TrophyBulkRow[];
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

function cell(value: string | undefined): string {
  return (value ?? "").trim();
}

function header(value: string): string {
  const normalized = cell(value).toLowerCase();
  return HEADER_ALIASES[normalized] ?? normalized;
}

function looksLikeHeader(cells: string[]): boolean {
  return cells.some((value) => {
    const normalized = cell(value).toLowerCase();
    return /^(?:line\s*[1-3]|quantity|qty)$/.test(normalized);
  });
}

function makeRow(
  values: string[],
  quantity: number,
  index: number,
): TrophyBulkRow {
  return {
    id: `bulk-trophy-${index}-${Math.random().toString(36).slice(2, 8)}`,
    lines: [values[0] ?? "", values[1] ?? "", values[2] ?? ""],
    quantity,
  };
}

/**
 * Accepts the downloadable template or pasted comma/tab-separated rows.
 * Each row is one personalized design and may carry its own quantity.
 */
export function parseTrophyBulkCsv(csv: string): TrophyBulkCsvResult {
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
    throw new Error("Add at least one row of trophy text.");
  }

  const hasHeader = looksLikeHeader(allRows[0]);
  const truncatedRows: number[] = [];
  let rows: TrophyBulkRow[];

  if (hasHeader) {
    const headers = allRows[0].map(header);
    const lineColumns = [1, 2, 3].map((line) =>
      headers.indexOf(`line${line}`),
    );
    if (lineColumns[0] < 0) {
      throw new Error('Include a "Line 1" column, or remove the header row.');
    }
    const quantityColumn = headers.indexOf("quantity");
    rows = allRows.slice(1).flatMap((values, index): TrophyBulkRow[] => {
      const lines = lineColumns.map((column) =>
        column >= 0 ? cell(values[column]) : "",
      );
      if (!lines[0]) {
        throw new Error(`Row ${index + 2} needs Line 1.`);
      }
      const rawQuantity =
        quantityColumn >= 0
          ? Number.parseInt(cell(values[quantityColumn]) || "1", 10)
          : 1;
      if (!Number.isFinite(rawQuantity) || rawQuantity < 1) {
        throw new Error(`Row ${index + 2} has an invalid quantity.`);
      }
      if (lines.some((line) => line.length > 40)) truncatedRows.push(index + 2);
      return [makeRow(lines.map((line) => line.slice(0, 40)), rawQuantity, index)];
    });
  } else {
    rows = allRows.map((values, index) => {
      const normalized = values.map(cell);
      if (!normalized[0]) throw new Error(`Row ${index + 1} needs Line 1.`);
      if (normalized.length > 3 || normalized.some((line) => line.length > 40)) {
        truncatedRows.push(index + 1);
      }
      return makeRow(
        normalized.slice(0, 3).map((line) => line.slice(0, 40)),
        1,
        index,
      );
    });
  }

  const total = rows.reduce((sum, row) => sum + row.quantity, 0);
  if (total > TROPHY_MAX_PRICED_QUANTITY) {
    throw new Error(
      `This CSV totals ${total} trophies. Online pricing currently supports up to ${TROPHY_MAX_PRICED_QUANTITY}; contact us for a larger order.`,
    );
  }

  return {
    rows,
    warning:
      truncatedRows.length > 0
        ? `Rows ${truncatedRows.join(", ")} exceeded three lines or 40 characters; extra text was removed.`
        : "",
  };
}

export const TROPHY_BULK_CSV_TEMPLATE =
  "Line 1,Line 2,Line 3,Quantity\n" +
  "CHAMPIONS,Alex Morgan,2026,1\n" +
  "MOST VALUABLE PLAYER,Jordan Lee,2026,1\n";

export const TROPHY_BULK_PASTE_EXAMPLES = [
  "CHAMPIONS,Alex Morgan,2026",
  "MOST VALUABLE PLAYER,Jordan Lee,2026",
] as const;
