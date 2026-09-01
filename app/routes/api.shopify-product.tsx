import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

const MYSHOPIFY = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i;
const DEFAULT_ADMIN_API_VERSION = "2026-07";

type StorefrontProduct = {
  variants?: Array<{
    id?: number;
    available?: boolean;
  }>;
  [key: string]: unknown;
};

function normalizeShopHost(raw: string | null): string | null {
  if (!raw) return null;
  let h = raw.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "");
  h = h.split("/")[0] ?? h;
  return MYSHOPIFY.test(h) ? h : null;
}

/**
 * The storefront product feed omits inventory quantities and reports an
 * out-of-stock variant as available whenever "continue selling when out of
 * stock" is enabled, so it cannot answer the stock question on its own.
 * With Admin API credentials we replace that value with the real rule:
 * tracked quantity must be positive; untracked counts as in stock.
 *
 * The token is only ever sent to the shop it belongs to, so a request for any
 * other shop falls back to the storefront value rather than leaking it.
 */
async function applyAdminInventory(
  product: StorefrontProduct,
  shop: string,
): Promise<StorefrontProduct> {
  const token = (
    process.env.SHOPIFY_ADMIN_ACCESS_TOKEN ??
    process.env.SHOPIFY_ACCESS_TOKEN ??
    ""
  ).trim();
  // Separate from SHOPIFY_STORE_URL, which other routes use as the cart store.
  const adminShop = normalizeShopHost(
    process.env.SHOPIFY_ADMIN_SHOP ?? process.env.SHOPIFY_STORE_URL ?? null,
  );
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (variants.length === 0) return product;
  if (!token) {
    console.warn(
      "[shopify-product] No Admin token set; falling back to storefront availability, which stays true for variants that continue selling when out of stock.",
    );
    return product;
  }
  if (adminShop !== shop) {
    console.warn(
      `[shopify-product] Admin token is scoped to ${adminShop ?? "no shop"}, not ${shop}; skipping the inventory lookup.`,
    );
    return product;
  }

  const ids = variants
    .map((variant) =>
      typeof variant.id === "number"
        ? `gid://shopify/ProductVariant/${variant.id}`
        : null,
    )
    .filter((id): id is string => id !== null);
  if (ids.length === 0) return product;

  const version =
    process.env.SHOPIFY_ADMIN_API_VERSION?.trim() ||
    DEFAULT_ADMIN_API_VERSION;
  let response: Response;
  try {
    response = await fetch(
      `https://${shop}/admin/api/${encodeURIComponent(version)}/graphql.json`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": token,
        },
        body: JSON.stringify({
          query: `query GavelVariantInventory($ids: [ID!]!) {
            nodes(ids: $ids) {
              ... on ProductVariant {
                id
                inventoryQuantity
                inventoryItem {
                  tracked
                }
              }
            }
          }`,
          variables: { ids },
        }),
      },
    );
  } catch (e) {
    console.warn("[shopify-product] Admin inventory request failed", e);
    return product;
  }
  if (!response.ok) {
    console.warn(
      `[shopify-product] Admin inventory request returned ${response.status}. A 401/403 means the token is wrong or missing read_products / read_inventory.`,
    );
    return product;
  }

  let body: {
    data?: {
      nodes?: Array<{
        id?: string;
        inventoryQuantity?: number;
        inventoryItem?: { tracked?: boolean } | null;
      } | null>;
    };
    errors?: unknown[];
  };
  try {
    body = (await response.json()) as typeof body;
  } catch (e) {
    console.warn("[shopify-product] Admin inventory response was not JSON", e);
    return product;
  }
  if (body.errors?.length || !Array.isArray(body.data?.nodes)) {
    console.warn(
      "[shopify-product] Admin inventory query returned errors",
      body.errors,
    );
    return product;
  }

  const availability = new Map<number, boolean>();
  for (const node of body.data.nodes) {
    const numericId = Number(node?.id?.split("/").pop());
    const tracked = node?.inventoryItem?.tracked;
    if (!Number.isFinite(numericId) || typeof tracked !== "boolean") continue;
    availability.set(
      numericId,
      !tracked ||
        (typeof node?.inventoryQuantity === "number" &&
          node.inventoryQuantity > 0),
    );
  }

  return {
    ...product,
    variants: variants.map((variant) => {
      const available =
        typeof variant.id === "number"
          ? availability.get(variant.id)
          : undefined;
      return available === undefined ? variant : { ...variant, available };
    }),
  };
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
  const shop =
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
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "User-Agent": "BadgeDesigner/1.0 (catalog sync)",
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
    const storefrontData = (await res.json()) as StorefrontProduct;
    const data = await applyAdminInventory(storefrontData, shop);
    return json(data, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Fetch failed";
    return json({ error: message }, { status: 502 });
  }
}
