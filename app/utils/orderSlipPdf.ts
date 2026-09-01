/**
 * Server-side order-slip PDF generator.
 * Matches the add-to-cart proof PDF layout exactly (same as pdfGenerator.generatePDFAsBlob):
 * one section per badge with image on left, table on right (4 rows per line: Line, Font, Color, Alignment + Quantity);
 * up to 6 text lines per item when present (e.g. signs).
 * then Background text below. Uses order quantities and only includes badges that are in the order (removed items excluded).
 */
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { BadgeOrderItem } from "./supabase";
import { getColorInfo } from "~/constants/colors";

// Match pdfGenerator.ts layout constants exactly
const PAGE_HEIGHT = 841.89;
const PAGE_WIDTH = 595.28;
const TOP_MARGIN = 40;
const BOTTOM_MARGIN = 40;
const HEADER_HEIGHT = 18;
const HEADER_GAP = 6;
const IMAGE_BOTTOM_GAP = 6;
const BACKGROUND_TEXT_HEIGHT = 12;
const SECTION_BOTTOM_PADDING = 14;
const MARGIN = 30;
const ROW_HEIGHT = 16;

// Default badge image area (rect-1x3 style: viewBox 336×144 px → pt)
const DEFAULT_IMAGE_WIDTH_PT = (288 + 48) * 0.75;
const DEFAULT_IMAGE_HEIGHT_PT = (96 + 48) * 0.75;

export interface OrderSlipItem {
  item: BadgeOrderItem;
  quantity: number;
  /** When set, use these PNG bytes for the badge image (avoids URL parsing; filled by link-order route). */
  imageBytes?: Uint8Array;
}

function extractHexFromColorField(value: string | undefined): string {
  if (!value || typeof value !== "string") return "#000000";
  const trimmed = value.trim();
  const hashIdx = trimmed.indexOf("#");
  if (hashIdx >= 0) {
    const hex = trimmed.slice(hashIdx);
    return hex.length >= 4 ? hex : "#000000";
  }
  return trimmed.startsWith("rgb") ? "#000000" : `#${trimmed}`;
}

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

export type GetImageBytes = (url: string) => Promise<Uint8Array | null>;

type SlipLineRow = {
  text: string;
  font: string;
  color: string;
  alignment: string;
};

/** Prefer badge_json / data_json (canonical designer state); fall back to flat columns for older rows. */
function getLineRows(item: BadgeOrderItem): SlipLineRow[] {
  const json = item.badge_json as
    | {
        lines?: Array<{
          text?: string;
          fontFamily?: string;
          color?: string;
          align?: string;
        }>;
      }
    | null
    | undefined;
  if (json && Array.isArray(json.lines)) {
    const rows: SlipLineRow[] = [];
    for (const line of json.lines.slice(0, 6)) {
      const trimmed = (line?.text ?? "").trim();
      if (!trimmed) continue;
      rows.push({
        text: trimmed,
        font: line.fontFamily?.trim() || "Roboto",
        color: line.color?.trim() || "#000000",
        alignment: line.align?.trim() || "Center",
      });
    }
    if (rows.length > 0) return rows;
  }

  const rows: SlipLineRow[] = [];
  const rec = item as unknown as Record<string, unknown>;
  for (let i = 1; i <= 6; i++) {
    const text = rec[`line_${i}_text`] as string | undefined;
    const trimmed = (text ?? "").trim();
    if (trimmed === "") continue;
    const font = rec[`line_${i}_font`] as string | undefined;
    const color = rec[`line_${i}_color`] as string | undefined;
    const alignment = rec[`line_${i}_alignment`] as string | undefined;
    rows.push({
      text: trimmed,
      font: font != null ? String(font) : "Roboto",
      color: color != null ? String(color) : "#000000",
      alignment: alignment != null ? String(alignment) : "Center",
    });
  }
  return rows;
}

function getBackgroundColorField(item: BadgeOrderItem): string | undefined {
  const json = item.badge_json as
    | { backgroundColor?: string }
    | null
    | undefined;
  if (json?.backgroundColor?.trim()) return json.backgroundColor.trim();
  return item.background_color;
}

/**
 * Generate order-slip PDF matching the add-to-cart proof layout.
 * Only items in the order are included (removed-from-cart badges are omitted). Quantities come from the order.
 * Pass getImageBytes (e.g. Supabase admin download) so images load when the bucket is private or fetch fails.
 */
export async function generateOrderSlipPdf(
  items: OrderSlipItem[],
  getImageBytes?: GetImageBytes,
): Promise<Uint8Array> {
  const loadImage = getImageBytes ?? fetchImageBytes;
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - TOP_MARGIN;

  for (let idx = 0; idx < items.length; idx++) {
    const { item, quantity } = items[idx];
    const lineRows = getLineRows(item);
    const lineCount = lineRows.length || 1;
    const estimatedTotalRows = lineCount * 4 + 1; // 4 rows per line + Quantity
    const estimatedTableHeight = estimatedTotalRows * ROW_HEIGHT;
    const imageWidthPt = DEFAULT_IMAGE_WIDTH_PT;
    const imageHeightPt = DEFAULT_IMAGE_HEIGHT_PT;
    const estimatedContentHeight = Math.max(imageHeightPt, estimatedTableHeight);
    const estimatedSectionHeight =
      HEADER_HEIGHT +
      HEADER_GAP +
      estimatedContentHeight +
      IMAGE_BOTTOM_GAP +
      BACKGROUND_TEXT_HEIGHT +
      SECTION_BOTTOM_PADDING;

    if (y - estimatedSectionHeight < BOTTOM_MARGIN) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - TOP_MARGIN;
    }

    const sectionTopY = y;

    // Image: use pre-filled imageBytes (PNG) when present; otherwise load by URL (thumbnail_url is PNG; full_image_url is SVG and cannot be embedded).
    const imageUrl = item.thumbnail_url || item.full_image_url;
    let imageWidth = imageWidthPt;
    let imageHeight = imageHeightPt;
    const imgBytes =
      items[idx].imageBytes ?? (imageUrl ? await loadImage(imageUrl) : null);
    if (imgBytes && imgBytes.length > 0) {
      let pdfImage: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
      try {
        pdfImage = await pdfDoc.embedPng(imgBytes);
      } catch {
        try {
          pdfImage = await pdfDoc.embedJpg(imgBytes);
        } catch {
          // skip image if neither PNG nor JPEG
        }
      }
      if (pdfImage) {
        const aspect = pdfImage.height / pdfImage.width;
        imageHeight = Math.min(imageHeightPt, imageWidthPt * aspect);
        imageWidth = Math.min(imageWidthPt, imageHeight / aspect);
        const imageTopY = sectionTopY - HEADER_HEIGHT - HEADER_GAP;
        page.drawImage(pdfImage, {
          x: MARGIN,
          y: imageTopY - imageHeight,
          width: imageWidth,
          height: imageHeight,
        });
      }
    }

    const tableX = MARGIN + imageWidthPt + 20;
    const tableWidth = PAGE_WIDTH - tableX - MARGIN;
    let tableY = sectionTopY - HEADER_HEIGHT - HEADER_GAP;

    const jsonMeta = item.badge_json as
      | { gavelStyle?: string; gavelBandFinish?: string }
      | null
      | undefined;
    const isGavel =
      Boolean(jsonMeta?.gavelStyle) ||
      String(item.badge_id ?? "").startsWith("gavel-");
    const isPen = String(item.badge_id ?? "").startsWith("pen-");
    const itemLabel = isGavel ? "Gavel" : isPen ? "Pen set" : "Badge";
    page.drawText(`${itemLabel} ${idx + 1}`, {
      x: MARGIN,
      y: sectionTopY - HEADER_HEIGHT,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    let rowIdx = 0;
    const lines =
      lineRows.length > 0 ? lineRows : [{ text: "", font: "Roboto", color: "#000000", alignment: "Center" }];
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const cleanText = (line.text ?? "").replace(/^"|"$/g, "").trim();
      const fontName = line.font ?? "Roboto";
      const textColor = extractHexFromColorField(line.color);
      const colorInfo = getColorInfo(textColor.startsWith("#") ? textColor : `#${textColor}`);
      const styleText = "Normal";
      const alignText = line.alignment ?? "Center";

      const rowY = tableY - (rowIdx + 1) * ROW_HEIGHT;
      page.drawRectangle({
        x: tableX,
        y: rowY,
        width: tableWidth,
        height: ROW_HEIGHT,
        color: rowIdx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.95, 0.95, 0.95),
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });
      page.drawText(`Line ${lineIdx + 1}: "${cleanText}"`, {
        x: tableX + 5,
        y: rowY + 4,
        size: 8,
        font,
        color: rgb(0, 0, 0),
      });
      rowIdx++;

      const fontRowY = tableY - (rowIdx + 1) * ROW_HEIGHT;
      page.drawRectangle({
        x: tableX,
        y: fontRowY,
        width: tableWidth,
        height: ROW_HEIGHT,
        color: rowIdx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.95, 0.95, 0.95),
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });
      page.drawText(`Font: ${fontName} 12pt (${styleText})`, {
        x: tableX + 5,
        y: fontRowY + 4,
        size: 8,
        font,
        color: rgb(0, 0, 0),
      });
      rowIdx++;

      const colorRowY = tableY - (rowIdx + 1) * ROW_HEIGHT;
      page.drawRectangle({
        x: tableX,
        y: colorRowY,
        width: tableWidth,
        height: ROW_HEIGHT,
        color: rowIdx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.95, 0.95, 0.95),
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });
      page.drawText(`Color: ${colorInfo.hex}`, {
        x: tableX + 5,
        y: colorRowY + 4,
        size: 8,
        font,
        color: rgb(0, 0, 0),
      });
      rowIdx++;

      const alignRowY = tableY - (rowIdx + 1) * ROW_HEIGHT;
      page.drawRectangle({
        x: tableX,
        y: alignRowY,
        width: tableWidth,
        height: ROW_HEIGHT,
        color: rowIdx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.95, 0.95, 0.95),
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });
      page.drawText(`Alignment: ${alignText}`, {
        x: tableX + 5,
        y: alignRowY + 4,
        size: 8,
        font,
        color: rgb(0, 0, 0),
      });
      rowIdx++;
    }

    const quantityRowY = tableY - (rowIdx + 1) * ROW_HEIGHT;
    page.drawRectangle({
      x: tableX,
      y: quantityRowY,
      width: tableWidth,
      height: ROW_HEIGHT,
      color: rowIdx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.95, 0.95, 0.95),
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.5,
    });
    page.drawText(`Quantity: ${quantity}`, {
      x: tableX + 5,
      y: quantityRowY + 4,
      size: 8,
      font,
      color: rgb(0, 0, 0),
    });
    rowIdx++;

    const tableHeight = rowIdx * ROW_HEIGHT;
    const contentHeight = Math.max(imageHeightPt, tableHeight);
    const contentBottomY = tableY - contentHeight;
    const bgHex = extractHexFromColorField(getBackgroundColorField(item));
    const bgColorInfo = getColorInfo(bgHex.startsWith("#") ? bgHex : `#${bgHex}`);

    const finishLabel =
      typeof item.finish === "string" && item.finish.trim()
        ? item.finish.trim()
        : "";
    page.drawText(
      (isGavel || isPen) && finishLabel
        ? `Finish: ${finishLabel}`
        : `Background: ${bgColorInfo.name} (${bgColorInfo.hex})`,
      {
      x: MARGIN,
      y: contentBottomY - IMAGE_BOTTOM_GAP - BACKGROUND_TEXT_HEIGHT,
      size: 9,
      font,
      color: rgb(0, 0, 0),
    });

    const sectionHeight =
      HEADER_HEIGHT +
      HEADER_GAP +
      contentHeight +
      IMAGE_BOTTOM_GAP +
      BACKGROUND_TEXT_HEIGHT +
      SECTION_BOTTOM_PADDING;
    y -= sectionHeight;
  }

  return new Uint8Array(await pdfDoc.save());
}
