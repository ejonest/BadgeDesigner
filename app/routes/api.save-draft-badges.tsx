import { json, type ActionFunctionArgs } from "@remix-run/node";
import {
  uploadToBadgeImagesBucket,
  convertBadgeToOrderItem,
  upsertBadgeOrderItems,
  deleteDraftBadgeOrderItemsExcept,
} from "~/utils/supabase";

/**
 * Incremental draft save: accepts designId + badge PNGs/SVGs (no PDF), uploads to storage,
 * upserts badge_order_items, and deletes orphan draft rows for this design_id.
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
    const designDataRaw = formData.get("designData");
    const designData =
      typeof designDataRaw === "string"
        ? JSON.parse(designDataRaw)
        : designDataRaw;
    if (!designData) {
      return json(
        { success: false, error: "designData is required" },
        { status: 400 },
      );
    }
    const shopifyCustomerId =
      (formData.get("shopifyCustomerId") as string) || null;

    const allBadges = designData.allBadges || (designData.badge ? [designData.badge] : []);
    if (allBadges.length === 0) {
      return json(
        { success: false, error: "No badges in designData" },
        { status: 400 },
      );
    }

    const badgeOrderItems: ReturnType<typeof convertBadgeToOrderItem>[] = [];

    for (let badgeIndex = 0; badgeIndex < allBadges.length; badgeIndex++) {
      const badge = allBadges[badgeIndex];
      const thumbnailPngFile = formData.get(
        `thumbnail_png_${badgeIndex}`,
      ) as File | null;
      const svgFile = formData.get(`svg_${badgeIndex}`) as File | null;

      let badgeThumbnailUrl = "";
      let badgeFullImageUrl = "";

      if (thumbnailPngFile?.size) {
        try {
          const thumbnailFileName = `${designId}/badge-${badgeIndex}-thumbnail.png`;
          badgeThumbnailUrl = await uploadToBadgeImagesBucket(
            thumbnailPngFile,
            thumbnailFileName,
            "image/png",
          );
        } catch (err) {
          console.warn(
            `[save-draft-badges] Thumbnail upload failed for badge ${badgeIndex}:`,
            err,
          );
        }
      }

      if (svgFile?.size) {
        try {
          const svgFileName = `${designId}/badge-${badgeIndex}-design.svg`;
          badgeFullImageUrl = await uploadToBadgeImagesBucket(
            svgFile,
            svgFileName,
            "image/svg+xml",
          );
        } catch (err) {
          console.warn(
            `[save-draft-badges] SVG upload failed for badge ${badgeIndex}:`,
            err,
          );
        }
      }

      const item = convertBadgeToOrderItem(badge, designId, badgeIndex, {
        thumbnail_url: badgeThumbnailUrl,
        full_image_url: badgeFullImageUrl,
        shopify_customer_id: shopifyCustomerId ?? undefined,
      });
      item.status = "draft";
      badgeOrderItems.push(item);
    }

    await upsertBadgeOrderItems(badgeOrderItems);
    const keepBadgeIds = badgeOrderItems
      .map((_, i) => `badge-${i}`)
      .filter(Boolean);
    await deleteDraftBadgeOrderItemsExcept(designId, keepBadgeIds);

    const thumbnailUrls = badgeOrderItems.map((i) => i.thumbnail_url || "");
    return json({
      success: true,
      thumbnailUrls,
      savedCount: badgeOrderItems.length,
    });
  } catch (err) {
    console.error("[save-draft-badges] error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
