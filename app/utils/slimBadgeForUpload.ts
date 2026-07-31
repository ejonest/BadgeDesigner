import type { Badge } from "~/types/badge";

/**
 * Strip oversized data-URL assets from badge JSON before multipart upload.
 * Keeps https(s) logo URLs so order items still get uploaded_image_url.
 */
export function slimBadgeForOrderUpload(badge: Badge): Badge {
  const next: Badge = { ...badge };
  if (next.logo?.src?.startsWith("data:")) {
    next.logo = { ...next.logo, src: "" };
  }
  if (next.backgroundImage?.src?.startsWith("data:")) {
    next.backgroundImage = { ...next.backgroundImage, src: "" };
  }
  return next;
}

export function slimBadgesForOrderUpload(badges: Badge[]): Badge[] {
  return badges.map(slimBadgeForOrderUpload);
}
