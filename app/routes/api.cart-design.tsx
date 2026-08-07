import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { getDesignerConfig, isDesignerId } from "~/config/designers";
import { getDesignerOrderItemsByDesignId } from "~/lib/designers/orderItemsStorage";

/**
 * GET /api/cart-design?designId=&designer=
 *
 * Rebuilds a design from its order-item rows so a cart line can be reopened for
 * editing. The design id is an unguessable token already stored on the cart line,
 * so it acts as the capability; only design fields are returned, never customer
 * or order data.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const designId = url.searchParams.get("designId")?.trim() ?? "";
  const designerParam = url.searchParams.get("designer")?.trim() || "badge";

  if (!designId) {
    return json({ found: false, error: "designId is required" }, { status: 400 });
  }
  if (!isDesignerId(designerParam)) {
    return json({ found: false, error: "Unknown designer" }, { status: 400 });
  }

  try {
    const def = getDesignerConfig(designerParam);
    const rows = await getDesignerOrderItemsByDesignId(def, designId);
    if (rows.length === 0) {
      return json({ found: false, design: null }, { status: 404 });
    }

    // badge_id is `${prefix}-${index}`; sort numerically so badge-10 follows badge-9.
    const indexOf = (badgeId: string | undefined) => {
      const n = Number.parseInt(String(badgeId ?? "").split("-").pop() ?? "", 10);
      return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
    };
    const ordered = [...rows].sort(
      (a, b) => indexOf(a.badge_id) - indexOf(b.badge_id),
    );

    const allBadges = ordered
      .map((row) => row.badge_json)
      .filter((b): b is Record<string, unknown> => !!b && typeof b === "object");

    // Rows saved before the design-json migration cannot rebuild a design.
    if (allBadges.length !== ordered.length) {
      return json(
        { found: false, design: null, reason: "no_design_state" },
        { status: 404 },
      );
    }

    const designMeta =
      (ordered.find((row) => row.design_meta)?.design_meta as
        | Record<string, unknown>
        | undefined) ?? {};

    return json({
      found: true,
      design: {
        design_id: designId,
        backing_type: ordered[0]?.backing_type ?? undefined,
        quantities: ordered.map((row) => row.quantity ?? 1),
        design_data: {
          ...designMeta,
          badge: allBadges[0],
          multipleBadges: allBadges.length > 1 ? allBadges.slice(1) : [],
          allBadges,
        },
      },
    });
  } catch (error) {
    console.error("[api.cart-design] error:", error);
    return json(
      {
        found: false,
        error: "Failed to load design",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
