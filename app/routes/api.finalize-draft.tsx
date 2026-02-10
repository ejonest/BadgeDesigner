import { json, type ActionFunctionArgs } from "@remix-run/node";
import {
  uploadToBadgePdfsBucket,
  updateDraftPdfUrlAndReturnRows,
  updateBadgeOrderItemsStatusByDesignId,
} from "~/utils/supabase";

/**
 * Finalize draft: upload PDF and set pdf_url on existing draft rows for this design_id.
 * Returns thumbnailUrls (and fullImageUrls) for building cart items.
 * If no draft rows exist, returns draftNotFound: true so the client can fall back to full flow.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const formData = await request.formData();
    const designId = (formData.get("designId") as string)?.trim();
    if (!designId) {
      return json(
        { success: false, error: "designId is required" },
        { status: 400 },
      );
    }
    const pdfFile = formData.get("pdf") as File | null;
    if (!pdfFile?.size) {
      return json(
        { success: false, error: "pdf file is required" },
        { status: 400 },
      );
    }

    const pdfFileName = `${designId}/badge-design.pdf`;
    let pdfUrl: string;
    try {
      pdfUrl = await uploadToBadgePdfsBucket(
        pdfFile,
        pdfFileName,
        "application/pdf",
      );
    } catch (err) {
      console.error("[finalize-draft] PDF upload failed:", err);
      return json(
        { success: false, error: "PDF upload failed" },
        { status: 503 },
      );
    }

    const { thumbnailUrls, fullImageUrls, updatedCount } =
      await updateDraftPdfUrlAndReturnRows(designId, pdfUrl);

    if (updatedCount === 0) {
      return json({
        success: false,
        draftNotFound: true,
        message: "No draft rows found for this design; use full add-to-cart flow.",
      });
    }

    await updateBadgeOrderItemsStatusByDesignId(designId, "in_cart");

    return json({
      success: true,
      thumbnailUrls,
      fullImageUrls,
      updatedCount,
    });
  } catch (err) {
    console.error("[finalize-draft] error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
