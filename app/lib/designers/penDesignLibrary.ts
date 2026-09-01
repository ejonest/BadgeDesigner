import { json } from "@remix-run/node";
import {
  deleteDesignLibraryMilestone,
  getLatestSavedPenDesign,
  getPenDesignForUserShop,
  listPenDesignGallery,
  savePenDesignMilestone,
  upsertPenAutosaveDesign,
  uploadedImageUrlFromBadgeRecord,
  type DesignSaveKind,
  type SignDesign,
} from "~/utils/supabase";
import {
  deleteDesignMilestoneBodySchema,
  parseOr400,
  savedDesignDetailQuerySchema,
  savedDesignQuerySchema,
  saveDesignBodySchema,
} from "~/utils/validation";

function requestDesignRow(body: Record<string, unknown>): {
  row: SignDesign;
  saveKind: DesignSaveKind;
} | Response {
  const parsed = parseOr400(
    saveDesignBodySchema,
    body,
    "Invalid request body",
  );
  if (!parsed.ok) return parsed.response;
  const { designData: topRaw = {}, shopData = {}, saveKind: rawSaveKind } =
    parsed.data as {
      designData?: Record<string, unknown>;
      shopData?: Record<string, unknown>;
      saveKind?: DesignSaveKind;
    };
  const top = topRaw as Record<string, unknown>;
  const userId = (top.userId ?? shopData.customerId) as string | undefined;
  const shopId = (top.shopId ?? shopData.shopId) as string | undefined;
  if (!userId?.trim() || !shopId?.trim()) {
    return json(
      { error: "A signed-in customer and shop are required." },
      { status: 400 },
    );
  }
  const inner =
    (top.designData as Record<string, unknown> | undefined) ?? top;
  const allBadges = inner.allBadges as Record<string, unknown>[] | undefined;
  const firstBadge =
    allBadges?.[0] ??
    (inner.badge as Record<string, unknown> | undefined) ??
    (top.badge as Record<string, unknown> | undefined);
  const designId =
    (top.designId as string | undefined) ??
    `design_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const saveKind: DesignSaveKind =
    rawSaveKind === "cart" || rawSaveKind === "ordered"
      ? rawSaveKind
      : "manual";
  return {
    row: {
      design_id: designId,
      product_id: String(top.productId ?? inner.productId ?? ""),
      shop_id: shopId.trim(),
      user_id: userId.trim(),
      total_price: Number(top.totalPrice ?? inner.totalPrice ?? 0),
      design_data: inner,
      status: "saved",
      thumbnail_url:
        (top.thumbnailUrl as string | undefined) ??
        (top.thumbnail_url as string | undefined),
      uploaded_image_url: uploadedImageUrlFromBadgeRecord(firstBadge),
    },
    saveKind,
  };
}

export async function savePenDesignRequest(
  request: Request,
  autosave: boolean,
) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  try {
    const body = (await request.json().catch(() => null)) as Record<
      string,
      unknown
    > | null;
    if (!body) return json({ error: "Invalid request body" }, { status: 400 });
    const result = requestDesignRow(body);
    if (result instanceof Response) return result;
    const saved = autosave
      ? await upsertPenAutosaveDesign({ ...result.row, design_id: "" })
      : await savePenDesignMilestone(result.row, result.saveKind);
    return json({
      success: true,
      id: saved.id,
      designId: saved.design_id,
      message: autosave ? "Design autosaved." : "Design saved.",
    });
  } catch (error) {
    return json(
      {
        error: autosave ? "Failed to autosave design" : "Failed to save design",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

function requiredQuery(request: Request, detail = false) {
  const url = new URL(request.url);
  const query = {
    shop: url.searchParams.get("shop") ?? "",
    userId: url.searchParams.get("userId") ?? "",
    ...(detail ? { designId: url.searchParams.get("designId") ?? "" } : {}),
  };
  return parseOr400(
    detail ? savedDesignDetailQuerySchema : savedDesignQuerySchema,
    query,
    detail
      ? "shop, userId, and designId are required"
      : "shop and userId are required",
  );
}

export async function latestPenDesignRequest(request: Request) {
  const parsed = requiredQuery(request);
  if (!parsed.ok) return parsed.response;
  const { shop, userId } = parsed.data as { shop: string; userId: string };
  const design = await getLatestSavedPenDesign(userId, shop);
  return json(
    design
      ? { saved: true, design }
      : { saved: false, design: null },
  );
}

export async function listPenDesignsRequest(request: Request) {
  const parsed = requiredQuery(request);
  if (!parsed.ok) return parsed.response;
  const { shop, userId } = parsed.data as { shop: string; userId: string };
  const { autosave, milestones } = await listPenDesignGallery(userId, shop);
  return json({
    autosave,
    milestones,
    items: [
      ...(autosave ? [{ ...autosave, isAutosave: true as const }] : []),
      ...milestones.map((item) => ({ ...item, isAutosave: false as const })),
    ],
  });
}

export async function penDesignDetailRequest(request: Request) {
  const parsed = requiredQuery(request, true);
  if (!parsed.ok) return parsed.response;
  const { shop, userId, designId } = parsed.data as {
    shop: string;
    userId: string;
    designId: string;
  };
  const design = await getPenDesignForUserShop(userId, shop, designId);
  return design?.design_data
    ? json({ found: true, design })
    : json({ found: false, design: null }, { status: 404 });
}

export async function deletePenDesignRequest(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = parseOr400(
    deleteDesignMilestoneBodySchema,
    body,
    "Invalid request body",
  );
  if (!parsed.ok) return parsed.response;
  await deleteDesignLibraryMilestone(
    "pen_designs",
    parsed.data.userId.trim(),
    parsed.data.shopId.trim(),
    parsed.data.designId.trim(),
  );
  return json({ success: true });
}
