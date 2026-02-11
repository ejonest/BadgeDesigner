import { json, type ActionFunctionArgs } from "@remix-run/node";
import {
  uploadToBadgeImagesBucket,
  convertBadgeToOrderItem,
  saveBadgeOrderItems,
  deleteDraftBadgeOrderItemsExcept,
} from "~/utils/supabase";

/**
 * Incremental draft save: accepts designId + badge PNGs/SVGs (no PDF), uploads to storage,
 * replaces draft rows for this design_id (delete existing drafts then insert) so we don't
 * depend on a unique constraint for upsert (table has a partial unique index only).
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  console.log("[BadgeDesigner] api.save-draft-badges request received", new Date().toISOString());
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
    // Cache-bust: each save uses new paths so PNG/SVG/table always reflect latest (avoids CDN/browser serving old assets)
    const saveTimestamp = Date.now();

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
          const thumbnailFileName = `${designId}/badge-${badgeIndex}-thumbnail-${saveTimestamp}.png`;
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
          const svgFileName = `${designId}/badge-${badgeIndex}-design-${saveTimestamp}.svg`;
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

    // Delete all existing draft rows for this design, then insert (avoids ON CONFLICT / partial unique index issues)
    await deleteDraftBadgeOrderItemsExcept(designId, []);
    await saveBadgeOrderItems(badgeOrderItems);

    const thumbnailUrls = badgeOrderItems.map((i) => i.thumbnail_url || "");
    console.log("[BadgeDesigner] save-draft-badges OK:", designId, "savedCount:", badgeOrderItems.length);
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
