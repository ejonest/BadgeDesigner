/**
 * Gadget action: on_order_paid
 * Place this in your Gadget app at: api/actions/on-order-paid.js (or .ts)
 *
 * Trigger: Shopify webhook "orders/paid" (or "orders/create" and filter for paid)
 * - In Gadget: open this action → Triggers → + → Shopify webhooks → orders/paid (or orders/create)
 *
 * Environment: In Gadget Settings → Environment variables, set:
 * - LINK_ORDER_SECRET (same value as in Vercel)
 * - VERCEL_LINK_ORDER_URL = https://badgedesigner.vercel.app/api/link-order-to-supabase
 */

const LINK_ORDER_URL =
  process.env.VERCEL_LINK_ORDER_URL || "https://badgedesigner.vercel.app/api/link-order-to-supabase";
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
 * Extract design IDs from order line items.
 * Cart sends "Design ID" and "Gadget Design ID" as line item properties.
 */
function getDesignIdsFromOrder(order) {
  const lineItems = order.line_items ?? order.lineItems ?? [];
  const payloadLineItems = [];

  for (const item of lineItems) {
    const props = getPropertiesMap(item);
    const designId = props["Design ID"] ?? props["Gadget Design ID"];
    if (designId && String(designId).trim()) {
      payloadLineItems.push({
        designId: String(designId).trim(),
        gadgetDesignId: props["Gadget Design ID"] ? String(props["Gadget Design ID"]).trim() : undefined,
      });
    }
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
 */
module.exports = async ({ params, trigger, record, logger }) => {
  // 1) Get the order from your trigger/record
  const order = record ?? trigger?.payload?.order ?? trigger?.order ?? params?.payload?.order ?? params?.order ?? params;
  if (!order) {
    logger.warn("on_order_paid: no order in params/trigger/record");
    return { success: false, reason: "no_order" };
  }

  const shopifyOrderId = order.id ?? order.shopifyId ?? order.admin_graphql_api_id;
  const shopifyOrderNumber = order.name ?? order.order_number;

  if (!shopifyOrderId) {
    logger.warn("on_order_paid: order has no id");
    return { success: false, reason: "no_order_id" };
  }

  const payloadLineItems = getDesignIdsFromOrder(order);
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

    logger.info("on_order_paid: linked order to Supabase", { updatedCount: data.updatedCount });
    return { success: true, updatedCount: data.updatedCount, data };
  } catch (err) {
    logger.error("on_order_paid: fetch failed", { error: err.message });
    return { success: false, error: err.message };
  }
};
