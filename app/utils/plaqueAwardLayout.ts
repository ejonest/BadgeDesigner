import type { BadgeLine } from "~/types/badge";
import type {
  PlaqueAwardFormatDefinition,
  PlaqueAwardSlot,
  PlaqueDividerStyle,
  PlaquePlateBorder,
} from "~/constants/plaqueFormats";
import { plaqueAwardLayoutEngine } from "~/constants/plaqueFormats";
import { PLAQUE_MUSIC_DIVIDER_MASK_DATA_URL } from "~/constants/plaqueMusicDividerMaskDataUrl";
import { PLAQUE_TAPER_GEM_DIVIDER_MASK_DATA_URL } from "~/constants/plaqueTaperGemDividerMaskDataUrl";
import { PLAQUE_VICTORIAN_BORDER_MASK_DATA_URL } from "~/constants/plaqueVictorianBorderMaskDataUrl";
import type { ResolvedSignTextLayout } from "~/utils/signTextLayout";
import { SIGN_TEXT_MIN_FONT_PX } from "~/utils/signTextLayout";

/** Classic / formal-for fixed layout: “presented to” baseline (fraction of plate height from top). */
export const PLAQUE_CLASSIC_Y_PRESENTED_TO_FRAC = 0.455;
/** Recipient name baseline — tuned with classic logo placement (band-sized emblem, vertically centered). */
export const PLAQUE_CLASSIC_Y_NAME_FRAC = 0.535;

export function plaqueClassicInnerBorderInsetPx(
  plateW: number,
  plateH: number,
): number {
  return Math.max(10, Math.min(plateW, plateH) * 0.046);
}

/** Gap between outer and inner strokes for {@link PlaquePlateBorder} `"double"`. */
export function plaqueDoubleBorderInnerGapPx(
  plateW: number,
  plateH: number,
): number {
  return Math.max(5, Math.min(12, Math.min(plateW, plateH) * 0.014));
}

/** Top of “safe” graphic area: clear inner frame(s); small inset when none. */
export function plaqueAwardLogoTopOffsetPx(
  trimBox: { width: number; height: number },
  border: PlaquePlateBorder,
): number {
  const { width: W, height: H } = trimBox;
  if (border === "none") {
    return Math.max(6, H * 0.012);
  }
  const outer = plaqueClassicInnerBorderInsetPx(W, H);
  if (border === "double") {
    return outer + plaqueDoubleBorderInnerGapPx(W, H) + 2;
  }
  if (border === "victorian") {
    return outer + Math.max(10, Math.min(W, H) * 0.028);
  }
  return outer;
}

/** Horizontal inset so copy stays inside the inner border / double inner line / plate margins. */
function plaqueAwardClassicTextInsetPx(
  db: { width: number; height: number },
  border: PlaquePlateBorder,
): number {
  const { width: W, height: H } = db;
  if (border === "none") {
    return Math.max(10, Math.min(W, H) * 0.042);
  }
  const outer = plaqueClassicInnerBorderInsetPx(W, H);
  if (border === "double") {
    return outer + plaqueDoubleBorderInnerGapPx(W, H) + 4;
  }
  if (border === "victorian") {
    return outer + Math.max(12, Math.min(W, H) * 0.036);
  }
  return outer;
}

function shrinkFontToFitMaxWidth(
  text: string,
  fontFamily: string,
  fontWeight: string,
  fontStyle: string,
  maxWidth: number,
  startPx: number,
  minPx: number,
): number {
  const floor = Math.max(SIGN_TEXT_MIN_FONT_PX, Math.floor(minPx));
  let fs = Math.floor(startPx);
  if (!Number.isFinite(fs) || fs < floor) return floor;
  const t = text || " ";
  while (fs > floor) {
    const { width } = measureTextPx(t, fontFamily, fs, fontWeight, fontStyle);
    if (width <= maxWidth) break;
    fs -= 1;
  }
  return Math.max(floor, fs);
}

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function tryNormalizeHex(input: string | undefined | null): string | null {
  let s = (input ?? "").trim();
  if (!s) return null;
  if (s[0] !== "#") s = `#${s}`;
  const m = s.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = `${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return `#${h.toUpperCase()}`;
}

function relativeLuminance(hex: string): number {
  const n = tryNormalizeHex(hex);
  if (!n) return 1;
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Dark or light ink on brushed plaque plate from plate fill hex. */
export function plaqueAwardInkHex(backgroundHex: string | undefined): string {
  const n = tryNormalizeHex(backgroundHex) ?? "#FFFFFF";
  return relativeLuminance(n) > 0.45 ? "#1a1a1a" : "#f2f2f2";
}

/** Intrinsic pixel size of {@link PLAQUE_MUSIC_DIVIDER_MASK_DATA_URL} art. */
const PLAQUE_MUSIC_DIVIDER_MASK_W = 248;
const PLAQUE_MUSIC_DIVIDER_MASK_H = 58;

const PLAQUE_TAPER_GEM_DIVIDER_MASK_W = 602;
const PLAQUE_TAPER_GEM_DIVIDER_MASK_H = 142;

function plaqueDividerFilterIdSuffix(raw: string | undefined): string {
  let s = (raw ?? "div").replace(/[^a-zA-Z0-9_]/g, "");
  if (!s.length) s = "div";
  if (/^[0-9]/.test(s)) s = `_${s}`;
  return s.slice(0, 48);
}

function measureTextPx(
  text: string,
  fontFamily: string,
  fontSizePx: number,
  fontWeight: string,
  fontStyle: string,
): { width: number; height: number } {
  if (typeof document === "undefined") {
    const t = text || " ";
    const bold =
      fontWeight === "bold" ||
      fontWeight === "700" ||
      fontWeight === "600" ||
      Number(fontWeight) >= 600;
    const wMul =
      fontStyle === "italic" ? (bold ? 0.54 : 0.5) : bold ? 0.62 : 0.55;
    return {
      width: Math.max(1, t.length * fontSizePx * wMul),
      height: fontSizePx * 1.15,
    };
  }
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const t = text || " ";
    const bold =
      fontWeight === "bold" ||
      fontWeight === "700" ||
      Number(fontWeight) >= 600;
    const wMul = bold ? 0.62 : 0.55;
    return {
      width: Math.max(1, t.length * fontSizePx * wMul),
      height: fontSizePx * 1.15,
    };
  }
  ctx.font = `${fontStyle} ${fontWeight} ${fontSizePx}px ${fontFamily}`;
  const metrics = ctx.measureText(text || " ");
  const width = Math.max(1, metrics.width);
  const ascent =
    (metrics as TextMetrics & { actualBoundingBoxAscent?: number })
      .actualBoundingBoxAscent ?? fontSizePx * 0.8;
  const descent =
    (metrics as TextMetrics & { actualBoundingBoxDescent?: number })
      .actualBoundingBoxDescent ?? fontSizePx * 0.22;
  return { width, height: Math.max(1, ascent + descent) };
}

function dividerSvg(
  style: PlaqueDividerStyle,
  cx: number,
  cy: number,
  totalW: number,
  stroke: string,
  dividerArtIdSuffix?: string,
): string {
  const w = Math.min(totalW * 0.62, 220);
  const x0 = cx - w / 2;
  const y = cy;
  if (style === "diamond") {
    const half = 7;
    return `<g stroke="${stroke}" stroke-width="1.05" fill="${stroke}" stroke-linecap="round">
      <line x1="${x0}" y1="${y}" x2="${cx - half - 4}" y2="${y}" />
      <polygon points="${cx},${y - half} ${cx + half},${y} ${cx},${y + half} ${
      cx - half
    },${y}" stroke="none" />
      <line x1="${cx + half + 4}" y1="${y}" x2="${x0 + w}" y2="${y}" />
    </g>`;
  }
  if (style === "dots") {
    const dot = 4;
    const gap = w * 0.18;
    const lx = cx - w / 2;
    const rx = cx + w / 2;
    return `<g stroke="${stroke}" stroke-width="1" fill="${stroke}">
      <line x1="${lx}" y1="${y}" x2="${
      cx - gap
    }" y2="${y}" stroke-linecap="round" />
      <circle cx="${cx - gap * 0.35}" cy="${y}" r="${
      dot * 0.35
    }" stroke="none" />
      <circle cx="${cx}" cy="${y}" r="${dot * 0.55}" stroke="none" />
      <circle cx="${cx + gap * 0.35}" cy="${y}" r="${
      dot * 0.35
    }" stroke="none" />
      <line x1="${
        cx + gap
      }" y1="${y}" x2="${rx}" y2="${y}" stroke-linecap="round" />
    </g>`;
  }
  if (style === "rule") {
    const halfBar = w * 0.11;
    const gap = Math.max(4, w * 0.026);
    const st = esc(stroke);
    return `<g stroke="${st}" stroke-linecap="round">
      <line x1="${x0}" y1="${y}" x2="${
      cx - halfBar - gap
    }" y2="${y}" stroke-width="1" />
      <line x1="${cx - halfBar}" y1="${y}" x2="${
      cx + halfBar
    }" y2="${y}" stroke-width="2.35" />
      <line x1="${cx + halfBar + gap}" y1="${y}" x2="${
      x0 + w
    }" y2="${y}" stroke-width="1" />
    </g>`;
  }
  if (style === "star") {
    const arm = Math.min(w * 0.085, 18);
    const wing = w * 0.14;
    const st = esc(stroke);
    return `<g stroke="${st}" stroke-width="1.05" stroke-linecap="round">
      <line x1="${x0}" y1="${y}" x2="${cx - arm - wing}" y2="${y}" />
      <line x1="${cx}" y1="${y - arm}" x2="${cx}" y2="${y + arm}" />
      <line x1="${cx - arm}" y1="${y}" x2="${cx + arm}" y2="${y}" />
      <line x1="${cx + arm + wing}" y1="${y}" x2="${x0 + w}" y2="${y}" />
    </g>`;
  }
  if (style === "dash") {
    const d = Math.min(w * 0.095, 26);
    const g = Math.max(5, w * 0.032);
    const total = 3 * d + 2 * g;
    const startX = cx - total / 2;
    const st = esc(stroke);
    const a = startX;
    const b = startX + d;
    const c = b + g;
    const d2 = c + d;
    const e = d2 + g;
    const f = e + d;
    return `<g stroke="${st}" stroke-linecap="round">
      <line x1="${x0}" y1="${y}" x2="${Math.max(
      x0,
      a - 2,
    )}" y2="${y}" stroke-width="0.9" stroke-opacity="0.6" />
      <line x1="${a}" y1="${y}" x2="${b}" y2="${y}" stroke-width="1.15" />
      <line x1="${c}" y1="${y}" x2="${d2}" y2="${y}" stroke-width="1.15" />
      <line x1="${e}" y1="${y}" x2="${f}" y2="${y}" stroke-width="1.15" />
      <line x1="${Math.min(x0 + w, f + 2)}" y1="${y}" x2="${
      x0 + w
    }" y2="${y}" stroke-width="0.9" stroke-opacity="0.6" />
    </g>`;
  }
  if (style === "whisker") {
    const maxSpan = Math.min(totalW * 0.44, 272);
    let rL = Math.max(3.6, Math.min(6.8, totalW * 0.024));
    let gap = rL * 0.5;
    let rM = rL * 0.52;
    let rS = rL * 0.3;
    const spindleLen = 3.45 * (2 * rL);
    const halfCore = rL + gap + 2 * rM + gap + 2 * rS + gap + spindleLen;
    const scale = halfCore * 2 > maxSpan ? maxSpan / (2 * halfCore) : 1;
    if (scale < 1) {
      rL *= scale;
      gap *= scale;
      rM *= scale;
      rS *= scale;
    }
    const sl = 3.45 * (2 * rL);
    const st = esc(stroke);
    const hSp = Math.max(rM * 1.02, rS * 1.65);

    const medCxR = cx + rL + gap + rM;
    const smCxR = cx + rL + gap + 2 * rM + gap + rS;
    const xRi = smCxR + rS + gap;
    const xRo = xRi + sl;
    const xmR = (xRi + xRo) / 2;

    const medCxL = cx - rL - gap - rM;
    const smCxL = cx - rL - gap - 2 * rM - gap - rS;
    const xLi = smCxL - rS - gap;
    const xLo = xLi - sl;
    const xmL = (xLo + xLi) / 2;

    return `<g fill="${st}" stroke="none">
      <circle cx="${cx}" cy="${y}" r="${rL}" />
      <circle cx="${medCxL}" cy="${y}" r="${rM}" />
      <circle cx="${medCxR}" cy="${y}" r="${rM}" />
      <circle cx="${smCxL}" cy="${y}" r="${rS}" />
      <circle cx="${smCxR}" cy="${y}" r="${rS}" />
      <polygon points="${xLo},${y} ${xmL},${y - hSp} ${xLi},${y} ${xmL},${
      y + hSp
    }" />
      <polygon points="${xRi},${y} ${xmR},${y - hSp} ${xRo},${y} ${xmR},${
      y + hSp
    }" />
    </g>`;
  }
  if (style === "music") {
    const fid = `musicDivTint${plaqueDividerFilterIdSuffix(
      dividerArtIdSuffix,
    )}`;
    const drawW = Math.min(totalW * 0.38, 232);
    const drawH =
      drawW * (PLAQUE_MUSIC_DIVIDER_MASK_H / PLAQUE_MUSIC_DIVIDER_MASK_W);
    const x = cx - drawW / 2;
    const y = cy - drawH / 2;
    const ink = esc(stroke);
    const href = PLAQUE_MUSIC_DIVIDER_MASK_DATA_URL;
    return `<defs>
      <filter id="${fid}" x="${x}" y="${y}" width="${drawW}" height="${drawH}"
        filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feFlood flood-color="${ink}" flood-opacity="1" result="ink"/>
        <feComposite in="ink" in2="SourceGraphic" operator="in"/>
      </filter>
    </defs>
    <image href="${href}" xlink:href="${href}" x="${x}" y="${y}" width="${drawW}" height="${drawH}"
      preserveAspectRatio="xMidYMid meet" filter="url(#${fid})"/>`;
  }
  if (style === "taperGem") {
    const fid = `taperGemDivTint${plaqueDividerFilterIdSuffix(
      dividerArtIdSuffix,
    )}`;
    const drawW = Math.min(totalW * 0.48, 318);
    const drawH =
      drawW *
      (PLAQUE_TAPER_GEM_DIVIDER_MASK_H / PLAQUE_TAPER_GEM_DIVIDER_MASK_W);
    const xLeft = cx - drawW / 2;
    const yTop = y - drawH / 2;
    const ink = esc(stroke);
    const href = PLAQUE_TAPER_GEM_DIVIDER_MASK_DATA_URL;
    return `<defs>
      <filter id="${fid}" x="${xLeft}" y="${yTop}" width="${drawW}" height="${drawH}"
        filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feFlood flood-color="${ink}" flood-opacity="1" result="ink"/>
        <feComposite in="ink" in2="SourceGraphic" operator="in"/>
      </filter>
    </defs>
    <image href="${href}" xlink:href="${href}" x="${xLeft}" y="${yTop}" width="${drawW}" height="${drawH}"
      preserveAspectRatio="xMidYMid meet" filter="url(#${fid})"/>`;
  }
  // scroll: four mirrored quadratics about cx
  const s = w * 0.14;
  const L = s * 1.5;
  const k = s * 0.6;
  const m = s * 0.88;
  const v = s * 0.15;
  return `<g stroke="${esc(
    stroke,
  )}" stroke-width="1" fill="none" stroke-linecap="round">
    <line x1="${x0}" y1="${y}" x2="${cx - L}" y2="${y}" />
    <path d="M ${cx - L} ${y}
             Q ${cx - k} ${y - m} ${cx} ${y - v}
             Q ${cx + k} ${y - m} ${cx + L} ${y}
             Q ${cx + k} ${y + m} ${cx} ${y + v}
             Q ${cx - k} ${y + m} ${cx - L} ${y}
             Z" />
    <line x1="${cx + L}" y1="${y}" x2="${x0 + w}" y2="${y}" />
  </g>`;
}

export type PlaqueAwardLayoutRow =
  | {
      kind: "text";
      text: string;
      x: number;
      y: number;
      fontSize: number;
      anchor: "middle";
      familyEscaped: string;
      fontWeight: string;
      fontStyle: string;
      fill: string;
      underline: boolean;
    }
  | { kind: "divider"; cy: number; markup: string };

type PlannedText = {
  t: "text";
  text: string;
  sizeMul: number;
  bold: boolean;
  italic: boolean;
  /** `undefined` = static caption — use plate contrast color */
  userLineIndex?: number;
};

type PlannedDiv = { t: "div"; style: PlaqueDividerStyle };

type Planned = PlannedText | PlannedDiv;

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function plannedTextForUserIndex(
  planned: Planned[],
  userIndex: number,
): PlannedText | undefined {
  return planned.find(
    (p) => p.t === "text" && p.userLineIndex === userIndex,
  ) as PlannedText | undefined;
}

function plaqueAwardClassicRows(params: {
  planned: Planned[];
  userLines: BadgeLine[];
  fullDesignBox: { x: number; y: number; width: number; height: number };
  defaultTextColor: string;
  familyEscaped: string;
  plateBorder: PlaquePlateBorder;
  /** Unescaped stack for canvas measurement (matches SVG `font-family`). */
  fontFamilyRaw: string;
  dividerArtIdSuffix?: string;
}): PlaqueAwardLayoutRow[] {
  const {
    planned,
    userLines,
    fullDesignBox: db,
    defaultTextColor,
    familyEscaped,
    plateBorder,
    fontFamilyRaw: fontFamilyRawParam,
    dividerArtIdSuffix,
  } = params;
  const fontFamilyRaw =
    fontFamilyRawParam.trim() || "Georgia, 'Times New Roman', serif";
  const H = Math.max(1, db.height);
  const cx = db.x + db.width / 2;

  // Reference-style fixed rhythm on the full inner plate, not the “text band”.
  // Tuned to match classic plaque photos: big emblem, “presented to” tucked under, large name,
  // generous body spacing, divider centered between the two body lines, date near bottom.
  const yCaption = db.y + H * PLAQUE_CLASSIC_Y_PRESENTED_TO_FRAC;
  const yName = db.y + H * PLAQUE_CLASSIC_Y_NAME_FRAC;
  const yLine1 = db.y + H * 0.635;
  const yDivider = db.y + H * 0.72;
  const yDate = db.y + H * 0.885;

  const fsCaption = clamp(Math.round(H * 0.04), SIGN_TEXT_MIN_FONT_PX, 60);
  const fsName = clamp(Math.round(H * 0.082), SIGN_TEXT_MIN_FONT_PX, 120);
  const fsBody = clamp(Math.round(H * 0.056), SIGN_TEXT_MIN_FONT_PX, 88);
  const fsDate = clamp(Math.round(H * 0.046), SIGN_TEXT_MIN_FONT_PX, 72);

  const textInset = plaqueAwardClassicTextInsetPx(db, plateBorder);
  const maxNameWidth = Math.max(40, db.width - 2 * textInset - 8);

  const cap = planned.find(
    (p) => p.t === "text" && p.userLineIndex === undefined && p.italic,
  ) as PlannedText | undefined;
  const name = plannedTextForUserIndex(planned, 0);
  const l1 = plannedTextForUserIndex(planned, 1);
  const l2 = plannedTextForUserIndex(planned, 2);
  const date = plannedTextForUserIndex(planned, 3);
  const div = planned.find((p) => p.t === "div") as PlannedDiv | undefined;
  /** With no divider row, nudge the second body line into the band classic reserves for divider art. */
  const yLine2 = db.y + H * (div ? 0.79 : 0.765);

  const rows: PlaqueAwardLayoutRow[] = [];
  if (cap?.text) {
    rows.push({
      kind: "text",
      text: cap.text,
      x: cx,
      y: yCaption,
      fontSize: fsCaption,
      anchor: "middle",
      familyEscaped,
      fontWeight: "normal",
      fontStyle: "italic",
      fill: defaultTextColor,
      underline: false,
    });
  }
  if (name?.text) {
    const fsNameFitted = shrinkFontToFitMaxWidth(
      name.text,
      fontFamilyRaw,
      "bold",
      "normal",
      maxNameWidth,
      fsName,
      SIGN_TEXT_MIN_FONT_PX,
    );
    rows.push({
      kind: "text",
      text: name.text,
      x: cx,
      y: yName,
      fontSize: fsNameFitted,
      anchor: "middle",
      familyEscaped,
      fontWeight: "bold",
      fontStyle: "normal",
      fill: userLines[0]?.color?.trim() || defaultTextColor,
      underline: Boolean(userLines[0]?.underline),
    });
  }
  if (l1?.text) {
    rows.push({
      kind: "text",
      text: l1.text,
      x: cx,
      y: yLine1,
      fontSize: fsBody,
      anchor: "middle",
      familyEscaped,
      fontWeight: "normal",
      fontStyle: "normal",
      fill: userLines[1]?.color?.trim() || defaultTextColor,
      underline: Boolean(userLines[1]?.underline),
    });
  }
  if (div) {
    rows.push({
      kind: "divider",
      cy: yDivider,
      markup: dividerSvg(
        div.style,
        cx,
        yDivider,
        db.width,
        defaultTextColor,
        dividerArtIdSuffix,
      ),
    });
  }
  if (l2?.text) {
    rows.push({
      kind: "text",
      text: l2.text,
      x: cx,
      y: yLine2,
      fontSize: fsBody,
      anchor: "middle",
      familyEscaped,
      fontWeight: "normal",
      fontStyle: "normal",
      fill: userLines[2]?.color?.trim() || defaultTextColor,
      underline: Boolean(userLines[2]?.underline),
    });
  }
  if (date?.text) {
    rows.push({
      kind: "text",
      text: date.text,
      x: cx,
      y: yDate,
      fontSize: fsDate,
      anchor: "middle",
      familyEscaped,
      fontWeight: "normal",
      fontStyle: "normal",
      fill: userLines[3]?.color?.trim() || defaultTextColor,
      underline: Boolean(userLines[3]?.underline),
    });
  }
  return rows;
}

/**
 * Reference-style rhythm: tight after small italics (“presented to”, “For”), medium between
 * body lines, extra air around the divider (classic award plaques).
 */
function plaqueAwardGapAfterRow(
  rowIndex: number,
  planned: Planned[],
  baseBodyPx: number,
): number {
  const tight = Math.max(3, baseBodyPx * 0.052);
  const medium = Math.max(9, baseBodyPx * 0.128);
  const aroundDivider = Math.max(14, baseBodyPx * 0.195);

  const cur = planned[rowIndex];
  const next = planned[rowIndex + 1];
  if (!next) return 0;

  if (next.t === "div" || cur.t === "div") {
    return aroundDivider;
  }

  if (cur.t === "text") {
    const smallCaption = cur.italic && cur.sizeMul <= 0.52;
    if (smallCaption) return tight;
  }

  return medium;
}

export type LayoutPlaqueAwardFormatOptions = {
  /** Stable id fragment for SVG defs (e.g. raster divider tint filters). */
  readonly dividerArtIdSuffix?: string;
};

/**
 * Vertical stack for attached plaque award formats inside {@link ResolvedSignTextLayout.contentRect}.
 */
export function layoutPlaqueAwardFormat(
  format: PlaqueAwardFormatDefinition,
  userLines: BadgeLine[],
  layout: ResolvedSignTextLayout,
  baseBodyPx: number,
  defaultTextColor: string,
  fullDesignBox: { x: number; y: number; width: number; height: number },
  options?: LayoutPlaqueAwardFormatOptions,
): PlaqueAwardLayoutRow[] {
  const dividerArtIdSuffix = options?.dividerArtIdSuffix;
  const cr = layout.contentRect;
  const fontFamily =
    userLines[0]?.fontFamily?.trim() || "Georgia, 'Times New Roman', serif";
  const familyEscaped = esc(fontFamily.replace(/"/g, "'"));

  const planned: Planned[] = [];
  for (const slot of format.slots) {
    appendSlot(slot, userLines, planned);
  }

  // For the classic award presets, use a purpose-built layout on the full plate.
  // The sign-style layout engine (and its centering/fit constraints) makes plaques look “floaty”.
  if (plaqueAwardLayoutEngine(format) === "classic-fixed") {
    return plaqueAwardClassicRows({
      planned,
      userLines,
      fullDesignBox,
      defaultTextColor,
      familyEscaped,
      plateBorder: format.border,
      fontFamilyRaw: fontFamily,
      dividerArtIdSuffix,
    });
  }

  /** Vertical slice reserved for scroll / diamond / dots so it matches printed plaque proportions. */
  const divHeight = baseBodyPx * 0.34;

  type Metric =
    | { kind: "text"; height: number; fontSize: number }
    | { kind: "div"; height: number };

  const metrics: Metric[] = [];
  let totalH = 0;
  for (let i = 0; i < planned.length; i++) {
    const p = planned[i];
    const gapAfter =
      i < planned.length - 1
        ? plaqueAwardGapAfterRow(i, planned, baseBodyPx)
        : 0;
    if (p.t === "div") {
      metrics.push({ kind: "div", height: divHeight });
      totalH += divHeight + gapAfter;
      continue;
    }
    const fs = Math.max(
      SIGN_TEXT_MIN_FONT_PX,
      Math.round(baseBodyPx * p.sizeMul),
    );
    const m = measureTextPx(
      p.text,
      fontFamily,
      fs,
      p.bold ? "bold" : "normal",
      p.italic ? "italic" : "normal",
    );
    metrics.push({ kind: "text", height: m.height, fontSize: fs });
    totalH += m.height + gapAfter;
  }

  const availH = Math.max(1, cr.height);
  const scale = totalH > availH ? availH / totalH : 1;

  const cx = cr.x + cr.width / 2;
  /** Top-align copy under the logo band (avoid vertically centering in the whole text region). */
  const topInset = Math.max(6, Math.min(20, cr.height * 0.016));
  let y = cr.y + topInset;
  const rows: PlaqueAwardLayoutRow[] = [];

  for (let i = 0; i < planned.length; i++) {
    const p = planned[i];
    const met = metrics[i]!;
    const gapAfter =
      i < planned.length - 1
        ? plaqueAwardGapAfterRow(i, planned, baseBodyPx)
        : 0;

    if (p.t === "div") {
      const h = met.kind === "div" ? met.height * scale : divHeight * scale;
      const cy = y + h / 2;
      rows.push({
        kind: "divider",
        cy,
        markup: dividerSvg(
          p.style,
          cx,
          cy,
          cr.width,
          defaultTextColor,
          dividerArtIdSuffix,
        ),
      });
      y += h + gapAfter * scale;
      continue;
    }

    const fs = Math.max(
      SIGN_TEXT_MIN_FONT_PX,
      Math.round((met.kind === "text" ? met.fontSize : baseBodyPx) * scale),
    );
    const hScaled =
      met.kind === "text"
        ? measureTextPx(
            p.text,
            fontFamily,
            fs,
            p.bold ? "bold" : "normal",
            p.italic ? "italic" : "normal",
          ).height * scale
        : baseBodyPx * scale;

    const midY = y + hScaled / 2;
    const userIdx = p.userLineIndex;
    const lineColor =
      userIdx !== undefined ? userLines[userIdx]?.color?.trim() : "";
    const fill =
      userIdx !== undefined && lineColor ? lineColor : defaultTextColor;

    rows.push({
      kind: "text",
      text: p.text,
      x: cx,
      y: midY,
      fontSize: fs,
      anchor: "middle",
      familyEscaped,
      fontWeight: p.bold ? "bold" : "normal",
      fontStyle: p.italic ? "italic" : "normal",
      fill,
      underline:
        userIdx !== undefined ? Boolean(userLines[userIdx]?.underline) : false,
    });
    y += hScaled + gapAfter * scale;
  }

  return rows;
}

function appendSlot(
  slot: PlaqueAwardSlot,
  userLines: BadgeLine[],
  out: Planned[],
): void {
  if (slot.kind === "divider") {
    out.push({ t: "div", style: slot.style });
    return;
  }
  if (slot.kind === "static") {
    out.push({
      t: "text",
      text: slot.text,
      sizeMul: slot.sizeMul,
      bold: slot.bold ?? false,
      italic: slot.italic ?? false,
    });
    return;
  }
  const L = userLines[slot.userIndex];
  let text = (L?.text ?? "").trim();
  if (!text) text = slot.placeholder;
  if (slot.uppercase) text = text.toUpperCase();
  out.push({
    t: "text",
    text,
    sizeMul: slot.sizeMul,
    bold: slot.bold ?? false,
    italic: slot.italic ?? false,
    userLineIndex: slot.userIndex,
  });
}

export function plaqueAwardRowsToSvgMarkup(
  rows: PlaqueAwardLayoutRow[],
): string {
  const parts: string[] = [];
  for (const r of rows) {
    if (r.kind === "divider") {
      parts.push(r.markup);
      continue;
    }
    const deco = r.underline ? "underline" : "none";
    parts.push(
      `<text x="${r.x}" y="${r.y}" font-size="${r.fontSize}" text-anchor="${
        r.anchor
      }"
        dominant-baseline="middle" font-family="${r.familyEscaped}" fill="${esc(
        r.fill,
      )}"
        font-weight="${r.fontWeight}" font-style="${
        r.fontStyle
      }" text-decoration="${deco}">${esc(r.text)}</text>`,
    );
  }
  return parts.join("");
}

/** Inner plate border strokes: none, single thin/thick, double rule, or Victorian raster frame. */
export function plaqueAwardPlateBorderSvgMarkup(params: {
  designBox: { x: number; y: number; width: number; height: number };
  stroke: string;
  border: PlaquePlateBorder;
  /** Unique SVG id fragment for raster border filters (see plaque previews as data-URL img). */
  svgFilterIdSuffix?: string;
}): string {
  const { designBox: db, stroke, border, svgFilterIdSuffix } = params;
  if (border === "none") return "";

  if (border === "victorian") {
    const fid = `vicPlateBorder${plaqueDividerFilterIdSuffix(svgFilterIdSuffix)}`;
    const ink = esc(stroke);
    const href = PLAQUE_VICTORIAN_BORDER_MASK_DATA_URL;
    const { x: bx, y: by, width: bw, height: bh } = db;
    return `<defs>
      <filter id="${fid}" x="${bx}" y="${by}" width="${bw}" height="${bh}"
        filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
        <feFlood flood-color="${ink}" flood-opacity="1" result="ink"/>
        <feComposite in="ink" in2="SourceGraphic" operator="in"/>
      </filter>
    </defs>
    <image href="${href}" xlink:href="${href}" x="${bx}" y="${by}" width="${bw}" height="${bh}"
      preserveAspectRatio="none" filter="url(#${fid})"/>`;
  }

  const insetPx = plaqueClassicInnerBorderInsetPx(db.width, db.height);
  const minSide = Math.min(db.width, db.height);
  /** Scaled stroke reads closer to printed plaques across template sizes. */
  const outerW =
    border === "heavy"
      ? Math.max(4.0, Math.min(5.6, minSide * 0.0096))
      : border === "thick"
        ? Math.max(3.05, Math.min(4.35, minSide * 0.0079))
        : border === "double"
          ? Math.max(2.1, Math.min(3.05, minSide * 0.0059))
          : 1.35;
  const outer = plaqueAwardInnerBorderSvgRect({
    designBox: db,
    stroke,
    insetPx,
    strokeWidth: outerW,
  });
  if (border === "thin" || border === "thick" || border === "heavy")
    return outer;
  const gap = plaqueDoubleBorderInnerGapPx(db.width, db.height);
  const innerStroke = Math.max(0.95, Math.min(1.22, minSide * 0.0026));
  const inner = plaqueAwardInnerBorderSvgRect({
    designBox: db,
    stroke,
    insetPx: insetPx + gap,
    strokeWidth: innerStroke,
  });
  return `${outer}${inner}`;
}

/** Inner plate inset stroke for “thin border” award formats. */
export function plaqueAwardInnerBorderSvgRect(params: {
  designBox: { x: number; y: number; width: number; height: number };
  stroke: string;
  insetPx: number;
  strokeWidth: number;
}): string {
  const { designBox: db, stroke, insetPx, strokeWidth } = params;
  const x = db.x + insetPx;
  const y = db.y + insetPx;
  const w = Math.max(4, db.width - 2 * insetPx);
  const h = Math.max(4, db.height - 2 * insetPx);
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${esc(
    stroke,
  )}" stroke-width="${strokeWidth}" />`;
}
