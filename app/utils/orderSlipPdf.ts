/**
 * Server-side order-slip PDF generator.
 * Builds a PDF from Supabase badge_order_items + order quantities (e.g. after checkout).
 * Uses thumbnail_url from each row; no DOM/canvas required.
 */
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { BadgeOrderItem } from "./supabase";

const PAGE_HEIGHT = 841.89;
const PAGE_WIDTH = 595.28;
const MARGIN = 30;
const ROW_HEIGHT = 16;
const HEADER_HEIGHT = 18;
const IMAGE_MAX_HEIGHT_PT = 120;

export interface OrderSlipItem {
  item: BadgeOrderItem;
  quantity: number;
}

/**
 * Fetch image bytes from URL (thumbnail). Returns PNG bytes or null if fetch fails.
 */
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

/**
 * Generate order-slip PDF as Uint8Array from order line items (with quantities).
 * One section per entry: thumbnail from item.thumbnail_url + table (Line 1–4, Quantity).
 */
export async function generateOrderSlipPdf(
  items: OrderSlipItem[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  let y = PAGE_HEIGHT - 40;

  for (let idx = 0; idx < items.length; idx++) {
    const { item, quantity } = items[idx];
    const sectionTopY = y;

    const lines = [
      item.line_1_text,
      item.line_2_text,
      item.line_3_text,
      item.line_4_text,
    ].filter((t) => t != null && String(t).trim() !== "");
    const tableRows = lines.length + 1; // +1 for Quantity
    const tableHeight = tableRows * ROW_HEIGHT;
    const estimatedSectionHeight =
      HEADER_HEIGHT + 12 + Math.max(IMAGE_MAX_HEIGHT_PT, tableHeight) + 20;

    if (y - estimatedSectionHeight < 40) {
      page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - 40;
    }

    page.drawText(`Badge ${idx + 1}`, {
      x: MARGIN,
      y: y - HEADER_HEIGHT,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    y -= HEADER_HEIGHT + 12;

    let imageHeightPt = 0;
    const tableX = MARGIN + 200;
    const tableWidth = PAGE_WIDTH - MARGIN - tableX - MARGIN;

    if (item.thumbnail_url) {
      const imgBytes = await fetchImageBytes(item.thumbnail_url);
      if (imgBytes && imgBytes.length > 0) {
        try {
          const pdfImage = await pdfDoc.embedPng(imgBytes);
          const aspect = pdfImage.height / pdfImage.width;
          const w = Math.min(180, pdfImage.width * 0.75);
          const h = Math.min(IMAGE_MAX_HEIGHT_PT, w * aspect);
          imageHeightPt = h;
          page.drawImage(pdfImage, {
            x: MARGIN,
            y: y - h,
            width: w,
            height: h,
          });
        } catch {
          // ignore embed errors
        }
      }
    }

    let tableY = y;
    let rowIdx = 0;
    lines.forEach((text, lineIdx) => {
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
      page.drawText(`Line ${lineIdx + 1}: "${String(text).trim()}"`, {
        x: tableX + 5,
        y: rowY + 4,
        size: 8,
        font,
        color: rgb(0, 0, 0),
      });
      rowIdx++;
    });
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

    const contentHeight = Math.max(imageHeightPt, tableHeight);
    y = sectionTopY - HEADER_HEIGHT - 12 - contentHeight - 20;
  }

  return new Uint8Array(await pdfDoc.save());
}
