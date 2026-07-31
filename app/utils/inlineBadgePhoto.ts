/**
 * Inline badge blank product photos as data URLs so SVG <image> paints in the
 * same pixel grid as calibrated text/icon rects (external href + meet can shift).
 *
 * Browser fetches are cached so bulk draft saves (Add Multiple) do not re-download
 * the same plate / bleed asset for every badge × render path.
 */

const browserInlineCache = new Map<string, Promise<string>>();

const MAX_BROWSER_INLINE_CACHE = 48;

function rememberBrowserInline(src: string, promise: Promise<string>): Promise<string> {
  if (browserInlineCache.size >= MAX_BROWSER_INLINE_CACHE) {
    const oldest = browserInlineCache.keys().next().value;
    if (oldest !== undefined) browserInlineCache.delete(oldest);
  }
  browserInlineCache.set(src, promise);
  return promise;
}

async function fetchAndReadDataUrl(src: string): Promise<string> {
  const res = await fetch(src);
  if (!res.ok) {
    console.warn(
      `[inlineBadgePhoto] fetch failed ${res.status} for ${src}, using href`,
    );
    return src;
  }
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? src));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function inlineBadgeBlankPhotoSrc(src: string): Promise<string> {
  if (!src?.trim() || src.startsWith("data:")) return src;

  if (typeof window !== "undefined") {
    const cached = browserInlineCache.get(src);
    if (cached) return cached;
    return rememberBrowserInline(
      src,
      fetchAndReadDataUrl(src).catch((err) => {
        browserInlineCache.delete(src);
        throw err;
      }),
    );
  }

  try {
    const { readFileSync, existsSync } = await import("node:fs");
    const { join } = await import("node:path");
    const clean = src.startsWith("/") ? src.slice(1) : src;
    const filePath = join(process.cwd(), "public", clean);
    if (!existsSync(filePath)) return src;
    const buf = readFileSync(filePath);
    const mime = src.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return src;
  }
}
