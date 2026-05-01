/** Encode rendered SVG markup as an image URL (same as template picker thumbnails). */
export function svgMarkupToImageSrc(svg: string): string {
  try {
    return (
      "data:image/svg+xml;base64," +
      btoa(unescape(encodeURIComponent(svg)))
    );
  } catch {
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
}
