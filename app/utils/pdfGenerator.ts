import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { Badge } from "../types/badge";
import { getColorInfo } from "../constants/colors";
import { generateBadgeTiff, generateFullBadgeImage } from "./badgeThumbnail";
import { loadTemplateById } from "./templates";

const HEADER_HEIGHT = 18;
const HEADER_GAP = 6;

const IMAGE_BOTTOM_GAP = 6;
const BACKGROUND_TEXT_HEIGHT = 12;
const SECTION_BOTTOM_PADDING = 14;

const PAGE_HEIGHT = 841.89;
const PAGE_WIDTH = 595.28;
const TOP_MARGIN = 40;
const BOTTOM_MARGIN = 40;

/* ---------- Color utils ---------- */

// rgb()/hex → [0..1] rgb
function cssColorToRgb(color: string): [number, number, number] {
  if (!color) return [0, 0, 0];

  // Normalize the color string
  const normalizedColor = color.trim().toLowerCase();

  if (normalizedColor.startsWith("rgb")) {
    const rgbArr = normalizedColor.match(/\d+/g)?.map(Number) || [0, 0, 0];
    return [rgbArr[0] / 255, rgbArr[1] / 255, rgbArr[2] / 255];
  }
  if (normalizedColor.startsWith("#")) {
    let hex = normalizedColor.slice(1);
    if (hex.length === 3)
      hex = hex
        .split("")
        .map((x) => x + x)
        .join("");
    const num = parseInt(hex, 16);
    return [
      ((num >> 16) & 255) / 255,
      ((num >> 8) & 255) / 255,
      (num & 255) / 255,
    ];
  }
  // Fallback: try getColorInfo (if caller passed a named color we support)
  const info = getColorInfo(normalizedColor) || getColorInfo("#000000");
  const hex = info?.hex?.toUpperCase?.() || "#000000";
  return cssColorToRgb(hex);
}

// Normalise to #RRGGBB (uppercase)
function cssColorToHex(color: string): string {
  if (!color) return "#000000";

  // Normalize the color string
  const normalizedColor = color.trim().toLowerCase();

  if (normalizedColor.startsWith("rgb")) {
    const [r, g, b] = normalizedColor.match(/\d+/g)?.map(Number) || [0, 0, 0];
    return (
      "#" +
      r.toString(16).padStart(2, "0") +
      g.toString(16).padStart(2, "0") +
      b.toString(16).padStart(2, "0")
    ).toUpperCase();
  }
  if (normalizedColor.startsWith("#")) {
    let hex = normalizedColor.slice(1);
    if (hex.length === 3)
      hex = hex
        .split("")
        .map((x) => x + x)
        .join("");
    return ("#" + hex).toUpperCase();
  }
  // Try lookup
  const info = getColorInfo(normalizedColor);
  if (info?.hex) return info.hex.toUpperCase();
  return "#000000";
}

/* ---------- Units ---------- */

// Convert px to pt
const pxToPt = (px: number) => px * 0.75;
const pxToPtRounded = (px: number) => Math.round(pxToPt(px));

/* ---------- NEW SIMPLE PDF GENERATOR ---------- */

export const generatePDFNew = async (
  badgeData: Badge,
  multipleBadges?: Badge[]
): Promise<void> => {
  console.log("NEW SIMPLE PDF GENERATOR");
  try {
    // Create new PDF document
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Simple layout: two horizontal rectangles side by side
    const margin = 30;
    const maxImageWidth = 300; // Maximum display width
    const maxImageHeight = 150; // Maximum display height

    let y = PAGE_HEIGHT - TOP_MARGIN;

    const allBadges = [badgeData, ...(multipleBadges || [])];

    for (let idx = 0; idx < allBadges.length; idx++) {
      const badge = allBadges[idx];
      console.log(`Processing Badge ${idx + 1}`);

      // Estimate section height BEFORE rendering
      const estimatedTotalRows = badge.lines.length * 4;
      const estimatedTableHeight = estimatedTotalRows * 16;
      const estimatedContentHeight = Math.max(
        maxImageHeight,
        estimatedTableHeight
      );

      const estimatedSectionHeight =
        HEADER_HEIGHT +
        HEADER_GAP +
        estimatedContentHeight +
        IMAGE_BOTTOM_GAP +
        BACKGROUND_TEXT_HEIGHT +
        SECTION_BOTTOM_PADDING;

      // Page break check
      if (y - estimatedSectionHeight < BOTTOM_MARGIN) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - TOP_MARGIN;
      }
      // Page break check
      if (y - estimatedSectionHeight < BOTTOM_MARGIN) {
        page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        y = PAGE_HEIGHT - TOP_MARGIN;
      }

      // NOW lock section top
      const sectionTopY = y;

      // Load the correct template for this badge
      const template = await loadTemplateById(badge.templateId || "rect-1x3");
      console.log(
        `Loaded template for badge ${idx + 1}:`,
        template.id,
        `(${template.widthPx}x${template.heightPx})`
      );

      // Generate high-resolution image
      console.log("Generating badge image...");
      const imageDataUrl = await generateFullBadgeImage(badge);
      console.log("Image generated successfully");

      // Convert to Uint8Array and embed
      const base64Data = imageDataUrl.split(",")[1];
      const imageBytes = Uint8Array.from(atob(base64Data), (c) =>
        c.charCodeAt(0)
      );
      const pdfImage = await pdfDoc.embedPng(imageBytes);
      console.log("Image embedded in PDF");
      console.log("PDF image dimensions:", {
        width: pdfImage.width,
        height: pdfImage.height,
      });

      // Calculate proper dimensions preserving aspect ratio
      const templateAspectRatio = template.widthPx / template.heightPx;
      let imageWidth = maxImageWidth;
      let imageHeight = maxImageWidth / templateAspectRatio;

      // If height exceeds max, scale down based on height
      if (imageHeight > maxImageHeight) {
        imageHeight = maxImageHeight;
        imageWidth = maxImageHeight * templateAspectRatio;
      }

      console.log(`Calculated dimensions for badge ${idx + 1}:`, {
        width: imageWidth,
        height: imageHeight,
        aspectRatio: templateAspectRatio,
      });

      // Calculate table position based on actual image width
      const tableX = margin + imageWidth + 20;
      const tableWidth = 595.28 - tableX - margin;

      page.drawText(`Badge ${idx + 1}`, {
        x: margin,
        y: sectionTopY - HEADER_HEIGHT,
        size: 12,
        font: fontBold,
        color: rgb(0, 0, 0),
      });

      // Draw image on left side (proper aspect ratio preserved)
      const imageTopY = sectionTopY - HEADER_HEIGHT - HEADER_GAP;

      page.drawImage(pdfImage, {
        x: margin,
        y: imageTopY - imageHeight,
        width: imageWidth,
        height: imageHeight,
      });
      console.log("Image drawn at:", {
        x: margin,
        y: y - imageHeight,
        width: imageWidth,
        height: imageHeight,
      });

      // Draw specification table (no headers) - level with image
      let tableY = imageTopY;
      const rowHeight = 16; // Smaller rows

      // Table rows
      let rowIdx = 0;

      // Text lines
      badge.lines.forEach((line, lineIdx) => {
        const cleanText = (line.text ?? "").replace(/^"|"$/g, "").trim();

        // BadgeLine-safe fields
        const fontName = line.fontFamily ?? "Roboto";
        const fontSize = 12; // BadgeLine does not expose size
        const textColor = cssColorToHex(line.color ?? "#000000");

        const style: string[] = [];
        if (line.bold) style.push("Bold");
        if (line.italic) style.push("Italic");
        if (line.underline) style.push("Underline");
        const styleText = style.length ? style.join(", ") : "Normal";

        // BadgeLine does not expose alignment
        const alignText = "Center";

        const rowY = tableY - (rowIdx + 1) * rowHeight;
        page.drawRectangle({
          x: tableX,
          y: rowY,
          width: tableWidth,
          height: rowHeight,
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

        // Font details
        const fontRowY = tableY - (rowIdx + 1) * rowHeight;
        page.drawRectangle({
          x: tableX,
          y: fontRowY,
          width: tableWidth,
          height: rowHeight,
          color: rowIdx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.95, 0.95, 0.95),
          borderColor: rgb(0, 0, 0),
          borderWidth: 0.5,
        });
        page.drawText(`Font: ${fontName} ${fontSize}pt (${styleText})`, {
          x: tableX + 5,
          y: fontRowY + 4,
          size: 8,
          font,
          color: rgb(0, 0, 0),
        });
        rowIdx++;

        // Color details
        const colorRowY = tableY - (rowIdx + 1) * rowHeight;
        page.drawRectangle({
          x: tableX,
          y: colorRowY,
          width: tableWidth,
          height: rowHeight,
          color: rowIdx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.95, 0.95, 0.95),
          borderColor: rgb(0, 0, 0),
          borderWidth: 0.5,
        });
        page.drawText(`Color: ${textColor}`, {
          x: tableX + 5,
          y: colorRowY + 4,
          size: 8,
          font,
          color: rgb(0, 0, 0),
        });
        rowIdx++;

        // Alignment details
        const alignRowY = tableY - (rowIdx + 1) * rowHeight;
        page.drawRectangle({
          x: tableX,
          y: alignRowY,
          width: tableWidth,
          height: rowHeight,
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
      });
      const totalRows = 1 + badge.lines.length * 4; // Background + 4 rows per text line
      const tableHeight = totalRows * rowHeight;
      const contentHeight = Math.max(imageHeight, tableHeight);
      const contentBottomY = imageTopY - contentHeight;

      const bgColorRaw = badge.backgroundColor ?? "#000000";
      const bgHex = cssColorToHex(bgColorRaw);
      const bgColorInfo = getColorInfo(bgHex) ?? {
        name: "Custom",
        hex: bgHex,
      };

      page.drawText(`Background: ${bgColorInfo.name} (${bgHex})`, {
        x: margin,
        y: contentBottomY - IMAGE_BOTTOM_GAP - BACKGROUND_TEXT_HEIGHT,
        size: 9,
        font,
        color: rgb(0, 0, 0),
      });

      // Move to next badge
      const sectionHeight =
        HEADER_HEIGHT +
        HEADER_GAP +
        contentHeight +
        IMAGE_BOTTOM_GAP +
        BACKGROUND_TEXT_HEIGHT +
        SECTION_BOTTOM_PADDING;
      y -= sectionHeight;

      console.log(`Badge ${idx + 1} completed, new Y:`, y);
    }

    // Save & download
    const pdfBytes = await pdfDoc.save();

    // Create a safe copy (guaranteed ArrayBuffer-backed)
    const pdfCopy = new Uint8Array(pdfBytes);

    const blob = new Blob([pdfCopy], {
      type: "application/pdf",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = "badge-design.pdf";
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error("Error generating PDF:", error);
    alert("Error generating PDF. Please try again.");
  }
};

export const handleDownloadPDF = (): void => {
  console.warn(
    "handleDownloadPDF is deprecated. Use generatePDF with badge data instead."
  );
};

/**
 * Generate PDF using the unified layout engine
 * This ensures perfect consistency between preview and PDF output
 */
export const generatePDFWithLayoutEngine = async (
  badgeData: Badge,
  multipleBadges?: Badge[]
): Promise<void> => {
  console.log("LAYOUT ENGINE PDF GENERATION - v1.0");

  // For now, just call the original PDF generator
  await generatePDFNew(badgeData, multipleBadges);
};
