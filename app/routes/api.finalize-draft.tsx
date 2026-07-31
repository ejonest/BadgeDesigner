import { json, type ActionFunctionArgs } from "@remix-run/node";
import { getDesignerConfig } from "~/config/designers";
import {
  uploadImageToDesignerBucket,
  uploadPdfToDesignerBucket,
  updateDesignerOrderItemsStatusByDesignId,
} from "~/lib/designers/orderItemsStorage";
import { getPacificTimestamp, supabaseAdmin } from "~/utils/supabase";

/**
 * Finalize draft on add-to-cart:
 * - upload proof PDF → pdf_url
 * - upload print-ready SVGs → print_svg_url (per badge line)
 * - set status to in_cart
 * Returns thumbnailUrls / fullImageUrls / printSvgUrls for cart properties.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  if (!supabaseAdmin) {
    return json(
      { success: false, error: "Supabase is not configured" },
      { status: 503 },
    );
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
    const backingType =
      (formData.get("backingType") as string)?.trim() || undefined;

    const def = getDesignerConfig("badge");

    let pdfUrl: string;
    try {
      pdfUrl = await uploadPdfToDesignerBucket(
        def,
        pdfFile,
        def.pdfProofRelativePath(designId),
        "application/pdf",
      );
    } catch (err) {
      console.error("[finalize-draft] PDF upload failed:", err);
      return json(
        { success: false, error: "PDF upload failed" },
        { status: 503 },
      );
    }

    const { data: existingRows, error: selectError } = await supabaseAdmin
      .from(def.orderItemsTable)
      .select("id, badge_id, thumbnail_url, full_image_url, print_svg_url, status")
      .eq("design_id", designId)
      .in("status", ["draft", "in_cart"]);

    if (selectError) {
      console.error("[finalize-draft] select failed:", selectError);
      return json(
        { success: false, error: selectError.message },
        { status: 500 },
      );
    }

    const rows = (existingRows ?? []) as Array<{
      id: string;
      badge_id: string | null;
      thumbnail_url: string | null;
      full_image_url: string | null;
      print_svg_url: string | null;
      status: string;
    }>;

    if (rows.length === 0) {
      return json({
        success: false,
        draftNotFound: true,
        message:
          "No draft/in_cart rows found for this design; use full add-to-cart flow.",
      });
    }

    rows.sort((a, b) => {
      const aIdx = a.badge_id
        ? parseInt(a.badge_id.replace(`${def.lineIdPrefix}-`, ""), 10)
        : 0;
      const bIdx = b.badge_id
        ? parseInt(b.badge_id.replace(`${def.lineIdPrefix}-`, ""), 10)
        : 0;
      return (Number.isFinite(aIdx) ? aIdx : 0) - (Number.isFinite(bIdx) ? bIdx : 0);
    });

    const printSvgUrlsByBadgeId = new Map<string, string>();
    const printUploadJobs: Promise<void>[] = [];
    for (let i = 0; i < rows.length; i++) {
      const printSvgFile = formData.get(`print_svg_${i}`) as File | null;
      if (!printSvgFile?.size) continue;
      const badgeId = rows[i]?.badge_id || `${def.lineIdPrefix}-${i}`;
      printUploadJobs.push(
        (async () => {
          try {
            const printSvgName = `${designId}/${def.lineIdPrefix}-${i}-print.svg`;
            const url = await uploadImageToDesignerBucket(
              def,
              printSvgFile,
              printSvgName,
              "image/svg+xml",
            );
            printSvgUrlsByBadgeId.set(badgeId, url);
          } catch (err) {
            console.warn(
              `[finalize-draft] Print SVG upload failed line ${i}:`,
              err,
            );
          }
        })(),
      );
    }
    await Promise.all(printUploadJobs);

    const now = getPacificTimestamp();
    for (const row of rows) {
      const updatePayload: Record<string, unknown> = {
        pdf_url: pdfUrl,
        updated_at: now,
      };
      if (backingType) updatePayload.backing_type = backingType;
      const printUrl =
        row.badge_id && printSvgUrlsByBadgeId.get(row.badge_id);
      if (printUrl) updatePayload.print_svg_url = printUrl;

      const { error: upErr } = await supabaseAdmin
        .from(def.orderItemsTable)
        .update(updatePayload)
        .eq("id", row.id);
      if (upErr) {
        console.error("[finalize-draft] row update failed:", row.id, upErr);
        throw upErr;
      }
    }

    try {
      await updateDesignerOrderItemsStatusByDesignId(def, designId, "in_cart");
    } catch (statusErr) {
      console.warn(
        "[finalize-draft] in_cart status update failed (run migration_add_in_cart_status.sql if needed):",
        statusErr,
      );
    }

    const printSvgUrls = rows.map((r) => {
      const fromUpload =
        (r.badge_id && printSvgUrlsByBadgeId.get(r.badge_id)) || "";
      return fromUpload || r.print_svg_url || "";
    });

    return json({
      success: true,
      thumbnailUrls: rows.map((r) => r.thumbnail_url || ""),
      fullImageUrls: rows.map((r) => r.full_image_url || ""),
      printSvgUrls,
      pdfUrl,
      updatedCount: rows.length,
    });
  } catch (err) {
    console.error("[finalize-draft] error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ success: false, error: message }, { status: 500 });
  }
}
