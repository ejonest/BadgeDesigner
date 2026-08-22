import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  saveGavelDesignMilestone,
  uploadedImageUrlFromBadgeRecord,
  type DesignSaveKind,
  type SignDesign,
} from "~/utils/supabase";
import { parseOr400, saveDesignBodySchema } from "~/utils/validation";

function coerceSaveKind(
  bodySave: unknown,
  top: Record<string, unknown> | undefined,
): DesignSaveKind {
  const fromBody =
    bodySave === "manual" || bodySave === "cart" || bodySave === "ordered"
      ? bodySave
      : undefined;
  if (fromBody) return fromBody;
  const sk = top?.saveKind ?? top?.save_kind;
  if (sk === "cart" || sk === "ordered" || sk === "manual") return sk;
  return "manual";
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = parseOr400(
      saveDesignBodySchema,
      body,
      "Invalid request body",
    );
    if (!parsed.ok) return parsed.response;
    const { designData: topRaw = {}, shopData = {}, saveKind: bodySaveKind } =
      parsed.data as {
        designData?: Record<string, unknown>;
        shopData?: Record<string, unknown>;
        saveKind?: DesignSaveKind;
      };

    const top = topRaw as Record<string, unknown>;

    const userId = (top.userId ??
      shopData.customerId ??
      (parsed.data as { userId?: string }).userId) as string | undefined;
    const shopId = (top.shopId ?? shopData.shopId) as string | undefined;
    const productId = top.productId as string | undefined;

    if (!userId || typeof userId !== "string" || !userId.trim()) {
      return json(
        {
          error:
            "Sign in to save your design. userId (customerId) is required.",
        },
        { status: 400 },
      );
    }

    if (!shopId || typeof shopId !== "string" || !shopId.trim()) {
      return json({ error: "Shop information is required." }, { status: 400 });
    }

    const milestoneKind = coerceSaveKind(bodySaveKind, top);

    const inner =
      (top.designData as Record<string, unknown> | undefined) ?? top;
    const allBadges = inner.allBadges as unknown[] | undefined;
    const firstBadge = Array.isArray(allBadges)
      ? (allBadges[0] as Record<string, unknown> | undefined)
      : (inner.badge as Record<string, unknown> | undefined) ??
        (top.badge as Record<string, unknown> | undefined);

    const designId =
      (top.designId as string | undefined) ??
      `design_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

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

    const designJson = {
      ...fullDesignData,
      gavelBandColor:
        (fullDesignData as { gavelBandColor?: string }).gavelBandColor ??
        (inner.gavelBandColor as string | undefined) ??
        (firstBadge?.backgroundColor as string | undefined) ??
        null,
      gavelPlateColor:
        (fullDesignData as { gavelProductType?: string }).gavelProductType ===
          "stand" || firstBadge?.gavelProductType === "stand"
          ? ((fullDesignData as { gavelPlateColor?: string }).gavelPlateColor ??
            (inner.gavelPlateColor as string | undefined) ??
            null)
          : null,
    };

    const row: SignDesign = {
      design_id: designId,
      product_id: productId ?? "",
      shop_id: shopId.trim(),
      user_id: userId.trim(),
      total_price:
        (typeof top.totalPrice === "number" ? top.totalPrice : undefined) ??
        (typeof inner.totalPrice === "number" ? inner.totalPrice : undefined) ??
        0,
      design_data: designJson,
      status: "saved",
      thumbnail_url: thumb,
      uploaded_image_url: uploadedImageUrlFromBadgeRecord(firstBadge),
    };

    const saved = await saveGavelDesignMilestone(row, milestoneKind);

    return json({
      success: true,
      id: saved.id,
      designId: saved.design_id,
      message: "Design saved. You can load it from your design library.",
    });
  } catch (error) {
    console.error("[GavelDesigner] api.save-gavel-design error:", error);
    const details = error instanceof Error ? error.message : "Unknown error";
    return json({ error: "Failed to save design", details }, { status: 500 });
  }
}
