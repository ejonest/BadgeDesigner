import {
  DESIGNER_IDS,
  getDesignerConfig,
  type DesignerId,
} from "~/config/designers";
import { supabaseAdmin } from "~/utils/supabase";

export type ProductionTextLine = {
  text: string;
  fontFamily: string;
  color?: string;
  alignment?: string;
  size?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
};

export type ProductionOrderItem = {
  designerId: DesignerId;
  productLabel: string;
  designId: string;
  quantity: number;
  lines: ProductionTextLine[];
  thumbnailUrl?: string;
  proofUrl?: string;
  uploadedImageUrl?: string;
};

type RawRow = Record<string, unknown>;

const DATA_JSON_DESIGNERS = new Set<DesignerId>([
  "desk-sign",
  "gavel",
  "pen",
]);

const UPLOAD_DESIGNERS = new Set<DesignerId>([
  "sign",
  "plaque",
  "desk-sign",
  "gavel",
  "pen",
]);

function safeHttpUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function asRecord(value: unknown): RawRow | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as RawRow)
    : null;
}

function lineSize(line: RawRow): string | undefined {
  if (typeof line.fontSize === "number") return `${line.fontSize}px`;
  if (typeof line.sizeNorm === "number") {
    return `${Math.round(line.sizeNorm * 100)}%`;
  }
  return undefined;
}

function extractLines(row: RawRow, jsonColumn: "badge_json" | "data_json") {
  const design = asRecord(row[jsonColumn]);
  const rawLines = Array.isArray(design?.lines) ? design.lines : [];
  const lines: ProductionTextLine[] = [];

  for (const rawLine of rawLines.slice(0, 12)) {
    const line = asRecord(rawLine);
    const text = typeof line?.text === "string" ? line.text.trim() : "";
    if (!line || !text) continue;
    lines.push({
      text,
      fontFamily:
        typeof line.fontFamily === "string" && line.fontFamily.trim()
          ? line.fontFamily.trim()
          : "Roboto",
      ...(typeof line.color === "string" && line.color.trim()
        ? { color: line.color.trim() }
        : {}),
      ...(typeof line.align === "string" && line.align.trim()
        ? { alignment: line.align.trim() }
        : {}),
      ...(lineSize(line) ? { size: lineSize(line) } : {}),
      ...(line.bold === true ? { bold: true } : {}),
      ...(line.italic === true ? { italic: true } : {}),
      ...(line.underline === true ? { underline: true } : {}),
    });
  }

  if (lines.length > 0) return lines;

  // Older rows can predate badge_json/data_json.
  for (let index = 1; index <= 6; index++) {
    const text = row[`line_${index}_text`];
    if (typeof text !== "string" || !text.trim()) continue;
    const font = row[`line_${index}_font`];
    const color = row[`line_${index}_color`];
    const alignment = row[`line_${index}_alignment`];
    const size = row[`line_${index}_font_size`];
    lines.push({
      text: text.trim(),
      fontFamily:
        typeof font === "string" && font.trim() ? font.trim() : "Roboto",
      ...(typeof color === "string" ? { color } : {}),
      ...(typeof alignment === "string" ? { alignment } : {}),
      ...(typeof size === "number" ? { size: `${size}px` } : {}),
      ...(row[`line_${index}_bold`] === true ? { bold: true } : {}),
      ...(row[`line_${index}_italicize`] === true ? { italic: true } : {}),
      ...(row[`line_${index}_underline`] === true
        ? { underline: true }
        : {}),
    });
  }
  return lines;
}

function numericOrderId(orderId: string): string | null {
  const trimmed = orderId.trim();
  const gidMatch = trimmed.match(/^gid:\/\/shopify\/Order\/(\d+)$/);
  if (gidMatch) return gidMatch[1];
  return /^\d+$/.test(trimmed) ? trimmed : null;
}

function selectColumns(designerId: DesignerId): string {
  const jsonColumn = DATA_JSON_DESIGNERS.has(designerId)
    ? "data_json"
    : "badge_json";
  const columns = [
    "design_id",
    "quantity",
    "thumbnail_url",
    "full_image_url",
    jsonColumn,
    "created_at",
  ];
  if (UPLOAD_DESIGNERS.has(designerId)) columns.push("uploaded_image_url");
  return columns.join(",");
}

export async function getProductionOrder(
  orderId: string,
  shop: string,
): Promise<ProductionOrderItem[]> {
  if (!supabaseAdmin) {
    throw new Error("Supabase is not configured.");
  }
  const db = supabaseAdmin;
  const numericId = numericOrderId(orderId);
  if (!numericId) throw new Response("Invalid order ID", { status: 400 });

  const batches = await Promise.all(
    DESIGNER_IDS.map(async (designerId) => {
      const def = getDesignerConfig(designerId);
      const { data, error } = await db
        .from(def.orderItemsTable)
        .select(selectColumns(designerId))
        .eq("shopify_order_id", numericId)
        .eq("shop_id", shop)
        .or("is_qa_test.is.null,is_qa_test.eq.false")
        .order("created_at", { ascending: true });

      if (error) {
        // Stamp/nameplate tables may not be installed yet. Skip only missing-table
        // and missing-column schema errors; surface real query failures.
        if (/does not exist|schema cache|Could not find/i.test(error.message)) {
          console.warn(
            `[production-admin] skipping ${def.orderItemsTable}: ${error.message}`,
          );
          return [] as ProductionOrderItem[];
        }
        throw new Error(`${def.orderItemsTable}: ${error.message}`);
      }

      const jsonColumn = DATA_JSON_DESIGNERS.has(designerId)
        ? "data_json"
        : "badge_json";
      return ((data ?? []) as unknown as RawRow[]).map((row) => ({
        designerId,
        productLabel: def.label,
        designId: String(row.design_id ?? ""),
        quantity:
          typeof row.quantity === "number" && row.quantity > 0
            ? row.quantity
            : 1,
        lines: extractLines(row, jsonColumn),
        ...(safeHttpUrl(row.thumbnail_url)
          ? { thumbnailUrl: safeHttpUrl(row.thumbnail_url) }
          : {}),
        ...(safeHttpUrl(row.full_image_url)
          ? { proofUrl: safeHttpUrl(row.full_image_url) }
          : {}),
        ...(safeHttpUrl(row.uploaded_image_url)
          ? { uploadedImageUrl: safeHttpUrl(row.uploaded_image_url) }
          : {}),
      }));
    }),
  );

  return batches.flat();
}
