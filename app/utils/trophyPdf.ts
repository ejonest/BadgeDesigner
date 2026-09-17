import { jsPDF } from "jspdf";

export async function generateTrophyProofPdf(input: {
  designId: string;
  thumbnailDataUrl: string;
  awardLabel: string;
  plateLabel: string;
  lines: string[];
  quantity: number;
  unitPrice: number;
}): Promise<Blob> {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setTextColor("#232323");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text("Custom Trophy Design Proof", 54, 58);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor("#6f6a62");
  pdf.text(`Design ID: ${input.designId}`, 54, 76);

  pdf.addImage(input.thumbnailDataUrl, "JPEG", 54, 96, pageWidth - 108, 280);

  pdf.setTextColor("#232323");
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.text("Award", 54, 406);
  pdf.text("Plate", 54, 428);
  pdf.text("Wording", 54, 450);
  pdf.text("Order", 54, 516);

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor("#323232");
  pdf.text(input.awardLabel, 142, 406);
  pdf.text(input.plateLabel, 142, 428);
  const wording = input.lines.filter((line) => line.trim()).join(" / ") || "—";
  pdf.text(wording, 142, 450, { maxWidth: pageWidth - 196 });
  pdf.text(
    `${input.quantity} × $${input.unitPrice.toFixed(2)} = $${(
      input.quantity * input.unitPrice
    ).toFixed(2)}`,
    142,
    516,
  );

  pdf.setDrawColor("#c9c0b2");
  pdf.line(54, 548, pageWidth - 54, 548);
  pdf.setFontSize(8);
  pdf.setTextColor("#6f6a62");
  pdf.text(
    "Artwork and placement are subject to production review before engraving.",
    54,
    568,
  );

  return pdf.output("blob");
}
