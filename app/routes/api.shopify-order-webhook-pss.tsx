/**
 * Native Shopify `orders/paid` webhook for Pacific Sign and Stamp.
 * One subscription covers every custom designer on that store: plaque,
 * trophy, and medal. Other designer lines on the same order are linked too,
 * so the production card can show them.
 *
 * Register in Shopify admin → Settings → Notifications → Webhooks:
 *   Event:  Order payment
 *   Format: JSON
 *   URL:    https://all-quality-design-tool.vercel.app/api/shopify-order-webhook-pss
 *
 * Shopify shows a signing secret when you create the webhook. Put it on Vercel
 * as SHOPIFY_WEBHOOK_SECRET_PSS (falls back to SHOPIFY_WEBHOOK_SECRET).
 * App-subscription deliveries are signed with the Production Design Card – PSS
 * client secret, so SHOPIFY_ADMIN_PSS_CLIENT_SECRET is accepted as well.
 */
import { json, type ActionFunctionArgs } from "@remix-run/node";
import { DESIGNER_IDS } from "~/config/designers";
import { handleNativeShopifyOrderPaid } from "~/lib/shopify/nativeOrderWebhook";

export async function loader() {
  return json(
    { error: "Method not allowed", message: "Shopify posts orders/paid here" },
    { status: 405 },
  );
}

export async function action({ request }: ActionFunctionArgs) {
  return handleNativeShopifyOrderPaid({
    request,
    logPrefix: "[pss-webhook]",
    hmacEnvNames: [
      "SHOPIFY_WEBHOOK_SECRET_PSS",
      "SHOPIFY_ADMIN_PSS_CLIENT_SECRET",
    ],
    allowed: DESIGNER_IDS,
  });
}
