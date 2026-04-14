import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { listSignDesignGallery } from "~/utils/supabase";
import { parseOr400, savedDesignQuerySchema } from "~/utils/validation";

/** GET /api/saved-sign-designs?shop=&userId= */
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
    const { autosave, milestones } = await listSignDesignGallery(
      userId,
      shopId,
    );
    return json({
      autosave,
      milestones,
      items: [
        ...(autosave ? [{ ...autosave, isAutosave: true as const }] : []),
        ...milestones.map((m) => ({ ...m, isAutosave: false as const })),
      ],
    });
  } catch (error) {
    console.error("[api.saved-sign-designs] error:", error);
    return json(
      {
        error: "Failed to list saved designs",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
