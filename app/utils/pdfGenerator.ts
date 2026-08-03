import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { Badge } from "../types/badge";
import {
  type DesignerVariant,
  isSignLikeVariant,
} from "~/constants/designerVariants";
import { BADGE_ICON_LABELS, isBadgeIconId } from "~/constants/badgeIcons";
import { getColorInfo } from "../constants/colors";
import {
  generateBadgeTiff,
  generateFullBadgeImage,
  type FullBadgeImageOptions,
} from "./badgeThumbnail";
import { getCustomBackgroundDisplayName } from "./badgeCustomBackgrounds";
import {
  getEffectiveDesignBox,
  resolveProductionRenderOpts,
} from "./renderSvg";
import { loadTemplateById, type LoadedTemplate } from "./templates";
import {
  getPlaqueAwardFormatById,
  resolveAttachedPlaqueAwardFormatForRender,
} from "~/constants/plaqueFormats";
import {
  parsePlaqueTemplateId,
  PLAQUE_LAYOUT_OPTIONS,
} from "~/constants/plaqueLayouts";
import {
  isPlaqueAttachedTemplateId,
  isPlaqueDetachedTemplateId,
  isPlaqueTemplateId,
} from "./plaqueRender";

const HEADER_HEIGHT = 18;
const HEADER_GAP = 6;

const SECTION_BOTTOM_PADDING = 14;

const PAGE_HEIGHT = 841.89;
const PAGE_WIDTH = 595.28;
const TOP_MARGIN = 40;
const BOTTOM_MARGIN = 40;

/** Proof PDF mockup for plaques: lower res JPEG to save space, time, and ink. */
export const PLAQUE_PROOF_PDF_IMAGE_OPTIONS: FullBadgeImageOptions = {
  rasterScale: 1.25,
  rasterFormat: "image/jpeg",
  rasterQuality: 0.72,
  loadTimeoutMs: 30_000,
};

/** Badge proof PDF mockup: same JPEG class as draft/cart thumbnails (not high-res PNG). */
export const BADGE_PROOF_PDF_IMAGE_OPTIONS: FullBadgeImageOptions = {
  rasterScale: 2,
  rasterFormat: "image/jpeg",
  rasterQuality: 0.88,
  loadTimeoutMs: 20_000,
};

export type GeneratePDFAsBlobOptions = {
  /** Precomputed mockup data URLs (one per badge). Skips internal raster when present. */
  mockupDataUrls?: (string | undefined)[];
};

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

/** Proof PDF layout box — badge/sign die size, not full photo canvas crop. */
function resolvePdfProofDisplayViewBoxPx(template: LoadedTemplate): {
  widthPx: number;
  heightPx: number;
} {
  const SVG_VIEWBOX_PADDING_PX = 24 * 2;
  return {
    widthPx: template.standardViewBoxWidth + SVG_VIEWBOX_PADDING_PX,
    heightPx: template.standardViewBoxHeight + SVG_VIEWBOX_PADDING_PX,
  };
}

function getPdfSpecRows(
  badge: Badge,
  template: LoadedTemplate,
  variant: DesignerVariant = "badge",
): string[] {
  if (variant === "plaque" || isPlaqueTemplateId(template.id)) {
    return getPlaquePdfSpecRows(badge, template);
  }

  const icon =
    badge.badgeIconId && isBadgeIconId(badge.badgeIconId)
      ? BADGE_ICON_LABELS[badge.badgeIconId]
      : "NA";
  const backgroundImage = badge.customBadgeBackgroundId
    ? getCustomBackgroundDisplayName(badge.customBadgeBackgroundId) ??
      badge.customBadgeBackgroundId
    : "NA";

  let backgroundColor = "NA";
  if (!badge.customBadgeBackgroundId) {
    const bgHex = cssColorToHex(badge.backgroundColor ?? "#000000");
    const bgColorInfo = getColorInfo(bgHex) ?? {
      name: "Custom",
      hex: bgHex,
    };
    backgroundColor = `${bgColorInfo.name} (${bgHex})`;
  }

  return [
    `Shape/size: ${template.name}`,
    `Icon: ${icon}`,
    `Background color: ${backgroundColor}`,
    `Background image: ${backgroundImage}`,
  ];
}

function getPlaquePdfSpecRows(
  badge: Badge,
  template: LoadedTemplate,
): string[] {
  const parsed = parsePlaqueTemplateId(template.id);
  const layoutOpt = parsed
    ? PLAQUE_LAYOUT_OPTIONS.find((o) => o.id === parsed.layoutId)
    : undefined;
  const layoutLabel = layoutOpt?.name
    ? layoutOpt.name
    : isPlaqueAttachedTemplateId(template.id)
      ? "Attached plate"
      : isPlaqueDetachedTemplateId(template.id)
        ? "Detached / photo plaque"
        : "Plaque";
  const sizeLabel = parsed?.size
    ? parsed.size.charAt(0).toUpperCase() + parsed.size.slice(1)
    : "—";

  const plateHex = cssColorToHex(badge.backgroundColor ?? "#000000");
  const plateInfo = getColorInfo(plateHex) ?? {
    name: "Custom",
    hex: plateHex,
  };
  const plateColor = `${plateInfo.name} (${plateHex})`;

  const rows = [
    `Layout: ${layoutLabel}`,
    `Size: ${sizeLabel}`,
    `Template: ${template.name}`,
    `Plate color: ${plateColor}`,
  ];

  if (isPlaqueAttachedTemplateId(template.id)) {
    const format =
      resolveAttachedPlaqueAwardFormatForRender(badge) ??
      getPlaqueAwardFormatById(badge.plaqueFormatId);
    rows.push(`Award format: ${format?.name ?? "Custom / none"}`);
  }

  if (isPlaqueDetachedTemplateId(template.id)) {
    const finish = badge.plaqueDetachedPhotoFrameFinish ?? "gold";
    rows.push(
      `Photo frame finish: ${finish.charAt(0).toUpperCase()}${finish.slice(1)}`,
    );
  }

  const logoSrc = badge.logo?.src?.trim() ?? "";
  if (logoSrc) {
    const isHttp = /^https?:\/\//i.test(logoSrc);
    rows.push(
      isHttp
        ? `Uploaded image: Saved to library`
        : `Uploaded image: Yes (pending cloud URL)`,
    );
  } else {
    rows.push(`Uploaded image: None`);
  }

  return rows;
}

function formatLineFontSizeLabel(
  badge: Badge,
  template: LoadedTemplate,
  line: Badge["lines"][number],
): string {
  const designBox = getEffectiveDesignBox(template, badge);
  const px =
    typeof line.fontSize === "number" && line.fontSize > 0
      ? Math.round(line.fontSize)
      : Math.max(1, Math.round((line.sizeNorm || 0) * designBox.height));
  const pt = Math.round(px * 0.75);
  return `${px}px (~${pt}pt)`;
}

async function embedProofMockupInPdf(
  pdfDoc: PDFDocument,
  badge: Badge,
  template: LoadedTemplate,
  variant: DesignerVariant,
  precomputedDataUrl?: string,
): Promise<Awaited<ReturnType<PDFDocument["embedPng"]>>> {
  const baseOpts = resolveProductionRenderOpts(badge, template, variant);
  const imageOpts: FullBadgeImageOptions =
    variant === "plaque" || isPlaqueTemplateId(template.id)
      ? { ...baseOpts, ...PLAQUE_PROOF_PDF_IMAGE_OPTIONS }
      : { ...baseOpts, ...BADGE_PROOF_PDF_IMAGE_OPTIONS };
  const imageDataUrl =
    precomputedDataUrl && precomputedDataUrl.startsWith("data:image/")
      ? precomputedDataUrl
      : await generateFullBadgeImage(badge, variant, imageOpts);
  const base64Data = imageDataUrl.split(",")[1];
  const imageBytes = Uint8Array.from(atob(base64Data), (c) =>
    c.charCodeAt(0),
  );
  if (
    imageOpts.rasterFormat === "image/jpeg" ||
    imageDataUrl.startsWith("data:image/jpeg")
  ) {
    return pdfDoc.embedJpg(imageBytes);
  }
  return pdfDoc.embedPng(imageBytes);
}

function drawPdfTableRow(
  page: ReturnType<PDFDocument["addPage"]>,
  opts: {
    tableX: number;
    tableY: number;
    tableWidth: number;
    rowHeight: number;
    rowIdx: number;
    label: string;
    font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  },
): number {
  const rowY = opts.tableY - (opts.rowIdx + 1) * opts.rowHeight;
  page.drawRectangle({
    x: opts.tableX,
    y: rowY,
    width: opts.tableWidth,
    height: opts.rowHeight,
    color: opts.rowIdx % 2 === 0 ? rgb(1, 1, 1) : rgb(0.95, 0.95, 0.95),
    borderColor: rgb(0, 0, 0),
    borderWidth: 0.5,
  });
  page.drawText(opts.label, {
    x: opts.tableX + 5,
    y: rowY + 4,
    size: 8,
    font: opts.font,
    color: rgb(0, 0, 0),
  });
  return opts.rowIdx + 1;
}

/* ---------- NEW SIMPLE PDF GENERATOR ---------- */

export const generatePDFNew = async (
  badgeData: Badge,
  multipleBadges?: Badge[],
  designLabel: string = "Badge",
  variant: DesignerVariant = "badge"
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

    let y = PAGE_HEIGHT - TOP_MARGIN;

    const allBadges = [badgeData, ...(multipleBadges || [])];

    for (let idx = 0; idx < allBadges.length; idx++) {
      const badge = allBadges[idx];
      console.log(`Processing ${designLabel} ${idx + 1}`);

      // Load the correct template for this badge (needed for section height and image dimensions)
      const template = await loadTemplateById(
        badge.templateId ||
          (isSignLikeVariant(variant) ? "circle-4x4" : "rect-1x3"),
        variant
      );
      console.log(
        `Loaded template for ${designLabel.toLowerCase()} ${idx + 1}:`,
        template.id,
        `(${template.widthPx}x${template.heightPx})`
      );
      // Proof layout uses die dimensions so the image fits beside the spec table.
      // Render still uses photo plates (embedded bg + icons) at full resolution.
      const viewBox = resolvePdfProofDisplayViewBoxPx(template);
      const svgViewBoxW = viewBox.widthPx;
      const svgViewBoxH = viewBox.heightPx;
      const imageHeightPt = pxToPt(svgViewBoxH);

      // Estimate section height BEFORE rendering (use SVG viewBox height in points)
      const estimatedTotalRows =
        badge.lines.length * 4 +
        getPdfSpecRows(badge, template, variant).length +
        1;
      const estimatedTableHeight = estimatedTotalRows * 16;
      const estimatedContentHeight = Math.max(
        imageHeightPt,
        estimatedTableHeight
      );

      const estimatedSectionHeight =
        HEADER_HEIGHT +
        HEADER_GAP +
        estimatedContentHeight +
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

      // Mockup raster (plaques use lower-quality JPEG to save space/ink)
      console.log(`Generating ${designLabel.toLowerCase()} image...`);
      const pdfImage = await embedProofMockupInPdf(
        pdfDoc,
        badge,
        template,
        variant,
      );
      console.log("Image embedded in PDF");
      console.log("PDF image dimensions:", {
        width: pdfImage.width,
        height: pdfImage.height,
      });

      // Use exact same sizing as SVG: viewBox dimensions in PDF points (matches rasterized PNG).
      // 72pt = 1 inch, 96px = 1 inch → px * 0.75 = pt.
      const imageWidth = pxToPt(svgViewBoxW);
      const imageHeight = pxToPt(svgViewBoxH);

      console.log(`Calculated dimensions for badge ${idx + 1}:`, {
        width: imageWidth,
        height: imageHeight,
        svgViewBoxPx: `${svgViewBoxW}x${svgViewBoxH}`,
      });

      // Calculate table position based on actual image width
      const tableX = margin + imageWidth + 20;
      const tableWidth = 595.28 - tableX - margin;

      page.drawText(`${designLabel} ${idx + 1}`, {
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

      for (const label of getPdfSpecRows(badge, template, variant)) {
        rowIdx = drawPdfTableRow(page, {
          tableX,
          tableY,
          tableWidth,
          rowHeight,
          rowIdx,
          label,
          font,
        });
      }

      // Text lines
      badge.lines.forEach((line, lineIdx) => {
        const cleanText = (line.text ?? "").replace(/^"|"$/g, "").trim();

        const fontName = line.fontFamily ?? "Roboto";
        const fontSizeLabel = formatLineFontSizeLabel(badge, template, line);
        const textColor = cssColorToHex(line.color ?? "#000000");

        const style: string[] = [];
        if (line.bold) style.push("Bold");
        if (line.italic) style.push("Italic");
        if (line.underline) style.push("Underline");
        const styleText = style.length ? style.join(", ") : "Normal";

        const alignText =
          line.align === "left" || line.align === "right" || line.align === "center"
            ? line.align.charAt(0).toUpperCase() + line.align.slice(1)
            : "Center";

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
        page.drawText(`Font: ${fontName} ${fontSizeLabel} (${styleText})`, {
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

      const totalRows =
        badge.lines.length * 4 +
        getPdfSpecRows(badge, template, variant).length +
        1;
      const tableHeight = totalRows * rowHeight;
      const contentHeight = Math.max(imageHeight, tableHeight);

      // Move to next badge
      const sectionHeight =
        HEADER_HEIGHT +
        HEADER_GAP +
        contentHeight +
        SECTION_BOTTOM_PADDING;
      y -= sectionHeight;

      console.log(`${designLabel} ${idx + 1} completed, new Y:`, y);
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
    link.download = `${designLabel.toLowerCase()}-design.pdf`;
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
  multipleBadges?: Badge[],
  designLabel: string = "Badge",
  variant: DesignerVariant = "badge"
): Promise<void> => {
  console.log("LAYOUT ENGINE PDF GENERATION - v1.0");

  await generatePDFNew(badgeData, multipleBadges, designLabel, variant);
};

/**
 * Generate PDF as a Blob (for upload, not download)
 * Uses the same logic as generatePDFNew but returns a Blob instead of downloading.
 * quantities: optional array, one per badge; default 1 for each. Shown as "Quantity" row in table (order slip).
 */
export const generatePDFAsBlob = async (
  badgeData: Badge,
  multipleBadges?: Badge[],
  quantities?: number[],
  designLabel: string = "Badge",
  variant: DesignerVariant = "badge",
  options?: GeneratePDFAsBlobOptions,
): Promise<Blob> => {
  console.log("GENERATING PDF AS BLOB");
  try {
    // Create new PDF document
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([595.28, 841.89]); // A4
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Simple layout: two horizontal rectangles side by side
    const margin = 30;

    let y = PAGE_HEIGHT - TOP_MARGIN;

    const allBadges = [badgeData, ...(multipleBadges || [])];
    const getQuantity = (i: number) =>
      quantities && quantities[i] !== undefined && quantities[i] >= 1
        ? quantities[i]
        : 1;

    for (let idx = 0; idx < allBadges.length; idx++) {
      const badge = allBadges[idx];
      const quantity = getQuantity(idx);
      console.log(`Processing ${designLabel} ${idx + 1}`);

      // Load the correct template (variant so sign templates load from sign config)
      const template = await loadTemplateById(
        badge.templateId ||
          (isSignLikeVariant(variant) ? "circle-4x4" : "rect-1x3"),
        variant
      );
      console.log(
        `Loaded template for ${designLabel.toLowerCase()} ${idx + 1}:`,
        template.id,
        `(${template.widthPx}x${template.heightPx})`
      );
      // Proof layout uses die dimensions so the image fits beside the spec table.
      // Render still uses photo plates (embedded bg + icons) at full resolution.
      const viewBox = resolvePdfProofDisplayViewBoxPx(template);
      const svgViewBoxW = viewBox.widthPx;
      const svgViewBoxH = viewBox.heightPx;
      const imageHeightPt = pxToPt(svgViewBoxH);

      // Estimate section height BEFORE rendering; appearance rows + Quantity row.
      const estimatedTotalRows =
        badge.lines.length * 4 +
        getPdfSpecRows(badge, template, variant).length +
        1;
      const estimatedTableHeight = estimatedTotalRows * 16;
      const estimatedContentHeight = Math.max(
        imageHeightPt,
        estimatedTableHeight
      );

      const estimatedSectionHeight =
        HEADER_HEIGHT +
        HEADER_GAP +
        estimatedContentHeight +
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

      // Mockup raster (badge/plaque JPEG; may reuse precomputed cart/proof assets)
      console.log(`Generating ${designLabel.toLowerCase()} image...`);
      const pdfImage = await embedProofMockupInPdf(
        pdfDoc,
        badge,
        template,
        variant,
        options?.mockupDataUrls?.[idx],
      );
      console.log("Image embedded in PDF");
      console.log("PDF image dimensions:", {
        width: pdfImage.width,
        height: pdfImage.height,
      });

      // Use exact same sizing as SVG: viewBox dimensions in PDF points (matches rasterized PNG).
      // 72pt = 1 inch, 96px = 1 inch → px * 0.75 = pt.
      const imageWidth = pxToPt(svgViewBoxW);
      const imageHeight = pxToPt(svgViewBoxH);

      console.log(`Calculated dimensions for ${designLabel.toLowerCase()} ${idx + 1}:`, {
        width: imageWidth,
        height: imageHeight,
        svgViewBoxPx: `${svgViewBoxW}x${svgViewBoxH}`,
      });

      // Calculate table position based on actual image width
      const tableX = margin + imageWidth + 20;
      const tableWidth = 595.28 - tableX - margin;

      page.drawText(`${designLabel} ${idx + 1}`, {
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

      for (const label of getPdfSpecRows(badge, template, variant)) {
        rowIdx = drawPdfTableRow(page, {
          tableX,
          tableY,
          tableWidth,
          rowHeight,
          rowIdx,
          label,
          font,
        });
      }

      // Text lines
      badge.lines.forEach((line, lineIdx) => {
        const cleanText = (line.text ?? "").replace(/^"|"$/g, "").trim();

        const fontName = line.fontFamily ?? "Roboto";
        const fontSizeLabel = formatLineFontSizeLabel(badge, template, line);
        const textColor = cssColorToHex(line.color ?? "#000000");

        const style: string[] = [];
        if (line.bold) style.push("Bold");
        if (line.italic) style.push("Italic");
        if (line.underline) style.push("Underline");
        const styleText = style.length ? style.join(", ") : "Normal";

        const alignText =
          line.align === "left" || line.align === "right" || line.align === "center"
            ? line.align.charAt(0).toUpperCase() + line.align.slice(1)
            : "Center";

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
        page.drawText(`Font: ${fontName} ${fontSizeLabel} (${styleText})`, {
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

      // Quantity row (order slip)
      const quantityRowY = tableY - (rowIdx + 1) * rowHeight;
      page.drawRectangle({
        x: tableX,
        y: quantityRowY,
        width: tableWidth,
        height: rowHeight,
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
      const totalRows =
        badge.lines.length * 4 +
        getPdfSpecRows(badge, template, variant).length +
        1;
      const tableHeight = totalRows * rowHeight;
      const contentHeight = Math.max(imageHeight, tableHeight);

      // Move to next item
      const sectionHeight =
        HEADER_HEIGHT +
        HEADER_GAP +
        contentHeight +
        SECTION_BOTTOM_PADDING;
      y -= sectionHeight;

      console.log(`${designLabel} ${idx + 1} completed, new Y:`, y);
    }

    // Save & return as blob
    const pdfBytes = await pdfDoc.save();
    const pdfCopy = new Uint8Array(pdfBytes);

    return new Blob([pdfCopy], {
      type: "application/pdf",
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    throw error;
  }
};
