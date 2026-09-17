import Papa from "papaparse";
import {
  GAVEL_MAX_LINES,
  SOUND_BLOCK_MAX_LINES,
  STAND_PLATE_MAX_LINES,
} from "~/constants/gavelStyles";

export type GavelBulkSecondaryMode = "shared" | "separate";
export type GavelBulkSecondarySurface = "stand" | "sound-block";

export type GavelBulkRow = {
  id: string;
  /** Text engraved on the gavel band. */
  texts: [string, string, string, string];
  /** Text printed/engraved on the stand plate or sound-block top. */
  secondaryTexts: [string, string, string, string];
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

const SECONDARY_HEADER_PREFIXES = [
  "secondary",
  "stand",
  "stand plate",
  "plate",
  "sound block",
  "soundblock",
  "block",
];

function normalizeCell(value: string | undefined): string {
  return (value ?? "").trim();
}

function normalizedHeader(value: string): string {
  const key = normalizeCell(value).toLowerCase();
  for (const prefix of SECONDARY_HEADER_PREFIXES) {
    const match = key.match(
      new RegExp(`^${prefix.replace(" ", "\\s*")}\\s*line\\s*([1-4])$`),
    );
    if (match) return `secondaryLine${match[1]}`;
  }
  const bandMatch = key.match(/^(?:gavel|gavel band|band)\s*line\s*([1-4])$/);
  if (bandMatch) return `line${bandMatch[1]}`;
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
    return (
      /^(?:(?:gavel|gavel band|band|secondary|stand|stand plate|plate|sound block|soundblock|block)\s*)?line\s*[1-9]\d*$/.test(
        key,
      ) ||
      key === "quantity" ||
      key === "qty"
    );
  });
}

function padTexts(texts: string[]): GavelBulkRow["texts"] {
  return [0, 1, 2, 3].map((i) => texts[i] ?? "") as GavelBulkRow["texts"];
}

function toRow(
  texts: string[],
  secondaryTexts: string[],
  quantity: number,
  index: number,
): GavelBulkRow {
  const padded = [0, 1, 2, 3].map((i) => texts[i] ?? "");
  return {
    id: `bulk-gavel-${index}-${Math.random().toString(36).slice(2, 8)}`,
    texts: padded as GavelBulkRow["texts"],
    secondaryTexts: padTexts(secondaryTexts),
    quantity,
  };
}

function formatTruncationWarning(
  rowNumbers: number[],
  maxColumns = GAVEL_MAX_LINES,
): string {
  if (rowNumbers.length === 0) return "";
  const label = rowNumbers.length > 1 ? "Rows" : "Row";
  const verb = rowNumbers.length > 1 ? "have" : "has";
  return (
    `The selected surfaces allow up to ${maxColumns} text columns per row. ` +
    `${label} ${rowNumbers.join(", ")} ${verb} extra columns that will be removed to fit.`
  );
}

/**
 * Accepts either the downloadable template (with a `Line 1…Quantity` header)
 * or plain pasted rows where each line is one gavel and commas separate its
 * text lines.
 */
export function parseGavelBulkCsv(
  csv: string,
  options: {
    secondaryMode?: GavelBulkSecondaryMode;
    secondarySurface?: GavelBulkSecondarySurface;
  } = {},
): GavelBulkCsvResult {
  const secondaryMode = options.secondaryMode ?? "shared";
  const secondaryMaxLines =
    options.secondarySurface === "stand"
      ? STAND_PLATE_MAX_LINES
      : SOUND_BLOCK_MAX_LINES;
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
    const secondaryLineColumns = [1, 2, 3, 4]
      .slice(0, secondaryMaxLines)
      .map((line) => headers.indexOf(`secondaryLine${line}`))
      .filter((column) => column >= 0);
    if (
      lineColumns.length === 0 &&
      (secondaryMode === "shared" || secondaryLineColumns.length === 0)
    ) {
      throw new Error(
        secondaryMode === "shared"
          ? 'Include a "Band Line 1" column, or remove the header row.'
          : 'Include a "Band Line 1" or secondary-surface line column.',
      );
    }
    const quantityColumn = headers.indexOf("quantity");

    rows = allRows.slice(1).flatMap((cells, index): GavelBulkRow[] => {
      const texts = lineColumns
        .slice(0, GAVEL_MAX_LINES)
        .map((column) => normalizeCell(cells[column]));
      const secondaryTexts =
        secondaryMode === "shared"
          ? texts.slice(0, secondaryMaxLines)
          : secondaryLineColumns.map((column) => normalizeCell(cells[column]));
      if (!texts.some(Boolean) && !secondaryTexts.some(Boolean)) return [];

      const rawQuantity =
        quantityColumn >= 0
          ? Number.parseInt(normalizeCell(cells[quantityColumn]) || "1", 10)
          : 1;
      if (!Number.isFinite(rawQuantity) || rawQuantity < 1) {
        throw new Error(`Row ${index + 2} has an invalid quantity.`);
      }
      return [
        toRow(texts, secondaryTexts, Math.min(999, rawQuantity), index),
      ];
    });
  } else {
    rows = allRows.flatMap((cells, index): GavelBulkRow[] => {
      const normalized = cells.map(normalizeCell);
      const texts = normalized.slice(0, GAVEL_MAX_LINES);
      const secondaryTexts =
        secondaryMode === "shared"
          ? texts.slice(0, secondaryMaxLines)
          : normalized.slice(
              GAVEL_MAX_LINES,
              GAVEL_MAX_LINES + secondaryMaxLines,
            );
      if (!texts.some(Boolean) && !secondaryTexts.some(Boolean)) return [];
      if (
        normalized.length >
        GAVEL_MAX_LINES +
          (secondaryMode === "separate" ? secondaryMaxLines : 0)
      ) {
        truncatedRowNumbers.push(index + 1);
      }
      return [toRow(texts, secondaryTexts, 1, index)];
    });
  }

  if (rows.length === 0) {
    throw new Error("No personalized gavel rows were found.");
  }
  return {
    rows,
    warning: formatTruncationWarning(
      truncatedRowNumbers,
      GAVEL_MAX_LINES +
        (secondaryMode === "separate" ? secondaryMaxLines : 0),
    ),
  };
}

export const GAVEL_BULK_CSV_TEMPLATE =
  "Band Line 1,Band Line 2,Band Line 3,Band Line 4,Quantity\n" +
  "MODEL UNITED NATIONS,Secretary-General,,,1\n" +
  "MODEL UNITED NATIONS,Delegate - Lincoln High School,,,1\n";

export function gavelBulkCsvTemplate(
  mode: GavelBulkSecondaryMode,
  surface: GavelBulkSecondarySurface | null,
): string {
  if (mode === "shared" || !surface) return GAVEL_BULK_CSV_TEMPLATE;
  const secondaryLabel =
    surface === "stand" ? "Stand Plate Line" : "Sound Block Line";
  const secondaryColumns = Array.from(
    {
      length:
        surface === "stand" ? STAND_PLATE_MAX_LINES : SOUND_BLOCK_MAX_LINES,
    },
    (_, index) => `${secondaryLabel} ${index + 1}`,
  );
  return [
    [
      "Band Line 1",
      "Band Line 2",
      "Band Line 3",
      "Band Line 4",
      ...secondaryColumns,
      "Quantity",
    ].join(","),
    [
      "MODEL UNITED NATIONS",
      "Secretary-General",
      "",
      "",
      "Secretary-General",
      "Lincoln High School",
      ...Array.from({ length: Math.max(0, secondaryColumns.length - 2) }, () => ""),
      "1",
    ].join(","),
  ].join("\n");
}

export const GAVEL_BULK_PASTE_EXAMPLE_ROWS: readonly string[] = [
  "MODEL UNITED NATIONS,Secretary-General",
  "MODEL UNITED NATIONS,Delegate,Lincoln High School",
];
