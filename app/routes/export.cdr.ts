import type { ActionFunction } from "@remix-run/node";
import { json } from "@remix-run/node";

export const action: ActionFunction = async ({ request }) => {
  try {
    const { svg, filename } = await request.json();
    const outName = filename || "badge.cdr";

    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": `attachment; filename="${outName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("CDR export error:", e);
    return json({ error: "Failed to export CDR" }, { status: 500 });
  }
};


