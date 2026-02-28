import { json, type ActionFunctionArgs } from "@remix-run/node";
import {
  updateDraftBadgeOrderItemsWithOrderInfo,
  getBadgeOrderItemsByDesignId,
  uploadToBadgePdfsBucket,
  updatePdfUrlByDesignId,
} from "~/utils/supabase";
import { generateOrderSlipPdf } from "~/utils/orderSlipPdf";

function getSecretFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim() || null;
  }
  const xHeader = request.headers.get("X-Link-Order-Secret");
  if (xHeader) {
    return xHeader.trim() || null;
  }
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  console.log(
    "[BadgeDesigner] api.link-order-to-supabase request received",
    new Date().toISOString(),
    request.method,
  );
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const secret = process.env.LINK_ORDER_SECRET;
  if (!secret) {
    console.error("[BadgeDesigner] LINK_ORDER_SECRET is not configured");
    return json(
      {
        error: "Server configuration error",
        message: "Link order secret not configured",
      },
      { status: 500 },
    );
  }

  const providedSecret = getSecretFromRequest(request);
  if (providedSecret !== secret) {
    console.warn(
      "[BadgeDesigner] link-order-to-supabase unauthorized (missing or invalid Bearer secret)",
    );
    return json(
      {
        error: "Unauthorized",
        message: "Invalid or missing link order secret",
      },
      { status: 401 },
    );
  }
  console.log(
    "[BadgeDesigner] link-order-to-supabase authorized, processing body",
  );

  try {
    const body = await request.json();
    const shopifyOrderId = body.shopifyOrderId as string | undefined;
    const shopifyOrderNumber = body.shopifyOrderNumber as string | undefined;
    const shopifyCustomerId = body.shopifyCustomerId as string | undefined;
    const lineItems = body.lineItems as
      | Array<{
          designId?: string;
          gadgetDesignId?: string;
          designData?: unknown;
          badgeIndex?: number | string;
          quantity?: number;
          badgeCount?: number | string;
        }>
      | undefined;

    if (
      !shopifyOrderId ||
      typeof shopifyOrderId !== "string" ||
      !shopifyOrderId.trim()
    ) {
      return json(
        { error: "Bad request", message: "shopifyOrderId is required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(lineItems) || lineItems.length === 0) {
      return json(
        {
          error: "Bad request",
          message: "lineItems must be a non-empty array",
        },
        { status: 400 },
      );
    }

    const orderIdTrimmed = shopifyOrderId.trim();
    const orderNumberTrimmed =
      shopifyOrderNumber != null && shopifyOrderNumber !== ""
        ? String(shopifyOrderNumber).trim()
        : undefined;
    const customerIdTrimmed =
      shopifyCustomerId != null && shopifyCustomerId !== ""
        ? String(shopifyCustomerId).trim()
        : undefined;

    console.log("[BadgeDesigner] link-order payload:", {
      shopifyOrderId: orderIdTrimmed,
      lineItemCount: lineItems.length,
      firstItem: lineItems[0],
    });

    const updateLineItems: Array<{ designId: string; badgeIndex: number }> = [];
    for (const item of lineItems) {
      const designId = (item.designId ?? item.gadgetDesignId)?.trim();
      if (!designId) {
        console.warn(
          "link-order: lineItem missing designId and gadgetDesignId, skipping",
          { item: JSON.stringify(item).slice(0, 200) },
        );
        continue;
      }
      const rawIndex = item.badgeIndex;
      let badgeIndex =
        typeof rawIndex === "number"
          ? rawIndex
          : typeof rawIndex === "string"
            ? parseInt(String(rawIndex).trim(), 10)
            : 0;
      if (Number.isNaN(badgeIndex) || badgeIndex < 0) {
        console.warn(
          "link-order: invalid badgeIndex for designId " + designId + ", using 0",
        );
        badgeIndex = 0;
      }
      const quantity =
        typeof item.quantity === "number" && item.quantity >= 1
          ? item.quantity
          : 1;
      const badgeCountRaw = item.badgeCount;
      const badgeCount =
        typeof badgeCountRaw === "number"
          ? badgeCountRaw
          : typeof badgeCountRaw === "string"
            ? parseInt(String(badgeCountRaw).trim(), 10)
            : 0;
      updateLineItems.push({ designId, badgeIndex });
      if (quantity === 2 && badgeCount > 0 && badgeIndex < badgeCount) {
        updateLineItems.push({ designId, badgeIndex: badgeIndex + badgeCount });
      }
    }

    if (updateLineItems.length === 0) {
      return json(
        {
          error: "Bad request",
          message:
            "No valid line items to update (missing designId or gadgetDesignId)",
        },
        { status: 400 },
      );
    }

    const { data: updated } = await updateDraftBadgeOrderItemsWithOrderInfo({
      lineItems: updateLineItems,
      shopifyOrderId: orderIdTrimmed,
      shopifyOrderNumber: orderNumberTrimmed,
      shopifyCustomerId: customerIdTrimmed,
    });
    const updatedCount = Array.isArray(updated) ? updated.length : 0;
    console.log("[BadgeDesigner] link-order-to-supabase result", {
      updatedCount,
      shopifyOrderId: body.shopifyOrderId,
      updateLineItems: updateLineItems.map((u) => `${u.designId}/badge-${u.badgeIndex}`),
    });

    // Regenerate order-slip PDF with final quantities (one PDF per design_id)
    const designIds = [...new Set(lineItems.map((i) => (i.designId ?? i.gadgetDesignId)?.trim()).filter(Boolean))] as string[];
    for (const designId of designIds) {
      try {
        const rows = await getBadgeOrderItemsByDesignId(designId);
        const designLineItems = lineItems.filter(
          (i) => (i.designId ?? i.gadgetDesignId)?.trim() === designId
        );
        const orderSlipItems = designLineItems
          .map((i) => {
            const badgeIndex = typeof i.badgeIndex === "number" ? i.badgeIndex : parseInt(String(i.badgeIndex ?? 0).trim(), 10);
            const quantity = typeof i.quantity === "number" && i.quantity >= 1 ? i.quantity : 1;
            const row = rows.find((r) => r.badge_id === `badge-${badgeIndex}`);
            return row ? { item: row, quantity } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x != null);
        if (orderSlipItems.length === 0) continue;
        const pdfBytes = await generateOrderSlipPdf(orderSlipItems);
        const pdfBlob = new Blob([pdfBytes], { type: "application/pdf" });
        const pdfUrl = await uploadToBadgePdfsBucket(
          pdfBlob,
          `${designId}/badge-design.pdf`,
          "application/pdf"
        );
        await updatePdfUrlByDesignId(designId, pdfUrl);
        console.log("[BadgeDesigner] link-order: order-slip PDF updated for design", designId);
      } catch (slipErr) {
        console.warn("[BadgeDesigner] link-order: order-slip PDF generation failed for design", designId, slipErr);
      }
    }

    return json({
      success: true,
      updatedCount,
      message: `Updated ${updatedCount} draft badge order item(s) with order info`,
    });
  } catch (err) {
    console.error("Link order to Supabase error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(
      { error: "Failed to link order to Supabase", message },
      { status: 500 },
    );
  }
}
