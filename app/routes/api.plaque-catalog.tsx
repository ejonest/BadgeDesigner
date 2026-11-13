import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";

import { loadPublishedPlaqueCatalog } from "~/utils/plaqueCatalog.server";

function shopIdFromRequest(request: Request): string {
  const shop = new URL(request.url).searchParams.get("shop")?.trim() ?? "";
  return /^[a-z0-9][a-z0-9.-]{0,120}$/i.test(shop) ? shop : "";
}

/**
 * Published plaque designs for the iframe.
 * `?slug=` returns one design. The list is cached at the edge; drafts stay on the server.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  if (request.method !== "GET") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }
  const slug = new URL(request.url).searchParams.get("slug")?.trim() ?? "";
  const catalog = await loadPublishedPlaqueCatalog(shopIdFromRequest(request));
  const designs = slug ? catalog.designs.filter((design) => design.slug === slug) : catalog.designs;
  if (slug && designs.length === 0) {
    return json({ error: "Design not found" }, { status: 404 });
  }
  return json(
    {
      source: catalog.source,
      designs,
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
      },
    },
  );
}
