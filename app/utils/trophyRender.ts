import {
  TROPHY_PLATE_RATIO,
  type TrophyPlateOption,
  type TrophyProduct,
  type TrophyTextArea,
} from "~/constants/trophyOptions";

export type TrophyLineSize = "small" | "medium" | "large";

export type TrophyLineStyle = {
  size: TrophyLineSize;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

export const TROPHY_LINE_HEIGHT = 1.18;
export const TROPHY_LINE_SIZE_SCALE: Record<TrophyLineSize, number> = {
  small: 0.78,
  medium: 1,
  large: 1.28,
};
const AVG_CHAR_EM = 0.58;
const BOLD_CHAR_EM = 0.62;
const MAX_FONT_CQH = 24;
const PRINT_HEIGHT_PX = 720;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fitTrophyFontSize(
  lineWidthsEm: number[],
  lineStyles: TrophyLineStyle[],
  area: TrophyTextArea,
  plateRatio: number,
): number {
  const scaledLineHeight = lineStyles.reduce(
    (total, style) => total + TROPHY_LINE_SIZE_SCALE[style.size],
    0,
  );
  const byHeight = area.height / (scaledLineHeight * TROPHY_LINE_HEIGHT);
  const widestScaledLine = Math.max(
    ...lineStyles.map(
      (style, index) =>
        (lineWidthsEm[index] ?? 0.01) * TROPHY_LINE_SIZE_SCALE[style.size],
    ),
    0.01,
  );
  const byWidth = (area.width * plateRatio * 0.96) / widestScaledLine;
  return Math.min(byHeight, byWidth, MAX_FONT_CQH);
}

export function estimateTrophyLineWidthsEm(
  lines: string[],
  lineStyles: TrophyLineStyle[],
): number[] {
  return lines.map((line, index) => {
    const style = lineStyles[index] ?? lineStyles[0];
    return (
      Math.max(line.length, 1) *
      (style.bold ? BOLD_CHAR_EM : AVG_CHAR_EM) *
      (style.italic ? 1.04 : 1)
    );
  });
}

let measureCanvas: HTMLCanvasElement | null = null;

/** Real width of each line, in ems of the face that will be drawn. */
export function measureTrophyLineWidthsEm(
  lines: string[],
  fontFamily: string,
  lineStyles: TrophyLineStyle[],
): number[] {
  if (typeof document === "undefined") {
    return estimateTrophyLineWidthsEm(lines, lineStyles);
  }
  measureCanvas ??= document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return estimateTrophyLineWidthsEm(lines, lineStyles);
  const probe = 100;
  return lines.map((line, index) => {
    const style = lineStyles[index] ?? lineStyles[0];
    ctx.font = `${style.italic ? "italic " : ""}${style.bold ? 700 : 400} ${probe}px "${fontFamily}"`;
    return Math.max(ctx.measureText(line || " ").width / probe, 0.01);
  });
}

/**
 * Crop applied by `.tr-plate-artwork > img` so a square product photo is
 * trimmed to the plate. Exact plates are already cropped and skip this.
 */
const PLATE_PHOTO_FRAME = {
  topPercent: -37.95,
  leftPercent: -9.15,
  widthPercent: 118.3,
};

function plateDrawSource(
  image: HTMLImageElement,
  exact: boolean | undefined,
  plateRatio: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const full = {
    sx: 0,
    sy: 0,
    sw: image.naturalWidth,
    sh: image.naturalHeight,
  };
  if (exact || image.naturalWidth < 1 || image.naturalHeight < 1) return full;

  const widthScale = PLATE_PHOTO_FRAME.widthPercent / 100;
  const leftScale = -PLATE_PHOTO_FRAME.leftPercent / 100;
  const topScale = -PLATE_PHOTO_FRAME.topPercent / 100;
  const heightScale =
    widthScale * plateRatio * (image.naturalHeight / image.naturalWidth);
  if (widthScale <= 0 || heightScale <= 0) return full;

  const sx = (leftScale / widthScale) * image.naturalWidth;
  const sy = (topScale / heightScale) * image.naturalHeight;
  const sw = (1 / widthScale) * image.naturalWidth;
  const sh = (1 / heightScale) * image.naturalHeight;
  const x = Math.min(Math.max(sx, 0), image.naturalWidth - 1);
  const y = Math.min(Math.max(sy, 0), image.naturalHeight - 1);
  const right = Math.min(Math.max(sx + sw, x + 1), image.naturalWidth);
  const bottom = Math.min(Math.max(sy + sh, y + 1), image.naturalHeight);
  return { sx: x, sy: y, sw: right - x, sh: bottom - y };
}

function containRect(
  srcW: number,
  srcH: number,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(boxW / Math.max(srcW, 1), boxH / Math.max(srcH, 1));
  const w = srcW * scale;
  const h = srcH * scale;
  return {
    x: boxX + (boxW - w) / 2,
    y: boxY + (boxH - h) / 2,
    w,
    h,
  };
}

function shownPlateLines(lines: string[]): string[] {
  return lines.some((line) => line.trim()) ? lines : ["YOUR TEXT HERE"];
}

export function trophyPlateToSvgString(input: {
  option: TrophyPlateOption;
  lines: string[];
  fontFamily: string;
  lineStyles: TrophyLineStyle[];
}): string {
  const shown = shownPlateLines(input.lines);
  const styles = shown.map(
    (_, index) => input.lineStyles[index] ?? input.lineStyles[0],
  );
  const area = input.option.textArea;
  const plateRatio = input.option.ratio ?? TROPHY_PLATE_RATIO;
  const height = PRINT_HEIGHT_PX;
  const width = Math.round(height * plateRatio);
  const fontCqh = fitTrophyFontSize(
    measureTrophyLineWidthsEm(shown, input.fontFamily, styles),
    styles,
    area,
    plateRatio,
  );
  const fontPx = (fontCqh / 100) * height;
  const x = (area.left / 100) * width;
  const y = (area.top / 100) * height;
  const boxW = (area.width / 100) * width;
  const boxH = (area.height / 100) * height;
  const lineBox = styles.map(
    (style) => fontPx * TROPHY_LINE_SIZE_SCALE[style.size] * TROPHY_LINE_HEIGHT,
  );
  const totalH = lineBox.reduce((sum, box) => sum + box, 0);

  const tspans = shown
    .map((line, index) => {
      const style = styles[index];
      const size = fontPx * TROPHY_LINE_SIZE_SCALE[style.size];
      const weight = style.bold ? "700" : "400";
      const fontStyle = style.italic ? "italic" : "normal";
      const decoration = style.underline ? "underline" : "none";
      const dy =
        index === 0 ? 0 : (lineBox[index - 1] + lineBox[index]) / 2;
      return `<tspan x="${(x + boxW / 2).toFixed(2)}" dy="${dy.toFixed(
        2,
      )}" font-size="${size.toFixed(2)}" font-weight="${weight}" font-style="${fontStyle}" text-decoration="${decoration}">${escapeXml(
        line || " ",
      )}</tspan>`;
    })
    .join("");

  const textY = y + (boxH - totalH) / 2 + lineBox[0] / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#f3f3f3"/>
  <text fill="${escapeXml(input.option.textColor)}" font-family="${escapeXml(
    input.fontFamily,
  )}, Arial, sans-serif" text-anchor="middle" dominant-baseline="middle" y="${textY.toFixed(
    2,
  )}">${tspans}</text>
</svg>`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load ${src}`));
    image.src = src;
  });
}

async function ensureTrophyFont(
  fontFamily: string,
  lineStyles: TrophyLineStyle[],
): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const faces = new Set(
    lineStyles.map(
      (style) =>
        `${style.italic ? "italic" : "normal"} ${style.bold ? 700 : 400} 16px "${fontFamily}"`,
    ),
  );
  await Promise.all(
    [...faces].map((face) => document.fonts.load(face).catch(() => undefined)),
  );
  await document.fonts.ready.catch(() => undefined);
}

export async function trophyPreviewToPng(input: {
  product: TrophyProduct;
  option: TrophyPlateOption;
  lines: string[];
  fontFamily: string;
  lineStyles: TrophyLineStyle[];
  logoSrc?: string | null;
}): Promise<{ blob: Blob; dataUrl: string; width: number; height: number }> {
  const trophy = await loadImage(input.option.trophySrc);
  const plate = await loadImage(input.option.plateSrc);
  const shown = shownPlateLines(input.lines);
  const styles = shown.map(
    (_, index) => input.lineStyles[index] ?? input.lineStyles[0],
  );
  await ensureTrophyFont(input.fontFamily, styles);

  const canvas = document.createElement("canvas");
  const width = Math.min(trophy.naturalWidth || 1200, 1200);
  const scale = width / (trophy.naturalWidth || width);
  const height = Math.round((trophy.naturalHeight || width) * scale);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the trophy preview.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(trophy, 0, 0, width, height);

  if (input.product.logoInsert && input.logoSrc) {
    try {
      const logo = await loadImage(input.logoSrc);
      const insert = input.product.logoInsert;
      const boxX = (insert.left / 100) * width;
      const boxY = (insert.top / 100) * height;
      const boxW = (insert.width / 100) * width;
      const boxH = (insert.height / 100) * height;
      const fitted = containRect(
        logo.naturalWidth,
        logo.naturalHeight,
        boxX,
        boxY,
        boxW,
        boxH,
      );
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(
        boxX + boxW / 2,
        boxY + boxH / 2,
        boxW / 2,
        boxH / 2,
        0,
        0,
        Math.PI * 2,
      );
      ctx.clip();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.drawImage(logo, fitted.x, fitted.y, fitted.w, fitted.h);
      ctx.restore();
    } catch {
      // Logo is optional on the thumbnail.
    }
  }

  const bounds = input.product.plateBounds;
  const plateX = (bounds.left / 100) * width;
  const plateY = (bounds.top / 100) * height;
  const plateW = (bounds.width / 100) * width;
  const plateH = (bounds.height / 100) * height;
  const plateRatio = input.option.ratio ?? TROPHY_PLATE_RATIO;
  const source = plateDrawSource(plate, input.option.exact, plateRatio);
  ctx.drawImage(
    plate,
    source.sx,
    source.sy,
    source.sw,
    source.sh,
    plateX,
    plateY,
    plateW,
    plateH,
  );

  const area = input.option.textArea;
  const fontCqh = fitTrophyFontSize(
    measureTrophyLineWidthsEm(shown, input.fontFamily, styles),
    styles,
    area,
    plateRatio,
  );
  const fontPx = (fontCqh / 100) * plateH;
  const textBoxX = plateX + (area.left / 100) * plateW;
  const textBoxY = plateY + (area.top / 100) * plateH;
  const textBoxW = (area.width / 100) * plateW;
  const textBoxH = (area.height / 100) * plateH;
  const sizes = styles.map(
    (style) => fontPx * TROPHY_LINE_SIZE_SCALE[style.size],
  );
  const lineBox = sizes.map((size) => size * TROPHY_LINE_HEIGHT);
  const totalH = lineBox.reduce((sum, box) => sum + box, 0);
  let lineTop = textBoxY + (textBoxH - totalH) / 2;
  const centerX = textBoxX + textBoxW / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(plateX, plateY, plateW, plateH);
  ctx.clip();
  ctx.fillStyle = input.option.textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  shown.forEach((line, index) => {
    const style = styles[index];
    const size = sizes[index];
    const mid = lineTop + lineBox[index] / 2;
    ctx.font = `${style.italic ? "italic " : ""}${style.bold ? 700 : 400} ${size}px "${input.fontFamily}"`;
    const text = line || " ";
    ctx.fillText(text, centerX, mid);
    if (style.underline && line.trim()) {
      const textWidth = ctx.measureText(text).width;
      const thickness = Math.max(1, size / 16);
      ctx.fillRect(
        centerX - textWidth / 2,
        mid + size * 0.32,
        textWidth,
        thickness,
      );
    }
    lineTop += lineBox[index];
  });
  ctx.restore();

  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error("Thumbnail failed"))),
      "image/jpeg",
      0.9,
    );
  });
  return { blob, dataUrl, width, height };
}
