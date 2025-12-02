export interface BadgeLine {
  id: string;
  text: string;
  // Normalized coordinates (0..1) relative to designBox
  xNorm: number;  // 0..1, relative to designBox width
  yNorm: number;  // 0..1, relative to designBox height
  sizeNorm: number; // 0..1, relative to designBox.height
  // Legacy absolute coordinates (for backward compatibility)
  x?: number;  // in template px
  y?: number;
  fontSize?: number;
  color?: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
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
  id?: string;
  templateId?: string;
  lines: BadgeLine[];
  backgroundColor: string;
  backing: 'pin' | 'magnetic' | 'adhesive';
  backgroundImage?: BadgeImage;
  logo?: BadgeImage;
}

export interface BadgeEditorPanelProps {
  badge: Badge;
  onLineChange: (index: number, changes: Partial<BadgeLine>) => void;
  onAlignmentChange: (index: number, alignment: string) => void;
  onBackgroundColorChange: (color: string) => void;
  onRemoveLine: (index: number) => void;
  showRemove: boolean;
  maxLines: number;
  addLineButton: React.ReactNode;
  resetButton: React.ReactNode;
  multiBadgeButton: React.ReactNode;
  editable?: boolean;
}

export interface BadgeDesignerProps {
  productId?: string;
  onBadgeChange?: (badge: Badge) => void;
  initialBadge?: Badge;
} 