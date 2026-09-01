/**
 * Gadget action: on_order_paid (All Quality / badge-designer-order-handler)
 *
 * Handles badge + desk-sign cart lines after Shopify checkout.
 *
 * Badge lines  → POST VERCEL_LINK_ORDER_URL
 *                 (default …/api/link-order-to-supabase)
 * Desk-sign    → POST VERCEL_LINK_ORDER_DESK_SIGN_URL
 *                 (default …/api/link-order-desk-sign-to-supabase)
 * Gavel        → POST VERCEL_LINK_ORDER_GAVEL_URL
 *                 (default …/api/link-order-gavel-to-supabase)
 *
 * Cart properties are underscore-prefixed (hidden in checkout), e.g.:
 *   _Designer, _Design ID, _Gadget Design ID, _Badge Index, _Desk Sign Index
 * Legacy unprefixed names are still accepted.
 *
 * Gadget env:
 *   LINK_ORDER_SECRET                 — required (shared or badge)
 *   LINK_ORDER_SECRET_DESK_SIGN       — optional; falls back to LINK_ORDER_SECRET
 *   VERCEL_LINK_ORDER_URL             — badge link endpoint
 *   VERCEL_LINK_ORDER_DESK_SIGN_URL   — desk-sign link endpoint
 *
 * Models:
 *   BadgeDesign     — existing
 *   DeskSignDesign  — same fields as BadgeDesign (see docs note / setup instructions)
 */

const BADGE_LINK_ORDER_URL =
  process.env.VERCEL_LINK_ORDER_URL ||
  "https://all-quality-design-tool.vercel.app/api/link-order-to-supabase";

const DESK_SIGN_LINK_ORDER_URL =
  process.env.VERCEL_LINK_ORDER_DESK_SIGN_URL ||
  process.env.VERCEL_LINK_ORDER_URL_DESK_SIGN ||
  "https://all-quality-design-tool.vercel.app/api/link-order-desk-sign-to-supabase";

const GAVEL_LINK_ORDER_URL =
  process.env.VERCEL_LINK_ORDER_GAVEL_URL ||
  "https://all-quality-design-tool.vercel.app/api/link-order-gavel-to-supabase";

const BADGE_SECRET = process.env.LINK_ORDER_SECRET;
const DESK_SIGN_SECRET =
  process.env.LINK_ORDER_SECRET_DESK_SIGN || process.env.LINK_ORDER_SECRET;
const GAVEL_SECRET =
  process.env.LINK_ORDER_SECRET_GAVEL || process.env.LINK_ORDER_SECRET;

function getPropertiesMap(lineItem: {
  properties?: unknown;
  customAttributes?: unknown;
}) {
  const props = lineItem.properties || lineItem.customAttributes || [];
  if (!Array.isArray(props)) return {} as Record<string, unknown>;
  return props.reduce(
    (
      acc: Record<string, unknown>,
      p: { name?: string; key?: string; value?: unknown },
    ) => {
      const name = p.name ?? p.key;
      const value = p.value;
      if (name != null) acc[name] = value;
      return acc;
    },
    {},
  );
}

/** Read `Name` or `_Name` (cart hides internals with underscore prefix). */
function readProp(
  props: Record<string, unknown>,
  name: string,
): string | undefined {
  const bare = name.startsWith("_") ? name.slice(1) : name;
  const hidden = `_${bare}`;
  const v = props[hidden] ?? props[bare] ?? props[name];
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function readIntProp(
  props: Record<string, unknown>,
  name: string,
): number | undefined {
  const raw = readProp(props, name);
  if (raw == null) return undefined;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? undefined : n;
}

/** @returns "badge" | "desk-sign" | "gavel" */
function designerLineKind(
  props: Record<string, unknown>,
): "badge" | "desk-sign" | "gavel" {
  const d = readProp(props, "Designer");
  if (d == null) return "badge";
  const t = d.toLowerCase();
  if (t === "desk-sign" || t === "desksign" || t === "desk_sign") {
    return "desk-sign";
  }
  if (t === "gavel") return "gavel";
  return "badge";
}

type PayloadLineItem = {
  designId: string | undefined;
  gadgetDesignId: string | undefined;
  badgeIndex: number | undefined;
  quantity: number;
  badgeCount: number | undefined;
  designData?: unknown;
};

async function fetchDesignData(
  model: any,
  designId: string | undefined,
  gadgetDesignId: string | undefined,
  logger: { warn: (msg: string, ctx?: unknown) => void },
  label: string,
): Promise<unknown | undefined> {
  if (!model) return undefined;
  let design: { designData?: unknown } | null = null;
  try {
    if (designId) {
      design = await model.findOne({ filter: { designId } });
    }
    if (!design && gadgetDesignId) {
      design = await model.findOne({ filter: { id: gadgetDesignId } });
    }
    if (design && design.designData != null) {
      return typeof design.designData === "string"
        ? JSON.parse(design.designData as string)
        : design.designData;
    }
    logger.warn(`on_order_paid: ${label} not found or missing designData`, {
      designId,
      gadgetDesignId,
    });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`on_order_paid: failed to fetch ${label}`, {
      designId,
      gadgetDesignId,
      error: errMsg,
    });
  }
  return undefined;
}

async function collectLinePayloads(
  order: { line_items?: unknown[]; lineItems?: unknown[] },
  api: any,
  logger: { warn: (msg: string, ctx?: unknown) => void },
) {
  const lineItems = order.line_items ?? order.lineItems ?? [];
  const badgePayload: PayloadLineItem[] = [];
  const deskSignPayload: PayloadLineItem[] = [];
  const gavelPayload: PayloadLineItem[] = [];

  for (const item of lineItems) {
    const props = getPropertiesMap(
      item as { properties?: unknown; customAttributes?: unknown },
    );

    const designId = readProp(props, "Design ID");
    const gadgetDesignId = readProp(props, "Gadget Design ID");
    if (!designId && !gadgetDesignId) continue;

    const kind = designerLineKind(props);

    const indexRaw =
      kind === "desk-sign"
        ? readIntProp(props, "Desk Sign Index") ??
          readIntProp(props, "Sign Index") ??
          readIntProp(props, "Badge Index")
        : kind === "gavel"
          ? readIntProp(props, "Gavel Index") ??
            readIntProp(props, "Badge Index")
        : readIntProp(props, "Badge Index") ??
          readIntProp(props, "Sign Index") ??
          readIntProp(props, "Desk Sign Index");

    const itemQ = (item as { quantity?: number }).quantity;
    const quantity: number = itemQ != null && itemQ >= 1 ? itemQ : 1;
    const badgeCount = readIntProp(props, "Badge count");

    const entry: PayloadLineItem = {
      designId: designId || gadgetDesignId,
      gadgetDesignId: gadgetDesignId || undefined,
      badgeIndex: indexRaw,
      quantity,
      badgeCount,
    };

    if (kind === "desk-sign") {
      const model = api?.deskSignDesign ?? api?.DeskSignDesign;
      const designData = await fetchDesignData(
        model,
        designId,
        gadgetDesignId,
        logger,
        "DeskSignDesign",
      );
      if (designData !== undefined) entry.designData = designData;
      deskSignPayload.push(entry);
    } else if (kind === "gavel") {
      const model = api?.gavelDesign ?? api?.GavelDesign;
      const designData = await fetchDesignData(
        model,
        designId,
        gadgetDesignId,
        logger,
        "GavelDesign",
      );
      if (designData !== undefined) entry.designData = designData;
      gavelPayload.push(entry);
    } else {
      const model = api?.badgeDesign ?? api?.BadgeDesign;
      const designData = await fetchDesignData(
        model,
        designId,
        gadgetDesignId,
        logger,
        "BadgeDesign",
      );
      if (designData !== undefined) entry.designData = designData;
      badgePayload.push(entry);
    }
  }

  return { badgePayload, deskSignPayload, gavelPayload };
}

async function postLink(
  url: string,
  secret: string | undefined,
  body: unknown,
  logger: {
    error: (msg: string, ctx?: unknown) => void;
    info: (msg: string, ctx?: unknown) => void;
  },
  label: string,
) {
  if (!secret) {
    logger.error(`on_order_paid: missing secret for ${label}`);
    return { ok: false as const, reason: "missing_secret" };
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
    return { ok: false as const, status: res.status, data };
  }
  logger.info(`on_order_paid: ${label} linked`, {
    updatedCount: data.updatedCount ?? data.insertedCount,
  });
  return { ok: true as const, data };
}

export async function run({ api, params, trigger, record, logger }: any) {
  const order =
    record ??
    trigger?.payload?.order ??
    trigger?.order ??
    params?.payload?.order ??
    params?.order ??
    params;
  if (!order) {
    logger.warn("on_order_paid: no order in params/trigger/record");
    return { success: false, reason: "no_order" };
  }

  const shopifyOrderId =
    order.id ?? order.shopifyId ?? order.admin_graphql_api_id;
  const shopifyOrderNumber = order.name ?? order.order_number;
  const shopifyCustomerId =
    order.customer_id ?? order.customer?.id ?? order.customerId ?? null;

  if (!shopifyOrderId) {
    logger.warn("on_order_paid: order has no id");
    return { success: false, reason: "no_order_id" };
  }

  const { badgePayload, deskSignPayload, gavelPayload } = await collectLinePayloads(
    order as { line_items?: unknown[]; lineItems?: unknown[] },
    api,
    logger,
  );

  if (
    badgePayload.length === 0 &&
    deskSignPayload.length === 0 &&
    gavelPayload.length === 0
  ) {
    logger.info(
      "on_order_paid: no designer line items (no Design ID), skipping",
    );
    return { success: true, skipped: true, reason: "no_designer_items" };
  }

  const baseBody = {
    shopifyOrderId: String(shopifyOrderId),
    shopifyOrderNumber:
      shopifyOrderNumber != null ? String(shopifyOrderNumber) : undefined,
    shopifyCustomerId:
      shopifyCustomerId != null ? String(shopifyCustomerId) : undefined,
  };

  const results: Record<string, unknown> = {};

  if (badgePayload.length > 0) {
    results.badge = await postLink(
      BADGE_LINK_ORDER_URL,
      BADGE_SECRET,
      { ...baseBody, lineItems: badgePayload },
      logger,
      "badge",
    );
  }

  if (deskSignPayload.length > 0) {
    results.deskSign = await postLink(
      DESK_SIGN_LINK_ORDER_URL,
      DESK_SIGN_SECRET,
      { ...baseBody, lineItems: deskSignPayload },
      logger,
      "desk-sign",
    );
  }

  if (gavelPayload.length > 0) {
    results.gavel = await postLink(
      GAVEL_LINK_ORDER_URL,
      GAVEL_SECRET,
      { ...baseBody, lineItems: gavelPayload },
      logger,
      "gavel",
    );
  }

  const anyFailed =
    (results.badge && !(results.badge as { ok?: boolean }).ok) ||
    (results.deskSign && !(results.deskSign as { ok?: boolean }).ok) ||
    (results.gavel && !(results.gavel as { ok?: boolean }).ok);

  return {
    success: !anyFailed,
    results,
  };
}

/**
 * Keep your existing triggerKey from the Gadget UI — do not add webhooks: [] here.
 */
export const options = {
  triggers: {
    shopify: { triggerKey: "on_order_paid" },
  },
};
