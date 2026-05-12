import type { Badge } from "~/types/badge";

const PLAQUE_LOGO_DATA_URL_CACHE_MAX = 40;

/**
 * Browsers block cross-origin `<image href="https://...">` when an SVG is rasterized to canvas
 * or encoded as a data-URL `<img>`. Inline the plate logo as a data URL before
 * `renderBadgeToSvgStringWithFonts` for plaque PDFs and previews.
 */
export async function badgeWithPlaqueLogoInlinedForSvgImg(
  badge: Badge,
  cache: Map<string, string>,
): Promise<Badge> {
  const raw = badge.logo?.src?.trim();
  if (!raw || raw.startsWith("data:")) {
    return badge;
  }
  const isHttp = /^https?:\/\//i.test(raw);
  const isBlob = raw.startsWith("blob:");
  if (!isHttp && !isBlob) {
    return badge;
  }
  const hit = cache.get(raw);
  if (hit) {
    return {
      ...badge,
      logo: badge.logo ? { ...badge.logo, src: hit } : badge.logo,
    };
  }
  try {
    const res = await fetch(raw, { mode: "cors", credentials: "omit" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => reject(new Error("FileReader failed"));
      fr.readAsDataURL(blob);
    });
    cache.set(raw, dataUrl);
    while (cache.size > PLAQUE_LOGO_DATA_URL_CACHE_MAX) {
      const first = cache.keys().next().value as string | undefined;
      if (!first) break;
      cache.delete(first);
    }
    return {
      ...badge,
      logo: badge.logo ? { ...badge.logo, src: dataUrl } : badge.logo,
    };
  } catch (e) {
    console.warn(
      "[plaqueLogoInline] Could not inline plaque logo for rasterization:",
      e,
    );
    return badge;
  }
}
