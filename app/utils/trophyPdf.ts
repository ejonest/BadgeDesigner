import { jsPDF } from "jspdf";

export type TrophyProofItem = {
  dataUrl: string;
  width: number;
  height: number;
  lines: string[];
  quantity: number;
};

const MARGIN = 40;
const FOOTER = 36;

function columnCount(count: number): number {
  if (count <= 1) return 1;
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

function fitBox(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number,
): { width: number; height: number } {
  const scale = Math.min(maxW / Math.max(srcW, 1), maxH / Math.max(srcH, 1));
  return { width: srcW * scale, height: srcH * scale };
}

function wordingOf(lines: string[]): string {
  return lines.map((line) => line.trim()).filter(Boolean).join(" / ");
}

/**
 * One proof page set for the whole order. Each physical trophy is drawn at
 * its own aspect ratio, so a quantity of six is six trophies rather than one
 * picture stretched into the page.
 */
export async function generateTrophyProofPdf(input: {
  designId: string;
  awardLabel: string;
  plateLabel: string;
  items: TrophyProofItem[];
  unitPrice: number;
  totalPrice: number;
}): Promise<Blob> {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - MARGIN * 2;
  const copies = input.items.flatMap((item, index) =>
    Array.from({ length: Math.max(1, Math.round(item.quantity)) }, () => ({
      ...item,
      alias: `trophy-${index}`,
    })),
  );
  if (copies.length === 0) {
    throw new Error("Could not build the trophy preview PDF.");
  }
  const designsDiffer =
    new Set(input.items.map((item) => wordingOf(item.lines))).size > 1;
  const orderQuantity = copies.length;
  const sharedWording = designsDiffer
    ? ""
    : wordingOf(input.items[0]?.lines ?? []);

  const drawFooter = () => {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor("#6f6a62");
    pdf.text(
      "Artwork and placement are subject to production review before engraving.",
      MARGIN,
      pageHeight - 22,
    );
  };

  const drawHeader = (continued: boolean) => {
    let y = 48;
    pdf.setTextColor("#232323");
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(20);
    pdf.text(
      continued
        ? "Custom Trophy Design Preview (continued)"
        : "Custom Trophy Design Preview",
      MARGIN,
      y,
    );
    y += 16;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.setTextColor("#6f6a62");
    pdf.text(`Design ID: ${input.designId}`, MARGIN, y);
    if (continued) return y + 22;

    y += 22;
    pdf.setFontSize(11);
    const specs = [
      ["Award", input.awardLabel],
      ["Plate", input.plateLabel],
      [
        "Order",
        `${orderQuantity} ${orderQuantity === 1 ? "trophy" : "trophies"}  ·  $${input.unitPrice.toFixed(2)} each  ·  $${input.totalPrice.toFixed(2)}`,
      ],
    ];
    if (sharedWording) specs.splice(2, 0, ["Wording", sharedWording]);
    for (const [label, value] of specs) {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor("#232323");
      pdf.text(label, MARGIN, y);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor("#323232");
      const wrapped = pdf.splitTextToSize(value, contentWidth - 78);
      pdf.text(wrapped, MARGIN + 70, y);
      y += Math.max(16, wrapped.length * 13);
    }
    return y + 10;
  };

  let y = drawHeader(false);
  const cols = columnCount(copies.length);
  const gap = 14;
  const cellW = (contentWidth - gap * (cols - 1)) / cols;
  const captionH = designsDiffer ? 28 : 0;
  const maxImage =
    copies.length === 1
      ? fitBox(copies[0].width, copies[0].height, Math.min(cellW, 340), 460)
      : null;

  copies.forEach((copy, index) => {
    const fitted =
      maxImage ??
      fitBox(copy.width, copy.height, cellW, cellW * (copy.height / copy.width));
    const rowH = fitted.height + captionH + 8;
    const col = copies.length === 1 ? 0 : index % cols;
    if (col === 0 && y + rowH > pageHeight - FOOTER) {
      drawFooter();
      pdf.addPage();
      y = drawHeader(true);
    }
    const x =
      copies.length === 1
        ? MARGIN + (contentWidth - fitted.width) / 2
        : MARGIN + col * (cellW + gap) + (cellW - fitted.width) / 2;
    pdf.addImage(
      copy.dataUrl,
      "JPEG",
      x,
      y,
      fitted.width,
      fitted.height,
      copy.alias,
    );
    if (designsDiffer) {
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(8);
      pdf.setTextColor("#323232");
      const caption = pdf.splitTextToSize(
        wordingOf(copy.lines) || "Trophy",
        cellW - 4,
      );
      pdf.text(caption.slice(0, 2), x, y + fitted.height + 12);
    }
    if (col === cols - 1 || index === copies.length - 1) {
      y += rowH;
    }
  });

  drawFooter();
  return pdf.output("blob");
}
