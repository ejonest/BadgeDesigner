/**
 * Native Shopify `orders/paid` webhook for the All Quality Badges store.
 * Handles badge and desk-sign cart lines on the same order.
 *
 * Register in Shopify admin → Settings → Notifications → Webhooks:
 *   Event:  Order payment
 *   Format: JSON
 *   URL:    https://all-quality-design-tool.vercel.app/api/shopify-order-webhook-aqb
 *
 * Shopify shows a signing secret when you create the webhook. Put it on Vercel
 * as SHOPIFY_WEBHOOK_SECRET_AQB (falls back to SHOPIFY_WEBHOOK_SECRET).
 *
 * Lines with no `_Designer` property are treated as badges (legacy carts).
 */
import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from "@remix-run/node";
import { handleNativeShopifyOrderPaid } from "~/lib/shopify/nativeOrderWebhook";

export async function loader(_args: LoaderFunctionArgs) {
  return json(
    { error: "Method not allowed", message: "Shopify posts orders/paid here" },
    { status: 405 },
  );
}

export async function action({ request }: ActionFunctionArgs) {
  return handleNativeShopifyOrderPaid({
    request,
    logPrefix: "[aqb-webhook]",
    hmacEnvNames: ["SHOPIFY_WEBHOOK_SECRET_AQB"],
    allowed: ["badge", "desk-sign"],
    defaultKind: "badge",
  });
}
