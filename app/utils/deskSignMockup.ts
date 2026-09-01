/**
 * Photo mockup for acrylic desk signs: the customer's artwork is projected onto
 * the plate face of a product photo so they see white ink on real acrylic
 * instead of a flat swatch. Preview only — print exports keep the vector plate.
 */
import type { Badge } from "~/types/badge";
import type { LoadedTemplate } from "~/utils/templates";
import {
  findDeskSignAcrylicFinish,
  isDeskSignTemplateId,
  type DeskSignAcrylicFinishId,
} from "~/utils/deskSignRender";

export type MockupPoint = { x: number; y: number };

export type MockupQuad = {
  tl: MockupPoint;
  tr: MockupPoint;
  br: MockupPoint;
  bl: MockupPoint;
};

const MOCKUP_CANVAS_WIDTH_PX = 1536;
const MOCKUP_CANVAS_HEIGHT_PX = 1024;

/**
 * Printable front face of the acrylic block in canvas pixels. The three finish
 * photos share one camera setup, so a single quad calibrates all of them.
 */
const ACRYLIC_FACE_QUAD: MockupQuad = {
  tl: { x: 272, y: 406 },
  tr: { x: 1372, y: 368 },
  br: { x: 1372, y: 638 },
  bl: { x: 272, y: 706 },
};

const ACRYLIC_MOCKUP_SRC: Record<DeskSignAcrylicFinishId, string> = {
  clear: "/images/desk-sign/mockup/clear.jpg",
  frosted: "/images/desk-sign/mockup/frosted.jpg",
  black: "/images/desk-sign/mockup/black.jpg",
};

export type ResolvedDeskSignMockup = {
  src: string;
  canvasWidthPx: number;
  canvasHeightPx: number;
  faceQuad: MockupQuad;
};

/** Callers sizing a mockup container need the photo's shape, not the plate's. */
export const DESK_SIGN_MOCKUP_ASPECT =
  MOCKUP_CANVAS_WIDTH_PX / MOCKUP_CANVAS_HEIGHT_PX;

/**
 * Template-id/badge check for UI that decides whether to offer the product-photo
 * view before a `LoadedTemplate` is on hand.
 */
export function hasDeskSignPhotoMockup(
  badge: Pick<Badge, "deskSignMaterial" | "deskSignAcrylicFinish">,
  templateId: string,
): boolean {
  if (!isDeskSignTemplateId(templateId)) return false;
  const isAcrylic = badge.deskSignMaterial
    ? badge.deskSignMaterial === "acrylic"
    : templateId.includes("acrylic");
  if (!isAcrylic) return false;
  return Boolean(findDeskSignAcrylicFinish(badge.deskSignAcrylicFinish));
}

/**
 * SVG has no projective transform, so the flat design rect is painted as
 * vertical slices, each carrying the affine that matches its own span of the
 * plate. Deviation from the true bilinear map shrinks as 1/SLICE_COUNT.
 */
const SLICE_COUNT = 48;

/** Flat-space overlap so antialiased glyph edges leave no hairline seams. */
const SLICE_OVERLAP_PX = 0.75;

export function resolveDeskSignMockup(
  badge: Badge,
  template: LoadedTemplate,
): ResolvedDeskSignMockup | null {
  if (!isDeskSignTemplateId(template.id)) return null;

  const isAcrylic = badge.deskSignMaterial
    ? badge.deskSignMaterial === "acrylic"
    : template.id.includes("acrylic");
  if (!isAcrylic) return null;

  // Before a finish is picked there is nothing to mock up; keep the flat plate.
  const finish = findDeskSignAcrylicFinish(badge.deskSignAcrylicFinish);
  if (!finish) return null;

  return {
    src: ACRYLIC_MOCKUP_SRC[finish.id],
    canvasWidthPx: MOCKUP_CANVAS_WIDTH_PX,
    canvasHeightPx: MOCKUP_CANVAS_HEIGHT_PX,
    faceQuad: ACRYLIC_FACE_QUAD,
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Bilinear position on the quad; (0,0) is top-left, (1,1) bottom-right. */
function quadPointAt(quad: MockupQuad, u: number, v: number): MockupPoint {
  const topX = lerp(quad.tl.x, quad.tr.x, u);
  const topY = lerp(quad.tl.y, quad.tr.y, u);
  const botX = lerp(quad.bl.x, quad.br.x, u);
  const botY = lerp(quad.bl.y, quad.br.y, u);
  return { x: lerp(topX, botX, v), y: lerp(topY, botY, v) };
}

function fmt(n: number): string {
  return Number(n.toFixed(4)).toString();
}

function escHref(src: string): string {
  return src.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

type SliceTransform = { matrix: string; clipX: number; clipWidth: number };

function buildSliceTransforms(
  quad: MockupQuad,
  flatWidthPx: number,
  flatHeightPx: number,
): SliceTransform[] {
  const slices: SliceTransform[] = [];
  for (let i = 0; i < SLICE_COUNT; i++) {
    const u0 = i / SLICE_COUNT;
    const u1 = (i + 1) / SLICE_COUNT;
    const x0 = u0 * flatWidthPx;
    const x1 = u1 * flatWidthPx;

    const p00 = quadPointAt(quad, u0, 0);
    const p10 = quadPointAt(quad, u1, 0);
    const p01 = quadPointAt(quad, u0, 1);

    const dx = x1 - x0;
    const a = (p10.x - p00.x) / dx;
    const b = (p10.y - p00.y) / dx;
    const c = (p01.x - p00.x) / flatHeightPx;
    const d = (p01.y - p00.y) / flatHeightPx;
    const e = p00.x - a * x0;
    const f = p00.y - b * x0;

    slices.push({
      matrix: `matrix(${fmt(a)} ${fmt(b)} ${fmt(c)} ${fmt(d)} ${fmt(e)} ${fmt(f)})`,
      clipX: x0 - SLICE_OVERLAP_PX,
      clipWidth: dx + SLICE_OVERLAP_PX * 2,
    });
  }
  return slices;
}

/**
 * Compose the finished mockup: product photo with `inkMarkup` (laid out in the
 * flat `flatWidthPx × flatHeightPx` template space) projected onto the plate.
 */
export function buildDeskSignMockupSvg(args: {
  mockup: ResolvedDeskSignMockup;
  flatWidthPx: number;
  flatHeightPx: number;
  inkMarkup: string;
  scopeId: string;
  fontDefsXml?: string;
  /** Clip paths that `inkMarkup` references, in flat template space. */
  extraDefsXml?: string;
  /** Data URL when the caller pre-inlined the photo for rasterisation. */
  photoHref?: string;
}): string {
  const {
    mockup,
    flatWidthPx,
    flatHeightPx,
    inkMarkup,
    scopeId,
    fontDefsXml = "",
    extraDefsXml = "",
    photoHref,
  } = args;

  const canvasW = mockup.canvasWidthPx;
  const canvasH = mockup.canvasHeightPx;
  const href = escHref(photoHref || mockup.src);
  const inkId = `${scopeId}-ink`;

  const slices = buildSliceTransforms(
    mockup.faceQuad,
    flatWidthPx,
    flatHeightPx,
  );

  // Generous vertical bounds: text may overshoot the plate while the customer types.
  const clipY = -flatHeightPx;
  const clipHeight = flatHeightPx * 3;

  const clipDefs = slices
    .map(
      (slice, i) =>
        `<clipPath id="${scopeId}-s${i}" clipPathUnits="userSpaceOnUse"><rect x="${fmt(
          slice.clipX,
        )}" y="${fmt(clipY)}" width="${fmt(slice.clipWidth)}" height="${fmt(
          clipHeight,
        )}"/></clipPath>`,
    )
    .join("");

  const sliceLayers = slices
    .map(
      (slice, i) =>
        `<g transform="${slice.matrix}"><g clip-path="url(#${scopeId}-s${i})"><use xlink:href="#${inkId}" href="#${inkId}"/></g></g>`,
    )
    .join("");

  return `
<svg xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     width="100%" height="100%"
     viewBox="0 0 ${canvasW} ${canvasH}"
     preserveAspectRatio="xMidYMid meet">
  <defs>
    ${fontDefsXml}
    ${extraDefsXml}
    <g id="${inkId}">${inkMarkup}</g>
    ${clipDefs}
  </defs>
  <image href="${href}" xlink:href="${href}" x="0" y="0" width="${canvasW}" height="${canvasH}" preserveAspectRatio="none" style="image-rendering:optimizeQuality"/>
  ${sliceLayers}
</svg>`.trim();
}
