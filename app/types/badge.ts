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

/** Detached plaque wood photo opening: metallic frame overlay (PNG asset). */
export type PlaqueDetachedPhotoFrameFinish = "gold" | "silver";

/** Sign Designer user logo: edge band with image centered in the band. */
export type SignLogoPlacement = "left" | "right" | "top" | "bottom";

/** Captured when a sign user logo is first applied (updated when the image is replaced). */
export type SignLogoLayoutSnapshot = {
  /**
   * Minimum `min(w/W,h/H)` of the rendered logo vs the slot baseline box — layout never scales
   * the logo smaller than this ratio unless the snapshot is cleared (logo removed/replaced).
   */
  minLogoRatioVsBaseline: number;
  /** Rounded template-space px per line index when the snapshot was taken. */
  textPxByLine: number[];
  /**
   * Max rounded px per line while this logo remains — set after the initial joint fit with the
   * minimum logo display rule. Older payloads used {@link textPxByLine} alone; clamp falls back to it.
   */
  textPxCeilingByLine?: number[];
};

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
  /** Sign Designer: which edge band the logo sits in; default left when src is set. */
  placement?: SignLogoPlacement;
  /** Natural pixel size from the uploaded file (used for aspect-preserving fit in the slot). */
  intrinsicWidth?: number;
  intrinsicHeight?: number;
}

export interface Badge {
  id?: string;
  templateId?: string;
  /** Sign Designer only: center/top scroll motif when using base `designer-*` templates. */
  designerMotif?:
    | "heart"
    | "coffee"
    | "golf"
    | "house"
    | "money"
    | "paws"
    | "recycle";
  lines: BadgeLine[];
  backgroundColor: string;
  /** Sign designer only: color for trim and decorative overlay (default #FFFFFF when template has overlay). */
  borderColor?: string;
  /**
   * Sign only: when true, render trim overlay (and Designer border + motif). When false, plate only.
   * Kept in sync with `signBorderOptionId` when that is set; used for legacy payloads.
   */
  signBorderEnabled?: boolean;
  /** Sign only: trim art variant when a framed option is selected (`default` until more styles ship). */
  signBorderStyleId?: string;
  /**
   * Sign only: explicit border step choice. `undefined` = user has not chosen yet (step incomplete).
   * `"none"` = plate only; any other id = framed trim (matches `signBorderStyleId` for v1).
   */
  signBorderOptionId?: string;
  /**
   * Plaque attached plate only: award layout preset (static captions, divider, optional inner border).
   * Omitted on detached layouts and legacy saves → generic line layout.
   */
  plaqueFormatId?: string;
  /**
   * Plaque detached wood photo slot only: metallic frame stroke around the photo opening.
   * Omitted on legacy payloads → render as gold (matches default brushed-gold plate previews).
   */
  plaqueDetachedPhotoFrameFinish?: PlaqueDetachedPhotoFrameFinish;
  backing: 'pin' | 'magnetic' | 'adhesive';
  backgroundImage?: BadgeImage;
  logo?: BadgeImage;
  /**
   * Sign only: bounds from the moment a user logo was committed — used so larger text can reclaim
   * space by shrinking the image down to (at minimum) the captured ratio vs the slot baseline.
   */
  signLogoLayoutSnapshot?: SignLogoLayoutSnapshot;
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

export interface UndoAction {
  type:
    | "line-property"
    | "background-color"
    | "template"
    | "apply-all-formatting"
    | "apply-line-formatting"
    | "apply-background-color-to-all"
    | "apply-backing-to-all"
    | "apply-border-to-all"
    | "reset-badge"
    | "reset-all-badges"
    | "reset-line-formatting";
  previousBadge: Badge; // Full badge state before change
  previousMultipleBadges?: Badge[]; // For "apply all" operations
  previousUniversalTemplateId?: string; // For template changes, track the previous universal template ID
  badgeIndex: number;
  lineIndex?: number; // For line-specific changes
  property?: string; // Which property changed (color, sizeNorm, fontFamily, etc.)
} 