import type { BadgeLine } from "~/types/badge";
import {
  GAVEL_BAND_GOLD_HEX,
  GAVEL_BAND_TEXTURE_HEIGHT_PX,
  GAVEL_BAND_TEXTURE_WIDTH_PX,
  GAVEL_DEFAULT_FONT,
  GAVEL_DEFAULT_TEXT_COLOR,
  GAVEL_TEXTURE_FONT_PX,
  type GavelTextSizePreset,
} from "~/constants/gavelStyles";

export type GavelBandLineInput = {
  text?: string;
  fontFamily?: string;
  color?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
};

function fontCss(
  line: GavelBandLineInput,
  preset: GavelTextSizePreset,
): string {
  const size = GAVEL_TEXTURE_FONT_PX[preset];
  const weight = line.bold ? "700" : "600";
  const style = line.italic ? "italic" : "normal";
  const family = line.fontFamily?.trim() || GAVEL_DEFAULT_FONT;
  return `${style} ${weight} ${size}px "${family}", Georgia, serif`;
}

function drawBrushedGold(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bandHex: string,
) {
  ctx.fillStyle = bandHex;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 90; i++) {
    const y = (i / 90) * height;
    ctx.fillStyle = `rgba(255,255,255,${0.02 + (i % 3) * 0.012})`;
    ctx.fillRect(0, y, width, 1.5);
  }
  const sheen = ctx.createLinearGradient(0, 0, width, 0);
  sheen.addColorStop(0, "rgba(255,255,255,0.08)");
  sheen.addColorStop(0.45, "rgba(255,255,255,0)");
  sheen.addColorStop(0.55, "rgba(255,255,255,0.18)");
  sheen.addColorStop(1, "rgba(0,0,0,0.08)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);
}

function activeLines(lines: readonly GavelBandLineInput[]): GavelBandLineInput[] {
  return lines
    .slice(0, 3)
    .filter((l) => (l.text ?? "").trim().length > 0);
}

/**
 * Paint the unwrapped band (gold + up to 3 centered text lines) onto a canvas.
 * Used for the 3D wrap texture, the flat proof strip, and print SVG raster.
 */
export function paintGavelBandCanvas(
  canvas: HTMLCanvasElement,
  lines: readonly GavelBandLineInput[],
  preset: GavelTextSizePreset,
  bandHex: string = GAVEL_BAND_GOLD_HEX,
): HTMLCanvasElement {
  const width = GAVEL_BAND_TEXTURE_WIDTH_PX;
  const height = GAVEL_BAND_TEXTURE_HEIGHT_PX;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;

  drawBrushedGold(ctx, width, height, bandHex);

  const filled = activeLines(lines);
  if (filled.length === 0) return canvas;

  const fontPx = GAVEL_TEXTURE_FONT_PX[preset];
  const lineGap = fontPx * 0.28;
  const blockHeight =
    filled.length * fontPx + Math.max(0, filled.length - 1) * lineGap;
  let y = (height - blockHeight) / 2 + fontPx * 0.78;

  for (const line of filled) {
    ctx.font = fontCss(line, preset);
    ctx.fillStyle = line.color?.trim() || GAVEL_DEFAULT_TEXT_COLOR;
    ctx.textBaseline = "alphabetic";
    const text = (line.text ?? "").trim();
    const align = line.align ?? "center";
    if (align === "left") {
      ctx.textAlign = "left";
      ctx.fillText(text, width * 0.06, y);
    } else if (align === "right") {
      ctx.textAlign = "right";
      ctx.fillText(text, width * 0.94, y);
    } else {
      ctx.textAlign = "center";
      ctx.fillText(text, width / 2, y);
    }
    y += fontPx + lineGap;
  }

  return canvas;
}

export function gavelBandToDataUrl(
  lines: readonly GavelBandLineInput[] | readonly BadgeLine[],
  preset: GavelTextSizePreset,
  bandHex: string = GAVEL_BAND_GOLD_HEX,
): string {
  if (typeof document === "undefined") return "";
  const canvas = document.createElement("canvas");
  paintGavelBandCanvas(canvas, lines, preset, bandHex);
  return canvas.toDataURL("image/png");
}

/** Print-ready SVG of the unwrapped band (manufacturing artwork). */
export function gavelBandToSvgString(
  lines: readonly GavelBandLineInput[] | readonly BadgeLine[],
  preset: GavelTextSizePreset,
  bandHex: string = GAVEL_BAND_GOLD_HEX,
): string {
  const width = GAVEL_BAND_TEXTURE_WIDTH_PX;
  const height = GAVEL_BAND_TEXTURE_HEIGHT_PX;
  const filled = activeLines(lines);
  const fontPx = GAVEL_TEXTURE_FONT_PX[preset];
  const lineGap = fontPx * 0.28;
  const blockHeight =
    filled.length * fontPx + Math.max(0, filled.length - 1) * lineGap;
  let y = (height - blockHeight) / 2 + fontPx * 0.78;

  const textEls = filled
    .map((line) => {
      const family = line.fontFamily?.trim() || GAVEL_DEFAULT_FONT;
      const weight = line.bold ? 700 : 600;
      const fontStyle = line.italic ? "italic" : "normal";
      const color = line.color?.trim() || GAVEL_DEFAULT_TEXT_COLOR;
      const text = escapeXml((line.text ?? "").trim());
      const align = line.align ?? "center";
      const anchor =
        align === "left" ? "start" : align === "right" ? "end" : "middle";
      const x =
        align === "left"
          ? width * 0.06
          : align === "right"
            ? width * 0.94
            : width / 2;
      const el = `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="${escapeXml(family)}, Georgia, serif" font-size="${fontPx}" font-weight="${weight}" font-style="${fontStyle}" fill="${escapeXml(color)}">${text}</text>`;
      y += fontPx + lineGap;
      return el;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${escapeXml(bandHex)}"/>
  ${textEls}
</svg>`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
