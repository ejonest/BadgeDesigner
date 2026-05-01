/**
 * Gadget Global Action: on_order_paid — badge + sign + plaque (split POST to Vercel)
 *
 * Cart line items include property "Designer" = "badge" | "sign" | "plaque" (set by BadgeDesigner).
 * Lines without "Designer" are treated as badges (backward compatible).
 *
 * Env vars (Gadget → Settings → Environment variables):
 *   LINK_ORDER_SECRET             — Bearer token; must match Vercel LINK_ORDER_SECRET
 *   LINK_ORDER_SECRET_SIGN        — optional; sign POST (else LINK_ORDER_SECRET)
 *   LINK_ORDER_SECRET_PLAQUE      — optional; plaque POST (else LINK_ORDER_SECRET)
 *   VERCEL_LINK_ORDER_URL         — default https://YOUR_APP/api/link-order-to-supabase
 *   VERCEL_LINK_ORDER_SIGN_URL    — default https://YOUR_APP/api/link-order-sign-to-supabase
 *   VERCEL_LINK_ORDER_PLAQUE_URL  — default https://YOUR_APP/api/link-order-plaque-to-supabase
 *
 * Sign / plaque rows in Supabase are filled by Vercel save-draft / send-to-supabase; this action links paid orders.
 *
 * Trigger: Shopify orders/paid (or orders/create).
 */

const BADGE_URL =
  process.env.VERCEL_LINK_ORDER_URL ||
  "https://all-quality-design-tool.vercel.app/api/link-order-to-supabase";
const SIGN_URL =
  process.env.VERCEL_LINK_ORDER_SIGN_URL ||
  "https://all-quality-design-tool.vercel.app/api/link-order-sign-to-supabase";
const PLAQUE_URL =
  process.env.VERCEL_LINK_ORDER_PLAQUE_URL ||
  "https://all-quality-design-tool.vercel.app/api/link-order-plaque-to-supabase";
const BADGE_SECRET = process.env.LINK_ORDER_SECRET;
const SIGN_SECRET = process.env.LINK_ORDER_SECRET_SIGN || process.env.LINK_ORDER_SECRET;
const PLAQUE_SECRET =
  process.env.LINK_ORDER_SECRET_PLAQUE || process.env.LINK_ORDER_SECRET;

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

/** @returns {"badge"|"sign"|"plaque"} */
function designerLineKind(props) {
  const d = props["Designer"];
  if (d == null || String(d).trim() === "") return "badge";
  const t = String(d).trim().toLowerCase();
  if (t === "sign") return "sign";
  if (t === "plaque") return "plaque";
  return "badge";
}

async function collectLinePayloads(order, api, logger) {
  const lineItems = order.line_items ?? order.lineItems ?? [];
  const badgePayload = [];
  const signPayload = [];
  const plaquePayload = [];

  for (const item of lineItems) {
    const props = getPropertiesMap(item);
    const designId = props["Design ID"] ? String(props["Design ID"]).trim() : null;
    const gadgetDesignId = props["Gadget Design ID"]
      ? String(props["Gadget Design ID"]).trim()
      : undefined;
    if (!designId && !gadgetDesignId) continue;

    const indexRaw =
      props["Badge Index"] ?? props["Sign Index"] ?? props["Plaque Index"];
    let badgeIndex =
      indexRaw !== undefined && indexRaw !== null && indexRaw !== ""
        ? parseInt(String(indexRaw).trim(), 10)
        : undefined;
    if (Number.isNaN(badgeIndex)) badgeIndex = undefined;

    const quantity = item.quantity != null && item.quantity >= 1 ? item.quantity : 1;
    const entry = {
      designId: designId || gadgetDesignId,
      gadgetDesignId: gadgetDesignId || undefined,
      badgeIndex,
      quantity,
    };

    const kind = designerLineKind(props);

    if (kind === "sign" && api && (api.signDesign || api.SignDesign)) {
      const model = api.signDesign || api.SignDesign;
      try {
        let design = null;
        if (designId) design = await model.findOne({ filter: { designId } });
        if (!design && gadgetDesignId)
          design = await model.findOne({ filter: { id: gadgetDesignId } });
        if (design?.designData != null) {
          entry.designData =
            typeof design.designData === "string"
              ? JSON.parse(design.designData)
              : design.designData;
        }
      } catch (err) {
        logger.warn("on_order_paid: SignDesign fetch failed", {
          designId,
          gadgetDesignId,
          error: err.message,
        });
      }
    } else if (kind === "plaque" && api && (api.plaqueDesign || api.PlaqueDesign)) {
      const model = api.plaqueDesign || api.PlaqueDesign;
      try {
        let design = null;
        if (designId) design = await model.findOne({ filter: { designId } });
        if (!design && gadgetDesignId)
          design = await model.findOne({ filter: { id: gadgetDesignId } });
        if (design?.designData != null) {
          entry.designData =
            typeof design.designData === "string"
              ? JSON.parse(design.designData)
              : design.designData;
        }
      } catch (err) {
        logger.warn("on_order_paid: PlaqueDesign fetch failed", {
          designId,
          gadgetDesignId,
          error: err.message,
        });
      }
    } else if (kind === "badge" && api && (api.badgeDesign || api.BadgeDesign)) {
      const model = api.badgeDesign || api.BadgeDesign;
      try {
        let design = null;
        if (designId) design = await model.findOne({ filter: { designId } });
        if (!design && gadgetDesignId)
          design = await model.findOne({ filter: { id: gadgetDesignId } });
        if (design?.designData != null) {
          entry.designData =
            typeof design.designData === "string"
              ? JSON.parse(design.designData)
              : design.designData;
        }
      } catch (err) {
        logger.warn("on_order_paid: BadgeDesign fetch failed", {
          designId,
          gadgetDesignId,
          error: err.message,
        });
      }
    }

    if (kind === "sign") signPayload.push(entry);
    else if (kind === "plaque") plaquePayload.push(entry);
    else badgePayload.push(entry);
  }

  return { badgePayload, signPayload, plaquePayload };
}

async function postLink(url, secret, body, logger, label) {
  if (!secret) {
    logger.error(`on_order_paid: missing secret for ${label}`);
    return { ok: false, reason: "missing_secret" };
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.error(`on_order_paid: ${label} Vercel error`, {
      status: res.status,
      data,
    });
    return { ok: false, status: res.status, data };
  }
  logger.info(`on_order_paid: ${label} linked`, {
    updatedCount: data.updatedCount ?? data.insertedCount,
  });
  return { ok: true, data };
}

module.exports = async ({ api, params, trigger, record, logger }) => {
  const order =
    record ??
    trigger?.payload?.order ??
    trigger?.order ??
    params?.payload?.order ??
    params?.order ??
    params;
  if (!order) {
    logger.warn("on_order_paid: no order");
    return { success: false, reason: "no_order" };
  }

  const shopifyOrderId = order.id ?? order.shopifyId ?? order.admin_graphql_api_id;
  const shopifyOrderNumber = order.name ?? order.order_number;
  const shopifyCustomerId =
    order.customer_id ?? order.customer?.id ?? order.customerId ?? null;

  if (!shopifyOrderId) {
    logger.warn("on_order_paid: order has no id");
    return { success: false, reason: "no_order_id" };
  }

  const { badgePayload, signPayload, plaquePayload } =
    await collectLinePayloads(order, api, logger);

  if (
    badgePayload.length === 0 &&
    signPayload.length === 0 &&
    plaquePayload.length === 0
  ) {
    logger.info("on_order_paid: no custom design line items (no Design ID)");
    return { success: true, skipped: true };
  }

  const baseBody = {
    shopifyOrderId: String(shopifyOrderId),
    shopifyOrderNumber:
      shopifyOrderNumber != null ? String(shopifyOrderNumber) : undefined,
    shopifyCustomerId:
      shopifyCustomerId != null ? String(shopifyCustomerId) : undefined,
  };

  const results = {};

  if (badgePayload.length > 0) {
    results.badge = await postLink(
      BADGE_URL,
      BADGE_SECRET,
      { ...baseBody, lineItems: badgePayload },
      logger,
      "badge",
    );
  }

  if (signPayload.length > 0) {
    results.sign = await postLink(
      SIGN_URL,
      SIGN_SECRET,
      { ...baseBody, lineItems: signPayload },
      logger,
      "sign",
    );
  }

  if (plaquePayload.length > 0) {
    results.plaque = await postLink(
      PLAQUE_URL,
      PLAQUE_SECRET,
      { ...baseBody, lineItems: plaquePayload },
      logger,
      "plaque",
    );
  }

  const failed = Object.values(results).some((r) => r && r.ok === false);
  if (failed) {
    return { success: false, results };
  }

  return { success: true, results };
};
