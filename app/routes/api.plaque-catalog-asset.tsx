import type { LoaderFunctionArgs } from "@remix-run/node";

import { findPlaqueCatalogSeedVariant, readPlaqueCatalogAsset } from "~/utils/plaqueCatalog.server";

/** Local preview photo for a catalog variant before it has a storage URL. */
export async function loader({ request }: LoaderFunctionArgs) {
  const params = new URL(request.url).searchParams;
  const file = findPlaqueCatalogSeedVariant(
    params.get("slug")?.trim() ?? "",
    params.get("plate")?.trim() ?? "",
    params.get("frame")?.trim() ?? "",
  );
  if (!file) {
    return new Response("Not found", { status: 404 });
  }
  try {
    const bytes = readPlaqueCatalogAsset(file);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
