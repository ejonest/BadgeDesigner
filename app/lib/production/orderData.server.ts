import {
  DESIGNER_IDS,
  getDesignerConfig,
  type DesignerId,
} from "~/config/designers";
import {
  GAVEL_BAND_HEIGHT_IN,
  formatGavelOptionSummary,
  formatGavelOrderFinish,
} from "~/constants/gavelStyles";
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

export type ProductionSpec = {
  label: string;
  value: string;
};

export type ProductionLineGroup = {
  heading: string;
  lines: ProductionTextLine[];
};

export type ProductionOrderItem = {
  designerId: DesignerId;
  productLabel: string;
  designId: string;
  quantity: number;
  lines: ProductionTextLine[];
  lineGroups: ProductionLineGroup[];
  specs: ProductionSpec[];
  thumbnailUrl?: string;
  proofUrl?: string;
  uploadedImageUrl?: string;
  printSvgUrl?: string;
  secondarySvgUrl?: string;
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

const SECONDARY_SVG_DESIGNERS = new Set<DesignerId>(["gavel", "pen"]);

/** Badge templates treat design-box height as 70pt (see app/constants/badge.ts). */
const BADGE_DESIGN_BOX_PT = 70;

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
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    try {
      return asRecord(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as RawRow)
    : null;
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function lineSize(
  line: RawRow,
  designerId: DesignerId,
  design: RawRow | null,
): string | undefined {
  const parts: string[] = [];
  if (typeof line.fontSize === "number" && Number.isFinite(line.fontSize)) {
    parts.push(`${Math.round(line.fontSize * 0.75)}pt`);
    parts.push(`${Math.round(line.fontSize)}px`);
  } else if (typeof line.sizeNorm === "number" && Number.isFinite(line.sizeNorm)) {
    const percent = `${Math.round(line.sizeNorm * 100)}%`;
    if (designerId === "gavel") {
      parts.push(`${Math.round(line.sizeNorm * GAVEL_BAND_HEIGHT_IN * 72)}pt`);
    } else if (designerId === "badge") {
      parts.push(`${Math.round(line.sizeNorm * BADGE_DESIGN_BOX_PT)}pt`);
    }
    parts.push(percent);
  }
  if (
    designerId === "gavel" &&
    typeof design?.gavelTextSizePreset === "string" &&
    design.gavelTextSizePreset.trim()
  ) {
    parts.push(design.gavelTextSizePreset.trim());
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function mapLine(
  rawLine: unknown,
  designerId: DesignerId,
  design: RawRow | null,
): ProductionTextLine | null {
  const line = asRecord(rawLine);
  const text = typeof line?.text === "string" ? line.text.trim() : "";
  if (!line || !text) return null;
  return {
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
    ...(lineSize(line, designerId, design)
      ? { size: lineSize(line, designerId, design) }
      : {}),
    ...(line.bold === true ? { bold: true } : {}),
    ...(line.italic === true ? { italic: true } : {}),
    ...(line.underline === true ? { underline: true } : {}),
  };
}

function mapLines(
  rawLines: unknown,
  designerId: DesignerId,
  design: RawRow | null,
): ProductionTextLine[] {
  if (!Array.isArray(rawLines)) return [];
  const lines: ProductionTextLine[] = [];
  for (const rawLine of rawLines.slice(0, 12)) {
    const line = mapLine(rawLine, designerId, design);
    if (line) lines.push(line);
  }
  return lines;
}

function fallbackFlatLines(row: RawRow): ProductionTextLine[] {
  const lines: ProductionTextLine[] = [];
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
      ...(typeof size === "number" ? { size: `${Math.round(size * 0.75)}pt · ${size}px` } : {}),
      ...(row[`line_${index}_bold`] === true ? { bold: true } : {}),
      ...(row[`line_${index}_italicize`] === true ? { italic: true } : {}),
      ...(row[`line_${index}_underline`] === true ? { underline: true } : {}),
    });
  }
  return lines;
}

function linesFromMultilineText(
  value: unknown,
  template: ProductionTextLine | null,
): ProductionTextLine[] {
  if (typeof value !== "string") return [];
  return value
    .split("\n")
    .map((text) => text.trim())
    .filter(Boolean)
    .map((text) => ({
      text,
      fontFamily: template?.fontFamily ?? "Georgia",
      ...(template?.color ? { color: template.color } : {}),
      ...(template?.alignment ? { alignment: template.alignment } : {}),
      ...(template?.size ? { size: template.size } : {}),
    }));
}

function extractLineGroups(
  row: RawRow,
  designerId: DesignerId,
  jsonColumn: "badge_json" | "data_json",
): { groups: ProductionLineGroup[]; lines: ProductionTextLine[] } {
  const design = asRecord(row[jsonColumn]);
  const bandLines = mapLines(design?.lines, designerId, design);
  const groups: ProductionLineGroup[] = [];

  const primary =
    bandLines.length > 0 ? bandLines : fallbackFlatLines(row);
  if (primary.length > 0) {
    groups.push({
      heading: designerId === "gavel" ? "Band text" : "Text lines",
      lines: primary,
    });
  }

  if (designerId === "gavel" && design) {
    const soundLines = mapLines(design.gavelSoundBlockLines, designerId, design);
    const soundFromText =
      soundLines.length > 0
        ? soundLines
        : linesFromMultilineText(design.gavelSoundBlockText, primary[0] ?? null);
    if (soundFromText.length > 0) {
      groups.push({ heading: "Sound block text", lines: soundFromText });
    }

    const plateLines = mapLines(design.gavelStandPlateLines, designerId, design);
    if (plateLines.length > 0) {
      groups.push({ heading: "Stand plate text", lines: plateLines });
    }
  }

  return {
    groups,
    lines: groups.flatMap((group) => group.lines),
  };
}

function extractSpecs(row: RawRow, designerId: DesignerId): ProductionSpec[] {
  if (designerId !== "gavel") return [];
  const jsonColumn = "data_json";
  const design = asRecord(row[jsonColumn]);
  if (!design) return [];

  const specs: ProductionSpec[] = [];
  const style =
    typeof design.gavelStyle === "string" ? design.gavelStyle : undefined;
  const bandFinish =
    typeof design.gavelBandFinish === "string"
      ? design.gavelBandFinish
      : undefined;
  if (style || bandFinish) {
    specs.push({
      label: "Style",
      value: formatGavelOrderFinish(style, bandFinish),
    });
  }

  const productType = design.gavelProductType === "stand" ? "stand" : "gavel";
  const soundBlock =
    design.gavelSoundBlock === "plain" || design.gavelSoundBlock === "engraved"
      ? design.gavelSoundBlock
      : "none";
  specs.push({
    label: "Options",
    value: formatGavelOptionSummary({
      productType,
      soundBlock,
      suedeBag: design.gavelSuedeBag === true,
      soundBlockShape:
        design.gavelSoundBlockShape === "round" ? "round" : "square",
      standFinish: design.gavelStandFinish === "silver" ? "silver" : "gold",
      productionMethod:
        design.gavelProductionMethod === "uvprint" ? "uvprint" : "engrave",
    }),
  });

  if (typeof design.gavelTextSizePreset === "string" && design.gavelTextSizePreset) {
    specs.push({
      label: "Text size",
      value: titleCase(design.gavelTextSizePreset),
    });
  }
  if (typeof design.backing === "string" && design.backing.trim()) {
    specs.push({ label: "Backing", value: titleCase(design.backing) });
  }
  if (
    typeof design.gavelHandleLength === "string" &&
    design.gavelHandleLength.trim()
  ) {
    specs.push({
      label: "Handle",
      value: titleCase(design.gavelHandleLength),
    });
  }
  if (typeof design.gavelProductType === "string" && design.gavelProductType) {
    specs.push({
      label: "Product",
      value: productType === "stand" ? "Gavel + stand" : "Gavel",
    });
  }
  return specs;
}

function numericOrderId(orderId: string): string | null {
  const trimmed = orderId.trim();
  const gidMatch = trimmed.match(/^gid:\/\/shopify\/Order\/(\d+)$/);
  if (gidMatch) return gidMatch[1];
  return /^\d+$/.test(trimmed) ? trimmed : null;
}

function selectColumns(designerId: DesignerId, includeSvg: boolean): string {
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
    "is_qa_test",
  ];
  if (UPLOAD_DESIGNERS.has(designerId)) columns.push("uploaded_image_url");
  if (includeSvg) {
    columns.push("print_svg_url");
    if (SECONDARY_SVG_DESIGNERS.has(designerId)) {
      columns.push("secondary_svg_url");
    }
  }
  return columns.join(",");
}

function toItem(row: RawRow, designerId: DesignerId): ProductionOrderItem {
  const def = getDesignerConfig(designerId);
  const jsonColumn = DATA_JSON_DESIGNERS.has(designerId)
    ? "data_json"
    : "badge_json";
  const { groups, lines } = extractLineGroups(row, designerId, jsonColumn);
  return {
    designerId,
    productLabel: def.label,
    designId: String(row.design_id ?? ""),
    quantity:
      typeof row.quantity === "number" && row.quantity > 0 ? row.quantity : 1,
    lines,
    lineGroups: groups,
    specs: extractSpecs(row, designerId),
    ...(safeHttpUrl(row.thumbnail_url)
      ? { thumbnailUrl: safeHttpUrl(row.thumbnail_url) }
      : {}),
    ...(safeHttpUrl(row.full_image_url)
      ? { proofUrl: safeHttpUrl(row.full_image_url) }
      : {}),
    ...(safeHttpUrl(row.uploaded_image_url)
      ? { uploadedImageUrl: safeHttpUrl(row.uploaded_image_url) }
      : {}),
    ...(safeHttpUrl(row.print_svg_url)
      ? { printSvgUrl: safeHttpUrl(row.print_svg_url) }
      : {}),
    ...(safeHttpUrl(row.secondary_svg_url)
      ? { secondarySvgUrl: safeHttpUrl(row.secondary_svg_url) }
      : {}),
  };
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
      const query = (includeSvg: boolean) =>
        db
          .from(def.orderItemsTable)
          .select(selectColumns(designerId, includeSvg))
          .eq("shopify_order_id", numericId)
          .or(`shop_id.eq."${shop}",shop_id.is.null`)
          .order("created_at", { ascending: true });

      let { data, error } = await query(true);
      if (
        error &&
        /print_svg_url|secondary_svg_url/i.test(error.message)
      ) {
        ({ data, error } = await query(false));
      }

      if (error) {
        if (/does not exist|schema cache|Could not find/i.test(error.message)) {
          console.warn(
            `[production-admin] skipping ${def.orderItemsTable}: ${error.message}`,
          );
          return [] as ProductionOrderItem[];
        }
        throw new Error(`${def.orderItemsTable}: ${error.message}`);
      }

      return ((data ?? []) as unknown as RawRow[])
        .filter((row) => row.is_qa_test !== true)
        .map((row) => toItem(row, designerId));
    }),
  );

  return batches.flat();
}
