import type { BadgeLine } from "~/types/badge";
import {
  GAVEL_BAND_GOLD_HEX,
  GAVEL_BAND_TEXTURE_HEIGHT_PX,
  GAVEL_BAND_TEXTURE_WIDTH_PX,
  GAVEL_DEFAULT_FONT,
  GAVEL_DEFAULT_TEXT_COLOR,
  GAVEL_MAX_LINES,
  GAVEL_TEXTURE_FONT_PX,
  type GavelTextSizePreset,
} from "~/constants/gavelStyles";

export type GavelBandLineInput = {
  text?: string;
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
};

function fontCss(
  line: GavelBandLineInput,
  sizePx: number,
): string {
  const weight = line.bold ? "700" : "600";
  const style = line.italic ? "italic" : "normal";
  const family = line.fontFamily?.trim() || GAVEL_DEFAULT_FONT;
  return `${style} ${weight} ${sizePx}px "${family}", Georgia, serif`;
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
  sheen.addColorStop(0, "rgba(255,255,255,0.1)");
  sheen.addColorStop(0.5, "rgba(255,255,255,0.04)");
  sheen.addColorStop(1, "rgba(255,255,255,0.1)");
  ctx.fillStyle = sheen;
  ctx.fillRect(0, 0, width, height);
}

function activeLines(lines: readonly GavelBandLineInput[]): GavelBandLineInput[] {
  return lines
    .slice(0, GAVEL_MAX_LINES)
    .filter((l) => (l.text ?? "").trim().length > 0);
}

function bandTextLayout(filledCount: number, preset: GavelTextSizePreset) {
  const fontPx = GAVEL_TEXTURE_FONT_PX[preset];
  const lineGap = fontPx * 0.22;
  const rawBlock =
    filledCount * fontPx + Math.max(0, filledCount - 1) * lineGap;
  const maxBlock = GAVEL_BAND_TEXTURE_HEIGHT_PX * 0.86;
  const scale = rawBlock > maxBlock ? maxBlock / rawBlock : 1;
  const drawPx = fontPx * scale;
  const drawGap = lineGap * scale;
  const blockHeight =
    filledCount * drawPx + Math.max(0, filledCount - 1) * drawGap;
  const y0 = (GAVEL_BAND_TEXTURE_HEIGHT_PX - blockHeight) / 2 + drawPx * 0.78;
  return { drawPx, drawGap, y0 };
}

/**
 * Paint the unwrapped band (metal + up to 4 centered text lines) onto a canvas.
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

  const { drawPx, drawGap, y0 } = bandTextLayout(filled.length, preset);
  let y = y0;

  for (const line of filled) {
    ctx.font = fontCss(line, drawPx);
    ctx.fillStyle = line.color?.trim() || GAVEL_DEFAULT_TEXT_COLOR;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "center";
    ctx.fillText((line.text ?? "").trim(), width / 2, y);
    y += drawPx + drawGap;
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
  const { drawPx, drawGap, y0 } = bandTextLayout(filled.length, preset);
  let y = y0;

  const textEls = filled
    .map((line) => {
      const family = line.fontFamily?.trim() || GAVEL_DEFAULT_FONT;
      const weight = line.bold ? 700 : 600;
      const fontStyle = line.italic ? "italic" : "normal";
      const color = line.color?.trim() || GAVEL_DEFAULT_TEXT_COLOR;
      const text = escapeXml((line.text ?? "").trim());
      const el = `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="${escapeXml(family)}, Georgia, serif" font-size="${drawPx}" font-weight="${weight}" font-style="${fontStyle}" fill="${escapeXml(color)}">${text}</text>`;
      y += drawPx + drawGap;
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
