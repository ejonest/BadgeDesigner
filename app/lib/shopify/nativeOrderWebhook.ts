/**
 * Shared helpers for native Shopify `orders/paid` webhooks (no Gadget).
 * Each store registers its own webhook in Shopify admin → Settings →
 * Notifications → Webhooks; HMAC secrets are per-webhook.
 */
import { json } from "@remix-run/node";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
  type DesignerId,
  getDesignerApiPaths,
  getDesignerConfig,
  isDesignerId,
  resolveLinkOrderSecret,
} from "~/config/designers";
import { runLinkPaidOrderToSupabase } from "~/lib/designers/httpHandlers";
import { readCartProperty } from "~/utils/cartLineProperties";

export type ShopifyWebhookLine = {
  designId: string;
  gadgetDesignId?: string;
  badgeIndex: number;
  quantity: number;
  badgeCount?: number;
};

export type ShopifyOrderMeta = {
  shopifyOrderId: string;
  shopifyOrderNumber?: string;
  shopifyCustomerId?: string;
};

export function resolveShopifyWebhookSecret(
  ...envNames: string[]
): string | undefined {
  for (const name of envNames) {
    const v = process.env[name];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  const fallback = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (typeof fallback === "string" && fallback.trim() !== "") {
    return fallback.trim();
  }
  return undefined;
}

export function verifyShopifyWebhookHmac(
  rawBody: string,
  header: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !header) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(header, "base64");
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(expected, provided);
}

/** Shopify sends line item properties as [{ name, value }]. */
export function shopifyLinePropertiesToMap(
  item: unknown,
): Record<string, unknown> {
  const raw = (item as { properties?: unknown })?.properties;
  const out: Record<string, unknown> = {};
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    const name = (entry as { name?: string })?.name;
    if (name != null) out[name] = (entry as { value?: unknown }).value;
  }
  return out;
}

export function parseShopifyOrderMeta(
  order: Record<string, unknown>,
): ShopifyOrderMeta | null {
  if (order.id == null) return null;
  const customer = order.customer as { id?: unknown } | undefined;
  return {
    shopifyOrderId: String(order.id),
    shopifyOrderNumber:
      order.name != null
        ? String(order.name)
        : order.order_number != null
          ? String(order.order_number)
          : undefined,
    shopifyCustomerId: customer?.id != null ? String(customer.id) : undefined,
  };
}

function normalizeDesignerKind(
  raw: string | undefined,
): DesignerId | null {
  if (raw == null) return null;
  const t = raw.toLowerCase().replace(/_/g, "-").trim();
  if (t === "desksign") return "desk-sign";
  if (isDesignerId(t)) return t;
  return null;
}

function readLineIndex(
  props: Record<string, unknown>,
  kind: DesignerId,
): number {
  const def = getDesignerConfig(kind);
  const keys = [def.cartIndexPropertyPrimary, ...def.cartIndexPropertyFallbacks];
  for (const key of keys) {
    const raw = readCartProperty(props, key);
    if (raw == null) continue;
    const n = Number.parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 0) return n;
  }
  return 0;
}

export function collectDesignerLinesFromShopifyOrder(
  order: Record<string, unknown>,
  allowed: readonly DesignerId[],
  defaultKind?: DesignerId,
): Map<DesignerId, ShopifyWebhookLine[]> {
  const allowedSet = new Set(allowed);
  const grouped = new Map<DesignerId, ShopifyWebhookLine[]>();
  const rawLines = Array.isArray(order.line_items) ? order.line_items : [];

  for (const item of rawLines) {
    const props = shopifyLinePropertiesToMap(item);
    const designId = readCartProperty(props, "Design ID");
    const gadgetDesignId = readCartProperty(props, "Gadget Design ID");
    if (!designId && !gadgetDesignId) continue;

    const kind =
      normalizeDesignerKind(readCartProperty(props, "Designer")) ??
      defaultKind ??
      null;
    if (kind == null || !allowedSet.has(kind)) continue;

    const quantity = (item as { quantity?: number }).quantity;
    const badgeCountRaw = readCartProperty(props, "Badge count");
    const badgeCount =
      badgeCountRaw == null ? undefined : Number.parseInt(badgeCountRaw, 10);

    const line: ShopifyWebhookLine = {
      designId: (designId ?? gadgetDesignId) as string,
      ...(gadgetDesignId ? { gadgetDesignId } : {}),
      badgeIndex: readLineIndex(props, kind),
      quantity: typeof quantity === "number" && quantity >= 1 ? quantity : 1,
      ...(badgeCount != null && !Number.isNaN(badgeCount)
        ? { badgeCount }
        : {}),
    };

    const list = grouped.get(kind) ?? [];
    list.push(line);
    grouped.set(kind, list);
  }

  return grouped;
}

export async function runNativeShopifyLinkOrder(
  designerId: DesignerId,
  meta: ShopifyOrderMeta,
  lineItems: ShopifyWebhookLine[],
): Promise<Response> {
  const def = getDesignerConfig(designerId);
  const secret = resolveLinkOrderSecret(def);
  if (!secret) {
    console.error(
      `[shopify-webhook] ${def.linkOrderSecretEnv} / LINK_ORDER_SECRET not set (${designerId})`,
    );
    return json(
      {
        error: "Server configuration error",
        message: "Link order secret not configured",
      },
      { status: 500 },
    );
  }

  const path = getDesignerApiPaths(designerId).linkOrderToSupabase;
  return runLinkPaidOrderToSupabase(
    designerId,
    new Request(`https://internal${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify({
        shopifyOrderId: meta.shopifyOrderId,
        shopifyOrderNumber: meta.shopifyOrderNumber,
        shopifyCustomerId: meta.shopifyCustomerId,
        lineItems,
      }),
    }),
  );
}

export async function handleNativeShopifyOrderPaid(args: {
  request: Request;
  logPrefix: string;
  hmacEnvNames: string[];
  allowed: readonly DesignerId[];
  defaultKind?: DesignerId;
}): Promise<Response> {
  const { request, logPrefix, hmacEnvNames, allowed, defaultKind } = args;

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const rawBody = await request.text();
  const hmacSecret = resolveShopifyWebhookSecret(...hmacEnvNames);
  if (
    !verifyShopifyWebhookHmac(
      rawBody,
      request.headers.get("X-Shopify-Hmac-Sha256"),
      hmacSecret,
    )
  ) {
    console.warn(`${logPrefix} rejected: bad or missing HMAC`);
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let order: Record<string, unknown>;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const meta = parseShopifyOrderMeta(order);
  if (!meta) {
    console.warn(`${logPrefix} order payload has no id`);
    return json({ success: false, reason: "no_order_id" }, { status: 200 });
  }

  const grouped = collectDesignerLinesFromShopifyOrder(
    order,
    allowed,
    defaultKind,
  );
  if (grouped.size === 0) {
    console.log(
      `${logPrefix} order ${meta.shopifyOrderId}: no matching designer lines, skipping`,
    );
    return json({ success: true, skipped: true }, { status: 200 });
  }

  const results: Record<string, unknown> = {};
  for (const [kind, lines] of grouped) {
    console.log(
      `${logPrefix} order ${meta.shopifyOrderId} (${meta.shopifyOrderNumber ?? "no number"}) ${kind} → ${lines
        .map((l) => `${l.designId}[${kind}-${l.badgeIndex}]`)
        .join(", ")}`,
    );
    const response = await runNativeShopifyLinkOrder(kind, meta, lines);
    if (!response.ok) return response;
    results[kind] = await response.json().catch(() => ({}));
  }

  return json({ success: true, results });
}
