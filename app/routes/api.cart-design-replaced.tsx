import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getDesignerConfig, isDesignerId } from "~/config/designers";
import { releaseReplacedCartOrderItems } from "~/lib/designers/orderItemsStorage";

/**
 * POST /api/cart-design-replaced { designId, designer, badgeIndex? }
 *
 * Called after an edited design replaces its cart line, so the old rows do not
 * linger as in_cart. `badgeIndex` scopes the release to the single line that was
 * edited, leaving the design's other cart lines untouched. Housekeeping only: it
 * never deletes assets and leaves placed orders alone.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  const body = (await request.json().catch(() => null)) as {
    designId?: string;
    designer?: string;
    badgeIndex?: number;
  } | null;
  const designId = body?.designId?.trim() ?? "";
  const designer = body?.designer?.trim() || "badge";
  const badgeIndex =
    typeof body?.badgeIndex === "number" && Number.isInteger(body.badgeIndex)
      ? body.badgeIndex
      : null;

  if (!designId) {
    return json({ success: false, error: "designId is required" }, { status: 400 });
  }
  if (!isDesignerId(designer)) {
    return json({ success: false, error: "Unknown designer" }, { status: 400 });
  }

  try {
    await releaseReplacedCartOrderItems(
      getDesignerConfig(designer),
      designId,
      badgeIndex,
    );
    return json({ success: true });
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
