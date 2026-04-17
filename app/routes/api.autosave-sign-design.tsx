import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { upsertSignAutosaveDesign, type SignDesign } from "~/utils/supabase";
import { parseOr400, saveDesignBodySchema } from "~/utils/validation";

/** Cloud autosave for sign designer: one row per user/shop. */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = parseOr400(saveDesignBodySchema, body, "Invalid request body");
    if (!parsed.ok) return parsed.response;
    const { designData: topRaw = {}, shopData = {} } = parsed.data as {
      designData?: Record<string, unknown>;
      shopData?: Record<string, unknown>;
    };

    const top = topRaw as Record<string, unknown>;

    const userId = (top.userId ??
      shopData.customerId ??
      (parsed.data as { userId?: string }).userId) as string | undefined;
    const shopId = (top.shopId ?? shopData.shopId) as string | undefined;
    const productId = top.productId as string | undefined;

    if (!userId || typeof userId !== "string" || !userId.trim()) {
      return json({ error: "userId (customerId) is required." }, { status: 400 });
    }

    if (!shopId || typeof shopId !== "string" || !shopId.trim()) {
      return json({ error: "Shop information is required." }, { status: 400 });
    }

    const inner =
      (top.designData as Record<string, unknown> | undefined) ?? top;
    const allBadges = inner.allBadges as unknown[] | undefined;
    const firstBadge = Array.isArray(allBadges)
      ? (allBadges[0] as Record<string, unknown> | undefined)
      : (inner.badge as Record<string, unknown> | undefined) ??
        (top.badge as Record<string, unknown> | undefined);

    const fullDesignData =
      inner.allBadges != null || inner.badge != null
        ? inner
        : {
            badge: firstBadge,
            multipleBadges:
              Array.isArray(allBadges) && allBadges.length > 1
                ? allBadges.slice(1)
                : [],
            allBadges: Array.isArray(allBadges)
              ? allBadges
              : [firstBadge].filter(Boolean),
            timestamp: new Date().toISOString(),
          };

    const thumb =
      (top.thumbnailUrl as string | undefined) ??
      (top.thumbnail_url as string | undefined);

    const row: SignDesign = {
      design_id: "",
      product_id: productId ?? "",
      shop_id: shopId.trim(),
      user_id: userId.trim(),
      background_color:
        (firstBadge?.backgroundColor as string | undefined) ?? "#FFFFFF",
      backing_type: firstBadge?.backing as string | undefined,
      backing_price: (top.backingPrice as number | undefined) ?? 0,
      base_price: (top.basePrice as number | undefined) ?? 9.99,
      total_price: (top.totalPrice as number | undefined) ?? 9.99,
      design_data: fullDesignData,
      thumbnail_url: thumb,
    };

    const saved = await upsertSignAutosaveDesign(row);

    return json({
      success: true,
      id: saved.id,
      designId: saved.design_id,
    });
  } catch (error) {
    console.error("[SignDesigner] api.autosave-sign-design error:", error);
    const details =
      error instanceof Error ? error.message : "Unknown error";
    return json(
      { error: "Failed to autosave design", details },
      { status: 500 },
    );
  }
}
