import type { Badge } from "../types/badge";

export const BADGE_CONSTANTS = {
  MAX_LINES: 4,
  MIN_FONT_SIZE: 8,
  BADGE_WIDTH: 300,
  BADGE_HEIGHT: 100,
} as const;

export const INITIAL_BADGE: Badge = {
  id: "initial",
  templateId: 'rect-1x3',
  backgroundColor: '#FFFFFF',
  lines: [
    { 
      id: "line1",
      text: 'Your Name', 
      xNorm: 0.5, 
      yNorm: 0.35, 
      sizeNorm: 0.12,
      color: '#000000', 
      bold: true, 
      italic: false, 
      fontFamily: 'Roboto', 
      alignment: 'center' 
    },
    { 
      id: "line2",
      text: 'Title', 
      xNorm: 0.5, 
      yNorm: 0.65, 
      sizeNorm: 0.09,
      color: '#000000', 
      bold: false, 
      italic: false, 
      fontFamily: 'Roboto', 
      alignment: 'center' 
    },
  ],
  backgroundImage: undefined,
  logo: undefined,
};