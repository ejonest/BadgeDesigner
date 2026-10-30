import type { MedalProduct } from "~/constants/medalOptions";

export type MedalLineStyle = {
  size: "small" | "medium" | "large";
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

/** Average capital width, as a fraction of the font size. Wider faces allow fewer letters. */
const CAPITAL_EM: Record<string, number> = {
  Arial: 0.688,
  "Open Sans": 0.663,
  "Times New Roman": 0.705,
  Montserrat: 0.732,
  Georgia: 0.77,
};

const FIELD_FIT = {
  circle: { width: 0.86, height: 0.68 },
  band: { width: 0.94, height: 0.82 },
} as const;

/** Largest type, as a fraction of the open area's width, before a short word looks cramped. */
const MAX_FITTED_SIZE = 0.46;

function textEmWidth(text: string, em: number, style: MedalLineStyle | undefined): number {
  let units = 0;
  for (const char of text) {
    if (char === " ") units += 0.33;
    else if (char >= "a" && char <= "z") units += 0.72;
    else units += 1;
  }
  const weight = style?.bold === false ? 0.96 : 1;
  const italic = style?.italic ? 1.03 : 1;
  return Math.max(units, 1) * em * weight * italic;
}

/**
 * One size for every line, as a fraction of the open area's width.
 * The block grows until the widest line or the stack meets the open area.
 */
export function medalFittedSize(input: {
  lines: string[];
  fontFamily: string;
  lineStyles: MedalLineStyle[];
  fieldShape: MedalProduct["fieldShape"];
  textArea: MedalProduct["textArea"];
}): number {
  const shown = visibleLines(input.lines);
  const em = CAPITAL_EM[input.fontFamily] ?? CAPITAL_EM.Arial;
  const fit = FIELD_FIT[input.fieldShape];
  const widest = Math.max(
    ...shown.map((line, index) => textEmWidth(line, em, input.lineStyles[index])),
  );
  const widthFit = fit.width / widest;
  const aspect = input.textArea.height / Math.max(input.textArea.width, 1);
  const heightFit = (fit.height * aspect) / (shown.length * LINE_HEIGHT);
  return Math.min(MAX_FITTED_SIZE, widthFit, heightFit);
}

const LINE_HEIGHT = 1.12;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function visibleLines(lines: string[]): string[] {
  const lastLine = Math.max(
    ...lines.map((line, index) => (line.trim() ? index : -1)),
  );
  return lastLine >= 0
    ? lines.slice(0, lastLine + 1)
    : ["YOUR", "CUSTOM TEXT", "HERE"];
}

function fittedFontSize(
  fieldWidth: number,
  input: {
    lines: string[];
    fontFamily: string;
    lineStyles: MedalLineStyle[];
    product: MedalProduct;
  },
): number {
  return (
    fieldWidth *
    medalFittedSize({
      lines: input.lines,
      fontFamily: input.fontFamily,
      lineStyles: input.lineStyles,
      fieldShape: input.product.fieldShape,
      textArea: input.product.textArea,
    })
  );
}

export function medalArtworkToSvgString(input: {
  product: MedalProduct;
  lines: string[];
  fontFamily: string;
  lineStyles: MedalLineStyle[];
}): string {
  const lines = visibleLines(input.lines);
  const area = input.product.textArea;
  const width = input.product.fieldShape === "circle" ? 720 : 960;
  const height =
    input.product.fieldShape === "circle"
      ? 720
      : Math.max(280, Math.round(width * (area.height / area.width)));
  const fontSize = fittedFontSize(width, input);
  const sizes = lines.map(() => fontSize);
  const totalHeight = sizes.reduce((sum, size) => sum + size * LINE_HEIGHT, 0);
  let cursor = height / 2 - totalHeight / 2;
  const rendered = lines
    .map((line, index) => {
      const style = input.lineStyles[index] ?? input.lineStyles[0];
      const size = sizes[index];
      const dy = index === 0 ? cursor + (size * LINE_HEIGHT) / 2 : size * LINE_HEIGHT;
      cursor += size * LINE_HEIGHT;
      return `<tspan x="${(width / 2).toFixed(2)}" dy="${index === 0 ? dy.toFixed(2) : (size * LINE_HEIGHT).toFixed(2)}" font-size="${size.toFixed(2)}" font-weight="${style.bold ? 700 : 400}" font-style="${style.italic ? "italic" : "normal"}" text-decoration="${style.underline ? "underline" : "none"}">${escapeXml(line || " ")}</tspan>`;
    })
    .join("");
  const y = 0;
  const field = escapeXml(input.product.fieldColor);
  const plate = input.product.textOnArtwork
    ? ""
    : input.product.fieldShape === "circle"
      ? `<circle cx="${width / 2}" cy="${height / 2}" r="${width / 2 - 2}" fill="${field}"/>`
      : `<rect x="0" y="0" width="${width}" height="${height}" rx="18" fill="${field}"/>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${plate}
  <text fill="${escapeXml(input.product.textColor)}" font-family="${escapeXml(input.fontFamily)}, Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" y="${y.toFixed(2)}">${rendered}</text>
</svg>`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the medal image."));
    image.src = src;
  });
}

export async function medalPreviewToPng(input: {
  product: MedalProduct;
  lines: string[];
  fontFamily: string;
  lineStyles: MedalLineStyle[];
}): Promise<{ blob: Blob; dataUrl: string }> {
  const photo = await loadImage(input.product.artworkSrc ?? input.product.imageSrc);
  const canvas = document.createElement("canvas");
  const size = Math.min(photo.naturalWidth || 1000, 1000);
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the medal preview.");
  ctx.drawImage(photo, 0, 0, size, size);

  const bounds = input.product.textArea;
  const x = (bounds.left / 100) * size;
  const y = (bounds.top / 100) * size;
  const w = (bounds.width / 100) * size;
  const h = (bounds.height / 100) * size;
  ctx.save();
  ctx.beginPath();
  if (input.product.fieldShape === "circle") {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.clip();
  if (!input.product.textOnArtwork) {
    ctx.fillStyle = input.product.fieldColor;
    ctx.fillRect(x, y, w, h);
  }

  const lines = visibleLines(input.lines);
  const fontSize = fittedFontSize(w, input);
  const sizes = lines.map(() => fontSize);
  const totalHeight = sizes.reduce((sum, fontSize) => sum + fontSize * LINE_HEIGHT, 0);
  let cursorY = y + (h - totalHeight) / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = input.product.textColor;
  lines.forEach((line, index) => {
    const style = input.lineStyles[index] ?? input.lineStyles[0];
    const fontSize = sizes[index];
    if (input.product.textOnArtwork) {
      ctx.shadowColor = "rgba(4, 10, 40, 0.85)";
      ctx.shadowBlur = Math.max(2, fontSize * 0.12);
      ctx.shadowOffsetY = Math.max(1, fontSize * 0.04);
    }
    ctx.font = `${style.italic ? "italic " : ""}${style.bold ? 700 : 400} ${fontSize}px "${input.fontFamily}"`;
    ctx.fillText(line || " ", x + w / 2, cursorY);
    cursorY += fontSize * LINE_HEIGHT;
  });
  ctx.restore();

  // Same window as `.md-medal-crop { width: 215% }`: the medal disc, not the ribbon.
  const zoom = 2.15;
  const cropSize = Math.round(size / zoom);
  const cropped = document.createElement("canvas");
  cropped.width = cropSize;
  cropped.height = cropSize;
  const cropCtx = cropped.getContext("2d");
  if (!cropCtx) throw new Error("Could not draw the medal preview.");
  cropCtx.drawImage(
    canvas,
    Math.round((size - cropSize) / 2),
    size - cropSize,
    cropSize,
    cropSize,
    0,
    0,
    cropSize,
    cropSize,
  );

  const dataUrl = cropped.toDataURL("image/jpeg", 0.88);
  const blob = await new Promise<Blob>((resolve, reject) => {
    cropped.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("Thumbnail failed."))),
      "image/jpeg",
      0.88,
    );
  });
  return { blob, dataUrl };
}
