/**
 * Gadget action: on_order_paid
 *
 * SETUP: Copy this entire file into your Gadget app as a new Global Action (e.g. name it "onOrderPaid").
 * Then: Triggers → + → Shopify webhooks → orders/paid (or orders/create).
 *
 * Gadget app: https://all-quality-badge-designer.gadget.app/
 * In Gadget Settings → Environment variables, set:
 * - LINK_ORDER_SECRET (same value as in Vercel)
 * - VERCEL_LINK_ORDER_URL = https://YOUR_VERCEL_DOMAIN/api/link-order-to-supabase (e.g. https://badgedesigner.vercel.app/api/link-order-to-supabase)
 *
 * Vercel API (link-order-to-supabase) expects:
 * - shopifyOrderId, shopifyOrderNumber, shopifyCustomerId
 * - lineItems: [ { designId, gadgetDesignId?, designData } ] — designData = full design (e.g. allBadges) from BadgeDesign
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
 * Extract design IDs from order line items (and optionally resolve designData from Gadget).
 * Cart sends "Design ID" and "Gadget Design ID" as line item properties.
 * If api is provided, fetches BadgeDesign by designId (or gadgetDesignId) and attaches designData.
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

    const entry = {
      designId: designId || gadgetDesignId,
      gadgetDesignId: gadgetDesignId || undefined,
    };

    if (api && (api.badgeDesign || api.BadgeDesign)) {
      const model = api.badgeDesign || api.BadgeDesign;
      try {
        const design = designId
          ? await model.findOne({ filter: { designId } })
          : gadgetDesignId
            ? await model.findOne({ filter: { id: gadgetDesignId } })
            : null;
        if (design && design.designData != null) {
          entry.designData = typeof design.designData === "string" ? JSON.parse(design.designData) : design.designData;
        } else {
          logger.warn("on_order_paid: BadgeDesign not found for designId/gadgetDesignId", { designId, gadgetDesignId });
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

    logger.info("on_order_paid: linked order to Supabase", { insertedCount: data.insertedCount });
    return { success: true, insertedCount: data.insertedCount, data };
  } catch (err) {
    logger.error("on_order_paid: fetch failed", { error: err.message });
    return { success: false, error: err.message };
  }
};
