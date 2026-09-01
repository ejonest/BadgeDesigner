/**
 * Acrylic desk signs are UV-printed onto the acrylic itself, so the print SVG
 * carries no plate fill. RGB-white artwork on that empty page is invisible in
 * CorelDRAW and rasterises to white-on-white, so the print export paints white
 * ink in a stand-in colour on a named layer; the RIP maps the stand-in back to
 * the white channel.
 */
import type { Badge } from "~/types/badge";
import type { LoadedTemplate } from "~/utils/templates";
import { isDeskSignTemplateId } from "~/utils/deskSignRender";

/**
 * Stand-in for white ink. Magenta is never a real desk-sign ink, so an
 * unmapped job is caught at proof instead of printing blank.
 */
export const DESK_SIGN_WHITE_INK_STANDIN_HEX = "#FF00FF";

export const DESK_SIGN_WHITE_INK_LAYER_ID = "White-Ink";
export const DESK_SIGN_REGISTRATION_LAYER_ID = "Registration-DoNotPrint";

/** Channel floor for "white enough to vanish against an unprinted page". */
const WHITE_INK_CHANNEL_MIN = 0xf2;

function escXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toRgbChannels(color: string | undefined | null): [number, number, number] | null {
  const raw = (color || "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "white") return [0xff, 0xff, 0xff];
  const hex = raw.startsWith("#") ? raw.slice(1) : null;
  if (!hex) return null;
  if (hex.length === 3 && /^[0-9a-f]{3}$/.test(hex)) {
    return [
      parseInt(hex[0] + hex[0], 16),
      parseInt(hex[1] + hex[1], 16),
      parseInt(hex[2] + hex[2], 16),
    ];
  }
  if (hex.length === 6 && /^[0-9a-f]{6}$/.test(hex)) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  return null;
}

export function isWhiteInkColor(color: string | undefined | null): boolean {
  const channels = toRgbChannels(color);
  if (!channels) return false;
  return channels.every((channel) => channel >= WHITE_INK_CHANNEL_MIN);
}

function isAcrylicDeskSign(badge: Badge, template: LoadedTemplate): boolean {
  if (!isDeskSignTemplateId(template.id)) return false;
  if (badge.deskSignMaterial) return badge.deskSignMaterial === "acrylic";
  return template.id.includes("acrylic");
}

/**
 * Acrylic plates print with no background, so white ink there needs a stand-in.
 * Dark-ink finishes are already visible in CorelDRAW and are left alone —
 * labelling their layer "White-Ink" would invite the wrong RIP mapping.
 */
export function deskSignPrintUsesWhiteInk(
  badge: Badge,
  template: LoadedTemplate,
): boolean {
  if (!isAcrylicDeskSign(badge, template)) return false;
  return (badge.lines || []).some(
    (line) => (line.text || "").trim() && isWhiteInkColor(line.color),
  );
}

export function deskSignPrintInkFill(
  color: string,
  whiteInkActive: boolean,
): string {
  if (!whiteInkActive) return color;
  return isWhiteInkColor(color) ? DESK_SIGN_WHITE_INK_STANDIN_HEX : color;
}

export function deskSignWhiteInkLayerMarkup(
  inkMarkup: string,
  clipPathId: string,
): string {
  return `<g id="${DESK_SIGN_WHITE_INK_LAYER_ID}" clip-path="url(#${clipPathId})"><title>${DESK_SIGN_WHITE_INK_LAYER_ID}</title>${inkMarkup}</g>`;
}

export function deskSignRegistrationLayerMarkup(outlineMarkup: string): string {
  if (!outlineMarkup.trim()) return outlineMarkup;
  return `<g id="${DESK_SIGN_REGISTRATION_LAYER_ID}"><title>${DESK_SIGN_REGISTRATION_LAYER_ID}</title>${outlineMarkup}</g>`;
}

export function deskSignWhiteInkPrintDescMarkup(badge: Badge): string {
  const notes = [
    `White ink is drawn in ${DESK_SIGN_WHITE_INK_STANDIN_HEX} on layer "${DESK_SIGN_WHITE_INK_LAYER_ID}" — map it to the white channel in the RIP and never print it as magenta.`,
    `The plate has no fill because the acrylic is the substrate; "${DESK_SIGN_REGISTRATION_LAYER_ID}" is the plate edge for placement only.`,
    "Convert text to curves before ripping.",
  ];
  if (badge.logo?.src?.trim()) {
    notes.push(
      "The customer logo is placed art and keeps its own colours; check it separately before printing white.",
    );
  }
  return `<desc>${escXml(notes.join(" "))}</desc>`;
}
