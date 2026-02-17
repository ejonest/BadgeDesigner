import { json, type ActionFunctionArgs } from "@remix-run/node";
import {
  uploadToBadgePdfsBucket,
  uploadToBadgeImagesBucket,
  saveBadgeOrderItems,
  convertBadgeToOrderItem,
  updateBadgeOrderItemsStatusByDesignId,
  deleteBadgeOrderItemsByDesignId,
} from "~/utils/supabase";

export async function action({ request }: ActionFunctionArgs) {
  console.log(
    "[BadgeDesigner] api.send-to-supabase request received",
    new Date().toISOString(),
    request.method,
  );
  try {
    const formData = await request.formData();
    const storageOnly =
      formData.get("storageOnly") === "true" ||
      new URL(request.url).searchParams.get("storageOnly") === "true";

    const designId = formData.get("designId") as string;
    const designData = JSON.parse(formData.get("designData") as string);
    const shopifyCustomerId =
      (formData.get("shopifyCustomerId") as string) || null;

    // Count thumbnail PNG and SVG files
    let thumbnailCount = 0;
    let svgCount = 0;
    let index = 0;
    while (
      formData.get(`thumbnail_png_${index}`) ||
      formData.get(`svg_${index}`)
    ) {
      if (formData.get(`thumbnail_png_${index}`)) thumbnailCount++;
      if (formData.get(`svg_${index}`)) svgCount++;
      index++;
    }

    console.log("[BadgeDesigner] send-to-supabase payload:", {
      designId,
      hasPdf: !!formData.get("pdf"),
      thumbnailCount,
      svgCount,
      shopifyCustomerId,
    });

    // Upload PDF to badge-pdfs bucket - ONE PDF for the entire order
    let pdfUrl = "";

    const pdfFile = formData.get("pdf") as File;

    // Upload PDF (contains all badges in one file) - ONLY to badge-pdfs bucket
    if (pdfFile && pdfFile.size > 0) {
      try {
        const pdfFileName = `${designId}/badge-design.pdf`;
        pdfUrl = await uploadToBadgePdfsBucket(
          pdfFile,
          pdfFileName,
          "application/pdf",
        );
        console.log(
          `PDF uploaded successfully to badge-pdfs (${(
            pdfFile.size / 1024
          ).toFixed(2)} KB):`,
          pdfUrl,
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        console.error("PDF upload failed:", errorMessage);
        console.error("Full error:", error);
        // Don't throw - continue with PNG uploads even if PDF fails
      }
    } else {
      console.warn("PDF file is missing or empty - this should not happen");
    }

    // Get all badges from design data
    const allBadges = designData.allBadges || [designData.badge];

    // Upload files for each badge and prepare order items
    const badgeOrderItems = [];

    for (let badgeIndex = 0; badgeIndex < allBadges.length; badgeIndex++) {
      const badge = allBadges[badgeIndex];

      // Get thumbnail PNG file (low quality) and SVG file (high quality) for this badge
      const thumbnailPngFile = formData.get(
        `thumbnail_png_${badgeIndex}`,
      ) as File;
      const svgFile = formData.get(`svg_${badgeIndex}`) as File;

      let badgeThumbnailUrl = "";
      let badgeFullImageUrl = "";

      // Upload low-quality PNG for thumbnail - ONLY to badge-images bucket
      if (thumbnailPngFile && thumbnailPngFile.size > 0) {
        try {
          const thumbnailFileName = `${designId}/badge-${badgeIndex}-thumbnail.png`;
          badgeThumbnailUrl = await uploadToBadgeImagesBucket(
            thumbnailPngFile,
            thumbnailFileName,
            "image/png",
          );
          console.log(
            `Thumbnail PNG uploaded successfully to badge-images for badge ${badgeIndex}:`,
            badgeThumbnailUrl,
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          console.error(
            `Thumbnail PNG upload failed for badge ${badgeIndex}:`,
            errorMessage,
          );
          console.error("Full error:", error);
        }
      } else {
        if (thumbnailPngFile) {
          console.warn(
            `Thumbnail PNG file for badge ${badgeIndex} is empty (size: ${thumbnailPngFile.size}), skipping upload`,
          );
        } else {
          console.warn(
            `Thumbnail PNG file missing for badge ${badgeIndex}, skipping upload`,
          );
        }
      }

      // Upload SVG for full image - ONLY to badge-images bucket
      if (svgFile && svgFile.size > 0) {
        try {
          const svgFileName = `${designId}/badge-${badgeIndex}-design.svg`;
          badgeFullImageUrl = await uploadToBadgeImagesBucket(
            svgFile,
            svgFileName,
            "image/svg+xml",
          );
          console.log(
            `SVG uploaded successfully to badge-images for badge ${badgeIndex}:`,
            badgeFullImageUrl,
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          console.error(
            `SVG upload failed for badge ${badgeIndex}:`,
            errorMessage,
          );
          console.error("Full error:", error);
        }
      } else {
        if (svgFile) {
          console.warn(
            `SVG file for badge ${badgeIndex} is empty (size: ${svgFile.size}), skipping upload`,
          );
        } else {
          console.warn(
            `SVG file missing for badge ${badgeIndex}, skipping upload`,
          );
        }
      }

      // Create badge order item using the helper function
      const badgeOrderItem = convertBadgeToOrderItem(
        badge,
        designId,
        badgeIndex,
        {
          thumbnail_url: badgeThumbnailUrl,
          full_image_url: badgeFullImageUrl,
          pdf_url: pdfUrl, // Same PDF for all badges (contains all badges)
          shopify_customer_id: shopifyCustomerId ?? undefined,
        },
      );
      badgeOrderItem.status = "draft";
      badgeOrderItems.push(badgeOrderItem);
    }

    // Storage-only mode (Add to Cart): replace any existing rows for this design_id, then insert full set (avoids duplicate key when draft already had fewer badges).
    if (storageOnly) {
      let savedCount = 0;
      try {
        await deleteBadgeOrderItemsByDesignId(designId);
        const saved = await saveBadgeOrderItems(badgeOrderItems);
        savedCount = Array.isArray(saved) ? saved.length : 0;
        console.log(
          `[BadgeDesigner] storageOnly: saved ${savedCount} draft badge order items for design ${designId}`,
        );
        try {
          await updateBadgeOrderItemsStatusByDesignId(designId, "in_cart");
        } catch (statusErr) {
          console.warn("[send-to-supabase] in_cart status update failed (run migration_add_in_cart_status.sql if needed):", statusErr);
        }
      } catch (saveErr) {
        console.error(
          "[BadgeDesigner] storageOnly: saveBadgeOrderItems failed:",
          saveErr,
        );
        return json(
          {
            success: false,
            error: "Failed to save draft order items",
            message:
              "Files uploaded but draft rows could not be saved. Check Supabase and badge_order_items table.",
          },
          { status: 503 },
        );
      }
      const hasAnyUploads =
        pdfUrl ||
        badgeOrderItems.some(
          (item) => item.thumbnail_url || item.full_image_url,
        );
      return json({
        success: true,
        storageOnly: true,
        uploads: {
          pdf: !!pdfUrl,
          thumbnails: badgeOrderItems.some((i) => i.thumbnail_url),
          fullImages: badgeOrderItems.some((i) => i.full_image_url),
        },
        thumbnailUrls: badgeOrderItems.map((i) => i.thumbnail_url || ""),
        fullImageUrls: badgeOrderItems.map((i) => i.full_image_url || ""),
        pdfUrl: pdfUrl || undefined,
        savedDraftCount: savedCount,
        message: hasAnyUploads
          ? "Proof files uploaded and draft order items saved; order will be linked when paid"
          : "Draft order items saved",
      });
    }

    // Save all badge order items to database
    let savedItems = null;
    try {
      savedItems = await saveBadgeOrderItems(badgeOrderItems);
      console.log(
        `Saved ${savedItems?.length || 0} badge order items to Supabase:`,
        {
          designId,
          badgeCount: savedItems?.length || 0,
          pdfUrl,
          thumbnailUrl: savedItems?.[0]?.thumbnail_url,
          fullImageUrl: savedItems?.[0]?.full_image_url,
        },
      );
    } catch (error) {
      console.error("Save badge order items error:", error);
      // Continue even if database save fails
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      if (
        errorMessage.includes("ENOTFOUND") ||
        errorMessage.includes("fetch failed")
      ) {
        return json(
          {
            success: false,
            error:
              "Cannot connect to Supabase. Please check your network connection and Supabase configuration.",
            message:
              "Supabase connection failed. Files were generated but could not be uploaded.",
            warning: true,
          },
          { status: 503 },
        );
      }
      throw error;
    }

    // Check if any uploads succeeded
    const hasAnyUploads =
      pdfUrl ||
      (savedItems &&
        savedItems.length > 0 &&
        (savedItems[0].thumbnail_url || savedItems[0].full_image_url));
    if (!hasAnyUploads && !savedItems) {
      return json(
        {
          success: false,
          error:
            "All uploads failed. Please check your Supabase configuration and network connection.",
          message: "Failed to upload files to Supabase storage",
        },
        { status: 503 },
      );
    }

    const badgeCount = savedItems?.length || 0;
    const hasThumbnail =
      savedItems && savedItems.length > 0 && !!savedItems[0].thumbnail_url;
    const hasFullImage =
      savedItems && savedItems.length > 0 && !!savedItems[0].full_image_url;

    return json({
      success: true,
      data: savedItems,
      badgeCount,
      uploads: {
        pdf: !!pdfUrl,
        thumbnails: hasThumbnail,
        fullImages: hasFullImage,
      },
      pdfUrl: pdfUrl || undefined,
      message: hasAnyUploads
        ? `Badge design uploaded successfully to Supabase (${badgeCount} badge${
            badgeCount !== 1 ? "s" : ""
          } saved)`
        : "Badge design saved to database (file uploads failed)",
    });
  } catch (error) {
    console.error("Send to Supabase error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Check if it's a network/connection error
    if (
      errorMessage.includes("ENOTFOUND") ||
      errorMessage.includes("fetch failed")
    ) {
      return json(
        {
          success: false,
          error:
            "Cannot connect to Supabase. Please check your network connection and Supabase configuration.",
          message: "Supabase connection failed",
        },
        { status: 503 },
      );
    }

    return json(
      {
        success: false,
        error: errorMessage,
        message: "Failed to upload badge design to Supabase",
      },
      { status: 500 },
    );
  }
}
