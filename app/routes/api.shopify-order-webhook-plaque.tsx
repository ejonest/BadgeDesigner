/**
 * Native Shopify `orders/paid` webhook for the Signs by Lita store.
 * Handles plaque cart lines (and sign lines if they appear on the same order).
 *
 * Register in Shopify admin → Settings → Notifications → Webhooks:
 *   Event:  Order payment
 *   Format: JSON
 *   URL:    https://all-quality-design-tool.vercel.app/api/shopify-order-webhook-plaque
 *
 * Shopify shows a signing secret when you create the webhook. Put it on Vercel
 * as SHOPIFY_WEBHOOK_SECRET_PLAQUE (falls back to SHOPIFY_WEBHOOK_SECRET).
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
    logPrefix: "[plaque-webhook]",
    hmacEnvNames: ["SHOPIFY_WEBHOOK_SECRET_PLAQUE", "SHOPIFY_WEBHOOK_SECRET_SBL"],
    allowed: ["plaque", "sign"],
  });
}
