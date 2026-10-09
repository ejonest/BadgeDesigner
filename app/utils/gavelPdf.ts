import {
  PDFDocument,
  rgb,
  StandardFonts,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import type { BadgeLine } from "~/types/badge";
import {
  formatGavelMoney,
  formatGavelOptionSummary,
  formatGavelOrderFinish,
  getGavelStandFinish,
  type GavelStyleId,
  type GavelBandFinishId,
  type GavelBagSelectionId,
  type GavelProductionMethodId,
  type GavelProductType,
  type GavelSoundBlockId,
  type GavelSoundBlockShapeId,
  type GavelStandFinishId,
  type GavelTextSizePreset,
} from "~/constants/gavelStyles";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;

type GenerateGavelProofPdfInput = {
  styleId: GavelStyleId | string;
  bandFinishId?: GavelBandFinishId | string;
  textSizePreset: GavelTextSizePreset;
  lines: BadgeLine[];
  quantity: number;
  mockupDataUrl?: string | null;
  unwrappedDataUrl?: string | null;
  productType?: GavelProductType;
  soundBlock?: GavelSoundBlockId;
  soundBlockShape?: GavelSoundBlockShapeId;
  soundBlockText?: string;
  soundBlockDataUrl?: string | null;
  suedeBag?: boolean;
  bagSelection?: GavelBagSelectionId;
  standFinish?: GavelStandFinishId;
  productionMethod?: GavelProductionMethodId;
  plateLines?: BadgeLine[];
  plateDataUrl?: string | null;
  unitPrice?: number | null;
  estimatedTotal?: number | null;
  logoFileName?: string | null;
  /**
   * One flat preview per design. More than one replaces the single mockup
   * with an unwrapped preview of every gavel, stand plate, and sound block.
   */
  artworks?: GavelProofArtwork[];
};

/** Flat preview of one design, matching the on-screen unwrapped strips. */
export type GavelProofArtwork = {
  title: string;
  quantity?: number;
  note?: string;
  unwrappedDataUrl?: string | null;
  plateDataUrl?: string | null;
  soundBlockDataUrl?: string | null;
};

async function embedDataUrlImage(
  pdfDoc: PDFDocument,
  dataUrl: string | null | undefined,
) {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const header = dataUrl.slice(0, comma);
  const b64 = dataUrl.slice(comma + 1);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  try {
    if (header.includes("image/jpeg") || header.includes("image/jpg")) {
      return await pdfDoc.embedJpg(bytes);
    }
    return await pdfDoc.embedPng(bytes);
  } catch {
    try {
      return await pdfDoc.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
const BAND_MAX_H = 64;
const PLATE_MAX_H = 80;
const BLOCK_MAX = 128;
const WOOD = rgb(0.91, 0.85, 0.77);
const RULE = rgb(0.82, 0.84, 0.86);

function fitText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  const ellipsis = "...";
  let end = text.length;
  while (end > 0) {
    const slice = text.slice(0, end).trimEnd() + ellipsis;
    if (font.widthOfTextAtSize(slice, size) <= maxWidth) return slice;
    end -= 1;
  }
  return ellipsis;
}

/** Helvetica is WinAnsi; one unsupported character would fail the whole proof. */
function pdfText(font: PDFFont, value: string): string {
  let out = "";
  for (const ch of value) {
    try {
      font.encodeText(ch);
      out += ch;
    } catch {
      out += "?";
    }
  }
  return out;
}

function fittedSize(image: PDFImage, maxW: number, maxH: number) {
  const scale = Math.min(maxW / image.width, maxH / image.height);
  return { w: image.width * scale, h: image.height * scale };
}

type GalleryCursor = { page: PDFPage; y: number };

function artworkBlockHeight(artwork: {
  note?: string;
  band: PDFImage | null;
  plate: PDFImage | null;
  wantsPlate: boolean;
  block: PDFImage | null;
  wantsBlock: boolean;
}): number {
  let height = 22;
  if (artwork.note) height += 14;
  const section = (wanted: boolean, image: PDFImage | null, maxH: number) => {
    if (!wanted) return 0;
    if (!image) return 28;
    return 18 + fittedSize(image, CONTENT_WIDTH, maxH).h + 12;
  };
  height += section(true, artwork.band, BAND_MAX_H);
  height += section(artwork.wantsPlate, artwork.plate, PLATE_MAX_H);
  height += section(artwork.wantsBlock, artwork.block, BLOCK_MAX);
  return height + 10;
}

async function drawArtworkGallery(
  pdfDoc: PDFDocument,
  font: PDFFont,
  fontBold: PDFFont,
  input: GenerateGavelProofPdfInput,
  artworks: GavelProofArtwork[],
) {
  const navy = rgb(0.04, 0.09, 0.16);
  const muted = rgb(0.35, 0.38, 0.42);
  const isStand = input.productType === "stand";

  let cursor: GalleryCursor = {
    page: pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]),
    y: PAGE_HEIGHT - MARGIN,
  };

  const nextPage = () => {
    const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawText("Design previews, continued", {
      x: MARGIN,
      y: PAGE_HEIGHT - MARGIN,
      size: 11,
      font: fontBold,
      color: navy,
    });
    cursor = { page, y: PAGE_HEIGHT - MARGIN - 22 };
  };

  const ensure = (needed: number) => {
    if (cursor.y - needed >= MARGIN) return;
    nextPage();
  };

  cursor.page.drawText("Gavels Fast — Design previews", {
    x: MARGIN,
    y: cursor.y,
    size: 16,
    font: fontBold,
    color: navy,
  });
  cursor.y -= 18;
  cursor.page.drawText(
    "Flat preview of every design. Each one shows the unwrapped band,",
    {
      x: MARGIN,
      y: cursor.y,
      size: 10,
      font,
      color: muted,
    },
  );
  cursor.y -= 13;
  cursor.page.drawText(
    "and the stand plate or sound block when those are part of the order.",
    {
      x: MARGIN,
      y: cursor.y,
      size: 10,
      font,
      color: muted,
    },
  );
  cursor.y -= 20;

  const finish = isStand
    ? `${formatGavelOrderFinish(input.styleId, input.bandFinishId)} · ${getGavelStandFinish(input.standFinish).label} plate`
    : formatGavelOrderFinish(input.styleId, input.bandFinishId);
  const specLines = [
    `Style: ${finish}`,
    `Options: ${formatGavelOptionSummary({
      productType: input.productType ?? "gavel",
      soundBlock: input.soundBlock ?? "none",
      soundBlockShape: input.soundBlockShape ?? "square",
      suedeBag: Boolean(input.suedeBag),
      bagSelection: input.bagSelection,
      standFinish: input.standFinish,
      productionMethod: input.productionMethod,
    })}`,
    `Text size: ${input.textSizePreset}`,
    `Designs: ${artworks.length}`,
    `Quantity: ${Math.max(1, input.quantity)}`,
  ];
  if (typeof input.unitPrice === "number" && input.unitPrice > 0) {
    specLines.push(
      `Est. ${formatGavelMoney(input.unitPrice)} ea` +
        (typeof input.estimatedTotal === "number" && input.estimatedTotal > 0
          ? ` · ${formatGavelMoney(input.estimatedTotal)} total`
          : ""),
    );
  }
  if ((input.logoFileName ?? "").trim()) {
    specLines.push(`Logo file: ${(input.logoFileName ?? "").trim()}`);
  }
  for (const line of specLines) {
    cursor.page.drawText(fitText(pdfText(fontBold, line), fontBold, 11, CONTENT_WIDTH), {
      x: MARGIN,
      y: cursor.y,
      size: 11,
      font: fontBold,
      color: navy,
    });
    cursor.y -= 16;
  }
  cursor.y -= 8;

  const prepared = await Promise.all(
    artworks.map(async (artwork) => ({
      title: pdfText(fontBold, artwork.title),
      quantity: artwork.quantity,
      note: artwork.note ? pdfText(font, artwork.note) : undefined,
      band: await embedDataUrlImage(pdfDoc, artwork.unwrappedDataUrl),
      plate: artwork.plateDataUrl
        ? await embedDataUrlImage(pdfDoc, artwork.plateDataUrl)
        : null,
      wantsPlate: Boolean(artwork.plateDataUrl),
      block: artwork.soundBlockDataUrl
        ? await embedDataUrlImage(pdfDoc, artwork.soundBlockDataUrl)
        : null,
      wantsBlock: Boolean(artwork.soundBlockDataUrl),
    })),
  );

  const drawSection = (label: string, image: PDFImage | null, maxH: number) => {
    if (!image) {
      cursor.page.drawText(`${label} unavailable.`, {
        x: MARGIN,
        y: cursor.y - 12,
        size: 10,
        font,
        color: muted,
      });
      cursor.y -= 28;
      return;
    }
    const { w, h } = fittedSize(image, CONTENT_WIDTH, maxH);
    cursor.page.drawText(label, {
      x: MARGIN,
      y: cursor.y,
      size: 10,
      font: fontBold,
      color: navy,
    });
    cursor.y -= 6;
    if (label.startsWith("Sound block")) {
      cursor.page.drawRectangle({
        x: MARGIN,
        y: cursor.y - h,
        width: w,
        height: h,
        color: WOOD,
      });
    }
    cursor.page.drawImage(image, {
      x: MARGIN,
      y: cursor.y - h,
      width: w,
      height: h,
    });
    cursor.y -= h + 12;
  };

  prepared.forEach((artwork, index) => {
    const needed = artworkBlockHeight(artwork);
    const pageBefore = cursor.page;
    ensure(Math.min(needed, PAGE_HEIGHT - MARGIN * 2 - 40));
    if (index > 0 && cursor.page === pageBefore) {
      cursor.page.drawRectangle({
        x: MARGIN,
        y: cursor.y + 6,
        width: CONTENT_WIDTH,
        height: 0.6,
        color: RULE,
      });
      cursor.y -= 8;
    }

    const qty =
      typeof artwork.quantity === "number"
        ? `Qty ${Math.max(1, Math.round(artwork.quantity))}`
        : "";
    const qtyWidth = qty ? fontBold.widthOfTextAtSize(qty, 11) : 0;
    const titleMax = CONTENT_WIDTH - (qty ? qtyWidth + 16 : 0);
    cursor.page.drawText(fitText(artwork.title, fontBold, 12, titleMax), {
      x: MARGIN,
      y: cursor.y,
      size: 12,
      font: fontBold,
      color: navy,
    });
    if (qty) {
      cursor.page.drawText(qty, {
        x: PAGE_WIDTH - MARGIN - qtyWidth,
        y: cursor.y,
        size: 11,
        font: fontBold,
        color: navy,
      });
    }
    cursor.y -= artwork.note ? 14 : 16;
    if (artwork.note) {
      cursor.page.drawText(fitText(artwork.note, font, 9, CONTENT_WIDTH), {
        x: MARGIN,
        y: cursor.y,
        size: 9,
        font,
        color: muted,
      });
      cursor.y -= 14;
    }

    drawSection("Unwrapped band", artwork.band, BAND_MAX_H);
    if (artwork.wantsPlate) {
      drawSection("Stand plate", artwork.plate, PLATE_MAX_H);
    }
    if (artwork.wantsBlock) {
      drawSection("Sound block top", artwork.block, BLOCK_MAX);
    }
    cursor.y -= 6;
  });

  ensure(24);
  cursor.page.drawText(
    "Your personalized design may differ slightly from on-screen color and spacing.",
    {
      x: MARGIN,
      y: Math.max(MARGIN, cursor.y - 8),
      size: 8,
      font,
      color: muted,
    },
  );
}

export async function generateGavelProofPdf(
  input: GenerateGavelProofPdfInput,
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const artworks = input.artworks ?? [];
  if (artworks.length > 1) {
    await drawArtworkGallery(pdfDoc, font, fontBold, input, artworks);
    const bytes = await pdfDoc.save();
    return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  }

  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const navy = rgb(0.04, 0.09, 0.16);
  const muted = rgb(0.35, 0.38, 0.42);

  const isStand = input.productType === "stand";

  let y = PAGE_HEIGHT - MARGIN;
  page.drawText(
    isStand
      ? "Gavels Fast — Gavel + stand preview"
      : "Gavels Fast — Custom band preview",
    {
      x: MARGIN,
      y,
      size: 16,
      font: fontBold,
      color: navy,
    },
  );
  y -= 18;
  page.drawText("Review your custom design before adding to cart.", {
    x: MARGIN,
    y,
    size: 10,
    font,
    color: muted,
  });
  y -= 22;

  const mockup = await embedDataUrlImage(pdfDoc, input.mockupDataUrl);
  if (mockup) {
    const maxW = 260;
    const maxH = 240;
    const scale = Math.min(maxW / mockup.width, maxH / mockup.height);
    const w = mockup.width * scale;
    const h = mockup.height * scale;
    page.drawImage(mockup, { x: MARGIN, y: y - h, width: w, height: h });
  }

  const finish = isStand
    ? `${formatGavelOrderFinish(input.styleId, input.bandFinishId)} · ${getGavelStandFinish(input.standFinish).label} plate`
    : formatGavelOrderFinish(input.styleId, input.bandFinishId);
  const specX = 310;
  let specY = y - 4;
  const specLines = [
    `Style: ${finish}`,
    `Options: ${formatGavelOptionSummary({
      productType: input.productType ?? "gavel",
      soundBlock: input.soundBlock ?? "none",
      soundBlockShape: input.soundBlockShape ?? "square",
      suedeBag: Boolean(input.suedeBag),
      bagSelection: input.bagSelection,
      standFinish: input.standFinish,
      productionMethod: input.productionMethod,
    })}`,
    `Text size: ${input.textSizePreset}`,
    `Quantity: ${Math.max(1, input.quantity)}`,
  ];
  if (typeof input.unitPrice === "number" && input.unitPrice > 0) {
    specLines.push(
      `Est. ${formatGavelMoney(input.unitPrice)} ea` +
        (typeof input.estimatedTotal === "number" && input.estimatedTotal > 0
          ? ` · ${formatGavelMoney(input.estimatedTotal)} total`
          : ""),
    );
  }
  if (input.soundBlock === "engraved" && (input.soundBlockText ?? "").trim()) {
    specLines.push(
      `Sound block: ${(input.soundBlockText ?? "").trim().replace(/\n+/g, " / ")}`,
    );
  }
  const plateFilled = (input.plateLines ?? []).filter((l) =>
    (l.text ?? "").trim(),
  );
  if (input.productType === "stand" && plateFilled.length > 0) {
    specLines.push(
      `Plate: ${plateFilled.map((l) => (l.text ?? "").trim()).join(" / ")}`.slice(
        0,
        70,
      ),
    );
  }
  if ((input.logoFileName ?? "").trim()) {
    specLines.push(`Logo file: ${(input.logoFileName ?? "").trim()}`);
  }
  for (const line of specLines) {
    page.drawText(line, {
      x: specX,
      y: specY,
      size: 11,
      font: fontBold,
      color: navy,
    });
    specY -= 16;
  }

  const filled = input.lines.filter((l) => (l.text ?? "").trim());
  if (filled.length === 0) {
    page.drawText("No custom text entered.", {
      x: specX,
      y: specY,
      size: 10,
      font,
      color: muted,
    });
    specY -= 14;
  } else {
    filled.forEach((line, i) => {
      const text = (line.text ?? "").trim();
      page.drawText(`Line ${i + 1}: ${text}`.slice(0, 60), {
        x: specX,
        y: specY,
        size: 10,
        font,
        color: navy,
      });
      specY -= 13;
      page.drawText(
        `Font: ${line.fontFamily || "Georgia"}  ${line.bold ? "Bold " : ""}${line.italic ? "Italic " : ""}${line.align || "center"}`.slice(
          0,
          70,
        ),
        {
          x: specX,
          y: specY,
          size: 9,
          font,
          color: muted,
        },
      );
      specY -= 16;
    });
  }

  y -= 260;
  page.drawText("Unwrapped band (manufacturing artwork)", {
    x: MARGIN,
    y,
    size: 11,
    font: fontBold,
    color: navy,
  });
  y -= 10;

  const unwrap = await embedDataUrlImage(pdfDoc, input.unwrappedDataUrl);
  if (unwrap) {
    const w = PAGE_WIDTH - MARGIN * 2;
    const h = Math.min(90, (unwrap.height / unwrap.width) * w);
    page.drawImage(unwrap, { x: MARGIN, y: y - h, width: w, height: h });
    y -= h + 16;
  } else {
    page.drawText("Band preview unavailable.", {
      x: MARGIN,
      y: y - 12,
      size: 10,
      font,
      color: muted,
    });
    y -= 28;
  }

  const plateArt = await embedDataUrlImage(pdfDoc, input.plateDataUrl);
  if (plateArt) {
    page.drawText("Stand plate (separate from the band)", {
      x: MARGIN,
      y,
      size: 11,
      font: fontBold,
      color: navy,
    });
    y -= 10;
    const w = PAGE_WIDTH - MARGIN * 2;
    const h = Math.min(72, (plateArt.height / plateArt.width) * w);
    page.drawImage(plateArt, { x: MARGIN, y: y - h, width: w, height: h });
    y -= h + 16;
  }

  const soundBlockArt = await embedDataUrlImage(
    pdfDoc,
    input.soundBlockDataUrl,
  );
  if (soundBlockArt) {
    page.drawText("Sound block top (separate from the band)", {
      x: MARGIN,
      y,
      size: 11,
      font: fontBold,
      color: navy,
    });
    y -= 10;
    const maxW = 180;
    const maxH = 180;
    const scale = Math.min(
      maxW / soundBlockArt.width,
      maxH / soundBlockArt.height,
    );
    const w = soundBlockArt.width * scale;
    const h = soundBlockArt.height * scale;
    page.drawRectangle({
      x: MARGIN,
      y: y - h,
      width: w,
      height: h,
      color: rgb(0.91, 0.85, 0.77),
    });
    page.drawImage(soundBlockArt, {
      x: MARGIN,
      y: y - h,
      width: w,
      height: h,
    });
    y -= h + 16;
  }

  page.drawText(
    "Your personalized design may differ slightly from on-screen color and spacing.",
    {
      x: MARGIN,
      y: Math.max(MARGIN + 24, y - 8),
      size: 8,
      font,
      color: muted,
    },
  );

  const bytes = await pdfDoc.save();
  return new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
}
