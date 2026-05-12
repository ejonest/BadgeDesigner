/**
 * Attached plaque “award format” presets: static labels, user line mapping, border + divider art.
 * Legacy designs omit {@link Badge.plaqueFormatId} and keep generic centered lines.
 */

import type { BadgeLine } from "../types/badge";

export type PlaqueDividerStyle =
  | "diamond"
  | "scroll"
  | "dots"
  /** Short heavy center bar with fine lines to the edges. */
  | "rule"
  /** Center cross with flanking rules (symmetric). */
  | "star"
  /** Three short dashes with gaps, centered on the plate. */
  | "dash"
  /** Large center dot, flanking medium/small dots, spindle caps (store reference). */
  | "whisker"
  /** Symmetrical calligraphic scroll / musical flourish (single stroke). */
  | "music"
  /** Tapered horizontal bar, taller center diamond, dots on tips (sport / certificate style). */
  | "taperGem";

/** Inner engraving frame on the metal plate (independent of wood trim). */
export type PlaquePlateBorder =
  | "none"
  | "thin"
  | "thick"
  /** Heavier single rule than {@link thick} (website standard attached plate). */
  | "heavy"
  | "double"
  /** Corner scroll frame from artwork (raster mask, tinted to plate ink). */
  | "victorian";

/**
 * `classic-fixed` uses reference Y positions (large emblem, fixed rhythm).
 * `content-stack` stacks slots inside the sign text content rect.
 */
export type PlaqueAwardLayoutEngine = "classic-fixed" | "content-stack";

export type PlaqueAwardSlot =
  | {
      kind: "static";
      text: string;
      /** Relative to base body size (1 = body line). */
      sizeMul: number;
      italic?: boolean;
      bold?: boolean;
    }
  | {
      kind: "user";
      userIndex: number;
      placeholder: string;
      /** Short label in the text editor (e.g. “Recipient name”). */
      editorLabel: string;
      sizeMul: number;
      italic?: boolean;
      bold?: boolean;
      uppercase?: boolean;
    }
  | { kind: "divider"; style: PlaqueDividerStyle };

export type PlaqueAwardFormatDefinition = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly border: PlaquePlateBorder;
  readonly slots: readonly PlaqueAwardSlot[];
  /**
   * When set, selects layout behavior. If omitted, inferred from legacy ids
   * (`plaque-format-classic-*`, formal-for, minimal → classic-fixed).
   */
  readonly layoutEngine?: PlaqueAwardLayoutEngine;
};

export const DEFAULT_PLAQUE_ATTACHED_FORMAT_ID = "plaque-format-store-standard";

/**
 * Earlier alternate presets — not offered in the format picker; still resolved by id so saved badges render.
 * To bring one back, move its entry into the active formats array in this file.
 */
export const SHELVED_PLAQUE_AWARD_FORMATS: readonly PlaqueAwardFormatDefinition[] =
  [
    {
      id: "plaque-format-classic-diamond",
      name: "Classic — diamond divider",
      description:
        '"Presented to", prominent name line, two custom lines, decorative divider with center diamond, date.',
      border: "thin",
      slots: [
        { kind: "static", text: "presented to", sizeMul: 0.42, italic: true },
        {
          kind: "user",
          userIndex: 0,
          placeholder: "YOUR NAME HERE",
          editorLabel: "Recipient name",
          sizeMul: 1.18,
          bold: true,
          uppercase: true,
        },
        {
          kind: "user",
          userIndex: 1,
          placeholder: "Your custom text here",
          editorLabel: "Award line 1",
          sizeMul: 0.82,
        },
        { kind: "divider", style: "diamond" },
        {
          kind: "user",
          userIndex: 2,
          placeholder: "Your custom text here",
          editorLabel: "Award line 2",
          sizeMul: 0.82,
        },
        {
          kind: "user",
          userIndex: 3,
          placeholder: "Date here",
          editorLabel: "Date",
          sizeMul: 0.78,
        },
      ],
    },
    {
      id: "plaque-format-classic-scroll",
      name: "Classic — scroll divider",
      description:
        "Same layout as Classic diamond, with an elegant scroll flourish between sections.",
      border: "thin",
      slots: [
        { kind: "static", text: "presented to", sizeMul: 0.42, italic: true },
        {
          kind: "user",
          userIndex: 0,
          placeholder: "YOUR NAME HERE",
          editorLabel: "Recipient name",
          sizeMul: 1.18,
          bold: true,
          uppercase: true,
        },
        {
          kind: "user",
          userIndex: 1,
          placeholder: "Your custom text here",
          editorLabel: "Award line 1",
          sizeMul: 0.82,
        },
        { kind: "divider", style: "scroll" },
        {
          kind: "user",
          userIndex: 2,
          placeholder: "Your custom text here",
          editorLabel: "Award line 2",
          sizeMul: 0.82,
        },
        {
          kind: "user",
          userIndex: 3,
          placeholder: "Date here",
          editorLabel: "Date",
          sizeMul: 0.78,
        },
      ],
    },
    {
      id: "plaque-format-classic-dots",
      name: "Classic — dotted divider",
      description: "Same layout with a centered dot motif between text blocks.",
      border: "thin",
      slots: [
        { kind: "static", text: "presented to", sizeMul: 0.42, italic: true },
        {
          kind: "user",
          userIndex: 0,
          placeholder: "YOUR NAME HERE",
          editorLabel: "Recipient name",
          sizeMul: 1.18,
          bold: true,
          uppercase: true,
        },
        {
          kind: "user",
          userIndex: 1,
          placeholder: "Your custom text here",
          editorLabel: "Award line 1",
          sizeMul: 0.82,
        },
        { kind: "divider", style: "dots" },
        {
          kind: "user",
          userIndex: 2,
          placeholder: "Your custom text here",
          editorLabel: "Award line 2",
          sizeMul: 0.82,
        },
        {
          kind: "user",
          userIndex: 3,
          placeholder: "Date here",
          editorLabel: "Date",
          sizeMul: 0.78,
        },
      ],
    },
    {
      id: "plaque-format-formal-for",
      name: "Formal — “For …”",
      description:
        "Adds a small “For” label before the first detail line; thin border; diamond divider.",
      border: "thin",
      slots: [
        { kind: "static", text: "presented to", sizeMul: 0.42, italic: true },
        {
          kind: "user",
          userIndex: 0,
          placeholder: "YOUR NAME HERE",
          editorLabel: "Recipient name",
          sizeMul: 1.12,
          bold: true,
          uppercase: true,
        },
        { kind: "static", text: "For", sizeMul: 0.48, italic: true },
        {
          kind: "user",
          userIndex: 1,
          placeholder: "Outstanding achievement",
          editorLabel: "Reason (follows “For”)",
          sizeMul: 0.85,
        },
        { kind: "divider", style: "diamond" },
        {
          kind: "user",
          userIndex: 2,
          placeholder: "Additional recognition text",
          editorLabel: "Additional text",
          sizeMul: 0.78,
        },
        {
          kind: "user",
          userIndex: 3,
          placeholder: "Date here",
          editorLabel: "Date",
          sizeMul: 0.76,
        },
      ],
    },
    {
      id: "plaque-format-minimal",
      name: "Minimal — no divider",
      description:
        "Clean stack: presented to, name, two lines, and date — no inner border line.",
      border: "none",
      slots: [
        { kind: "static", text: "presented to", sizeMul: 0.42, italic: true },
        {
          kind: "user",
          userIndex: 0,
          placeholder: "YOUR NAME HERE",
          editorLabel: "Recipient name",
          sizeMul: 1.15,
          bold: true,
          uppercase: true,
        },
        {
          kind: "user",
          userIndex: 1,
          placeholder: "Your custom text here",
          editorLabel: "Award line 1",
          sizeMul: 0.84,
        },
        {
          kind: "user",
          userIndex: 2,
          placeholder: "Your custom text here",
          editorLabel: "Award line 2",
          sizeMul: 0.82,
        },
        {
          kind: "user",
          userIndex: 3,
          placeholder: "Date here",
          editorLabel: "Date",
          sizeMul: 0.78,
        },
      ],
    },
    {
      id: "plaque-format-heritage-double",
      name: "Heritage — double rule frame",
      description:
        "Classic copy and scroll flourish with a double-line inner frame (certificate style).",
      border: "double",
      layoutEngine: "classic-fixed",
      slots: [
        { kind: "static", text: "presented to", sizeMul: 0.42, italic: true },
        {
          kind: "user",
          userIndex: 0,
          placeholder: "YOUR NAME HERE",
          editorLabel: "Recipient name",
          sizeMul: 1.18,
          bold: true,
          uppercase: true,
        },
        {
          kind: "user",
          userIndex: 1,
          placeholder: "Your custom text here",
          editorLabel: "Award line 1",
          sizeMul: 0.82,
        },
        { kind: "divider", style: "scroll" },
        {
          kind: "user",
          userIndex: 2,
          placeholder: "Your custom text here",
          editorLabel: "Award line 2",
          sizeMul: 0.82,
        },
        {
          kind: "user",
          userIndex: 3,
          placeholder: "Date here",
          editorLabel: "Date",
          sizeMul: 0.78,
        },
      ],
    },
    {
      id: "plaque-format-signature-thick",
      name: "Signature — bold inner frame",
      description:
        "Same rhythm as Classic diamond with a heavier single engraved border line.",
      border: "thick",
      layoutEngine: "classic-fixed",
      slots: [
        { kind: "static", text: "presented to", sizeMul: 0.42, italic: true },
        {
          kind: "user",
          userIndex: 0,
          placeholder: "YOUR NAME HERE",
          editorLabel: "Recipient name",
          sizeMul: 1.18,
          bold: true,
          uppercase: true,
        },
        {
          kind: "user",
          userIndex: 1,
          placeholder: "Your custom text here",
          editorLabel: "Award line 1",
          sizeMul: 0.82,
        },
        { kind: "divider", style: "diamond" },
        {
          kind: "user",
          userIndex: 2,
          placeholder: "Your custom text here",
          editorLabel: "Award line 2",
          sizeMul: 0.82,
        },
        {
          kind: "user",
          userIndex: 3,
          placeholder: "Date here",
          editorLabel: "Date",
          sizeMul: 0.78,
        },
      ],
    },
    {
      id: "plaque-format-modern-awarded",
      name: "Modern — “Awarded to” + rule",
      description:
        "No inner frame line; clean “Awarded to” caption and a minimal center rule divider.",
      border: "none",
      layoutEngine: "classic-fixed",
      slots: [
        { kind: "static", text: "Awarded to", sizeMul: 0.44, italic: true },
        {
          kind: "user",
          userIndex: 0,
          placeholder: "YOUR NAME HERE",
          editorLabel: "Recipient name",
          sizeMul: 1.12,
          bold: true,
          uppercase: true,
        },
        {
          kind: "user",
          userIndex: 1,
          placeholder: "Achievement or role",
          editorLabel: "Award line 1",
          sizeMul: 0.8,
        },
        { kind: "divider", style: "rule" },
        {
          kind: "user",
          userIndex: 2,
          placeholder: "Organization or detail",
          editorLabel: "Award line 2",
          sizeMul: 0.8,
        },
        {
          kind: "user",
          userIndex: 3,
          placeholder: "Date here",
          editorLabel: "Date",
          sizeMul: 0.76,
        },
      ],
    },
    {
      id: "plaque-format-certificate-star",
      name: "Certificate — star divider",
      description:
        "Formal certificate wording, double rule frame, and a centered star motif between sections.",
      border: "double",
      layoutEngine: "classic-fixed",
      slots: [
        {
          kind: "static",
          text: "This certificate is presented to",
          sizeMul: 0.36,
          italic: true,
        },
        {
          kind: "user",
          userIndex: 0,
          placeholder: "YOUR NAME HERE",
          editorLabel: "Recipient name",
          sizeMul: 1.14,
          bold: true,
          uppercase: true,
        },
        {
          kind: "user",
          userIndex: 1,
          placeholder: "For distinguished service",
          editorLabel: "Award line 1",
          sizeMul: 0.8,
        },
        { kind: "divider", style: "star" },
        {
          kind: "user",
          userIndex: 2,
          placeholder: "Additional recognition text",
          editorLabel: "Award line 2",
          sizeMul: 0.78,
        },
        {
          kind: "user",
          userIndex: 3,
          placeholder: "Date here",
          editorLabel: "Date",
          sizeMul: 0.74,
        },
      ],
    },
    {
      id: "plaque-format-distinction-dash",
      name: "Distinction — dash divider",
      description:
        "“In recognition of” caption with a triple-dash divider and the usual name and date stack.",
      border: "thin",
      layoutEngine: "classic-fixed",
      slots: [
        {
          kind: "static",
          text: "In recognition of",
          sizeMul: 0.44,
          italic: true,
        },
        {
          kind: "user",
          userIndex: 0,
          placeholder: "YOUR NAME HERE",
          editorLabel: "Recipient name",
          sizeMul: 1.16,
          bold: true,
          uppercase: true,
        },
        {
          kind: "user",
          userIndex: 1,
          placeholder: "Your custom text here",
          editorLabel: "Award line 1",
          sizeMul: 0.82,
        },
        { kind: "divider", style: "dash" },
        {
          kind: "user",
          userIndex: 2,
          placeholder: "Your custom text here",
          editorLabel: "Award line 2",
          sizeMul: 0.82,
        },
        {
          kind: "user",
          userIndex: 3,
          placeholder: "Date here",
          editorLabel: "Date",
          sizeMul: 0.78,
        },
      ],
    },
    {
      id: "plaque-format-service-gratitude",
      name: "Service — “In gratitude for”",
      description:
        "Thanks-forward wording with dotted divider; thin inner frame.",
      border: "thin",
      layoutEngine: "classic-fixed",
      slots: [
        {
          kind: "static",
          text: "In gratitude for",
          sizeMul: 0.42,
          italic: true,
        },
        {
          kind: "user",
          userIndex: 0,
          placeholder: "YOUR NAME HERE",
          editorLabel: "Recipient name",
          sizeMul: 1.14,
          bold: true,
          uppercase: true,
        },
        {
          kind: "user",
          userIndex: 1,
          placeholder: "Years of dedicated service",
          editorLabel: "Contribution line",
          sizeMul: 0.82,
        },
        { kind: "divider", style: "dots" },
        {
          kind: "user",
          userIndex: 2,
          placeholder: "Organization or team name",
          editorLabel: "Organization",
          sizeMul: 0.8,
        },
        {
          kind: "user",
          userIndex: 3,
          placeholder: "Date here",
          editorLabel: "Date",
          sizeMul: 0.76,
        },
      ],
    },
  ];

/** Award formats shown in Step 3 (attached plaque). */
const ACTIVE_PLAQUE_AWARD_FORMATS: readonly PlaqueAwardFormatDefinition[] = [
  {
    id: "plaque-format-store-standard",
    name: "Standard award",
    description:
      "Store layout: single medium inner frame, centered serif stack, circle-and-spindle divider.",
    border: "thick",
    layoutEngine: "classic-fixed",
    slots: [
      { kind: "static", text: "presented to", sizeMul: 0.42, italic: true },
      {
        kind: "user",
        userIndex: 0,
        placeholder: "YOUR NAME HERE",
        editorLabel: "Recipient name",
        sizeMul: 1.18,
        bold: true,
        uppercase: true,
      },
      {
        kind: "user",
        userIndex: 1,
        placeholder: "Your custom text here",
        editorLabel: "Award line 1",
        sizeMul: 0.82,
      },
      { kind: "divider", style: "whisker" },
      {
        kind: "user",
        userIndex: 2,
        placeholder: "Your custom text here",
        editorLabel: "Award line 2",
        sizeMul: 0.82,
      },
      {
        kind: "user",
        userIndex: 3,
        placeholder: "Date here",
        editorLabel: "Date",
        sizeMul: 0.78,
      },
    ],
  },
  {
    id: "plaque-format-music",
    name: "Music",
    description:
      "Same layout as Standard award; divider uses store flourish artwork (tinted to plate ink).",
    border: "thick",
    layoutEngine: "classic-fixed",
    slots: [
      { kind: "static", text: "presented to", sizeMul: 0.42, italic: true },
      {
        kind: "user",
        userIndex: 0,
        placeholder: "YOUR NAME HERE",
        editorLabel: "Recipient name",
        sizeMul: 1.18,
        bold: true,
        uppercase: true,
      },
      {
        kind: "user",
        userIndex: 1,
        placeholder: "Your custom text here",
        editorLabel: "Award line 1",
        sizeMul: 0.82,
      },
      { kind: "divider", style: "music" },
      {
        kind: "user",
        userIndex: 2,
        placeholder: "Your custom text here",
        editorLabel: "Award line 2",
        sizeMul: 0.82,
      },
      {
        kind: "user",
        userIndex: 3,
        placeholder: "Date here",
        editorLabel: "Date",
        sizeMul: 0.78,
      },
    ],
  },
  {
    id: "plaque-format-taper-gem",
    name: "Taper bar",
    description:
      "Single medium inner frame like other store plaques; divider uses store artwork (tinted to plate ink).",
    border: "thick",
    layoutEngine: "classic-fixed",
    slots: [
      { kind: "static", text: "presented to", sizeMul: 0.42, italic: true },
      {
        kind: "user",
        userIndex: 0,
        placeholder: "YOUR NAME HERE",
        editorLabel: "Recipient name",
        sizeMul: 1.18,
        bold: true,
        uppercase: true,
      },
      {
        kind: "user",
        userIndex: 1,
        placeholder: "Your custom text here",
        editorLabel: "Award line 1",
        sizeMul: 0.82,
      },
      { kind: "divider", style: "taperGem" },
      {
        kind: "user",
        userIndex: 2,
        placeholder: "Your custom text here",
        editorLabel: "Award line 2",
        sizeMul: 0.82,
      },
      {
        kind: "user",
        userIndex: 3,
        placeholder: "Date here",
        editorLabel: "Date",
        sizeMul: 0.78,
      },
    ],
  },
  {
    id: "plaque-format-victorian-scroll",
    name: "Victorian scroll",
    description:
      "Same layout and taper divider as Taper bar; ornamental corner-scroll frame from reference art.",
    border: "victorian",
    layoutEngine: "classic-fixed",
    slots: [
      { kind: "static", text: "presented to", sizeMul: 0.42, italic: true },
      {
        kind: "user",
        userIndex: 0,
        placeholder: "YOUR NAME HERE",
        editorLabel: "Recipient name",
        sizeMul: 1.18,
        bold: true,
        uppercase: true,
      },
      {
        kind: "user",
        userIndex: 1,
        placeholder: "Your custom text here",
        editorLabel: "Award line 1",
        sizeMul: 0.82,
      },
      { kind: "divider", style: "taperGem" },
      {
        kind: "user",
        userIndex: 2,
        placeholder: "Your custom text here",
        editorLabel: "Award line 2",
        sizeMul: 0.82,
      },
      {
        kind: "user",
        userIndex: 3,
        placeholder: "Date here",
        editorLabel: "Date",
        sizeMul: 0.78,
      },
    ],
  },
];

const FORMATS = ACTIVE_PLAQUE_AWARD_FORMATS;

const BY_ID: Record<string, PlaqueAwardFormatDefinition> = Object.fromEntries([
  ...SHELVED_PLAQUE_AWARD_FORMATS.map((f) => [f.id, f] as const),
  ...ACTIVE_PLAQUE_AWARD_FORMATS.map((f) => [f.id, f] as const),
]);

export function getPlaqueAwardFormats(): readonly PlaqueAwardFormatDefinition[] {
  return FORMATS;
}

export function getPlaqueAwardFormatById(
  id: string | undefined | null,
): PlaqueAwardFormatDefinition | undefined {
  if (!id?.trim()) return undefined;
  return BY_ID[id.trim()];
}

/**
 * Shown first in Step 3 before “more award formats” (same idea as featured badge templates).
 * Order = display order.
 */
export const FEATURED_PLAQUE_AWARD_FORMAT_IDS: readonly string[] = [
  "plaque-format-store-standard",
  "plaque-format-music",
  "plaque-format-taper-gem",
  "plaque-format-victorian-scroll",
];

/** Collapsed picker: featured presets plus current selection if it is not featured. */
export function getPlaqueAwardFormatsForPicker(options: {
  expanded: boolean;
  selectedFormatId: string | undefined | null;
}): readonly PlaqueAwardFormatDefinition[] {
  if (options.expanded) return FORMATS;
  const featured: PlaqueAwardFormatDefinition[] = [];
  for (const id of FEATURED_PLAQUE_AWARD_FORMAT_IDS) {
    const f = BY_ID[id];
    if (f) featured.push(f);
  }
  const sid = options.selectedFormatId?.trim();
  if (sid && !featured.some((f) => f.id === sid)) {
    const sel = BY_ID[sid];
    if (sel) featured.push(sel);
  }
  return featured;
}

export function plaqueAwardFormatsPickerHasExtras(): boolean {
  return FORMATS.length > FEATURED_PLAQUE_AWARD_FORMAT_IDS.length;
}

/** Fixed Y-stack plaques vs flexible stack inside the content rect. */
export function plaqueAwardLayoutEngine(
  format: PlaqueAwardFormatDefinition,
): PlaqueAwardLayoutEngine {
  if (format.layoutEngine) return format.layoutEngine;
  if (
    format.id.startsWith("plaque-format-classic-") ||
    format.id === "plaque-format-formal-for" ||
    format.id === "plaque-format-minimal"
  ) {
    return "classic-fixed";
  }
  return "content-stack";
}

/** Attached plaque: emblem uses classic vertical placement (under inner frame). */
export function plaqueAwardUsesClassicAttachedLogo(
  format: PlaqueAwardFormatDefinition | undefined,
): boolean {
  if (!format) return false;
  return plaqueAwardLayoutEngine(format) === "classic-fixed";
}

/** Number of {@link BadgeLine} entries required for this format (user slots only). */
export function plaqueAwardFormatUserLineCount(
  format: PlaqueAwardFormatDefinition,
): number {
  let max = 0;
  for (const s of format.slots) {
    if (s.kind === "user") max = Math.max(max, s.userIndex + 1);
  }
  return max;
}

/** Editor labels indexed by {@link BadgeLine} index (only defined slots). */
export function plaqueAwardEditorLabelsForFormat(
  format: PlaqueAwardFormatDefinition | undefined,
  maxLines: number,
): (string | undefined)[] {
  const out: (string | undefined)[] = Array.from(
    { length: maxLines },
    () => undefined,
  );
  if (!format) return out;
  for (const s of format.slots) {
    if (s.kind === "user" && s.userIndex < maxLines && !out[s.userIndex]) {
      out[s.userIndex] = s.editorLabel;
    }
  }
  return out;
}

export function buildInitialLinesForPlaqueAwardFormat(
  format: PlaqueAwardFormatDefinition,
  defaultLineShape: BadgeLineShape,
  maxLines: number,
): BadgeLine[] {
  const lines: BadgeLine[] = [];
  const placeholdersByIndex = new Map<number, string>();
  for (const slot of format.slots) {
    if (slot.kind === "user") {
      placeholdersByIndex.set(slot.userIndex, slot.placeholder);
    }
  }
  for (let i = 0; i < maxLines; i++) {
    const ph = placeholdersByIndex.get(i) ?? "";
    lines.push({
      ...defaultLineShape,
      id: `line-${i + 1}`,
      text: ph,
      align: "center",
      bold: format.slots.some(
        (s) => s.kind === "user" && s.userIndex === i && s.bold,
      ),
      italic: format.slots.some(
        (s) => s.kind === "user" && s.userIndex === i && s.italic,
      ),
    });
  }
  return lines;
}

/** Narrow shape passed from BadgeDesigner to avoid importing BadgeLine in circular deps. */
export type BadgeLineShape = {
  xNorm: number;
  yNorm: number;
  sizeNorm: number;
  color?: string;
  fontFamily?: string;
  align?: "left" | "center" | "right";
};
