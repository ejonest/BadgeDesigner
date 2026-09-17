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
    estimateTrophyLineWidthsEm(shown, styles),
    styles,
    area,
    plateRatio,
  );
  const fontPx = (fontCqh / 100) * height;
  const x = (area.left / 100) * width;
  const y = (area.top / 100) * height;
  const boxW = (area.width / 100) * width;
  const boxH = (area.height / 100) * height;

  const tspans = shown
    .map((line, index) => {
      const style = styles[index];
      const size = fontPx * TROPHY_LINE_SIZE_SCALE[style.size];
      const weight = style.bold ? "700" : "400";
      const fontStyle = style.italic ? "italic" : "normal";
      const decoration = style.underline ? "underline" : "none";
      return `<tspan x="${(x + boxW / 2).toFixed(2)}" dy="${
        index === 0 ? "0" : (size * TROPHY_LINE_HEIGHT).toFixed(2)
      }" font-size="${size.toFixed(2)}" font-weight="${weight}" font-style="${fontStyle}" text-decoration="${decoration}">${escapeXml(
        line || " ",
      )}</tspan>`;
    })
    .join("");

  const firstSize = fontPx * TROPHY_LINE_SIZE_SCALE[styles[0].size];
  const textY = y + boxH / 2 - ((shown.length - 1) * firstSize * TROPHY_LINE_HEIGHT) / 2;

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

export async function trophyPreviewToPng(input: {
  product: TrophyProduct;
  option: TrophyPlateOption;
  lines: string[];
  fontFamily: string;
  lineStyles: TrophyLineStyle[];
  logoSrc?: string | null;
}): Promise<{ blob: Blob; dataUrl: string }> {
  const trophy = await loadImage(input.option.trophySrc);
  const plate = await loadImage(input.option.plateSrc);
  const canvas = document.createElement("canvas");
  const width = Math.min(trophy.naturalWidth || 900, 900);
  const scale = width / (trophy.naturalWidth || width);
  const height = Math.round((trophy.naturalHeight || 1200) * scale);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not draw the trophy preview.");
  ctx.drawImage(trophy, 0, 0, width, height);

  if (input.product.logoInsert && input.logoSrc) {
    try {
      const logo = await loadImage(input.logoSrc);
      ctx.drawImage(
        logo,
        (input.product.logoInsert.left / 100) * width,
        (input.product.logoInsert.top / 100) * height,
        (input.product.logoInsert.width / 100) * width,
        (input.product.logoInsert.height / 100) * height,
      );
    } catch {
      // Logo is optional on the thumbnail.
    }
  }

  const bounds = input.product.plateBounds;
  const plateX = (bounds.left / 100) * width;
  const plateY = (bounds.top / 100) * height;
  const plateW = (bounds.width / 100) * width;
  const plateH = (bounds.height / 100) * height;
  ctx.drawImage(plate, plateX, plateY, plateW, plateH);

  const shown = shownPlateLines(input.lines);
  const styles = shown.map(
    (_, index) => input.lineStyles[index] ?? input.lineStyles[0],
  );
  const area = input.option.textArea;
  const plateRatio = input.option.ratio ?? TROPHY_PLATE_RATIO;
  const fontCqh = fitTrophyFontSize(
    estimateTrophyLineWidthsEm(shown, styles),
    styles,
    area,
    plateRatio,
  );
  const fontPx = (fontCqh / 100) * plateH;
  ctx.fillStyle = input.option.textColor;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const textBoxX = plateX + (area.left / 100) * plateW;
  const textBoxY = plateY + (area.top / 100) * plateH;
  const textBoxW = (area.width / 100) * plateW;
  const textBoxH = (area.height / 100) * plateH;
  const totalEm = styles.reduce(
    (sum, style) => sum + TROPHY_LINE_SIZE_SCALE[style.size],
    0,
  );
  let cursorY =
    textBoxY +
    textBoxH / 2 -
    ((totalEm - TROPHY_LINE_SIZE_SCALE[styles[0].size]) *
      fontPx *
      TROPHY_LINE_HEIGHT) /
      2;
  shown.forEach((line, index) => {
    const style = styles[index];
    const size = fontPx * TROPHY_LINE_SIZE_SCALE[style.size];
    ctx.font = `${style.italic ? "italic " : ""}${style.bold ? 700 : 400} ${size}px "${input.fontFamily}"`;
    ctx.fillText(line || " ", textBoxX + textBoxW / 2, cursorY, textBoxW);
    cursorY += size * TROPHY_LINE_HEIGHT;
  });

  const dataUrl = canvas.toDataURL("image/jpeg", 0.86);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => (next ? resolve(next) : reject(new Error("Thumbnail failed"))),
      "image/jpeg",
      0.86,
    );
  });
  return { blob, dataUrl };
}
