import type { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import sharp from "sharp";

export const action: ActionFunction = async ({ request }) => {
  try {
    const { svg, width, height, filename } = await request.json();

    const pngBuffer = await sharp(Buffer.from(svg)).png({
      compressionLevel: 9,
      progressive: false,
    }).toBuffer();

    const tiffBuffer = await sharp(pngBuffer)
      .tiff({ compression: "lzw" })
      .toBuffer();

    return new Response(tiffBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/tiff",
        "Content-Disposition": `attachment; filename="${filename || "badge.tiff"}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("TIFF export error:", e);
    return json({ error: "Failed to export TIFF" }, { status: 500 });
  }
};


