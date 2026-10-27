import { jsPDF } from "jspdf";

export async function generateMedalProofPdf(input: {
  designId: string;
  thumbnailDataUrl: string;
  medalLabel: string;
  lines: string[];
  quantity: number;
  unitPrice: number;
}): Promise<Blob> {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setTextColor("#232323");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text("Custom Medal Design Preview", 54, 58);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor("#6f6a62");
  pdf.text(`Design ID: ${input.designId}`, 54, 76);
  pdf.addImage(input.thumbnailDataUrl, "JPEG", 120, 96, pageWidth - 240, 330);

  pdf.setTextColor("#232323");
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.text("Medal", 54, 464);
  pdf.text("Wording", 54, 488);
  pdf.text("Order", 54, 536);
  pdf.setFont("helvetica", "normal");
  pdf.text(input.medalLabel, 142, 464, { maxWidth: pageWidth - 196 });
  pdf.text(
    input.lines.filter((line) => line.trim()).join(" / ") || "—",
    142,
    488,
    { maxWidth: pageWidth - 196 },
  );
  pdf.text(
    `${input.quantity} × $${input.unitPrice.toFixed(2)} = $${(
      input.quantity * input.unitPrice
    ).toFixed(2)}`,
    142,
    536,
  );
  pdf.setFontSize(8);
  pdf.setTextColor("#6f6a62");
  pdf.text(
    "Artwork and placement are subject to production review.",
    54,
    578,
  );
  return pdf.output("blob");
}
