import {
  PEN_ENGRAVING_COLOR,
  PEN_METAL_COLOR,
  PEN_SURFACES,
  type PenBandMode,
  type PenFontId,
  type PenSurfaceSpec,
} from "~/constants/pen";

export interface PenSurfaceArtwork {
  mode?: PenBandMode;
  text: string;
  fontFamily: PenFontId;
  bold?: boolean;
  italic?: boolean;
  logoDataUrl?: string | null;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function safeImageDataUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^data:image\/(?:png|jpeg|jpg|webp|svg\+xml);/i.test(value)
    ? value
    : null;
}

function surfaceSvg(
  title: string,
  spec: PenSurfaceSpec,
  artwork: PenSurfaceArtwork,
  options?: { includeSurface?: boolean },
): string {
  const { viewBoxWidth: width, viewBoxHeight: height, safeInset } = spec;
  const logo = safeImageDataUrl(artwork.logoDataUrl);
  const usesLogo = artwork.mode === "logo" && logo;
  const text = escapeXml(artwork.text.trim());
  const safeWidth = width - safeInset * 2;
  const safeHeight = height - safeInset * 2;
  const baseFontSize = height * (title === "Case band" ? 0.3 : 0.36);
  const fittedFontSize =
    safeWidth / Math.max(1, artwork.text.trim().length * 0.62);
  const fontSize = Math.round(Math.min(baseFontSize, fittedFontSize));
  const artworkColor = options?.includeSurface
    ? PEN_ENGRAVING_COLOR
    : "#000000";
  const content = usesLogo
    ? `<image href="${escapeXml(logo)}" x="${safeInset}" y="${safeInset}" width="${safeWidth}" height="${safeHeight}" preserveAspectRatio="xMidYMid meet"/>`
    : `<text x="${width / 2}" y="${height / 2}" dominant-baseline="middle" text-anchor="middle" font-family="${escapeXml(artwork.fontFamily)}" font-size="${fontSize}" font-weight="${artwork.bold ? 700 : 500}" font-style="${artwork.italic ? "italic" : "normal"}" fill="${artworkColor}">${text || " "}</text>`;
  const surface = options?.includeSurface
    ? [
        `<rect width="${width}" height="${height}" rx="${Math.round(height * 0.08)}" fill="${PEN_METAL_COLOR}"/>`,
        `<rect x="${safeInset}" y="${safeInset}" width="${safeWidth}" height="${safeHeight}" fill="none" stroke="#777" stroke-width="2" stroke-dasharray="10 8"/>`,
      ].join("")
    : "";

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${spec.widthIn}in" height="${spec.heightIn}in" viewBox="0 0 ${width} ${height}">`,
    `<title>${title} engraving artwork</title>`,
    `<desc>Estimated ${spec.widthIn} by ${spec.heightIn} inch production area; confirm vendor measurements before manufacture.</desc>`,
    surface,
    `<g id="artwork">${content}</g>`,
    `</svg>`,
  ].join("");
}

export function penCaseBandToSvgString(
  artwork: PenSurfaceArtwork,
  options?: { includeSurface?: boolean },
): string {
  return surfaceSvg("Case band", PEN_SURFACES.caseBand, artwork, options);
}

export function penCapToSvgString(
  artwork: PenSurfaceArtwork,
  options?: { includeSurface?: boolean },
): string {
  return surfaceSvg("Pen cap", PEN_SURFACES.cap, {
    ...artwork,
    mode: "text",
    logoDataUrl: null,
  }, options);
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function penProofBoardToSvgString(input: {
  band: PenSurfaceArtwork;
  cap: PenSurfaceArtwork;
}): string {
  const bandUrl = svgDataUrl(
    penCaseBandToSvgString(input.band, { includeSurface: true }),
  );
  const capUrl = svgDataUrl(
    penCapToSvgString(input.cap, { includeSurface: true }),
  );
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720" viewBox="0 0 1200 720">`,
    `<rect width="1200" height="720" fill="#f4f0e8"/>`,
    `<text x="70" y="86" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#0a2740">Custom pen proof</text>`,
    `<text x="70" y="138" font-family="Arial, sans-serif" font-size="20" fill="#68717a">Case band</text>`,
    `<image href="${bandUrl}" x="70" y="166" width="1060" height="364" preserveAspectRatio="xMidYMid meet"/>`,
    `<text x="70" y="584" font-family="Arial, sans-serif" font-size="20" fill="#68717a">Pen cap</text>`,
    `<image href="${capUrl}" x="70" y="608" width="760" height="88" preserveAspectRatio="xMinYMid meet"/>`,
    `</svg>`,
  ].join("");
}

async function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const image = new Image();
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  );
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Could not render pen proof."));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function penProofBoardToPng(input: {
  band: PenSurfaceArtwork;
  cap: PenSurfaceArtwork;
}): Promise<{ blob: Blob; dataUrl: string }> {
  const svg = penProofBoardToSvgString(input);
  const image = await loadSvgImage(svg);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is unavailable.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL("image/png");
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) =>
        value ? resolve(value) : reject(new Error("Could not save pen proof.")),
      "image/png",
    );
  });
  return { blob, dataUrl };
}
