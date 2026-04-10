import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

const MYSHOPIFY = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;

function normalizeShopHost(raw: string | null): string | null {
  if (!raw) return null;
  let h = raw.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "");
  h = h.split("/")[0] ?? h;
  return MYSHOPIFY.test(h) ? h : null;
}

/**
 * Proxies Shopify `GET /products/{handle}.js` so the designer can read live variant IDs and
 * prices without a Storefront token and without browser CORS issues.
 *
 * Query: `shop` (e.g. sign-dev-store.myshopify.com), `handle` (default custom-sign).
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const handle = url.searchParams.get("handle")?.trim() || "custom-sign";
  let shop =
    normalizeShopHost(url.searchParams.get("shop")) ||
    normalizeShopHost(process.env.SHOPIFY_STORE_URL ?? null);

  if (!shop) {
    return json(
      { error: "Missing or invalid shop. Pass ?shop=your-store.myshopify.com" },
      { status: 400 },
    );
  }

  const allowed = process.env.SHOPIFY_ALLOWED_SHOPS?.split(",")
    .map((s) => normalizeShopHost(s.trim()))
    .filter(Boolean) as string[];
  if (allowed?.length && !allowed.includes(shop)) {
    return json({ error: "Shop not allowed" }, { status: 403 });
  }

  const productUrl = `https://${shop}/products/${encodeURIComponent(
    handle,
  )}.js`;
  try {
    const res = await fetch(productUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "BadgeDesigner/1.0 (price sync)",
      },
    });
    if (!res.ok) {
      return json(
        {
          error: `Shopify returned ${res.status}`,
          detail: await res.text().catch(() => ""),
        },
        { status: 502 },
      );
    }
    const data = await res.json();
    return json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Fetch failed";
    return json({ error: message }, { status: 502 });
  }
}
