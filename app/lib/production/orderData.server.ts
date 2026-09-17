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
import {
  BADGE_ICON_LABELS,
  badgeIconPublicSrc,
  isBadgeIconId,
} from "~/constants/badgeIcons";
import { getCustomBackgroundDisplayName } from "~/utils/badgeCustomBackgrounds";
import {
  getTemplateDesignBox,
  loadTemplateById,
} from "~/utils/templates-canonical";
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
  iconUrl?: string;
  iconLabel?: string;
  printSvgUrl?: string;
  secondarySvgUrl?: string;
};

type RawRow = Record<string, unknown>;

const DATA_JSON_DESIGNERS = new Set<DesignerId>([
  "desk-sign",
  "gavel",
  "pen",
  "trophy",
]);

const NESTED_DESIGN_KEYS = [
  "badge",
  "design",
  "designData",
  "design_data",
  "data",
  "payload",
  "item",
] as const;

function appOrigin(): string {
  const raw =
    process.env.SHOPIFY_APP_URL ||
    process.env.APPLICATION_URL ||
    "https://all-quality-design-tool.vercel.app";
  return raw.replace(/\/$/, "");
}

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

function coerceArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : coerceArray(parsed);
    } catch {
      return [];
    }
  }
  const record = asRecord(value);
  if (!record) return [];
  const keys = Object.keys(record);
  if (keys.length > 0 && keys.every((key) => /^\d+$/.test(key))) {
    return keys
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => record[key]);
  }
  return [];
}

function looksLikeDesign(record: RawRow | null): boolean {
  if (!record) return false;
  return (
    coerceArray(record.lines).length > 0 ||
    typeof record.templateId === "string" ||
    typeof record.gavelStyle === "string" ||
    typeof record.penStyle === "string" ||
    typeof record.trophyProductId === "string" ||
    typeof record.deskSignMaterial === "string" ||
    typeof record.backing === "string"
  );
}

function unwrapDesign(raw: unknown): RawRow | null {
  if (Array.isArray(raw) && raw.length > 0) {
    return unwrapDesign(raw[0]);
  }
  const record = asRecord(raw);
  if (!record) return null;

  if (coerceArray(record.lines).length === 0) {
    for (const key of NESTED_DESIGN_KEYS) {
      const nested = unwrapDesign(record[key]);
      if (nested && coerceArray(nested.lines).length > 0) return nested;
    }
    const fromList =
      coerceArray(record.allBadges)[0] ??
      coerceArray(record.badges)[0] ??
      coerceArray(record.multipleBadges)[0];
    if (fromList) {
      const nested = unwrapDesign(fromList);
      if (nested && coerceArray(nested.lines).length > 0) return nested;
    }
  }

  if (looksLikeDesign(record)) return record;
  return record;
}

function designsFromPayload(payload: unknown): RawRow[] {
  const record = asRecord(payload);
  if (!record) {
    if (Array.isArray(payload)) {
      return payload
        .map((entry) => unwrapDesign(entry))
        .filter((entry): entry is RawRow => entry != null);
    }
    return [];
  }
  if (looksLikeDesign(record)) return [record];
  const list =
    coerceArray(record.allBadges).length > 0
      ? coerceArray(record.allBadges)
      : coerceArray(record.badges).length > 0
        ? coerceArray(record.badges)
        : coerceArray(record.multipleBadges);
  if (list.length > 1) {
    return list
      .map((entry) => unwrapDesign(entry))
      .filter((entry): entry is RawRow => entry != null);
  }
  const single = unwrapDesign(record);
  return single ? [single] : [];
}

function payloadFromRow(row: RawRow, designerId: DesignerId): unknown {
  const preferred = DATA_JSON_DESIGNERS.has(designerId)
    ? row.data_json
    : row.badge_json;
  return preferred ?? row.badge_json ?? row.data_json ?? null;
}

function titleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function designBoxHeightPx(
  designerId: DesignerId,
  design: RawRow | null,
): number {
  const templateId =
    typeof design?.templateId === "string" ? design.templateId : undefined;
  if (templateId) {
    const template = loadTemplateById(templateId);
    if (template) {
      const height = getTemplateDesignBox(template).height;
      if (height > 0) return height;
    }
    if (templateId.includes("1.5")) return 144;
  }
  if (designerId === "badge") return 96;
  return 96;
}

function lineSize(
  line: RawRow,
  designerId: DesignerId,
  design: RawRow | null,
): string | undefined {
  const parts: string[] = [];
  const fontSize =
    typeof line.fontSize === "number" && Number.isFinite(line.fontSize)
      ? line.fontSize
      : typeof line.size === "number" && Number.isFinite(line.size)
        ? line.size
        : undefined;
  if (fontSize != null) {
    parts.push(`${Math.round(fontSize * 0.75)}pt`);
    parts.push(`${Math.round(fontSize)}px`);
  } else if (typeof line.sizeNorm === "number" && Number.isFinite(line.sizeNorm)) {
    const heightPx = designBoxHeightPx(designerId, design);
    const percent = `${Math.round(line.sizeNorm * 100)}%`;
    if (designerId === "gavel") {
      parts.push(`${Math.round(line.sizeNorm * GAVEL_BAND_HEIGHT_IN * 72)}pt`);
    } else {
      parts.push(`${Math.round(line.sizeNorm * heightPx * 0.75)}pt`);
      parts.push(`${Math.round(line.sizeNorm * heightPx)}px`);
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

function readLineText(line: RawRow): string {
  for (const key of ["text", "lineText", "content", "value"]) {
    const value = line[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function mapLine(
  rawLine: unknown,
  designerId: DesignerId,
  design: RawRow | null,
): ProductionTextLine | null {
  const line = asRecord(rawLine);
  const text = line ? readLineText(line) : "";
  if (!line || !text) return null;
  const fontFamilyRaw = line.fontFamily ?? line.font ?? line.font_family;
  const colorRaw = line.color ?? line.fontColor;
  const alignRaw = line.align ?? line.alignment;
  const size = lineSize(line, designerId, design);
  return {
    text,
    fontFamily:
      typeof fontFamilyRaw === "string" && fontFamilyRaw.trim()
        ? fontFamilyRaw.trim()
        : "Roboto",
    ...(typeof colorRaw === "string" && colorRaw.trim()
      ? { color: colorRaw.trim() }
      : {}),
    ...(typeof alignRaw === "string" && alignRaw.trim()
      ? { alignment: titleCase(alignRaw.trim()) }
      : {}),
    ...(size ? { size } : {}),
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
  const lines: ProductionTextLine[] = [];
  for (const rawLine of coerceArray(rawLines).slice(0, 12)) {
    const line = mapLine(rawLine, designerId, design);
    if (line) lines.push(line);
  }
  return lines;
}

function fallbackFlatLines(row: RawRow, design: RawRow | null): ProductionTextLine[] {
  const lines: ProductionTextLine[] = [];
  const sources = [design, row].filter((source): source is RawRow => source != null);
  for (const source of sources) {
    for (let index = 1; index <= 6; index++) {
      const text = source[`line_${index}_text`];
      if (typeof text !== "string" || !text.trim()) continue;
      const font = source[`line_${index}_font`];
      const color = source[`line_${index}_color`];
      const alignment = source[`line_${index}_alignment`];
      const size = source[`line_${index}_font_size`];
      lines.push({
        text: text.trim(),
        fontFamily:
          typeof font === "string" && font.trim() ? font.trim() : "Roboto",
        ...(typeof color === "string" ? { color } : {}),
        ...(typeof alignment === "string"
          ? { alignment: titleCase(alignment) }
          : {}),
        ...(typeof size === "number"
          ? { size: `${Math.round(size * 0.75)}pt · ${size}px` }
          : {}),
        ...(source[`line_${index}_bold`] === true ? { bold: true } : {}),
        ...(source[`line_${index}_italicize`] === true ? { italic: true } : {}),
        ...(source[`line_${index}_underline`] === true ? { underline: true } : {}),
      });
    }
    if (lines.length > 0) return lines;
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
  design: RawRow | null,
): { groups: ProductionLineGroup[]; lines: ProductionTextLine[] } {
  const bandLines = mapLines(design?.lines, designerId, design);
  const groups: ProductionLineGroup[] = [];

  const primary =
    bandLines.length > 0 ? bandLines : fallbackFlatLines(row, design);
  if (primary.length > 0) {
    groups.push({
      heading: designerId === "gavel" ? "Band text" : "Text lines",
      lines: primary,
    });
  }

  if (designerId === "pen" && design) {
    const caseLines = linesFromMultilineText(
      design.penCaseBandText,
      primary[0] ?? null,
    );
    if (caseLines.length > 0) {
      groups.push({ heading: "Case band text", lines: caseLines });
    }
    const capLines = linesFromMultilineText(
      design.penCapText,
      primary[0] ?? null,
    );
    if (capLines.length > 0) {
      groups.push({ heading: "Cap text", lines: capLines });
    }
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

function pushStringSpec(
  specs: ProductionSpec[],
  label: string,
  value: unknown,
  format: (raw: string) => string = titleCase,
) {
  if (typeof value !== "string" || !value.trim()) return;
  specs.push({ label, value: format(value.trim()) });
}

function extractGavelSpecs(design: RawRow): ProductionSpec[] {
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
  const bagSelection =
    design.gavelBagSelection === "gavel" ||
    design.gavelBagSelection === "secondary" ||
    design.gavelBagSelection === "both"
      ? design.gavelBagSelection
      : design.gavelSuedeBag === true
        ? "gavel"
        : "none";
  specs.push({
    label: "Options",
    value: formatGavelOptionSummary({
      productType,
      soundBlock,
      suedeBag: design.gavelSuedeBag === true,
      bagSelection,
      soundBlockShape:
        design.gavelSoundBlockShape === "round" ? "round" : "square",
      standFinish: design.gavelStandFinish === "silver" ? "silver" : "gold",
      productionMethod:
        design.gavelProductionMethod === "uvprint" ? "uvprint" : "engrave",
    }),
  });

  pushStringSpec(specs, "Text size", design.gavelTextSizePreset);
  pushStringSpec(specs, "Backing", design.backing);
  pushStringSpec(specs, "Handle", design.gavelHandleLength);
  if (typeof design.gavelProductType === "string" && design.gavelProductType) {
    specs.push({
      label: "Product",
      value: productType === "stand" ? "Gavel + stand" : "Gavel",
    });
  }
  return specs;
}

function extractSpecs(
  row: RawRow,
  designerId: DesignerId,
  design: RawRow | null,
): ProductionSpec[] {
  if (!design) return [];
  if (designerId === "gavel") return extractGavelSpecs(design);

  const specs: ProductionSpec[] = [];
  pushStringSpec(specs, "Template", design.templateId);
  if (typeof design.backgroundColor === "string" && design.backgroundColor.trim()) {
    specs.push({ label: "Background", value: design.backgroundColor.trim() });
  }

  if (designerId === "badge") {
    pushStringSpec(specs, "Backing", design.backing);
    const iconId =
      typeof design.badgeIconId === "string" ? design.badgeIconId : undefined;
    if (isBadgeIconId(iconId)) {
      specs.push({ label: "Icon", value: BADGE_ICON_LABELS[iconId] });
    } else {
      pushStringSpec(specs, "Icon", design.badgeIconId);
    }
    if (typeof design.customBadgeBackgroundId === "string") {
      const name = getCustomBackgroundDisplayName(design.customBadgeBackgroundId);
      specs.push({
        label: "Artwork",
        value: name ?? titleCase(design.customBadgeBackgroundId),
      });
    }
  }

  if (designerId === "desk-sign") {
    pushStringSpec(specs, "Material", design.deskSignMaterial);
    pushStringSpec(specs, "Size", design.deskSignSize, (value) =>
      value.replace(/x/i, " × "),
    );
    pushStringSpec(specs, "Acrylic finish", design.deskSignAcrylicFinish);
    pushStringSpec(specs, "Mount", design.deskSignMountType);
    pushStringSpec(specs, "Hardware", design.deskSignAluminumColor);
    pushStringSpec(specs, "Profession", design.deskSignProfessionId);
  }

  if (designerId === "sign") {
    pushStringSpec(specs, "Motif", design.designerMotif);
    if (design.signBorderOptionId === "none" || design.signBorderEnabled === false) {
      specs.push({ label: "Border", value: "None" });
    } else {
      pushStringSpec(specs, "Border", design.signBorderStyleId);
    }
    if (typeof design.borderColor === "string" && design.borderColor.trim()) {
      specs.push({ label: "Border color", value: design.borderColor.trim() });
    }
  }

  if (designerId === "pen") {
    pushStringSpec(specs, "Style", design.penStyle);
    pushStringSpec(specs, "Case band", design.penCaseBandMode);
    pushStringSpec(specs, "Cap", design.penCapMode);
  }

  if (designerId === "trophy") {
    pushStringSpec(specs, "Award", design.trophyProductLabel);
    pushStringSpec(specs, "Plate", design.trophyPlateLabel);
    const first = asRecord(coerceArray(design.lines)[0]);
    if (first && typeof first.fontFamily === "string") {
      pushStringSpec(specs, "Font", first.fontFamily);
    }
  }

  const meta = asRecord(row.design_meta);
  if (meta) {
    pushStringSpec(specs, "Sign size", meta.selectedSignSizeTemplateId);
    pushStringSpec(specs, "Plaque layout", meta.selectedPlaqueLayoutId);
    pushStringSpec(specs, "Plaque size", meta.selectedPlaqueSize);
  }

  return specs;
}

function extractIcon(design: RawRow | null): {
  iconUrl?: string;
  iconLabel?: string;
} {
  const iconId =
    typeof design?.badgeIconId === "string" ? design.badgeIconId.trim() : "";
  if (!isBadgeIconId(iconId)) return {};
  return {
    iconUrl: `${appOrigin()}${badgeIconPublicSrc(iconId)}`,
    iconLabel: BADGE_ICON_LABELS[iconId],
  };
}

function extractUploadedUrl(row: RawRow, design: RawRow | null): string | undefined {
  return (
    safeHttpUrl(row.uploaded_image_url) ??
    safeHttpUrl(asRecord(design?.logo)?.src) ??
    safeHttpUrl(asRecord(design?.backgroundImage)?.src)
  );
}

function numericOrderId(orderId: string): string | null {
  const trimmed = orderId.trim();
  const gidMatch = trimmed.match(/^gid:\/\/shopify\/Order\/(\d+)$/);
  if (gidMatch) return gidMatch[1];
  return /^\d+$/.test(trimmed) ? trimmed : null;
}

function shopCandidates(shop: string): string[] {
  const host = shop.trim().toLowerCase();
  const handle = host.replace(/\.myshopify\.com$/, "");
  return [...new Set([host, handle, `${handle}.myshopify.com`].filter(Boolean))];
}

function quoteOrFilter(column: string, values: string[]): string {
  return values
    .map((value) => `${column}.eq."${value.replace(/"/g, '\\"')}"`)
    .join(",");
}

function lineItemLabel(
  row: RawRow,
  designerId: DesignerId,
  indexInType: number,
  typeCount: number,
): string {
  const def = getDesignerConfig(designerId);
  if (typeCount <= 1) return def.label;
  const raw = row[def.lineIdColumn];
  if (typeof raw === "string") {
    const suffix = raw.split("-").pop();
    if (suffix && /^\d+$/.test(suffix)) {
      return `${def.label} ${Number(suffix) + 1}`;
    }
  }
  return `${def.label} ${indexInType + 1}`;
}

function toItem(
  row: RawRow,
  designerId: DesignerId,
  design: RawRow | null,
  productLabel: string,
): ProductionOrderItem {
  const { groups, lines } = extractLineGroups(row, designerId, design);
  const icon = extractIcon(design);
  const uploadedImageUrl = extractUploadedUrl(row, design);
  if (lines.length === 0) {
    console.warn("[production-admin] no text lines parsed", {
      designerId,
      designId: row.design_id,
      jsonKeys: design ? Object.keys(design).slice(0, 24) : [],
      hasBadgeJson: row.badge_json != null,
      hasDataJson: row.data_json != null,
    });
  }
  return {
    designerId,
    productLabel,
    designId: String(row.design_id ?? ""),
    quantity:
      typeof row.quantity === "number" && row.quantity > 0 ? row.quantity : 1,
    lines,
    lineGroups: groups,
    specs: extractSpecs(row, designerId, design),
    ...(safeHttpUrl(row.thumbnail_url)
      ? { thumbnailUrl: safeHttpUrl(row.thumbnail_url) }
      : {}),
    ...(safeHttpUrl(row.full_image_url)
      ? { proofUrl: safeHttpUrl(row.full_image_url) }
      : {}),
    ...(uploadedImageUrl ? { uploadedImageUrl } : {}),
    ...(icon.iconUrl ? { iconUrl: icon.iconUrl } : {}),
    ...(icon.iconLabel ? { iconLabel: icon.iconLabel } : {}),
    ...(safeHttpUrl(row.print_svg_url)
      ? { printSvgUrl: safeHttpUrl(row.print_svg_url) }
      : {}),
    ...(safeHttpUrl(row.secondary_svg_url)
      ? { secondarySvgUrl: safeHttpUrl(row.secondary_svg_url) }
      : {}),
  };
}

function rowsToItems(rows: RawRow[], designerId: DesignerId): ProductionOrderItem[] {
  const items: ProductionOrderItem[] = [];
  rows.forEach((row, rowIndex) => {
    const designs = designsFromPayload(payloadFromRow(row, designerId));
    const designsOrFallback = designs.length > 0 ? designs : [null];
    designsOrFallback.forEach((design, designIndex) => {
      items.push(
        toItem(
          row,
          designerId,
          design,
          lineItemLabel(
            row,
            designerId,
            rowIndex + designIndex,
            rows.length + designsOrFallback.length - 1,
          ),
        ),
      );
    });
  });

  const counts = new Map<DesignerId, number>();
  for (const item of items) {
    counts.set(item.designerId, (counts.get(item.designerId) ?? 0) + 1);
  }
  return items.map((item) => {
    const typeCount = counts.get(item.designerId) ?? 1;
    if (typeCount <= 1) {
      return { ...item, productLabel: getDesignerConfig(item.designerId).label };
    }
    const sameType = items.filter((other) => other.designerId === item.designerId);
    const typeIndex = sameType.indexOf(item);
    return {
      ...item,
      productLabel: `${getDesignerConfig(item.designerId).label} ${typeIndex + 1}`,
    };
  });
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

  const shopFilter = `${quoteOrFilter("shop_id", shopCandidates(shop))},shop_id.is.null`;

  const batches = await Promise.all(
    DESIGNER_IDS.map(async (designerId) => {
      const def = getDesignerConfig(designerId);
      const query = (columns: string) =>
        db
          .from(def.orderItemsTable)
          .select(columns)
          .eq("shopify_order_id", numericId)
          .or(shopFilter)
          .order("created_at", { ascending: true });

      let { data, error } = await query("*");
      if (error && /column|schema cache|Could not find/i.test(error.message)) {
        ({ data, error } = await query(
          "design_id,quantity,thumbnail_url,full_image_url,badge_json,data_json,created_at,is_qa_test,uploaded_image_url,print_svg_url,secondary_svg_url,design_meta,shop_id,shopify_order_id",
        ));
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

      const rows = ((data ?? []) as unknown as RawRow[]).filter(
        (row) => row.is_qa_test !== true,
      );
      return rowsToItems(rows, designerId);
    }),
  );

  return batches.flat();
}
