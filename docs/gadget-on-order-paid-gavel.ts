/**
 * Gadget action: on_order_paid (Gavels Fast / or shared AQB badge-designer-order-handler)
 *
 * Gavel cart lines → POST VERCEL_LINK_ORDER_GAVEL_URL
 *   (default …/api/link-order-gavel-to-supabase)
 *
 * Cart properties (underscore-prefixed):
 *   _Designer=gavel, _Design ID, _Gadget Design ID, _Gavel Index
 *   Gavel Text Line 1–4, _Gavel Style, _Band Finish
 *   _Product Type (Gavel | Gavel + stand), _Plate Finish, Stand Plate Line 1–2
 *
 * Gadget env:
 *   LINK_ORDER_SECRET_GAVEL   — optional; falls back to LINK_ORDER_SECRET
 *   VERCEL_LINK_ORDER_GAVEL_URL
 *
 * Model (optional, same shape as BadgeDesign):
 *   GavelDesign
 *
 * If Gavels Fast shares the AQB Gadget app, merge this branch into
 * docs/gadget-on-order-paid-aqb-badge-and-desk-sign.ts instead.
 *
 * Full create-app checklist: docs/GADGET_GAVEL_SETUP.md
 */

const GAVEL_LINK_ORDER_URL =
  process.env.VERCEL_LINK_ORDER_GAVEL_URL ||
  "https://all-quality-design-tool.vercel.app/api/link-order-gavel-to-supabase";

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

function isGavelLine(props: Record<string, unknown>): boolean {
  const d = readProp(props, "Designer");
  if (d == null) return false;
  return d.toLowerCase() === "gavel";
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
  } catch (err) {
    logger.warn("on_order_paid: failed to fetch GavelDesign", {
      designId,
      gadgetDesignId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return undefined;
}

async function postLink(
  url: string,
  secret: string | undefined,
  body: unknown,
  logger: {
    error: (msg: string, ctx?: unknown) => void;
    info: (msg: string, ctx?: unknown) => void;
  },
) {
  if (!secret) {
    logger.error("on_order_paid: missing secret for gavel");
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
    logger.error("on_order_paid: gavel Vercel error", {
      status: res.status,
      data,
    });
    return { ok: false as const, status: res.status, data };
  }
  logger.info("on_order_paid: gavel linked", {
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

  const lineItems = order.line_items ?? order.lineItems ?? [];
  const gavelPayload: PayloadLineItem[] = [];

  for (const item of lineItems) {
    const props = getPropertiesMap(
      item as { properties?: unknown; customAttributes?: unknown },
    );
    if (!isGavelLine(props)) continue;

    const designId = readProp(props, "Design ID");
    const gadgetDesignId = readProp(props, "Gadget Design ID");
    if (!designId && !gadgetDesignId) continue;

    const indexRaw =
      readIntProp(props, "Gavel Index") ?? readIntProp(props, "Badge Index");
    const itemQ = (item as { quantity?: number }).quantity;
    const quantity: number = itemQ != null && itemQ >= 1 ? itemQ : 1;

    const entry: PayloadLineItem = {
      designId: designId || gadgetDesignId,
      gadgetDesignId: gadgetDesignId || undefined,
      badgeIndex: indexRaw,
      quantity,
      badgeCount: undefined,
    };

    const model = api?.gavelDesign ?? api?.GavelDesign;
    const designData = await fetchDesignData(
      model,
      designId,
      gadgetDesignId,
      logger,
    );
    if (designData !== undefined) entry.designData = designData;
    gavelPayload.push(entry);
  }

  if (gavelPayload.length === 0) {
    logger.info("on_order_paid: no gavel line items, skipping");
    return { success: true, skipped: true, reason: "no_gavel_items" };
  }

  const result = await postLink(
    GAVEL_LINK_ORDER_URL,
    GAVEL_SECRET,
    {
      shopifyOrderId: String(shopifyOrderId),
      shopifyOrderNumber:
        shopifyOrderNumber != null ? String(shopifyOrderNumber) : undefined,
      shopifyCustomerId:
        shopifyCustomerId != null ? String(shopifyCustomerId) : undefined,
      lineItems: gavelPayload,
    },
    logger,
  );

  return { success: result.ok, result };
}

export const options = {
  triggers: {
    shopify: { triggerKey: "on_order_paid" },
  },
};
