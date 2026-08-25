import Papa from "papaparse";
import { GAVEL_MAX_LINES } from "~/constants/gavelStyles";

export type GavelBulkRow = {
  id: string;
  texts: [string, string, string, string];
  quantity: number;
};

export type GavelBulkCsvResult = {
  rows: GavelBulkRow[];
  /** Non-fatal notice when rows carried more than {@link GAVEL_MAX_LINES} lines. */
  warning: string;
};

const HEADER_ALIASES: Record<string, string> = {
  line1: "line1",
  "line 1": "line1",
  name: "line1",
  delegate: "line1",
  line2: "line2",
  "line 2": "line2",
  title: "line2",
  role: "line2",
  line3: "line3",
  "line 3": "line3",
  organization: "line3",
  school: "line3",
  line4: "line4",
  "line 4": "line4",
  quantity: "quantity",
  qty: "quantity",
};

function normalizeCell(value: string | undefined): string {
  return (value ?? "").trim();
}

function normalizedHeader(value: string): string {
  const key = normalizeCell(value).toLowerCase();
  return HEADER_ALIASES[key] ?? key;
}

/**
 * Only treat row 1 as a header when it is unambiguous: an explicit `Line N`
 * column or a quantity column. Pasted rows like `Jane Smith,Delegate` also
 * match softer aliases such as "name", so those alone must not consume a row.
 */
function looksLikeHeaderRow(cells: string[]): boolean {
  return cells.some((cell) => {
    const key = normalizeCell(cell).toLowerCase();
    return /^line\s*[1-9]\d*$/.test(key) || key === "quantity" || key === "qty";
  });
}

function toRow(texts: string[], quantity: number, index: number): GavelBulkRow {
  const padded = [0, 1, 2, 3].map((i) => texts[i] ?? "");
  return {
    id: `bulk-gavel-${index}-${Math.random().toString(36).slice(2, 8)}`,
    texts: padded as GavelBulkRow["texts"],
    quantity,
  };
}

function formatTruncationWarning(rowNumbers: number[]): string {
  if (rowNumbers.length === 0) return "";
  const label = rowNumbers.length > 1 ? "Rows" : "Row";
  const verb = rowNumbers.length > 1 ? "have" : "has";
  const extra = rowNumbers.length > 1 ? "extra lines" : "an extra line";
  return (
    `Gavels allow up to ${GAVEL_MAX_LINES} lines of text each. ` +
    `${label} ${rowNumbers.join(", ")} ${verb} more than ${GAVEL_MAX_LINES} — ${extra} will be removed to fit.`
  );
}

/**
 * Accepts either the downloadable template (with a `Line 1…Quantity` header)
 * or plain pasted rows where each line is one gavel and commas separate its
 * text lines.
 */
export function parseGavelBulkCsv(csv: string): GavelBulkCsvResult {
  const parsed = Papa.parse<string[]>(csv.trim(), {
    skipEmptyLines: "greedy",
    // Spreadsheet copy/paste often arrives tab-separated; anything else falls
    // back to commas, which is what the on-screen instructions ask for.
    delimitersToGuess: [",", "\t"],
  });
  // Ragged rows are expected (rows may carry fewer lines), and single-column
  // input makes delimiter detection "fail" even though the parse is fine.
  const fatal = parsed.errors.find(
    (error) => error.type !== "FieldMismatch" && error.type !== "Delimiter",
  );
  if (fatal) {
    throw new Error(fatal.message || "The CSV could not be read.");
  }

  const allRows = parsed.data.filter((row) =>
    row.some((cell) => normalizeCell(cell)),
  );
  if (allRows.length === 0) {
    throw new Error("Add at least one row of gavel text.");
  }

  const hasHeader = looksLikeHeaderRow(allRows[0]);
  const truncatedRowNumbers: number[] = [];
  let rows: GavelBulkRow[];

  if (hasHeader) {
    const headers = allRows[0].map(normalizedHeader);
    const lineColumns = [1, 2, 3, 4]
      .map((line) => headers.indexOf(`line${line}`))
      .filter((column) => column >= 0);
    if (lineColumns.length === 0) {
      throw new Error('Include a "Line 1" column, or remove the header row.');
    }
    const quantityColumn = headers.indexOf("quantity");

    rows = allRows.slice(1).flatMap((cells, index): GavelBulkRow[] => {
      const texts = lineColumns
        .slice(0, GAVEL_MAX_LINES)
        .map((column) => normalizeCell(cells[column]));
      if (!texts.some(Boolean)) return [];

      const rawQuantity =
        quantityColumn >= 0
          ? Number.parseInt(normalizeCell(cells[quantityColumn]) || "1", 10)
          : 1;
      if (!Number.isFinite(rawQuantity) || rawQuantity < 1) {
        throw new Error(`Row ${index + 2} has an invalid quantity.`);
      }
      return [toRow(texts, Math.min(999, rawQuantity), index)];
    });
  } else {
    rows = allRows.flatMap((cells, index): GavelBulkRow[] => {
      const texts = cells.map(normalizeCell);
      if (!texts.some(Boolean)) return [];
      if (texts.length > GAVEL_MAX_LINES) {
        truncatedRowNumbers.push(index + 1);
      }
      return [toRow(texts.slice(0, GAVEL_MAX_LINES), 1, index)];
    });
  }

  if (rows.length === 0) {
    throw new Error("No personalized gavel rows were found.");
  }
  return { rows, warning: formatTruncationWarning(truncatedRowNumbers) };
}

export const GAVEL_BULK_CSV_TEMPLATE =
  "Line 1,Line 2,Line 3,Line 4,Quantity\n" +
  "MODEL UNITED NATIONS,Secretary-General,,,1\n" +
  "MODEL UNITED NATIONS,Delegate - Lincoln High School,,,1\n";

export const GAVEL_BULK_PASTE_EXAMPLE_ROWS: readonly string[] = [
  "MODEL UNITED NATIONS,Secretary-General",
  "MODEL UNITED NATIONS,Delegate,Lincoln High School",
];
