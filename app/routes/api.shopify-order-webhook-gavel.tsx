/**
 * Native Shopify `orders/paid` webhook for the Gavels Fast store.
 * Handles gavel and pen cart lines on the same order, because the store
 * registers a single `orders/paid` webhook for both designers.
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
    logPrefix: "[gavel-webhook]",
    hmacEnvNames: ["SHOPIFY_WEBHOOK_SECRET_GAVEL"],
    allowed: ["gavel", "pen"],
  });
}
