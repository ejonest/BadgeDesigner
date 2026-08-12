import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getLatestSavedGavelDesign } from "~/utils/supabase";
import { parseOr400, savedDesignQuerySchema } from "~/utils/validation";

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const query = {
    shop: url.searchParams.get("shop") ?? "",
    userId: url.searchParams.get("userId") ?? "",
  };
  const parsed = parseOr400(
    savedDesignQuerySchema,
    query,
    "shop and userId are required",
  );
  if (!parsed.ok) return parsed.response;
  const { shop: shopId, userId } = parsed.data;

  try {
    const design = await getLatestSavedGavelDesign(userId, shopId);
    if (!design) {
      return json({ saved: false, design: null });
    }
    return json({
      saved: true,
      design: {
        design_id: design.design_id,
        design_data: design.design_data,
        updated_at: design.updated_at,
        backing_type: design.backing_type ?? undefined,
      },
    });
  } catch (error) {
    console.error("[GavelDesigner] api.saved-gavel-design loader error:", error);
    return json(
      {
        error: "Failed to load saved design",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
