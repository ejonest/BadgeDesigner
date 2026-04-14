import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  deleteSavedSignDesignsForUser,
  saveSignDesign,
} from "~/utils/supabase";
import type { SignDesign } from "~/utils/supabase";
import { parseOr400, saveDesignBodySchema } from "~/utils/validation";

/**
 * Save sign design to Supabase (`sign_designs`): one saved set per user per shop.
 * Same body shape as POST /api/save-design; keeps badge saves in `badge_designs` untouched.
 */
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
    const { designData = {}, shopData = {} } = parsed.data as {
      designData?: Record<string, unknown>;
      shopData?: Record<string, unknown>;
      userId?: string;
    };

    const userId = (designData?.userId ??
      shopData?.customerId ??
      (parsed.data as { userId?: string }).userId) as string | undefined;
    const shopId = (designData?.shopId ?? shopData?.shopId) as
      | string
      | undefined;
    const productId = designData?.productId as string | undefined;

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

    const dd = designData.designData as Record<string, unknown> | undefined;
    const badgeDesignData =
      (dd?.badge as Record<string, unknown> | undefined) ??
      (designData.badge as Record<string, unknown> | undefined) ??
      designData;
    const allBadges = (dd?.allBadges ?? designData.allBadges) as
      | unknown[]
      | undefined;
    const firstBadge = Array.isArray(allBadges)
      ? (allBadges[0] as Record<string, unknown> | undefined)
      : (badgeDesignData as Record<string, unknown> | undefined);

    const designId =
      (designData.designId as string | undefined) ??
      `design_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const fullDesignData = dd ?? {
      badge: firstBadge,
      multipleBadges:
        Array.isArray(allBadges) && allBadges.length > 1
          ? allBadges.slice(1)
          : [],
      allBadges: Array.isArray(allBadges) ? allBadges : [firstBadge].filter(Boolean),
      timestamp: new Date().toISOString(),
    };

    await deleteSavedSignDesignsForUser(userId.trim(), shopId.trim());

    const row: SignDesign = {
      design_id: designId,
      product_id: productId ?? "",
      shop_id: shopId.trim(),
      user_id: userId.trim(),
      background_color:
        (firstBadge?.backgroundColor as string | undefined) ?? "#FFFFFF",
      backing_type: firstBadge?.backing as string | undefined,
      backing_price: (designData.backingPrice as number | undefined) ?? 0,
      base_price: (designData.basePrice as number | undefined) ?? 9.99,
      total_price: (designData.totalPrice as number | undefined) ?? 9.99,
      design_data: fullDesignData,
      text_lines:
        (designData.textLines as unknown) ?? firstBadge?.lines ?? [],
      status: "saved",
    };

    const saved = await saveSignDesign(row);

    return json({
      success: true,
      id: saved.id,
      designId: saved.design_id,
      message: "Design saved. You can load it next time you visit.",
    });
  } catch (error) {
    console.error("[SignDesigner] api.save-sign-design error:", error);
    let details = "Unknown error";
    if (error instanceof Error) {
      details = error.message;
    } else if (error && typeof error === "object") {
      const o = error as Record<string, unknown>;
      if (typeof o.message === "string") details = o.message;
      else if (typeof o.details === "string") details = o.details;
      else if (typeof o.error_description === "string")
        details = o.error_description;
      else details = JSON.stringify(o);
    }
    return json(
      {
        error: "Failed to save design",
        details,
      },
      { status: 500 },
    );
  }
}
