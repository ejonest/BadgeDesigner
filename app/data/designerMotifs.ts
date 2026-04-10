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

/**
 * Picker previews use **2×5** fragments: `Designer 2x5.svg` still has separate center paths, while
 * 4×9/2.8×7/XL “heart” data is often one giant `Design` path — filtering would remove everything.
 * Coordinates are `0…5000 × 0…2000` (see `Designer 2x5.svg` viewBox).
 */
const DESIGNER_MOTIF_PREVIEW_SOURCE_KEY: DesignerSizeKey = "2x5";

/** Default picker `viewBox` in 2×5 user space (tight crop on the center ornament column). */
export const DESIGNER_MOTIF_PREVIEW_VIEWBOX = "2180 22 640 620" as const;

/** Center of {@link DESIGNER_MOTIF_PREVIEW_VIEWBOX} — used for preview-only flips. */
const PREVIEW_VB_CX = 2180 + 640 / 2;
const PREVIEW_VB_CY = 22 + 620 / 2;

/** Scroll / quarter-frame paths from Corel extraction (~1.9–2.05k chars); merged trim paths are huge. */
function isDesignerMotifScrollPathD(d: string): boolean {
  const L = d.length;
  return (L >= 1780 && L <= 2120) || L > 5500;
}

function firstMoveToY(d: string): number | null {
  const m = d.match(/^\s*M\s*([-0-9.eE]+)\s*[,\s]\s*([-0-9.eE]+)/i);
  return m ? Number(m[2]) : null;
}

/**
 * Keeps center-icon paths only (drops scroll flourishes). Heart: one top heart. Paws: top paw
 * cluster only. Other themes: all non-scroll paths (e.g. recycle arrows, golf club geometry).
 */
function motifPreviewPathMarkupOnly(
  markup: string,
  motifId: DesignerMotifId,
): string {
  const pathTagRe = /<path(\s[^>]*)>/gi;
  const pathTags: { attrs: string; d: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = pathTagRe.exec(markup)) !== null) {
    const attrs = m[1];
    const dm = attrs.match(/\bd="([^"]*)"/i);
    const d = dm?.[1] ?? "";
    pathTags.push({ attrs, d });
  }
  let kept = pathTags.filter(
    (p) => p.d.trim() && !isDesignerMotifScrollPathD(p.d),
  );
  if (motifId === "heart") {
    const tiny = kept.filter((p) => p.d.length < 350);
    if (tiny.length >= 2) {
      tiny.sort(
        (a, b) =>
          (firstMoveToY(a.d) ?? 0) - (firstMoveToY(b.d) ?? 0),
      );
      const topY = firstMoveToY(tiny[0].d);
      kept = kept.filter(
        (p) =>
          p.d.length >= 350 ||
          (topY != null && firstMoveToY(p.d) === topY),
      );
    }
  } else if (motifId === "paws") {
    kept = kept.filter((p) => {
      const y = firstMoveToY(p.d);
      return y != null && y < 600;
    });
  } else if (motifId === "recycle") {
    // Inner coordinates: top symbol ~y 4800–4950; mirrored bottom ~y 6050–6250 (before translate).
    kept = kept.filter((p) => {
      const y = firstMoveToY(p.d);
      return y != null && y < 5500;
    });
  }
  return kept.map((p) => `<path${p.attrs}>`).join("");
}

function motifPreviewInnerWithoutScrollwork(
  fragment: string,
  motifId: DesignerMotifId,
): string {
  const trimmed = fragment.trim();
  const gMatch = trimmed.match(
    /^<g\s+transform="([^"]*)">\s*([\s\S]*?)\s*<\/g>\s*$/i,
  );
  if (gMatch) {
    const inner = motifPreviewPathMarkupOnly(gMatch[2], motifId);
    if (!inner.trim()) return "";
    return `<g transform="${gMatch[1]}">${inner}</g>`;
  }
  return motifPreviewPathMarkupOnly(trimmed, motifId);
}

function applyMotifPathPreviewFills(fragment: string): string {
  if (!fragment.trim()) return "";
  return fragment.replace(
    /<path\s+/g,
    `<path fill="currentColor" fill-rule="evenodd" stroke="none" `,
  );
}

/** Picker-only corrections vs plate extraction (orientation / mirroring). */
function wrapMotifPreviewGraphic(motifId: DesignerMotifId, inner: string): string {
  if (motifId === "heart") {
    return `<g transform="translate(${PREVIEW_VB_CX},${PREVIEW_VB_CY}) scale(1,-1) translate(${-PREVIEW_VB_CX},${-PREVIEW_VB_CY})">${inner}</g>`;
  }
  if (motifId === "money") {
    return `<g transform="translate(${PREVIEW_VB_CX},${PREVIEW_VB_CY}) scale(-1,1) translate(${-PREVIEW_VB_CX},${-PREVIEW_VB_CY})">${inner}</g>`;
  }
  return inner;
}

/** Tight `viewBox` in **2×5** user space (after child `transform`s). Avoids `clip-path: url(#id)` in HTML — those refs often break when SVG is injected via `innerHTML`. */
function designerMotifPreviewViewBox(motifId: DesignerMotifId): string {
  if (motifId === "recycle") {
    // Top symbol only — tighter frame than when both mirrors were visible.
    return "2240 200 520 320";
  }
  return DESIGNER_MOTIF_PREVIEW_VIEWBOX;
}

/** Inline SVG for motif picker: center icon only (scroll paths dropped + tight viewBox crop). */
export function designerMotifPreviewSvgMarkup(
  motifId: DesignerMotifId,
): string {
  let raw = getDesignerMotifPaths(DESIGNER_MOTIF_PREVIEW_SOURCE_KEY, motifId);
  if (!raw.trim()) {
    raw = getDesignerMotifPaths("4x9", motifId);
  }
  const stripped = motifPreviewInnerWithoutScrollwork(raw, motifId);
  const filled = applyMotifPathPreviewFills(stripped);
  if (!filled.trim()) return "";
  const inner = wrapMotifPreviewGraphic(motifId, filled);
  const vb = designerMotifPreviewViewBox(motifId);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">${inner}</svg>`;
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
