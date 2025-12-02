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
  DEFAULT_BACKING: 'pin',

  // Alignment options
  ALIGNMENT_OPTIONS: {
    LEFT: 'left',
    CENTER: 'center',
    RIGHT: 'right'
  } as const,

  // Backing options
  BACKING_OPTIONS: [
    { value: 'pin', label: 'Pin (Included)' },
    { value: 'magnetic', label: 'Magnetic (+$2.00)' },
    { value: 'adhesive', label: 'Adhesive (+$1.00)' }
  ] as const,

  // Pricing
  BASE_PRICE: 9.99,
  BACKING_PRICES: {
    magnetic: 2.00,
    adhesive: 1.00,
    pin: 0.00
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
        sizeNorm: 0.20,  // 14pt equivalent (14/70 = 0.20)
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
        sizeNorm: 0.143,  // 10pt equivalent (10/70 = 0.143)
        color: '#000000',
        bold: false,
        italic: false,
        fontFamily: DEFAULT_FONT,
        align: 'center'
      }
    ],
    backgroundColor: '#FFFFFF',
    backing: 'pin'
  }
} as const; 