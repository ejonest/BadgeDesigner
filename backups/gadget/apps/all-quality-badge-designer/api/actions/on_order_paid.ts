/**
 * Gadget action: on_order_paid
 *
 * PURPOSE: After Shopify checkout, this action sends the order + badge design data from Gadget
 * to your Vercel API, which inserts rows into the Supabase badge_order_items table (filling in
 * all fields: shopify_order_id, design_id, line_1_text, thumbnail_url, pdf_url, etc.).
 *
 * SETUP:
 * 1. In Gadget: create a new Global Action, paste this file's code, name it e.g. "onOrderPaid".
 * 2. Triggers: add trigger → Shopify webhooks → orders/paid (recommended) or orders/create.
 * 3. Environment variables (Gadget Settings → Environment variables):
 *    - LINK_ORDER_SECRET = same secret as in Vercel (LINK_ORDER_SECRET)
 *    - VERCEL_LINK_ORDER_URL = https://YOUR_VERCEL_DOMAIN/api/link-order-to-supabase
 * 4. Vercel: set LINK_ORDER_SECRET (and SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY for the API).
 *
 * FLOW: Order paid → webhook fires → this action runs → reads line item properties "Design ID"
 * and "Gadget Design ID" → fetches BadgeDesign from Gadget (by designId or id) → POSTs to
 * Vercel with shopifyOrderId, shopifyOrderNumber, shopifyCustomerId, lineItems (each with
 * designId, gadgetDesignId, designData). Vercel inserts into Supabase badge_order_items.
 *
 * TROUBLESHOOTING (badge_order_items not updated after checkout):
 * - Confirm the Global Action exists and is triggered by orders/paid (or orders/create).
 * - Confirm Gadget env vars LINK_ORDER_SECRET and VERCEL_LINK_ORDER_URL are set.
 * - Confirm cart line items have "Design ID" and "Badge Index" (add-to-cart sets these). Optional: "Gadget Design ID".
 * - In Gadget logs, check for "on_order_paid: linked order to Supabase" and updatedCount > 0, or errors (e.g. fetch failed, 401).
 * - If updatedCount is 0: Vercel received the request but no draft rows matched. Ensure draft rows in Supabase use design_id = same as "Design ID" and badge_id = badge-0, badge-1, ... (0-based). New inserts use badge-0, badge-1; old rows with badge-1, badge-2 will not match.
 */

const LINK_ORDER_URL =
  process.env.VERCEL_LINK_ORDER_URL || "https://badgedesigner.vercel.app/api/link-order-to-supabase";
// VERCEL_LINK_ORDER_URL must be set in Gadget to your actual Vercel deployment URL
const LINK_ORDER_SECRET = process.env.LINK_ORDER_SECRET;

/**
 * Get line item properties as a key-value map.
 * Shopify Admin API uses line_item.properties = [{ name, value }].
 * Shopify Storefront/Customer API may use customAttributes.
 */
function getPropertiesMap(lineItem) {
  const props = lineItem.properties || lineItem.customAttributes || [];
  if (!Array.isArray(props)) return {};
  return props.reduce((acc, p) => {
    const name = p.name ?? p.key;
    const value = p.value;
    if (name != null) acc[name] = value;
    return acc;
  }, {});
}

/**
 * Extract design IDs from order line items and resolve full designData from Gadget.
 * Cart sends "Design ID" and "Gadget Design ID" as line item properties.
 * Fetches BadgeDesign by designId first, then by id (Gadget Design ID), and attaches designData
 * so Vercel link-order-to-supabase can insert into the Supabase badge_order_items table.
 */
async function getLineItemsWithDesignData(order, api, logger) {
  const lineItems = order.line_items ?? order.lineItems ?? [];
  const payloadLineItems = [];

  for (const item of lineItems) {
    const props = getPropertiesMap(item);
    const designId = props["Design ID"] ? String(props["Design ID"]).trim() : null;
    const gadgetDesignId = props["Gadget Design ID"] ? String(props["Gadget Design ID"]).trim() : undefined;
    const idToUse = designId || gadgetDesignId;
    if (!idToUse) continue;

    const badgeIndexRaw = props["Badge Index"];
    const badgeIndex = badgeIndexRaw !== undefined && badgeIndexRaw !== null && badgeIndexRaw !== ""
      ? parseInt(String(badgeIndexRaw).trim(), 10)
      : undefined;
    const quantity = item.quantity != null && item.quantity >= 1 ? item.quantity : 1;
    const badgeCountRaw = props["Badge count"];
    const badgeCount = badgeCountRaw !== undefined && badgeCountRaw !== null && badgeCountRaw !== ""
      ? parseInt(String(badgeCountRaw).trim(), 10)
      : undefined;
    const entry = {
      designId: designId || gadgetDesignId,
      gadgetDesignId: gadgetDesignId || undefined,
      badgeIndex: Number.isNaN(badgeIndex) ? undefined : badgeIndex,
      quantity,
      badgeCount: Number.isNaN(badgeCount) ? undefined : badgeCount,
    };

    if (api && (api.badgeDesign || api.BadgeDesign)) {
      const model = api.badgeDesign || api.BadgeDesign;
      let design = null;
      try {
        if (designId) {
          design = await model.findOne({ filter: { designId } });
        }
        if (!design && gadgetDesignId) {
          design = await model.findOne({ filter: { id: gadgetDesignId } });
        }
        if (design && design.designData != null) {
          entry.designData = typeof design.designData === "string" ? JSON.parse(design.designData) : design.designData;
        } else {
          logger.warn("on_order_paid: BadgeDesign not found or missing designData", { designId, gadgetDesignId });
        }
      } catch (err) {
        logger.warn("on_order_paid: failed to fetch BadgeDesign", { designId, gadgetDesignId, error: err.message });
      }
    }

    payloadLineItems.push(entry);
  }

  return payloadLineItems;
}

/**
 * Run: called when the action is triggered (e.g. by orders/paid webhook).
 *
 * If using a Shopify webhook trigger, the order is in params or trigger.
 * - Global action with webhook: trigger might be the webhook payload (order inside).
 * - Model action on shopifyOrder: record is the synced order.
 *
 * Adapt the first line to how your trigger supplies the order:
 * - Webhook payload: order = params.payload?.order ?? params.order ?? trigger?.payload?.order ?? trigger?.order
 * - Model record: order = record (and use record.id, record.name, record.lineItems, etc.)
 *
 * Include api in the action context so we can fetch BadgeDesign records for designData.
 */
module.exports = async ({ api, params, trigger, record, logger }) => {
  const order = record ?? trigger?.payload?.order ?? trigger?.order ?? params?.payload?.order ?? params?.order ?? params;
  if (!order) {
    logger.warn("on_order_paid: no order in params/trigger/record");
    return { success: false, reason: "no_order" };
  }

  const shopifyOrderId = order.id ?? order.shopifyId ?? order.admin_graphql_api_id;
  const shopifyOrderNumber = order.name ?? order.order_number;
  const shopifyCustomerId = order.customer_id ?? order.customer?.id ?? order.customerId ?? null;

  if (!shopifyOrderId) {
    logger.warn("on_order_paid: order has no id");
    return { success: false, reason: "no_order_id" };
  }

  const payloadLineItems = await getLineItemsWithDesignData(order, api, logger);
  if (payloadLineItems.length === 0) {
    logger.info("on_order_paid: no badge line items (no Design ID), skipping");
    return { success: true, skipped: true, reason: "no_badge_items" };
  }

  if (!LINK_ORDER_SECRET) {
    logger.error("on_order_paid: LINK_ORDER_SECRET not set");
    return { success: false, reason: "missing_secret" };
  }

  const body = {
    shopifyOrderId: String(shopifyOrderId),
    shopifyOrderNumber: shopifyOrderNumber != null ? String(shopifyOrderNumber) : undefined,
    shopifyCustomerId: shopifyCustomerId != null ? String(shopifyCustomerId) : undefined,
    lineItems: payloadLineItems,
  };

  try {
    const res = await fetch(LINK_ORDER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINK_ORDER_SECRET}`,
      },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.error("on_order_paid: Vercel API error", { status: res.status, data });
      return { success: false, status: res.status, error: data.message ?? data.error };
    }

    logger.info("on_order_paid: linked order to Supabase", { updatedCount: data.updatedCount ?? data.insertedCount, data });
    return { success: true, updatedCount: data.updatedCount ?? data.insertedCount, data };
  } catch (err) {
    logger.error("on_order_paid: fetch failed", { error: err.message });
    return { success: false, error: err.message };
  }
};
