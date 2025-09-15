export type TextAlign = 'left' | 'center' | 'right';

export interface BadgeLine {
  id: string;
  text: string;
  x: number;  // in template px
  y: number;
  fontSize: number;
  color?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
  fontFamily?: string;
}

export interface BadgeImage {
  src: string;
  // background image props:
  widthPx?: number;
  heightPx?: number;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
  // logo props (optional):
  x?: number;
  y?: number;
}

export interface Badge {
  id: string;
  backgroundColor?: string;
  backgroundImage?: BadgeImage;
  logo?: BadgeImage;
  lines: BadgeLine[];
  templateId: string;
}