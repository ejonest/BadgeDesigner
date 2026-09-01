import {
  json,
  type ActionFunctionArgs,
} from "@remix-run/node";
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
    logPrefix: "[pen-webhook]",
    hmacEnvNames: ["SHOPIFY_WEBHOOK_SECRET_PEN"],
    allowed: ["pen"],
  });
}
