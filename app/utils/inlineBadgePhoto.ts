/**
 * Inline badge blank product photos as data URLs so SVG <image> paints in the
 * same pixel grid as calibrated text/icon rects (external href + meet can shift).
 */
export async function inlineBadgeBlankPhotoSrc(src: string): Promise<string> {
  if (!src?.trim() || src.startsWith("data:")) return src;

  if (typeof window !== "undefined") {
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
