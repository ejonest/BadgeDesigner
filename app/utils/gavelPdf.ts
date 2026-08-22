import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { BadgeLine } from "~/types/badge";
import {
  formatGavelMoney,
  formatGavelOptionSummary,
  formatGavelOrderFinish,
  getGavelStandFinish,
  type GavelStyleId,
  type GavelBandFinishId,
  type GavelProductionMethodId,
  type GavelProductType,
  type GavelSoundBlockId,
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
  soundBlockText?: string;
  soundBlockDataUrl?: string | null;
  suedeBag?: boolean;
  standFinish?: GavelStandFinishId;
  productionMethod?: GavelProductionMethodId;
  plateLines?: BadgeLine[];
  plateDataUrl?: string | null;
  unitPrice?: number | null;
  estimatedTotal?: number | null;
  logoFileName?: string | null;
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

export async function generateGavelProofPdf(
  input: GenerateGavelProofPdfInput,
): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const navy = rgb(0.04, 0.09, 0.16);
  const muted = rgb(0.35, 0.38, 0.42);

  const isStand = input.productType === "stand";

  let y = PAGE_HEIGHT - MARGIN;
  page.drawText(
    isStand
      ? "Gavels Fast — Gavel + stand proof"
      : "Gavels Fast — Custom band proof",
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
      suedeBag: Boolean(input.suedeBag),
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
    specLines.push(`Sound block: ${(input.soundBlockText ?? "").trim()}`);
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
