/**
 * Native Shopify `orders/paid` webhook for the Gavels Fast store.
 *
 * Register in Shopify admin → Settings → Notifications → Webhooks:
 *   Event:  Order payment
 *   Format: JSON
 *   URL:    https://all-quality-design-tool.vercel.app/api/shopify-order-webhook-gavel
 *
 * Shopify shows a signing secret when you create the webhook. Put it on Vercel
 * as SHOPIFY_WEBHOOK_SECRET_GAVEL (or SHOPIFY_WEBHOOK_SECRET for all stores).
 *
 * This is a Gadget-free path to the same linking logic: it verifies Shopify's
 * HMAC, reshapes the order into the canonical link-order body, then hands off
 * to runLinkPaidOrderToSupabase so behaviour stays identical to the Gadget
 * route (`/api/link-order-gavel-to-supabase`), including order-slip PDFs.
 */
import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getDesignerConfig, resolveLinkOrderSecret } from "~/config/designers";
import { runLinkPaidOrderToSupabase } from "~/lib/designers/httpHandlers";
import { readCartProperty } from "~/utils/cartLineProperties";

const LOG = "[gavel-webhook]";

export async function loader(_args: LoaderFunctionArgs) {
  return json(
    { error: "Method not allowed", message: "Shopify posts orders/paid here" },
    { status: 405 },
  );
}

function verifyShopifyHmac(rawBody: string, header: string | null): boolean {
  const secret =
    process.env.SHOPIFY_WEBHOOK_SECRET_GAVEL ||
    process.env.SHOPIFY_WEBHOOK_SECRET;
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
function propertiesToMap(item: unknown): Record<string, unknown> {
  const raw = (item as { properties?: unknown })?.properties;
  const out: Record<string, unknown> = {};
  if (!Array.isArray(raw)) return out;
  for (const entry of raw) {
    const name = (entry as { name?: string })?.name;
    if (name != null) out[name] = (entry as { value?: unknown }).value;
  }
  return out;
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // The signature covers the exact bytes Shopify sent, so read text first.
  const rawBody = await request.text();
  if (!verifyShopifyHmac(rawBody, request.headers.get("X-Shopify-Hmac-Sha256"))) {
    console.warn(`${LOG} rejected: bad or missing HMAC`);
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let order: Record<string, unknown>;
  try {
    order = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, { status: 400 });
  }

  const shopifyOrderId = order.id;
  if (shopifyOrderId == null) {
    console.warn(`${LOG} order payload has no id`);
    return json({ success: false, reason: "no_order_id" }, { status: 200 });
  }

  const rawLines = Array.isArray(order.line_items) ? order.line_items : [];
  const lineItems: Array<{
    designId: string;
    gadgetDesignId?: string;
    badgeIndex: number;
    quantity: number;
  }> = [];

  for (const item of rawLines) {
    const props = propertiesToMap(item);
    if (readCartProperty(props, "_Designer")?.toLowerCase() !== "gavel") continue;

    const designId = readCartProperty(props, "_Design ID");
    const gadgetDesignId = readCartProperty(props, "_Gadget Design ID");
    if (!designId && !gadgetDesignId) continue;

    const rawIndex =
      readCartProperty(props, "_Gavel Index") ??
      readCartProperty(props, "_Badge Index");
    const parsedIndex = rawIndex == null ? 0 : Number.parseInt(rawIndex, 10);
    const quantity = (item as { quantity?: number }).quantity;

    lineItems.push({
      designId: (designId ?? gadgetDesignId) as string,
      ...(gadgetDesignId ? { gadgetDesignId } : {}),
      badgeIndex: Number.isNaN(parsedIndex) || parsedIndex < 0 ? 0 : parsedIndex,
      quantity: typeof quantity === "number" && quantity >= 1 ? quantity : 1,
    });
  }

  // 200 on non-gavel orders, otherwise Shopify retries and eventually disables
  // the webhook for this store.
  if (lineItems.length === 0) {
    console.log(`${LOG} order ${shopifyOrderId}: no gavel lines, skipping`);
    return json({ success: true, skipped: true }, { status: 200 });
  }

  const def = getDesignerConfig("gavel");
  const secret = resolveLinkOrderSecret(def);
  if (!secret) {
    console.error(`${LOG} LINK_ORDER_SECRET_GAVEL / LINK_ORDER_SECRET not set`);
    return json(
      { error: "Server configuration error", message: "Link order secret not configured" },
      { status: 500 },
    );
  }

  const customer = order.customer as { id?: unknown } | undefined;
  const payload = {
    shopifyOrderId: String(shopifyOrderId),
    shopifyOrderNumber:
      order.name != null
        ? String(order.name)
        : order.order_number != null
          ? String(order.order_number)
          : undefined,
    shopifyCustomerId: customer?.id != null ? String(customer.id) : undefined,
    lineItems,
  };

  console.log(
    `${LOG} order ${payload.shopifyOrderId} (${payload.shopifyOrderNumber ?? "no number"}) → ${lineItems
      .map((l) => `${l.designId}[gavel-${l.badgeIndex}]`)
      .join(", ")}`,
  );

  // Reuse the proven handler rather than duplicating the Supabase update.
  return runLinkPaidOrderToSupabase(
    "gavel",
    new Request("https://internal/api/link-order-gavel-to-supabase", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${secret}`,
      },
      body: JSON.stringify(payload),
    }),
  );
}
