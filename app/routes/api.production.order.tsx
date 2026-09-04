import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { getProductionOrder } from "~/lib/production/orderData.server";
import { verifyAdminSessionToken } from "~/lib/shopify/adminSession.server";

const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "https://extensions.shopifycdn.com",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "private, no-store",
  Vary: "Origin",
};

export async function loader({ request }: LoaderFunctionArgs) {
  const session = verifyAdminSessionToken(request);
  const orderId = new URL(request.url).searchParams.get("orderId")?.trim();
  if (!orderId) {
    return json(
      { error: "orderId is required" },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  try {
    const items = await getProductionOrder(orderId, session.shop);
    return json(
      { orderId, shop: session.shop, items },
      { headers: RESPONSE_HEADERS },
    );
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[production-admin] order lookup failed", error);
    return json(
      { error: "Could not load production details." },
      { status: 500, headers: RESPONSE_HEADERS },
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
  }
  return json(
    { error: "Method not allowed" },
    { status: 405, headers: RESPONSE_HEADERS },
  );
}
