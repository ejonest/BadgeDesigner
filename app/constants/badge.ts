import { DEFAULT_FONT } from './fonts';

export const BADGE_CONSTANTS = {
  // Layout
  MAX_LINES: 4,
  BADGE_WIDTH: 300,
  BADGE_HEIGHT: 100,
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
    text: 'Line Text',
    xNorm: 0.5,
    yNorm: 0.5,
    sizeNorm: 0.15,
    color: '#000000',
    bold: false,
    italic: false,
    underline: false,
    fontFamily: DEFAULT_FONT,
    alignment: 'center'
  } as const,

  // Initial badge state
  INITIAL_BADGE: {
    id: "initial",
    templateId: 'rect-1x3',
    lines: [
      {
        text: 'Your Name',
        xNorm: 0.5,
        yNorm: 0.35,
        sizeNorm: 0.12,
        color: '#000000',
        bold: true,
        italic: false,
        underline: false,
        fontFamily: DEFAULT_FONT,
        alignment: 'center'
      },
      {
        text: 'Title',
        xNorm: 0.5,
        yNorm: 0.65,
        sizeNorm: 0.09,
        color: '#000000',
        bold: false,
        italic: false,
        underline: false,
        fontFamily: DEFAULT_FONT,
        alignment: 'center'
      }
    ],
    backgroundColor: '#FFFFFF',
    backing: 'pin'
  }
} as const; 