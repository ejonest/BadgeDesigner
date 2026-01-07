import { BADGE_CONSTANTS } from '../constants/badge';

/**
 * Measures the width of text with given font properties
 */
export function measureTextWidth(
  text: string,
  fontSize: number,
  fontFamily: string,
  bold: boolean,
  italic: boolean
): number {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return 0;
  
  context.font = `${bold ? 'bold' : 'normal'} ${italic ? 'italic' : 'normal'} ${fontSize}px ${fontFamily}`;
  return context.measureText(text).width;
}

/**
 * Calculates the maximum number of characters that can fit at minimum font size
 */
export function getMaxCharsForMinFont(
  text: string,
  minFontSize: number,
  fontFamily: string,
  bold: boolean,
  italic: boolean,
  badgeWidth?: number  // Optional: use template width if provided
): number {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return 0;

  context.font = `${bold ? 'bold' : 'normal'} ${italic ? 'italic' : 'normal'} ${minFontSize}px ${fontFamily}`;
  const charWidth = context.measureText('W').width;
  const width = badgeWidth || BADGE_CONSTANTS.BADGE_WIDTH;
  return Math.floor(width / charWidth);
}

/**
 * Calculates if text will fit within badge dimensions
 */
export function calculateTextFit(
  text: string,
  fontSize: number,
  fontFamily: string,
  bold: boolean,
  italic: boolean,
  badgeWidth?: number  // Optional: use template width if provided
): boolean {
  const width = measureTextWidth(text, fontSize, fontFamily, bold, italic);
  const maxWidth = badgeWidth || BADGE_CONSTANTS.BADGE_WIDTH;
  return width <= maxWidth;
}

/**
 * Auto-scales font size to fit within badge width
 */
export function autoScaleFontSize(
  text: string,
  maxWidth: number,
  minSize: number,
  maxSize: number,
  fontFamily: string = BADGE_CONSTANTS.DEFAULT_FONT,
  bold: boolean = false,
  italic: boolean = false
): number {
  let fontSize = maxSize;
  while (fontSize > minSize) {
    const width = measureTextWidth(text, fontSize, fontFamily, bold, italic);
    if (width <= maxWidth) break;
    fontSize--;
  }
  return fontSize;
} 