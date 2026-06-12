import { DEFAULT_FONT } from './fonts';

export const BADGE_CONSTANTS = {
  // Layout
  MAX_LINES: 4,
  // Standard badge dimensions (3" width at 96 DPI)
  // Height varies: 96px (1×3) or 144px (1.5×3) - use template dimensions for actual badges
  BADGE_WIDTH: 288,  // 3.0" at 96 DPI (standard width for all badges)
  BADGE_HEIGHT: 96,  // 1.0" at 96 DPI (default, but 1.5×3 badges use 144px)
  MIN_FONT_SIZE: 8,
  MAX_FONT_SIZE: 72,
  LINE_HEIGHT_MULTIPLIER: 1.3,

  // Defaults
  DEFAULT_FONT,
  DEFAULT_COLOR: '#000000',
  DEFAULT_BACKGROUND: '#FFFFFF',
  DEFAULT_BACKING: 'magnetic',

  // Alignment options
  ALIGNMENT_OPTIONS: {
    LEFT: 'left',
    CENTER: 'center',
    RIGHT: 'right'
  } as const,

  // Backing options (order: magnet, pin, adhesive; magnet default)
  BACKING_OPTIONS: [
    { value: 'magnetic', label: 'Magnetic (+$1.00)' },
    { value: 'pin', label: 'Pin (+$0.50)' },
    { value: 'adhesive', label: 'Adhesive (included)' }
  ] as const,

  // Per-badge price by backing (matches Shopify variant prices)
  BADGE_PRICES_BY_BACKING: {
    adhesive: 4.99,
    pin: 5.49,
    magnetic: 5.99,
  } as const,

  // Pricing — adhesive base + backing uplift (legacy save/API fields)
  BASE_PRICE: 4.99,
  BACKING_PRICES: {
    magnetic: 1.0,
    pin: 0.5,
    adhesive: 0,
  } as const,

  // Text formatting
  DEFAULT_LINE: {
    id: 'default-line',
    text: 'Line Text',
    xNorm: 0.5,
    yNorm: 0.5,
    sizeNorm: 0.143,  // 10pt equivalent (10/70 = 0.143)
    color: '#000000',
    bold: false,
    italic: false,
    fontFamily: DEFAULT_FONT,
    align: 'center'
  } as const,

  // Initial badge state
  INITIAL_BADGE: {
    id: "initial",
    templateId: 'rect-1x3',
    lines: [
      {
        id: 'line-1',
        text: 'Your Name',
        xNorm: 0.5,
        yNorm: 0.5,  // Use center position - will be recalculated
        sizeNorm: 0.260,  // 25px for line 1 (25/96 = 0.260)
        color: '#000000',
        bold: false,  // No default bold
        italic: false,
        fontFamily: DEFAULT_FONT,
        align: 'center'
      },
      {
        id: 'line-2',
        text: 'Title',
        xNorm: 0.5,
        yNorm: 0.5,  // Use center position - will be recalculated
        sizeNorm: 17 / 96,  // 17px for line 2 (17/96)
        color: '#000000',
        bold: false,
        italic: false,
        fontFamily: DEFAULT_FONT,
        align: 'center'
      }
    ],
    backgroundColor: '#FFFFFF',
    backing: 'magnetic'
  }
} as const;

export type BadgeBackingPriceKey = keyof typeof BADGE_CONSTANTS.BADGE_PRICES_BY_BACKING;

/** Total per-badge price for a backing type (Shopify variant price). */
export function getBadgePriceForBacking(
  backing: string | undefined | null,
): number {
  const prices = BADGE_CONSTANTS.BADGE_PRICES_BY_BACKING;
  if (backing === "magnetic") return prices.magnetic;
  if (backing === "pin") return prices.pin;
  return prices.adhesive;
}

/** Split total into base + backing uplift for APIs that store both fields. */
export function getBadgePriceBreakdownForBacking(
  backing: string | undefined | null,
): { basePrice: number; backingPrice: number; totalPrice: number } {
  const totalPrice = getBadgePriceForBacking(backing);
  const basePrice = BADGE_CONSTANTS.BASE_PRICE;
  return {
    basePrice,
    backingPrice: totalPrice - basePrice,
    totalPrice,
  };
} 