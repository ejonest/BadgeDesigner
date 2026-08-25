import Papa from "papaparse";

export type GavelBulkRow = {
  id: string;
  texts: [string, string, string, string];
  quantity: number;
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

function normalizedHeader(value: string): string {
  return HEADER_ALIASES[value.trim().toLowerCase()] ?? value.trim().toLowerCase();
}

export function parseGavelBulkCsv(csv: string): GavelBulkRow[] {
  const parsed = Papa.parse<string[]>(csv, {
    skipEmptyLines: "greedy",
  });
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message || "The CSV could not be read.");
  }

  const rows = parsed.data;
  if (rows.length < 2) {
    throw new Error("Add a header row and at least one gavel row.");
  }

  const headers = rows[0].map(normalizedHeader);
  const lineIndexes = [1, 2, 3, 4].map((line) =>
    headers.indexOf(`line${line}`),
  );
  if (lineIndexes[0] < 0) {
    throw new Error('Include a "Line 1" or "Name" column.');
  }
  const quantityIndex = headers.indexOf("quantity");

  const result = rows.slice(1).flatMap((values, index): GavelBulkRow[] => {
    const texts = lineIndexes.map((column) =>
      column >= 0 ? (values[column] ?? "").trim() : "",
    ) as GavelBulkRow["texts"];
    if (!texts.some(Boolean)) return [];

    const rawQuantity =
      quantityIndex >= 0 ? Number.parseInt(values[quantityIndex] ?? "1", 10) : 1;
    if (!Number.isFinite(rawQuantity) || rawQuantity < 1) {
      throw new Error(`Row ${index + 2} has an invalid quantity.`);
    }

    return [
      {
        id: `bulk-gavel-${index}-${Math.random().toString(36).slice(2, 8)}`,
        texts,
        quantity: Math.min(999, rawQuantity),
      },
    ];
  });

  if (result.length === 0) {
    throw new Error("No personalized gavel rows were found.");
  }
  return result;
}

export const GAVEL_BULK_CSV_TEMPLATE =
  "Line 1,Line 2,Line 3,Line 4,Quantity\n" +
  "MODEL UNITED NATIONS,Secretary-General,,,1\n" +
  "MODEL UNITED NATIONS,Delegate - Lincoln High School,,,1\n";
