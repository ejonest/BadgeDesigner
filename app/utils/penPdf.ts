import { jsPDF } from "jspdf";
import { PEN_SURFACES } from "~/constants/pen";

export async function generatePenProofPdf(input: {
  designId: string;
  thumbnailDataUrl: string;
  bandSummary: string;
  capText: string;
  quantity: number;
  unitPrice: number;
}): Promise<Blob> {
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = pdf.internal.pageSize.getWidth();

  pdf.setTextColor("#0a2740");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.text("Custom Pen Design Proof", 54, 58);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor("#66717b");
  pdf.text(`Design ID: ${input.designId}`, 54, 76);

  pdf.addImage(input.thumbnailDataUrl, "PNG", 54, 100, pageWidth - 108, 304);

  pdf.setTextColor("#0a2740");
  pdf.setFontSize(11);
  pdf.setFont("helvetica", "bold");
  pdf.text("Case band", 54, 438);
  pdf.text("Pen cap", 54, 482);
  pdf.text("Order", 54, 526);

  pdf.setFont("helvetica", "normal");
  pdf.setTextColor("#323b43");
  pdf.text(input.bandSummary || "Uploaded logo", 142, 438);
  pdf.text(input.capText, 142, 482);
  pdf.text(
    `${input.quantity} × $${input.unitPrice.toFixed(2)} = $${(
      input.quantity * input.unitPrice
    ).toFixed(2)}`,
    142,
    526,
  );

  pdf.setDrawColor("#c7b37a");
  pdf.line(54, 556, pageWidth - 54, 556);
  pdf.setFontSize(8);
  pdf.setTextColor("#6f767d");
  pdf.text(
    `Initial calibration: case band ${PEN_SURFACES.caseBand.widthIn} × ${PEN_SURFACES.caseBand.heightIn} in; cap ${PEN_SURFACES.cap.widthIn} × ${PEN_SURFACES.cap.heightIn} in.`,
    54,
    578,
  );
  pdf.text(
    "Artwork and placement are subject to production review before engraving.",
    54,
    592,
  );

  return pdf.output("blob");
}
