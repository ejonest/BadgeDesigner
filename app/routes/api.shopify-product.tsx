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
 * The storefront product feed omits inventory quantities and can report an
 * out-of-stock variant as available when "continue selling" is enabled.
 * When Admin API credentials are configured, replace that value with the
 * requested rule: tracked quantity must be positive; untracked is in stock.
 */
async function applyAdminInventory(
  product: StorefrontProduct,
  shop: string,
): Promise<StorefrontProduct> {
  const token = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim();
  const configuredShop = normalizeShopHost(
    process.env.SHOPIFY_STORE_URL ?? null,
  );
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (!token || configuredShop !== shop || variants.length === 0) {
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
  } catch {
    return product;
  }
  if (!response.ok) return product;

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
  } catch {
    return product;
  }
  if (body.errors?.length || !Array.isArray(body.data?.nodes)) {
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
