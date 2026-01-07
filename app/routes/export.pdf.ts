import type { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import sharp from "sharp";

export const action: ActionFunction = async ({ request }) => {
  try {
    const { svg, width, height, filename } = await request.json();

    // sharp can turn a raster into a 1-page PDF.
    const pngBuffer = await sharp(Buffer.from(svg))
      .png({ compressionLevel: 9 })
      .toBuffer();

    const pdfBuffer = await sharp(pngBuffer)
      .pdf({ page: { width: width || 300, height: height || 100 } })
      .toBuffer();

    return new Response(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename || "badge.pdf"}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("PDF export error:", e);
    return json({ error: "Failed to export PDF" }, { status: 500 });
  }
};


