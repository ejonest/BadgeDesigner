import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { uploadDataUrlToBadgeImagesBucket } from "~/utils/supabase";
import { parseOr400, libraryThumbnailBodySchema } from "~/utils/validation";

/** Same storage path can be upserted (e.g. autosave); public URL must change or browsers/CDNs keep the old bitmap. */
function publicUrlWithCacheBust(publicUrl: string): string {
  try {
    const u = new URL(publicUrl);
    u.searchParams.set("cb", String(Date.now()));
    return u.toString();
  } catch {
    const sep = publicUrl.includes("?") ? "&" : "?";
    return `${publicUrl}${sep}cb=${Date.now()}`;
  }
}

/**
 * POST /api/library-thumbnail
 * Uploads a small PNG preview to Supabase `badge-images` for design library gallery.
 * Body: { designId, imageData } — imageData must be a data:image/png;base64,... URL.
 */
export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.json().catch(() => null);
    const parsed = parseOr400(
      libraryThumbnailBodySchema,
      body,
      "designId and imageData (PNG data URL) are required",
    );
    if (!parsed.ok) return parsed.response;

    const { designId, imageData } = parsed.data;
    const basePublicUrl = await uploadDataUrlToBadgeImagesBucket(
      imageData,
      designId,
      "library-preview",
    );
    const thumbnailUrl = publicUrlWithCacheBust(basePublicUrl);

    return json({ success: true, thumbnailUrl });
  } catch (error) {
    console.error("[api.library-thumbnail] error:", error);
    const details =
      error instanceof Error ? error.message : "Unknown error";
    return json(
      { error: "Failed to upload library thumbnail", details },
      { status: 500 },
    );
  }
}
