import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import {
  updateDraftBadgeOrderItemsWithOrderInfo,
  getBadgeOrderItemsByDesignId,
  uploadToBadgePdfsBucket,
  updatePdfUrlByDesignId,
  downloadFromBadgePdfsBucket,
} from "~/utils/supabase";
import { parseOr400, linkOrderBodySchema } from "~/utils/validation";

/** Count lines with non-empty text (matches client: only lines with text get rows). */
function getLineCount(row: Record<string, unknown>): number {
  let count = 0;
  for (let i = 1; i <= 4; i++) {
    const t = String(row[`line_${i}_text`] ?? "").trim();
    if (t !== "") count++;
  }
  return count;
}

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

/** GET/HEAD: return 405 so Remix doesn't throw when something pings this URL. */
export async function loader({ request }: LoaderFunctionArgs) {
  return json(
    {
      error: "Method not allowed",
      message: "Use POST to link an order to Supabase",
    },
    { status: 405 },
  );
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
    const body = await request.json().catch(() => null);
    const parsed = parseOr400(
      linkOrderBodySchema,
      body,
      "Invalid request body",
    );
    if (!parsed.ok) return parsed.response;
    const { shopifyOrderId, shopifyOrderNumber, shopifyCustomerId, lineItems } =
      parsed.data;

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

    const updateLineItems: Array<{
      designId: string;
      badgeIndex: number;
      quantity: number;
    }> = [];
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
          "link-order: invalid badgeIndex for designId " +
            designId +
            ", using 0",
        );
        badgeIndex = 0;
      }
      const quantity =
        typeof item.quantity === "number" && item.quantity >= 1
          ? item.quantity
          : 1;
      updateLineItems.push({ designId, badgeIndex, quantity });
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
      shopifyOrderId: orderIdTrimmed,
      updateLineItems: updateLineItems.map(
        (u) => `${u.designId}/badge-${u.badgeIndex}(qty=${u.quantity})`,
      ),
    });

    // Edit existing add-to-cart PDF in place: remove pages for removed badges, update quantities (layout constants match pdfGenerator.ts)
    const designIds = [
      ...new Set(
        lineItems
          .map((i) => (i.designId ?? i.gadgetDesignId)?.trim())
          .filter(Boolean),
      ),
    ] as string[];
    const PAGE_HEIGHT = 841.89;
    const TOP_MARGIN = 40;
    const HEADER_HEIGHT = 18;
    const HEADER_GAP = 6;
    const ROW_HEIGHT = 16;
    const MARGIN = 30;
    const IMAGE_WIDTH_PT = 252; // rect-1x3 default (288+48)*0.75
    const PAGE_WIDTH = 595.28;

    for (const designId of designIds) {
      try {
        const pdfBytes = await downloadFromBadgePdfsBucket(
          designId,
          "badge-design.pdf",
        );
        if (!pdfBytes || pdfBytes.length === 0) {
          console.warn(
            "[BadgeDesigner] link-order: no existing PDF for design",
            designId,
          );
          continue;
        }
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const pageCount = pdfDoc.getPageCount();

        const rows = await getBadgeOrderItemsByDesignId(designId);
        const designLineItems = lineItems.filter(
          (i) => (i.designId ?? i.gadgetDesignId)?.trim() === designId,
        );
        const orderBadgeIndices = designLineItems.map((i) => {
          const raw = i.badgeIndex;
          return typeof raw === "number"
            ? raw
            : parseInt(String(raw ?? 0).trim(), 10);
        });
        const orderSet = new Set(orderBadgeIndices);

        for (let i = pageCount - 1; i >= 0; i--) {
          if (!orderSet.has(i)) {
            pdfDoc.removePage(i);
          }
        }

        const orderItems = designLineItems
          .map((i) => {
            const badgeIndex =
              typeof i.badgeIndex === "number"
                ? i.badgeIndex
                : parseInt(String(i.badgeIndex ?? 0).trim(), 10);
            const quantity =
              typeof i.quantity === "number" && i.quantity >= 1
                ? i.quantity
                : 1;
            const row = rows.find((r) => r.badge_id === `badge-${badgeIndex}`);
            return row ? { quantity, lineCount: getLineCount(row) } : null;
          })
          .filter((x): x is NonNullable<typeof x> => x != null);

        const tableX = MARGIN + IMAGE_WIDTH_PT + 20;
        const tableWidth = PAGE_WIDTH - tableX - MARGIN;
        const tableY =
          PAGE_HEIGHT - TOP_MARGIN - HEADER_HEIGHT - HEADER_GAP;

        for (let p = 0; p < pdfDoc.getPageCount(); p++) {
          const item = orderItems[p];
          if (!item) continue;
          const { quantity, lineCount } = item;
          const quantityRowY = tableY - (lineCount * 4 + 1) * ROW_HEIGHT;
          const page = pdfDoc.getPage(p);
          page.drawRectangle({
            x: tableX,
            y: quantityRowY,
            width: tableWidth,
            height: ROW_HEIGHT,
            color: rgb(1, 1, 1),
          });
          page.drawText(`Quantity: ${quantity}`, {
            x: tableX + 5,
            y: quantityRowY + 4,
            size: 8,
            font,
            color: rgb(0, 0, 0),
          });
        }

        const newPdfBytes = await pdfDoc.save();
        const pdfBlob = new Blob([newPdfBytes], { type: "application/pdf" });
        const uploadedUrl = await uploadToBadgePdfsBucket(
          pdfBlob,
          `${designId}/badge-design.pdf`,
          "application/pdf",
        );
        const pdfUrl =
          uploadedUrl +
          (uploadedUrl.includes("?") ? "&" : "?") +
          "v=" +
          Date.now();
        await updatePdfUrlByDesignId(designId, pdfUrl);
        console.log(
          "[BadgeDesigner] link-order: PDF updated in place for design",
          designId,
        );
      } catch (slipErr) {
        console.warn(
          "[BadgeDesigner] link-order: PDF in-place edit failed for design",
          designId,
          slipErr,
        );
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
