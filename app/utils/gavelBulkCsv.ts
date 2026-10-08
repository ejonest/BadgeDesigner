import Papa from "papaparse";
import {
  GAVEL_MAX_CHARS_PER_LINE,
  GAVEL_MAX_LINES,
  GAVEL_TEXT_SIZE_PRESETS,
  SOUND_BLOCK_MAX_CHARS,
  SOUND_BLOCK_MAX_LINES,
  STAND_PLATE_MAX_LINES,
  type GavelTextSizePreset,
} from "~/constants/gavelStyles";

export type GavelBulkSecondaryMode = "shared" | "separate";
export type GavelBulkSecondarySurface = "stand" | "sound-block";

export type GavelBulkLineStyle = {
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  /** Overrides the row, then the order, for this line only. */
  textSize?: GavelTextSizePreset;
};

export type GavelBulkRow = {
  id: string;
  /** Text engraved on the gavel band. */
  texts: [string, string, string, string];
  /** Text printed/engraved on the stand plate or sound-block top. */
  secondaryTexts: [string, string, string, string];
  quantity: number;
  /** Overrides the order-wide text size for this row only. */
  textSize?: GavelTextSizePreset;
  /** Per-gavel formatting overrides. Missing entries inherit the bulk design. */
  bandStyles?: GavelBulkLineStyle[];
  secondaryStyles?: GavelBulkLineStyle[];
};

export function parseGavelTextSize(
  value: unknown,
): GavelTextSizePreset | undefined {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (GAVEL_TEXT_SIZE_PRESETS as readonly string[]).includes(key)
    ? (key as GavelTextSizePreset)
    : undefined;
}

export function newGavelBulkRowId(): string {
  return `bulk-gavel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blankGavelBulkRow(): GavelBulkRow {
  return {
    id: newGavelBulkRowId(),
    texts: ["", "", "", ""],
    secondaryTexts: ["", "", "", ""],
    quantity: 1,
  };
}

export function gavelBulkRowIsBlank(row: GavelBulkRow): boolean {
  return ![...row.texts, ...row.secondaryTexts].some((text) => text.trim());
}

export function secondaryLineCount(
  surface: GavelBulkSecondarySurface | null | undefined,
): number {
  return surface === "stand" ? STAND_PLATE_MAX_LINES : SOUND_BLOCK_MAX_LINES;
}

/** The band text a shared-mode row repeats on its stand plate or sound block. */
export function sharedSecondaryTexts(
  texts: GavelBulkRow["texts"],
  surface: GavelBulkSecondarySurface | null | undefined,
): GavelBulkRow["secondaryTexts"] {
  return padTexts(texts.slice(0, secondaryLineCount(surface)));
}

function rowContentKey(row: GavelBulkRow): string {
  return JSON.stringify([
    row.texts.map((text) => text.trim().toLowerCase()),
    row.secondaryTexts.map((text) => text.trim().toLowerCase()),
  ]);
}

export type GavelBulkRowIssues = {
  /** Cells (`band-N`, `secondary-N`) whose text is past the limit for the row's size. */
  overCells: Set<string>;
  /** Band line 1 is empty; every gavel needs it, as in the single design. */
  missingRequired: boolean;
  /** 1-based number of the first row with identical wording, if any. */
  duplicateOf: number | null;
};

export type GavelBulkCheck = {
  issues: GavelBulkRowIssues[];
  /** Rows that must be fixed before ordering. */
  errorRows: number;
  overRows: number;
  missingRows: number;
  /** Warning only: a repeated row is more often a slip than intent. */
  duplicateRows: number;
  /** Distinct wordings across the order. */
  designs: number;
};

export function checkGavelBulkRows(
  rows: readonly GavelBulkRow[],
  options: {
    textSize: GavelTextSizePreset;
    /** Secondary columns the customer edits; 0 when they repeat the band. */
    secondaryCount: number;
    secondarySurface: GavelBulkSecondarySurface | null;
  },
): GavelBulkCheck {
  const firstRowFor = new Map<string, number>();
  let errorRows = 0;
  let overRows = 0;
  let missingRows = 0;
  let duplicateRows = 0;

  const issues = rows.map((row, index): GavelBulkRowIssues => {
    const overCells = new Set<string>();
    row.texts.forEach((text, lineIndex) => {
      const limit =
        GAVEL_MAX_CHARS_PER_LINE[
          gavelBulkLineTextSize(row, lineIndex, options.textSize)
        ];
      if (text.length > limit) overCells.add(`band-${lineIndex}`);
    });
    const secondary = row.secondaryTexts.slice(0, options.secondaryCount);
    if (options.secondarySurface === "stand") {
      secondary.forEach((text, lineIndex) => {
        const limit =
          GAVEL_MAX_CHARS_PER_LINE[
            gavelBulkLineTextSize(row, lineIndex, options.textSize, "secondary")
          ];
        if (text.length > limit) overCells.add(`secondary-${lineIndex}`);
      });
    } else if (
      options.secondarySurface === "sound-block" &&
      secondary.reduce((sum, text) => sum + text.length, 0) >
        SOUND_BLOCK_MAX_CHARS
    ) {
      secondary.forEach((text, lineIndex) => {
        if (text) overCells.add(`secondary-${lineIndex}`);
      });
    }

    const missingRequired = !row.texts[0].trim();
    let duplicateOf: number | null = null;
    if (!gavelBulkRowIsBlank(row)) {
      const key = rowContentKey(row);
      const first = firstRowFor.get(key);
      if (first === undefined) firstRowFor.set(key, index + 1);
      else duplicateOf = first;
    }

    if (overCells.size > 0) overRows += 1;
    if (missingRequired) missingRows += 1;
    if (overCells.size > 0 || missingRequired) errorRows += 1;
    if (duplicateOf !== null) duplicateRows += 1;
    return { overCells, missingRequired, duplicateOf };
  });

  return {
    issues,
    errorRows,
    overRows,
    missingRows,
    duplicateRows,
    designs: firstRowFor.size,
  };
}

/** Appends incoming rows, skipping any whose wording is already in the list. */
export function mergeGavelBulkRows(
  current: readonly GavelBulkRow[],
  incoming: readonly GavelBulkRow[],
): { rows: GavelBulkRow[]; added: number; skipped: number } {
  const seen = new Set(current.map(rowContentKey));
  const added: GavelBulkRow[] = [];
  for (const row of incoming) {
    const key = rowContentKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(row);
  }
  return {
    rows: [...current, ...added],
    added: added.length,
    skipped: incoming.length - added.length,
  };
}

/**
 * The customer's current list in the template's own column layout, so it
 * imports straight back in.
 */
/** The size a line is engraved at: its own, then the row's, then the order's. */
export function gavelBulkLineTextSize(
  row: GavelBulkRow,
  lineIndex: number,
  fallback: GavelTextSizePreset,
  surface: "band" | "secondary" = "band",
): GavelTextSizePreset {
  const styles = surface === "band" ? row.bandStyles : row.secondaryStyles;
  return styles?.[lineIndex]?.textSize ?? row.textSize ?? fallback;
}

/**
 * The list as plain rows for the paste boxes. Blank rows stay as a comma so
 * a gavel line and its sound-block line keep the same row number.
 */
export function gavelBulkRowsToPaste(
  rows: readonly GavelBulkRow[],
  pick: (row: GavelBulkRow) => readonly string[],
): string {
  return rows
    .map((row) => {
      const cells = [...pick(row)];
      while (cells.length > 1 && !cells[cells.length - 1].trim()) cells.pop();
      if (!cells.some((cell) => cell.trim())) return ",";
      return cells
        .map((cell) =>
          /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell,
        )
        .join(",");
    })
    .join("\n");
}

export function gavelBulkRowsToCsv(
  rows: readonly GavelBulkRow[],
  mode: GavelBulkSecondaryMode,
  surface: GavelBulkSecondarySurface | null,
): string {
  const secondaryCount =
    mode === "separate" && surface ? secondaryLineCount(surface) : 0;
  const secondaryLabel =
    surface === "stand" ? "Stand Plate Line" : "Sound Block Line";
  const header = [
    "Band Line 1",
    "Band Line 2",
    "Band Line 3",
    "Band Line 4",
    ...Array.from(
      { length: secondaryCount },
      (_, index) => `${secondaryLabel} ${index + 1}`,
    ),
    "Text Size",
    "Quantity",
  ];
  const body = rows.map((row) => [
    ...row.texts,
    ...row.secondaryTexts.slice(0, secondaryCount),
    row.textSize ?? "",
    String(row.quantity),
  ]);
  return Papa.unparse([header, ...body]);
}

/** Column names as the customer's own file spelled them, per engraved line. */
export type GavelBulkColumnLabels = {
  band: [string, string, string, string];
  secondary: [string, string, string, string];
};

export type GavelBulkCsvResult = {
  rows: GavelBulkRow[];
  /** Non-fatal notice when rows carried more than {@link GAVEL_MAX_LINES} lines. */
  warning: string;
  /** Null when the list had no header row to name the columns. */
  columnLabels: GavelBulkColumnLabels | null;
};

const HEADER_ALIASES: Record<string, string> = {
  line1: "line1",
  "line 1": "line1",
  name: "line1",
  "full name": "line1",
  delegate: "line1",
  line2: "line2",
  "line 2": "line2",
  title: "line2",
  role: "line2",
  position: "line2",
  line3: "line3",
  "line 3": "line3",
  organization: "line3",
  organisation: "line3",
  school: "line3",
  line4: "line4",
  "line 4": "line4",
  quantity: "quantity",
  qty: "quantity",
  "text size": "textSize",
  textsize: "textSize",
  size: "textSize",
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
 * column, a quantity column, or a row made up entirely of column names such
 * as `Name,Title,School`. A pasted row like `Jane Smith,Delegate` matches the
 * soft alias "delegate" once, but "Jane Smith" is not a column name, so it
 * stays a row of text.
 */
function looksLikeHeaderRow(cells: string[]): boolean {
  const explicit = cells.some((cell) => {
    const key = normalizeCell(cell).toLowerCase();
    return (
      /^(?:(?:gavel|gavel band|band|secondary|stand|stand plate|plate|sound block|soundblock|block)\s*)?line\s*[1-9]\d*$/.test(
        key,
      ) ||
      key === "quantity" ||
      key === "qty"
    );
  });
  if (explicit) return true;
  const named = cells.map(normalizeCell).filter(Boolean);
  return (
    named.length >= 2 &&
    named.every((cell) => HEADER_ALIASES[cell.toLowerCase()] !== undefined)
  );
}

function padTexts(texts: string[]): GavelBulkRow["texts"] {
  return [0, 1, 2, 3].map((i) => texts[i] ?? "") as GavelBulkRow["texts"];
}

function toRow(
  texts: string[],
  secondaryTexts: string[],
  quantity: number,
  textSize?: GavelTextSizePreset,
): GavelBulkRow {
  return {
    id: newGavelBulkRowId(),
    texts: padTexts(texts),
    secondaryTexts: padTexts(secondaryTexts),
    quantity,
    ...(textSize ? { textSize } : {}),
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
  let columnLabels: GavelBulkColumnLabels | null = null;

  if (hasHeader) {
    const headers = allRows[0].map(normalizedHeader);
    const lineColumns = [1, 2, 3, 4]
      .map((line) => headers.indexOf(`line${line}`))
      .filter((column) => column >= 0);
    const secondaryLineColumns = [1, 2, 3, 4]
      .slice(0, secondaryMaxLines)
      .map((line) => headers.indexOf(`secondaryLine${line}`))
      .filter((column) => column >= 0);
    const labelFor = (columns: number[], index: number) =>
      columns[index] !== undefined
        ? normalizeCell(allRows[0][columns[index]])
        : "";
    columnLabels = {
      band: padTexts([0, 1, 2, 3].map((i) => labelFor(lineColumns, i))),
      secondary: padTexts(
        [0, 1, 2, 3].map((i) => labelFor(secondaryLineColumns, i)),
      ),
    };
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
    const textSizeColumn = headers.indexOf("textSize");

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
        toRow(
          texts,
          secondaryTexts,
          Math.min(999, rawQuantity),
          textSizeColumn >= 0
            ? parseGavelTextSize(cells[textSizeColumn])
            : undefined,
        ),
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
      return [toRow(texts, secondaryTexts, 1)];
    });
  }

  if (rows.length === 0) {
    throw new Error("No personalized gavel rows were found.");
  }
  return {
    rows,
    columnLabels,
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

/**
 * Pairs two independently pasted or uploaded lists. Row 1 of the gavel list
 * belongs with row 1 of the sound block or stand plate, and so on.
 */
export function pairGavelBulkSurfaceRows(
  bandRows: readonly GavelBulkRow[],
  secondaryRows: readonly GavelBulkRow[],
  options: { surfaceLabel: string; secondaryLineCount: number },
): GavelBulkRow[] {
  if (bandRows.length === 0) {
    throw new Error("Add at least one row of gavel text.");
  }
  if (secondaryRows.length === 0) {
    throw new Error(`Add at least one row of ${options.surfaceLabel} text.`);
  }
  if (bandRows.length !== secondaryRows.length) {
    const bandLabel = `${bandRows.length} row${bandRows.length === 1 ? "" : "s"}`;
    const secondaryLabel = `${secondaryRows.length} row${
      secondaryRows.length === 1 ? "" : "s"
    }`;
    throw new Error(
      `The gavel list has ${bandLabel} and the ${options.surfaceLabel} list has ${secondaryLabel}. Use the same number of rows so each gavel lines up.`,
    );
  }
  return bandRows.map((row, index) => ({
    ...row,
    secondaryTexts: padTexts(
      secondaryRows[index].texts.slice(0, options.secondaryLineCount),
    ),
  }));
}

/** A one-surface template. The window it is uploaded into decides where it goes. */
export function gavelBulkSurfaceCsvTemplate(lineCount: number): string {
  const headers = Array.from(
    { length: lineCount },
    (_, index) => `Line ${index + 1}`,
  );
  const example = [
    "MODEL UNITED NATIONS",
    "Secretary-General",
    ...Array.from({ length: Math.max(0, lineCount - 2) }, () => ""),
    "1",
  ];
  return [[...headers, "Quantity"].join(","), example.join(",")].join("\n");
}
