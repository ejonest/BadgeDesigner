import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getDeskSignDesignForUserShop } from "~/utils/supabase";
import { parseOr400, savedDesignDetailQuerySchema } from "~/utils/validation";

/** GET /api/saved-desk-sign-design-detail?shop=&userId=&designId= */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const query = {
    shop: url.searchParams.get("shop") ?? "",
    userId: url.searchParams.get("userId") ?? "",
    designId: url.searchParams.get("designId") ?? "",
  };
  const parsed = parseOr400(
    savedDesignDetailQuerySchema,
    query,
    "shop, userId, and designId are required",
  );
  if (!parsed.ok) return parsed.response;
  const { shop: shopId, userId, designId } = parsed.data;

  try {
    const row = await getDeskSignDesignForUserShop(userId, shopId, designId);
    if (!row?.design_data) {
      return json({ found: false, design: null }, { status: 404 });
    }
    return json({
      found: true,
      design: {
        design_id: row.design_id,
        design_data: row.design_data,
        updated_at: row.updated_at,
        backing_type: row.backing_type ?? undefined,
        save_kind: row.save_kind ?? undefined,
      },
    });
  } catch (error) {
    console.error("[api.saved-desk-sign-design-detail] error:", error);
    return json(
      {
        error: "Failed to load design",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
