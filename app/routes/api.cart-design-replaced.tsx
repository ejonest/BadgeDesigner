import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getDesignerConfig, isDesignerId } from "~/config/designers";
import { deleteReplacedCartOrderItems } from "~/lib/designers/orderItemsStorage";

/**
 * POST /api/cart-design-replaced { designId, designer }
 *
 * Called after an edited design replaces its cart lines. The edit is saved under
 * a new design_id, so the original rows are deleted rather than left behind as a
 * duplicate copy of the same design.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = (await request.json().catch(() => null)) as {
    designId?: string;
    designer?: string;
  } | null;
  const designId = body?.designId?.trim() ?? "";
  const designer = body?.designer?.trim() || "badge";

  if (!designId) {
    return json({ success: false, error: "designId is required" }, { status: 400 });
  }
  if (!isDesignerId(designer)) {
    return json({ success: false, error: "Unknown designer" }, { status: 400 });
  }

  try {
    const deleted = await deleteReplacedCartOrderItems(
      getDesignerConfig(designer),
      designId,
    );
    return json({ success: true, deleted });
  } catch (error) {
    console.error("[api.cart-design-replaced] error:", error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
