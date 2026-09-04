import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/node";
import { getProductionOrder } from "~/lib/production/orderData.server";
import { verifyAdminSessionToken } from "~/lib/shopify/adminSession.server";

const SHOPIFY_ORIGIN = /(^|\.)shopifycdn\.com$|(^|\.)shopify\.com$/;

/**
 * Admin UI extensions run in a sandbox whose origin varies (and can be opaque),
 * so echo Shopify origins and fall back to `*`. Safe because every request is
 * authorized by a signed session token rather than cookies.
 */
function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  let allowOrigin = "*";
  if (origin) {
    try {
      if (SHOPIFY_ORIGIN.test(new URL(origin).hostname)) allowOrigin = origin;
    } catch {
      // Opaque origins arrive as the literal string "null".
    }
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      request.headers.get("Access-Control-Request-Headers") ??
      "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "private, no-store",
    Vary: "Origin",
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const headers = corsHeaders(request);

  // Remix routes OPTIONS to the loader, so the preflight has to be answered
  // before the session token check.
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    const session = verifyAdminSessionToken(request);
    const orderId = new URL(request.url).searchParams.get("orderId")?.trim();
    if (!orderId) {
      return json({ error: "orderId is required" }, { status: 400, headers });
    }

    const items = await getProductionOrder(orderId, session.shop);
    return json({ orderId, shop: session.shop, items }, { headers });
  } catch (error) {
    if (error instanceof Response) {
      const message = await error.text().catch(() => "");
      return json(
        { error: message || `Request rejected (${error.status}).` },
        { status: error.status, headers },
      );
    }
    console.error("[production-admin] order lookup failed", error);
    return json(
      { error: "Could not load production details." },
      { status: 500, headers },
    );
  }
}

export async function action({ request }: ActionFunctionArgs) {
  return json(
    { error: "Method not allowed" },
    { status: 405, headers: corsHeaders(request) },
  );
}
