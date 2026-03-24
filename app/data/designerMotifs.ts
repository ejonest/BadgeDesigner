import { DESIGNER_MOTIF_FRAGMENTS } from "./designerMotifs.generated";

export type DesignerMotifId =
  | "heart"
  | "coffee"
  | "golf"
  | "house"
  | "money"
  | "paws"
  | "recycle";

export type DesignerSizeKey = "2x5" | "2_8x7" | "4x9" | "4_25x11";

const MOTIF_IDS: DesignerMotifId[] = [
  "heart",
  "coffee",
  "golf",
  "house",
  "money",
  "paws",
  "recycle",
];

export function isDesignerMotifId(s: string | undefined): s is DesignerMotifId {
  return !!s && (MOTIF_IDS as string[]).includes(s);
}

export function templateIdToDesignerSizeKey(
  templateId: string,
): DesignerSizeKey | undefined {
  if (templateId === "designer-2x5") return "2x5";
  if (templateId === "designer-2_8x7") return "2_8x7";
  if (templateId === "designer-4x9") return "4x9";
  if (templateId === "designer-4_25x11") return "4_25x11";
  return undefined;
}

/** ViewBoxes from `Designer 4x9.svg` and `Designer 4.25 x 11.svg` (user space for motif paths). */
const DESIGNER_4X9_VIEWBOX = { w: 8995, h: 3495 };
const DESIGNER_XL_VIEWBOX = { w: 11000, h: 4250 };

/**
 * There is no separate Coffee XL source file; extraction fell back to the heart base and produced
 * incorrect data. Map the working 4×9 coffee fragment into XL coordinates by scaling about plate center.
 */
function scaleDesignerMotifFrom4x9ToXl(inner: string): string {
  if (!inner.trim()) return "";
  const { w: w0, h: h0 } = DESIGNER_4X9_VIEWBOX;
  const { w: w1, h: h1 } = DESIGNER_XL_VIEWBOX;
  const sx = w1 / w0;
  const sy = h1 / h0;
  const cx0 = w0 / 2;
  const cy0 = h0 / 2;
  const cx1 = w1 / 2;
  const cy1 = h1 / 2;
  return `<g transform="translate(${cx1},${cy1}) scale(${sx},${sy}) translate(${-cx0},${-cy0})">${inner}</g>`;
}

/** SVG fragment: `<path …/>` or `<g transform="…">…</g>` in layout user space (before loadOne transform). */
export function getDesignerMotifPaths(
  sizeKey: DesignerSizeKey,
  motifId: DesignerMotifId,
): string {
  if (sizeKey === "4_25x11" && motifId === "coffee") {
    const from49 = DESIGNER_MOTIF_FRAGMENTS["4x9"]?.coffee;
    if (typeof from49 === "string" && from49.trim()) {
      return scaleDesignerMotifFrom4x9ToXl(from49);
    }
  }

  const row = DESIGNER_MOTIF_FRAGMENTS[sizeKey];
  if (!row) return "";
  const frag = row[motifId];
  return typeof frag === "string" ? frag : "";
}

/** Border step: motif picker labels (order = display order). */
export const DESIGNER_MOTIF_UI_OPTIONS: { id: DesignerMotifId; label: string }[] =
  [
    { id: "heart", label: "Heart" },
    { id: "coffee", label: "Coffee" },
    { id: "golf", label: "Golf" },
    { id: "house", label: "House" },
    { id: "money", label: "Money" },
    { id: "paws", label: "Paws" },
    { id: "recycle", label: "Recycle" },
  ];
