import { useEffect, useMemo, useRef, useState } from "react";
import BadgeSvgRenderer from "~/components/BadgeSvgRenderer";
import { ProofPdfViewer } from "~/components/ProofPdfViewer";
import {
  getDesignerApiPaths,
  getDesignerConfig,
  getDesignerLibraryApiPaths,
} from "~/config/designers";
import type { BadgeLineShape } from "~/constants/plaqueFormats";
import {
  DEFAULT_PLAQUE_ATTACHED_FORMAT_ID,
  getPlaqueAwardFormatById,
  getPlaqueAwardFormatsForPicker,
  plaqueAwardEditorLabelsForFormat,
  plaqueAwardEditorPlaceholdersForFormat,
  plaqueAwardFormatUserLineCount,
  plaqueAwardFormatsPickerHasExtras,
  type PlaqueAwardFormatDefinition,
} from "~/constants/plaqueFormats";
import {
  DEFAULT_PLAQUE_LAYOUT_ID,
  DEFAULT_PLAQUE_SIZE,
  PLAQUE_LAYOUT_OPTIONS,
  buildPlaqueTemplateId,
  defaultPlaqueTemplateId,
  getPlaqueSizeStepDisplay,
  getPlaqueSizeStepOptionsForLayout,
  isPlaqueDetachedLayoutId,
  normalizePlaqueSizeForLayout,
  type PlaqueSizeKey,
} from "~/constants/plaqueLayouts";
import type { Badge, BadgeLine, SignLogoPlacement } from "~/types/badge";
import { createApi } from "~/utils/api";
import { DRAFT_FULL_BADGE_IMAGE_OPTIONS, generateFullBadgeImage } from "~/utils/badgeThumbnail";
import {
  buildDesignerCartLineProperties,
  buildProductionLineProperties,
} from "~/utils/cartLineProperties";
import { generatePrintSVGAsBlob, generateSVGAsBlob } from "~/utils/export";
import { mapWithConcurrency } from "~/utils/mapWithConcurrency";
import { generatePDFAsBlob } from "~/utils/pdfGenerator";
import {
  PLAQUE_MAX_QUANTITY,
  parsePlaqueBulkCsv,
  plaqueBulkCsvTemplate,
  plaqueBulkPasteExamples,
  type PlaqueBulkRow,
  type PlaqueLineStyle,
} from "~/utils/plaqueBulkCsv";
import {
  buildPlaqueAwardFormatPreviewBadge,
  buildPlaqueLayoutPreviewBadge,
  PLAQUE_ATTACHED_LAYOUT_LOGO_SRC,
} from "~/utils/plaqueAwardFormatPreview";
import { PLAQUE_DEFAULT_BRUSH_GOLD_HEX } from "~/utils/plaqueRender";
import {
  blankPlaquePlateImage,
  hexForPlaqueCatalogPlate,
  PLAQUE_CUSTOM_PLATE_SLUG,
  plaqueCatalogPlateForHex,
  plaqueCatalogVariantForPlate,
  representativePlaqueCatalogVariant,
  type PlaqueCatalogDesign,
} from "~/utils/plaqueCatalog";
import { FEATURED_BRUSHED_SILVER_HEX } from "~/constants/colors";
import {
  isShopifyProductJsPayload,
  resolveSignVariantIdAndPrice,
  type ShopifyProductJs,
} from "~/utils/signShopifyCatalog";
import { getPlaqueShopifyShapeSizeForTemplateId } from "~/utils/signTemplateShopifyOptions";
import {
  getSignLogoPlacementOptionsForTemplate,
  normalizeSignLogoPlacementForTemplate,
} from "~/utils/signLogoPlacement";
import { loadTemplateById } from "~/utils/templates";
import "../styles/gavelDesigner.css";
import "../styles/medalDesigner.css";
import "../styles/plaqueDesigner.css";

type StepId = "layout" | "size" | "format" | "metal" | "design";
type PlaqueImage = {
  src: string;
  fileName: string;
  width: number;
  height: number;
};
type DesignerBulkRow = PlaqueBulkRow & { image?: PlaqueImage | null };
type PendingPlaqueOrder = {
  designId: string;
  pdf: Blob;
  badges: Badge[];
  quantities: number[];
  unitPrice: number;
  layoutLabel: string;
  sizeLabel: string;
  plateName: string;
  formatName: string;
  catalogSlug: string;
  catalogSchemaVersion: number;
  formatSnapshot: PlaqueCatalogDesign["format"] | null;
};

const DETACHED_LINE_COUNT = 6;
const FONT_OPTIONS = ["Georgia", "Times New Roman", "Arial", "Montserrat", "Open Sans"];
const SIZE_STEPS = [0.75, 0.85, 1, 1.15, 1.3, 1.45];
const CACHE_KEY = "plaque-designer-wizard-v2";
const FALLBACK_PRICE = 24.99;
const DEFAULT_SHAPE: BadgeLineShape = {
  xNorm: 0.5,
  yNorm: 0.5,
  sizeNorm: 0.22,
  color: "#111111",
  fontFamily: "Georgia",
  align: "center",
};
const PLATE_FINISHES = [
  { value: PLAQUE_DEFAULT_BRUSH_GOLD_HEX, name: "Brushed Gold", detail: "Gold plate and frame." },
  { value: FEATURED_BRUSHED_SILVER_HEX, name: "Brushed Silver", detail: "Silver plate and frame." },
  { value: "#000000", name: "Black", detail: "Black plate." },
] as const;
const PLAQUE_TEXT_COLORS = [
  { value: "#0D1B2A", name: "Navy" },
  { value: "#FFFFFF", name: "White" },
  { value: "#C8962A", name: "Gold" },
  { value: "#C0392B", name: "Red" },
  { value: "#1A5C8E", name: "Blue" },
] as const;
const DEFAULT_TEXT_COLOR = PLAQUE_TEXT_COLORS[0].value;

function plaqueTextColor(hex: string): string {
  const match = PLAQUE_TEXT_COLORS.find((color) => color.value.toLowerCase() === hex.trim().toLowerCase());
  return match?.value ?? DEFAULT_TEXT_COLOR;
}

function isAllowedPlateHex(hex: string): boolean {
  return PLATE_FINISHES.some((finish) => finish.value.toLowerCase() === hex.trim().toLowerCase());
}

/** Logo plates and photo plaques take an upload. Emblem plates already include the artwork. */
function designAcceptsImageUpload(design: PlaqueCatalogDesign | null, customPlate: boolean, layout: string): boolean {
  if (customPlate || isPlaqueDetachedLayoutId(layout)) return true;
  if (!design) return false;
  return /logo/i.test(`${design.slug} ${design.name} ${design.description}`);
}
const PLACEMENT_LABEL: Record<SignLogoPlacement, string> = {
  left: "Left",
  right: "Right",
  top: "Top",
  bottom: "Bottom",
};
const LAYOUT_COPY: Record<string, { title: string; detail: string }> = {
  "plaque-attached": {
    title: "Attached plate",
    detail: "Your image and text share one metal plate.",
  },
  "plaque-detached-portrait": {
    title: "Photo plaque — portrait",
    detail: "Portrait photo on the wood, with text on a plate below.",
  },
  "plaque-detached-landscape": {
    title: "Photo plaque — landscape",
    detail: "Landscape photo on the wood, with text on a plate below.",
  },
};
const STEP_LABELS: Record<StepId, string> = {
  layout: "Layout",
  size: "Size",
  format: "Format",
  metal: "Finish",
  design: "Design",
};
const PANEL_COPY: Record<StepId, { title: string; sub: string }> = {
  layout: {
    title: "Choose the plaque layout",
    sub: "Start with a full metal plate, or a photo plaque with a separate plate for the wording.",
  },
  size: {
    title: "Choose the size",
    sub: "Small is available on the attached plate. Photo plaques come in medium and large.",
  },
  format: {
    title: "Choose the award format",
    sub: "Captions, dividers, and the inner frame follow the format you pick.",
  },
  metal: {
    title: "Choose the plate finish",
    sub: "Brushed gold, brushed silver, or black. Text color, wording, and images come after this.",
  },
  design: {
    title: "Add your wording",
    sub: "Choose a text color, then enter the wording.",
  },
};

function newDesignId(): string {
  return `design_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function readQueryParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name)?.trim() || "";
}

function linesToText(lines: string[]): string {
  let last = -1;
  lines.forEach((line, index) => {
    if (line.length > 0) last = index;
  });
  return last < 0 ? "" : lines.slice(0, last + 1).join("\n");
}

function clampText(value: string, limit: number): string {
  const normalized = value.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n");
  return parts.length <= limit ? normalized : parts.slice(0, limit).join("\n");
}

function textToLines(value: string, limit: number): string[] {
  const parts = value.replace(/\r\n/g, "\n").split("\n").slice(0, limit);
  return Array.from({ length: limit }, (_, index) => parts[index] ?? "");
}

function emptyStyle(): PlaqueLineStyle {
  return {
    bold: false,
    italic: false,
    underline: false,
    fontFamily: "",
    sizeScale: 1,
    emphasisCustom: false,
  };
}

function normalizeStyle(style: Partial<PlaqueLineStyle> | undefined): PlaqueLineStyle {
  const scale = typeof style?.sizeScale === "number" && Number.isFinite(style.sizeScale) ? style.sizeScale : 1;
  const font = FONT_OPTIONS.includes(style?.fontFamily ?? "") ? style?.fontFamily ?? "" : "";
  return {
    bold: Boolean(style?.bold),
    italic: Boolean(style?.italic),
    underline: Boolean(style?.underline),
    fontFamily: font,
    sizeScale: Math.min(SIZE_STEPS[SIZE_STEPS.length - 1], Math.max(SIZE_STEPS[0], scale)),
    emphasisCustom: Boolean(style?.emphasisCustom),
  };
}

function emptyStyles(count: number): PlaqueLineStyle[] {
  return Array.from({ length: count }, () => emptyStyle());
}

function stylesFor(styles: PlaqueLineStyle[] | undefined, count: number): PlaqueLineStyle[] {
  const next = emptyStyles(count);
  (styles ?? []).forEach((style, index) => {
    if (index < count) next[index] = normalizeStyle(style);
  });
  return next;
}

function sizeStepIndex(scale: number): number {
  let best = 0;
  let bestDist = Infinity;
  SIZE_STEPS.forEach((step, index) => {
    const dist = Math.abs(step - scale);
    if (dist < bestDist) {
      best = index;
      bestDist = dist;
    }
  });
  return best;
}

function cloneStyles(styles: PlaqueLineStyle[]): PlaqueLineStyle[] {
  return styles.map((style) => ({ ...style }));
}

function inkForPlate(hex: string): string {
  const raw = hex.replace("#", "").trim();
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return "#111111";
  const r = Number.parseInt(raw.slice(0, 2), 16);
  const g = Number.parseInt(raw.slice(2, 4), 16);
  const b = Number.parseInt(raw.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.45 ? "#ffffff" : "#111111";
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const mime = parts[0]?.match(/:(.*?);/)?.[1] ?? "image/jpeg";
  const binary = atob(parts[1] ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}

function layoutFromOption(value: string): string | null {
  const name = value.trim().toLowerCase();
  if (name.includes("portrait")) return "plaque-detached-portrait";
  if (name.includes("landscape")) return "plaque-detached-landscape";
  if (name.includes("attached")) return "plaque-attached";
  return null;
}

function sizeFromOption(value: string): PlaqueSizeKey | null {
  const name = value.trim().toLowerCase();
  if (name === "small" || name === "medium" || name === "large") return name;
  return null;
}

function PlaqueFormatButtons({
  style,
  onToggle,
}: {
  style: PlaqueLineStyle;
  onToggle: (format: "bold" | "italic" | "underline") => void;
}) {
  return (
    <div className="md-line-tools" role="group" aria-label="Text formatting">
      {(
        [
          ["bold", "Bold", "B"],
          ["italic", "Italic", "I"],
          ["underline", "Underline", "U"],
        ] as const
      ).map(([format, name, mark]) => (
        <button
          type="button"
          key={format}
          className={style[format] ? "is-on" : ""}
          aria-label={name}
          aria-pressed={style[format]}
          title={name}
          onClick={() => onToggle(format)}
        >
          {mark}
        </button>
      ))}
    </div>
  );
}

type CatalogLineRole = "name" | "body" | "date" | "caption" | "extra";

type CatalogLinePlan = {
  variant: "presented" | "award";
  lines: { text: string; placeholder: boolean; role: CatalogLineRole; bodyIndex: number; userIndex: number }[];
};

/** Four customer lines, placed in the open bands of the plate photo. Your Award uses a different order. */
function catalogLinePlan(
  format: PlaqueAwardFormatDefinition | null | undefined,
  userLines: string[],
): CatalogLinePlan | null {
  if (!format) return null;
  const users = format.slots.filter((slot) => slot.kind === "user");
  if (users.length === 0) return null;
  const award = !users[0].bold && users.some((slot) => slot.bold);
  const roles: CatalogLineRole[] = award
    ? ["caption", "name", "date", "extra"]
    : ["name", "body", "body", "date"];
  let bodyCount = 0;
  return {
    variant: award ? "award" : "presented",
    lines: users.map((slot, index) => {
      const typed = userLines[slot.userIndex]?.trim() ?? "";
      const raw = typed || slot.placeholder;
      const role = roles[index] ?? "body";
      const bodyIndex = role === "body" ? bodyCount++ : 0;
      return {
        text: slot.uppercase ? raw.toUpperCase() : raw,
        placeholder: typed.length === 0,
        role,
        bodyIndex,
        userIndex: slot.userIndex,
      };
    }),
  };
}

function formatEngraving(
  format: PlaqueAwardFormatDefinition | null | undefined,
  userLines: string[],
  placeholders: boolean,
): { text: string; bold: boolean; italic: boolean; userIndex: number | null }[] {
  if (!format) return [];
  const rows: { text: string; bold: boolean; italic: boolean; userIndex: number | null }[] = [];
  for (const slot of format.slots) {
    if (slot.kind === "static") {
      rows.push({ text: slot.text, bold: Boolean(slot.bold), italic: Boolean(slot.italic), userIndex: null });
    } else if (slot.kind === "user") {
      const typed = userLines[slot.userIndex]?.trim() ?? "";
      const sample = slot.userIndex === 0 ? "YOUR NAME" : slot.placeholder;
      const text = placeholders ? sample : typed;
      if (text) rows.push({ text, bold: Boolean(slot.bold), italic: Boolean(slot.italic), userIndex: slot.userIndex });
    } else if (slot.kind === "divider") {
      rows.push({ text: "— • —", bold: false, italic: false, userIndex: null });
    }
  }
  return rows;
}

function engravingStyles(
  rows: { bold: boolean; italic: boolean; userIndex: number | null }[],
  userStyles: PlaqueLineStyle[] | undefined,
): PlaqueLineStyle[] {
  return rows.map((row) => {
    if (row.userIndex == null) return { ...emptyStyle(), bold: row.bold, italic: row.italic };
    const user = normalizeStyle(userStyles?.[row.userIndex]);
    return user.emphasisCustom ? user : { ...user, bold: row.bold, italic: row.italic };
  });
}

function PlaqueArt({ badge, frame }: { badge: Badge; frame: "choice" | "card" | "stage" }) {
  const templateId = badge.templateId || defaultPlaqueTemplateId();
  return (
    <div className={frame === "stage" ? "pd-preview-frame" : frame === "card" ? "pd-card-art" : "pd-choice-art"}>
      <BadgeSvgRenderer variant="plaque" badge={badge} templateId={templateId} height="100%" />
    </div>
  );
}

type PhotoPlaqueFrame = "portrait" | "landscape";

/** Blank plaques: sample photo in the frame, empty plate. The wording is drawn straight onto the plate. */
const PHOTO_PLAQUE_IMAGE: Record<PhotoPlaqueFrame, { gold: string; silver: string; black: string }> = {
  portrait: {
    gold: "/images/plaque/photo/stage-portrait-gold.jpg",
    silver: "/images/plaque/photo/stage-portrait-silver.jpg",
    black: "/images/plaque/photo/stage-portrait-black.jpg",
  },
  landscape: {
    gold: "/images/plaque/photo/stage-landscape-gold.jpg",
    silver: "/images/plaque/photo/stage-landscape-silver.jpg",
    black: "/images/plaque/photo/stage-landscape-black.jpg",
  },
};

function photoPlaqueFrame(layout: string): PhotoPlaqueFrame | null {
  if (layout === "plaque-detached-portrait") return "portrait";
  if (layout === "plaque-detached-landscape") return "landscape";
  return null;
}

function photoPlaqueImage(frame: PhotoPlaqueFrame, plate: string): string {
  if (plate === "silver") return PHOTO_PLAQUE_IMAGE[frame].silver;
  if (plate === "black-white") return PHOTO_PLAQUE_IMAGE[frame].black;
  return PHOTO_PLAQUE_IMAGE[frame].gold;
}

/** Your Award’s product photo fills more of the square than the other plates. These copies sit in the same frame, so the card and the preview use one crop. */
const YOUR_AWARD_FRAME: Partial<Record<string, string>> = {
  "black-white": "/images/plaque/catalog/your-award-black-white.jpg",
  gold: "/images/plaque/catalog/your-award-gold.jpg",
  silver: "/images/plaque/catalog/your-award-silver.jpg",
  "white-black": "/images/plaque/catalog/your-award-white-black.jpg",
};

function PlaquePhotoStage({
  src,
  lines,
  styles,
  image,
  ink,
  fontFamily,
  catalog,
  photo,
  catalogLayout,
}: {
  src: string;
  lines: string[];
  styles: PlaqueLineStyle[];
  image: PlaqueImage | null;
  ink: string;
  fontFamily: string;
  /** Ready-made plates already show the emblem and “presented to”, so the name sits in the open band. */
  catalog?: boolean;
  /** Photo plaques use a product photo, with the upload in the frame and wording on the plate. */
  photo?: PhotoPlaqueFrame;
  /** Customer lines anchored to the engraved bands on a catalog plate photo. */
  catalogLayout?: CatalogLinePlan | null;
}) {
  const written = lines
    .map((text, index) => ({ text: text.trim(), style: styles[index] }))
    .filter((line) => line.text.length > 0);
  return (
    <div className={`pd-preview-frame pd-photo-stage${photo ? ` is-photo is-${photo}` : ""}`}>
      <div className={`pd-photo-zoom${catalogLayout?.variant === "award" ? " is-award" : ""}`}>
        <img className="pd-photo-base" src={src} alt="" />
        {photo && image ? (
          <div className="pd-photo-window">
            <img src={image.src} alt="" />
          </div>
        ) : null}
        {catalogLayout && !photo && image ? <img className="pd-catalog-logo" src={image.src} alt="" /> : null}
        {catalogLayout && !photo
          ? catalogLayout.lines.map((line, index) => {
              const style = styles[line.userIndex];
              const scale = style?.sizeScale ?? 1;
              const family = style?.fontFamily?.trim() || fontFamily;
              return (
                <p
                  key={`${line.role}-${index}`}
                  className={`pd-catalog-line is-${line.role}${line.role === "body" ? ` is-i${line.bodyIndex}` : ""}${line.placeholder ? " is-placeholder" : ""}`}
                  style={{
                    color: ink,
                    fontFamily: family,
                    ["--pd-line-scale" as string]: String(scale),
                    ...(style?.emphasisCustom
                      ? {
                          fontWeight: style.bold ? 700 : 400,
                          fontStyle: style.italic ? "italic" : "normal",
                        }
                      : null),
                    textDecoration: style?.underline ? "underline" : undefined,
                  }}
                >
                  {line.text}
                </p>
              );
            })
          : null}
        {catalogLayout && !photo ? null : (
        <div className={`pd-photo-plate${catalog ? " is-catalog" : ""}`}>
        {!photo && image ? <img className="pd-photo-logo" src={image.src} alt="" /> : null}
        {written.length > 0 ? (
          <div className="pd-photo-lines" style={{ color: ink, fontFamily }}>
            {written.map((line, index) => {
              const scale = line.style?.sizeScale ?? 1;
              const family = line.style?.fontFamily?.trim();
              return (
                <p
                  key={`${line.text}-${index}`}
                  style={{
                    fontWeight: line.style?.bold ? 700 : 400,
                    fontStyle: line.style?.italic ? "italic" : "normal",
                    textDecoration: line.style?.underline ? "underline" : "none",
                    fontFamily: family || undefined,
                    ["--pd-line-scale" as string]: String(scale),
                    fontSize: photo ? undefined : `calc(${index === 0 ? "1.35em" : "1em"} * ${scale})`,
                  }}
                >
                  {line.text}
                </p>
              );
            })}
          </div>
        ) : null}
        </div>
        )}
      </div>
    </div>
  );
}

export default function PlaqueDesigner() {
  const [step, setStep] = useState<StepId>("layout");
  const [visited, setVisited] = useState<StepId[]>(["layout"]);
  const [layoutId, setLayoutId] = useState("");
  const [needsLayoutChoice, setNeedsLayoutChoice] = useState(false);
  const [layoutPane, setLayoutPane] = useState<"layouts" | "designs">("layouts");
  const [catalogSlug, setCatalogSlug] = useState("");
  const [needsDesignChoice, setNeedsDesignChoice] = useState(false);
  const [plaqueCatalogDesigns, setPlaqueCatalogDesigns] = useState<PlaqueCatalogDesign[]>([]);
  const [size, setSize] = useState<PlaqueSizeKey>(DEFAULT_PLAQUE_SIZE);
  const [formatId, setFormatId] = useState(DEFAULT_PLAQUE_ATTACHED_FORMAT_ID);
  const [plate, setPlate] = useState(PLAQUE_DEFAULT_BRUSH_GOLD_HEX);
  const [textColor, setTextColor] = useState(DEFAULT_TEXT_COLOR);
  const [fontFamily, setFontFamily] = useState("Georgia");
  const [lines, setLines] = useState<string[]>(() => textToLines("", 4));
  const [textDraft, setTextDraft] = useState("");
  const [lineStyles, setLineStyles] = useState<PlaqueLineStyle[]>(() => emptyStyles(4));
  const [lineFocus, setLineFocus] = useState(0);
  const [wordingMode, setWordingMode] = useState<"all" | "line">("all");
  const [quantity, setQuantity] = useState(1);
  const [sharedImage, setSharedImage] = useState<PlaqueImage | null>(null);
  const [placementChoice, setPlacementChoice] = useState<SignLogoPlacement>("top");
  const [formatsExpanded, setFormatsExpanded] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkRows, setBulkRows] = useState<DesignerBulkRow[]>([]);
  const [bulkCsvText, setBulkCsvText] = useState("");
  const [bulkCsvWarning, setBulkCsvWarning] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [selectedBulkRow, setSelectedBulkRow] = useState(0);
  const [bulkPane, setBulkPane] = useState<"edit" | "all" | "add">("add");
  const [bulkSearch, setBulkSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [cartError, setCartError] = useState("");
  const [cartAdded, setCartAdded] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  const [catalog, setCatalog] = useState<ShopifyProductJs | null>(null);
  const designIdRef = useRef(newDesignId());
  const pendingOrderRef = useRef<PendingPlaqueOrder | null>(null);
  const imageFilesRef = useRef<Map<string, File>>(new Map());
  const bulkCsvInputRef = useRef<HTMLInputElement>(null);
  const sharedImageInputRef = useRef<HTMLInputElement>(null);
  const rowImageInputRef = useRef<HTMLInputElement>(null);
  const skipNextPersist = useRef(false);
  const allowUrlDefaults = useRef(true);
  const apiRef = useRef(createApi(undefined, undefined, { designerId: "plaque" }));

  const attached = layoutId === "plaque-attached";
  const attachedCatalogDesigns = plaqueCatalogDesigns.filter(
    (design) => design.showInAttachedPicker && design.layoutId === "plaque-attached",
  );
  const selectedCatalogDesign =
    attachedCatalogDesigns.find((design) => design.slug === catalogSlug) ?? null;
  const customPlate = catalogSlug === PLAQUE_CUSTOM_PLATE_SLUG;
  const showImageUpload = designAcceptsImageUpload(selectedCatalogDesign, customPlate, layoutId);
  const imageRequired = showImageUpload && attached;
  const format =
    selectedCatalogDesign?.format ??
    getPlaqueAwardFormatById(formatId) ??
    getPlaqueAwardFormatById(DEFAULT_PLAQUE_ATTACHED_FORMAT_ID);
  const lineCount = attached && format ? Math.max(1, plaqueAwardFormatUserLineCount(format)) : DETACHED_LINE_COUNT;
  const steps = useMemo<StepId[]>(() => {
    if (!layoutId) return ["layout", "size", "metal", "design"];
    return attached && !selectedCatalogDesign
      ? ["layout", "size", "format", "metal", "design"]
      : ["layout", "size", "metal", "design"];
  }, [attached, layoutId, selectedCatalogDesign]);
  const stepIndex = Math.max(0, steps.indexOf(step));
  const templateId = layoutId
    ? buildPlaqueTemplateId(layoutId, normalizePlaqueSizeForLayout(layoutId, size))
    : defaultPlaqueTemplateId();
  const labels = attached
    ? plaqueAwardEditorLabelsForFormat(format, lineCount).map((label, index) => label || `Line ${index + 1}`)
    : Array.from({ length: lineCount }, (_, index) => `Line ${index + 1}`);
  const placeholders = attached
    ? plaqueAwardEditorPlaceholdersForFormat(format, lineCount).map(
        (placeholder, index) => placeholder || labels[index] || `Line ${index + 1}`,
      )
    : ["Presented to", "YOUR NAME", "Your custom text here", "Date here", "", ""].slice(0, lineCount);
  const placement = normalizeSignLogoPlacementForTemplate(templateId, placementChoice);
  const placementOptions = getSignLogoPlacementOptionsForTemplate(templateId);
  const bulkQuantity = bulkRows.reduce((sum, row) => sum + row.quantity, 0);
  const orderQuantity = bulkMode && bulkRows.length > 0 ? bulkQuantity : quantity;
  const activeLines = bulkMode && bulkRows[selectedBulkRow] ? bulkRows[selectedBulkRow].lines : lines;
  const activeStyles =
    bulkMode && bulkRows[selectedBulkRow]?.lineStyles
      ? bulkRows[selectedBulkRow].lineStyles
      : lineStyles;
  const focusIndex = Math.min(lineFocus, Math.max(0, lineCount - 1));
  const focusStyle = normalizeStyle(activeStyles?.[focusIndex]);
  const focusEmphasis = lineEmphasis(focusStyle, focusIndex);
  const focusFont = focusStyle.fontFamily || fontFamily;
  const focusSizeIndex = sizeStepIndex(focusStyle.sizeScale);
  const activeImage =
    bulkMode && bulkRows[selectedBulkRow]?.image !== undefined
      ? bulkRows[selectedBulkRow].image
      : sharedImage;
  const imageReady = !imageRequired || (
    bulkMode && bulkRows.length > 0
      ? bulkRows.every((row) => (row.image === undefined ? sharedImage : row.image))
      : Boolean(sharedImage)
  );
  const textReady = bulkMode
    ? bulkRows.length > 0 && bulkRows.every((row) => row.lines[0]?.trim())
    : Boolean(lines[0]?.trim());
  const designReady = textReady && imageReady;
  const panel =
    step === "design" && bulkMode
      ? {
          title: bulkRows.length > 0 ? "Review each plaque" : "Add your plaques",
          sub:
            bulkRows.length > 0
              ? "Work on one plaque, look at all of them, or add more names."
              : "Paste a list or upload a CSV. Each plaque can say something different.",
        }
      : step === "layout" && layoutPane === "designs"
        ? {
            title: "Choose a design",
            sub: "Pick a ready-made plate, or start with a blank one and add your own image and wording.",
          }
        : step === "design"
          ? {
              title: "Add your wording",
              sub: showImageUpload
                ? "Choose a text color, enter the wording, then add an image. Each line can have its own font and size."
                : "Choose a text color, then enter the wording. Each line can have its own font and size.",
            }
          : PANEL_COPY[step];
  const shopifyOptions = getPlaqueShopifyShapeSizeForTemplateId(templateId);
  const priced = shopifyOptions ? resolveSignVariantIdAndPrice(catalog, shopifyOptions.shape, shopifyOptions.size) : null;
  const queryPrice = Number(readQueryParam("price"));
  const unitPrice =
    priced && priced.price > 0
      ? priced.price
      : Number.isFinite(queryPrice) && queryPrice > 0
        ? queryPrice
        : FALLBACK_PRICE;
  const price = { perUnit: unitPrice, total: unitPrice * Math.max(1, orderQuantity) };
  const plateName = PLATE_FINISHES.find((finish) => finish.value.toLowerCase() === plate.toLowerCase())?.name ?? "Brushed Gold";
  const layoutLabel = selectedCatalogDesign?.name ?? LAYOUT_COPY[layoutId]?.title ?? layoutId;
  const attachedPlatePhoto = attachedCatalogDesigns[0]
    ? representativePlaqueCatalogVariant(attachedCatalogDesigns[0])
    : undefined;
  const stagePlate = plaqueCatalogPlateForHex(plate);
  function plateFinishImage(hex: string): string | undefined {
    const key = plaqueCatalogPlateForHex(hex);
    if (!key) return blankPlaquePlateImage("gold");
    if (selectedCatalogDesign?.slug === "your-award" && YOUR_AWARD_FRAME[key]) return YOUR_AWARD_FRAME[key];
    if (selectedCatalogDesign) {
      return plaqueCatalogVariantForPlate(selectedCatalogDesign, key)?.imageUrl ?? blankPlaquePlateImage(key);
    }
    return blankPlaquePlateImage(key);
  }
  const photoFrame = photoPlaqueFrame(layoutId);
  const stagePhoto = photoFrame
    ? photoPlaqueImage(photoFrame, stagePlate ?? "gold")
    : !attached
      ? undefined
      : selectedCatalogDesign
        ? plateFinishImage(plate)
        : customPlate
          ? blankPlaquePlateImage(stagePlate) ?? blankPlaquePlateImage("gold")
          : attachedPlatePhoto?.imageUrl;
  const stageInk = textColor;
  const sizeLabel = [
    getPlaqueSizeStepDisplay(layoutId, size).primaryLine,
    ...getPlaqueSizeStepDisplay(layoutId, size).detailLines,
  ].join(" · ");
  const pasteExamples = useMemo(() => plaqueBulkPasteExamples(labels), [labels]);
  const bulkPastePreview = useMemo(() => {
    if (!bulkCsvText.trim()) return null;
    try {
      return { ...parsePlaqueBulkCsv(bulkCsvText, lineCount, labels), error: "" };
    } catch (error) {
      return {
        rows: [] as PlaqueBulkRow[],
        warning: "",
        error: error instanceof Error ? error.message : "The list could not be read.",
      };
    }
  }, [bulkCsvText, labels, lineCount]);
  const visibleBulkRows = useMemo(() => {
    const query = bulkSearch.trim().toLocaleLowerCase();
    return bulkRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) =>
        query ? row.lines.some((line) => line.toLocaleLowerCase().includes(query)) : true,
      );
  }, [bulkRows, bulkSearch]);

  function badgeFor(texts: string[], styles: PlaqueLineStyle[], image: PlaqueImage | null | undefined, id: string): Badge {
    const shown = texts.some((line) => line.trim())
      ? texts
      : attached
        ? texts
        : placeholders.map((placeholder) => placeholder || "");
    const badgeLines: BadgeLine[] = shown.slice(0, lineCount).map((text, index) => {
      const style = normalizeStyle(styles[index]);
      const chosenFont = style.fontFamily || fontFamily;
      return {
        id: `line-${index + 1}`,
        text,
        xNorm: 0.5,
        yNorm: 0.5,
        sizeNorm: 0.22 * style.sizeScale,
        align: "center" as const,
        color: textColor,
        fontFamily: chosenFont,
        bold: style.bold,
        italic: style.italic,
        underline: style.underline,
        plaqueSizeScale: style.sizeScale,
        plaqueEmphasisCustom: style.emphasisCustom,
        plaqueFontCustom: Boolean(style.fontFamily),
      };
    });
    const logo = showImageUpload && image
      ? {
          src: image.src,
          fileName: image.fileName,
          placement,
          intrinsicWidth: image.width,
          intrinsicHeight: image.height,
        }
      : undefined;
    return {
      id,
      templateId,
      lines: badgeLines,
      backgroundColor: plate,
      backing: "magnetic",
      ...(attached && format ? { plaqueFormatId: format.id } : {}),
      ...(selectedCatalogDesign
        ? {
            plaqueCatalogSlug: selectedCatalogDesign.slug,
            plaqueCatalogSchemaVersion: selectedCatalogDesign.schemaVersion,
            plaqueFormatSnapshot: selectedCatalogDesign.format,
          }
        : {}),
      ...(logo ? { logo } : {}),
    };
  }

  const previewImage =
    activeImage ??
    (step === "layout" && attached && !selectedCatalogDesign
      ? {
          src: PLAQUE_ATTACHED_LAYOUT_LOGO_SRC,
          fileName: "Your Logo",
          width: 200,
          height: 200,
        }
      : null);
  const previewBadge = badgeFor(
    activeLines,
    activeStyles ?? emptyStyles(lineCount),
    previewImage,
    "plaque-preview",
  );
  const layoutPreviews = useMemo(
    () =>
      PLAQUE_LAYOUT_OPTIONS.map((option) => ({
        option,
        badge: buildPlaqueLayoutPreviewBadge({
          layoutId: option.id,
          templateId: buildPlaqueTemplateId(option.id, normalizePlaqueSizeForLayout(option.id, "medium")),
          defaultLineShape: { ...DEFAULT_SHAPE, fontFamily, color: inkForPlate(plate) },
          plateBackgroundHex: plate,
        }),
      })),
    [fontFamily, plate],
  );
  const formatPreviews = useMemo(() => {
    const previewTemplate = buildPlaqueTemplateId("plaque-attached", normalizePlaqueSizeForLayout("plaque-attached", size));
    return getPlaqueAwardFormatsForPicker({ expanded: formatsExpanded, selectedFormatId: formatId }).map((item) => ({
      item,
      badge: buildPlaqueAwardFormatPreviewBadge({
        formatId: item.id,
        templateId: previewTemplate,
        maxLines: lineCount,
        defaultLineShape: { ...DEFAULT_SHAPE, fontFamily, color: inkForPlate(plate) },
        plateBackgroundHex: plate,
      }),
    }));
  }, [fontFamily, formatId, formatsExpanded, lineCount, plate, size]);

  useEffect(() => {
    if (steps.includes(step)) return;
    setStep("metal");
  }, [step, steps]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return;
      allowUrlDefaults.current = false;
      const draft = JSON.parse(raw) as {
        step?: string;
        visited?: string[];
        layoutId?: string;
        layoutPane?: string;
        catalogSlug?: string;
        size?: PlaqueSizeKey;
        formatId?: string;
        plate?: string;
        textColor?: string;
        fontFamily?: string;
        lines?: string[];
        lineStyles?: PlaqueLineStyle[];
        quantity?: number;
        placement?: SignLogoPlacement;
        bulkMode?: boolean;
        bulkRows?: PlaqueBulkRow[];
        bulkCsvText?: string;
        bulkCsvWarning?: string;
      };
      if (draft.layoutId && PLAQUE_LAYOUT_OPTIONS.some((option) => option.id === draft.layoutId)) {
        setLayoutId(draft.layoutId);
      }
      if (typeof draft.catalogSlug === "string") setCatalogSlug(draft.catalogSlug);
      if (draft.layoutPane === "designs" || draft.layoutPane === "layouts") {
        setLayoutPane(draft.layoutPane);
      } else if (draft.catalogSlug) {
        setLayoutPane("designs");
      }
      if (draft.size === "small" || draft.size === "medium" || draft.size === "large") {
        setSize(normalizePlaqueSizeForLayout(draft.layoutId || DEFAULT_PLAQUE_LAYOUT_ID, draft.size));
      }
      if (draft.formatId && getPlaqueAwardFormatById(draft.formatId)) setFormatId(draft.formatId);
      if (typeof draft.plate === "string" && isAllowedPlateHex(draft.plate)) setPlate(draft.plate);
      if (typeof draft.textColor === "string") setTextColor(plaqueTextColor(draft.textColor));
      if (FONT_OPTIONS.includes(draft.fontFamily ?? "")) setFontFamily(draft.fontFamily!);
      if (draft.placement) setPlacementChoice(draft.placement);
      const restoredLines = Array.isArray(draft.lines) ? draft.lines.map((line) => String(line ?? "")) : [];
      if (restoredLines.length > 0) {
        setLines(restoredLines);
        setTextDraft(linesToText(restoredLines));
      }
      if (Array.isArray(draft.lineStyles) && draft.lineStyles.length > 0) {
        setLineStyles(draft.lineStyles.map((style) => normalizeStyle(style)));
      }
      if (typeof draft.quantity === "number") {
        setQuantity(Math.max(1, Math.min(PLAQUE_MAX_QUANTITY, Math.round(draft.quantity))));
      }
      if (Array.isArray(draft.bulkRows) && draft.bulkRows.length > 0) {
        setBulkRows(
          draft.bulkRows.flatMap((row, index): DesignerBulkRow[] => {
            if (!row || !Array.isArray(row.lines)) return [];
            return [{
              id: row.id || `bulk-plaque-cached-${index}`,
              lines: row.lines.map((line) => String(line ?? "")),
              quantity: Math.max(1, Math.round(Number(row.quantity) || 1)),
              lineStyles: Array.isArray(row.lineStyles)
                ? row.lineStyles.map((style) => normalizeStyle(style))
                : undefined,
            }];
          }),
        );
        if (draft.bulkMode) {
          setBulkMode(true);
          setBulkPane("edit");
          const first = draft.bulkRows[0]?.lines;
          if (Array.isArray(first)) setTextDraft(linesToText(first.map((line) => String(line ?? ""))));
        }
      }
      if (typeof draft.bulkCsvText === "string") setBulkCsvText(draft.bulkCsvText);
      if (typeof draft.bulkCsvWarning === "string") setBulkCsvWarning(draft.bulkCsvWarning);
      const savedStep = draft.step;
      if (
        savedStep === "layout" ||
        savedStep === "size" ||
        savedStep === "format" ||
        savedStep === "metal" ||
        savedStep === "design"
      ) {
        setStep(savedStep);
      }
      if (Array.isArray(draft.visited)) {
        const next = draft.visited.filter(
          (id): id is StepId =>
            id === "layout" || id === "size" || id === "format" || id === "metal" || id === "design",
        );
        if (next.length > 0) setVisited(next);
      }
    } catch {
      localStorage.removeItem(CACHE_KEY);
    } finally {
      setRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!restored) return;
    const shop = readQueryParam("storeUrl") || readQueryParam("shop");
    const handle = readQueryParam("plaqueProductHandle") || readQueryParam("productHandle") || "custom-plaque";
    let cancelled = false;
    function accept(payload: unknown) {
      if (cancelled || !isShopifyProductJsPayload(payload)) return;
      setCatalog(payload);
    }
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; payload?: unknown } | null;
      if (data?.type === "PLAQUE_DESIGNER_SHOPIFY_PRODUCT") accept(data.payload);
    }
    window.addEventListener("message", onMessage);
    if (shop) {
      const params = new URLSearchParams({ shop, handle });
      fetch(`/api/shopify-product?${params}`)
        .then((response) => response.json())
        .then(accept)
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
    };
  }, [restored]);

  useEffect(() => {
    if (!catalog || !allowUrlDefaults.current) return;
    allowUrlDefaults.current = false;
    const variantId = readQueryParam("variantIdSign") || readQueryParam("variantId");
    const variant = catalog.variants.find((item) => String(item.id) === variantId);
    if (!variant) return;
    const nextLayout = layoutFromOption(variant.option1 || "") || layoutFromOption(variant.option2 || "");
    const nextSize = sizeFromOption(variant.option2 || "") || sizeFromOption(variant.option1 || "");
    if (nextLayout) setLayoutId(nextLayout);
    if (nextLayout && nextLayout !== "plaque-attached") setCatalogSlug("");
    if (nextSize) setSize(normalizePlaqueSizeForLayout(nextLayout || DEFAULT_PLAQUE_LAYOUT_ID, nextSize));
  }, [catalog]);

  useEffect(() => {
    const shop = readQueryParam("shop") || readQueryParam("storeUrl");
    const params = shop ? `?shop=${encodeURIComponent(shop)}` : "";
    let cancelled = false;
    fetch(`/api/plaque-catalog${params}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { designs?: PlaqueCatalogDesign[] } | null) => {
        if (cancelled || !Array.isArray(payload?.designs)) return;
        setPlaqueCatalogDesigns(payload.designs);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      return;
    }
    const payload = {
      step,
      visited,
      layoutId,
      layoutPane,
      catalogSlug,
      size,
      formatId,
      plate,
      textColor,
      fontFamily,
      lines,
      lineStyles,
      quantity,
      placement: placementChoice,
      bulkMode,
      bulkRows: bulkRows.map(({ image: _image, ...row }) => row),
      bulkCsvText,
      bulkCsvWarning,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  }, [
    bulkCsvText,
    bulkCsvWarning,
    bulkMode,
    bulkRows,
    fontFamily,
    catalogSlug,
    layoutPane,
    formatId,
    layoutId,
    lineStyles,
    lines,
    placementChoice,
    plate,
    textColor,
    quantity,
    restored,
    size,
    step,
    visited,
  ]);

  function goToStep(next: StepId) {
    if (!steps.includes(next)) return;
    if (step === "layout" && next !== "layout") setLayoutPane("layouts");
    setStep(next);
    setVisited((current) => (current.includes(next) ? current : [...current, next]));
  }

  function goBack() {
    if (step === "layout" && layoutPane === "designs") {
      setLayoutPane("layouts");
      setNeedsDesignChoice(false);
      return;
    }
    const previous = steps[stepIndex - 1];
    if (previous) goToStep(previous);
  }

  function goForward() {
    if (step === "layout" && !layoutId) {
      setNeedsLayoutChoice(true);
      return;
    }
    if (step === "layout" && layoutId === "plaque-attached" && layoutPane === "layouts") {
      openAttachedDesigns();
      return;
    }
    if (step === "layout" && layoutPane === "designs" && !catalogSlug) {
      setNeedsDesignChoice(true);
      return;
    }
    const next = steps[stepIndex + 1];
    if (next) goToStep(next);
  }

  function resizeText(count: number) {
    setLines((current) => textToLines(linesToText(current), count));
    setTextDraft((current) => linesToText(textToLines(current, count)));
    setLineStyles((current) => {
      const next = emptyStyles(count);
      current.forEach((style, index) => {
        if (index < count) next[index] = { ...style };
      });
      return next;
    });
    setBulkRows((rows) =>
      rows.map((row) => ({
        ...row,
        lines: textToLines(linesToText(row.lines), count),
        lineStyles: row.lineStyles
          ? textToLines(linesToText(row.lines), count).map((_, index) => normalizeStyle(row.lineStyles?.[index]))
          : row.lineStyles,
      })),
    );
  }

  function selectLayout(nextLayout: string) {
    allowUrlDefaults.current = false;
    const nextSize = normalizePlaqueSizeForLayout(nextLayout, size);
    const nextAttached = nextLayout === "plaque-attached";
    const count = nextAttached && format ? Math.max(1, plaqueAwardFormatUserLineCount(format)) : DETACHED_LINE_COUNT;
    setCatalogSlug("");
    setLayoutPane("layouts");
    setNeedsDesignChoice(false);
    setNeedsLayoutChoice(false);
    setLayoutId(nextLayout);
    setSize(nextSize);
    if (lines.length !== count) resizeText(count);
  }

  function openAttachedDesigns() {
    allowUrlDefaults.current = false;
    setLayoutId("plaque-attached");
    setSize(normalizePlaqueSizeForLayout("plaque-attached", size));
    setLayoutPane("designs");
    setNeedsDesignChoice(false);
    setNeedsLayoutChoice(false);
  }

  function selectCustomPlate() {
    allowUrlDefaults.current = false;
    const next = getPlaqueAwardFormatById(DEFAULT_PLAQUE_ATTACHED_FORMAT_ID);
    const count = next ? Math.max(1, plaqueAwardFormatUserLineCount(next)) : 4;
    setCatalogSlug(PLAQUE_CUSTOM_PLATE_SLUG);
    setFormatId(DEFAULT_PLAQUE_ATTACHED_FORMAT_ID);
    setLayoutId("plaque-attached");
    setLayoutPane("designs");
    setNeedsDesignChoice(false);
    setSize(normalizePlaqueSizeForLayout("plaque-attached", size));
    if (lines.length !== count) resizeText(count);
  }

  function applyPlate(nextPlate: string) {
    setTextColor((current) => {
      const darkText = current.toLowerCase() === DEFAULT_TEXT_COLOR.toLowerCase() || current.toLowerCase() === "#111111";
      const lightText = current.toLowerCase() === "#ffffff";
      const nextIsDark = inkForPlate(nextPlate) === "#ffffff";
      if (nextIsDark && darkText) return "#FFFFFF";
      if (!nextIsDark && lightText) return DEFAULT_TEXT_COLOR;
      return current;
    });
    setPlate(nextPlate);
  }

  function selectCatalogDesign(design: PlaqueCatalogDesign) {
    allowUrlDefaults.current = false;
    const count = Math.max(1, plaqueAwardFormatUserLineCount(design.format));
    setCatalogSlug(design.slug);
    setFormatId(design.format.id);
    setLayoutId("plaque-attached");
    setLayoutPane("designs");
    setNeedsDesignChoice(false);
    setSize(normalizePlaqueSizeForLayout("plaque-attached", size));
    const hex = hexForPlaqueCatalogPlate(design.slug === "your-award" ? "black-white" : design.defaultPlate);
    if (hex && isAllowedPlateHex(hex)) applyPlate(hex);
    if (lines.length !== count) resizeText(count);
  }

  function selectSize(nextSize: PlaqueSizeKey) {
    allowUrlDefaults.current = false;
    setSize(normalizePlaqueSizeForLayout(layoutId, nextSize));
  }

  function selectFormat(nextId: string) {
    const next = getPlaqueAwardFormatById(nextId);
    setFormatId(nextId);
    if (next) {
      const count = Math.max(1, plaqueAwardFormatUserLineCount(next));
      if (count !== lineCount) resizeText(count);
    }
  }

  function commitStyles(next: PlaqueLineStyle[]) {
    const normalized = next.map((style) => normalizeStyle(style));
    setLineStyles(normalized);
    if (bulkMode && bulkRows.length > 0) {
      setBulkRows((rows) =>
        rows.map((row, rowIndex) =>
          rowIndex === selectedBulkRow ? { ...row, lineStyles: cloneStyles(normalized) } : row,
        ),
      );
    }
  }

  function updateLine(index: number, update: Partial<PlaqueLineStyle>) {
    const next = stylesFor(activeStyles, lineCount);
    next[index] = normalizeStyle({ ...next[index], ...update });
    commitStyles(next);
  }

  function slotEmphasis(index: number): { bold: boolean; italic: boolean } {
    if (!attached || !format) return { bold: false, italic: false };
    const slot = format.slots.find((item) => item.kind === "user" && item.userIndex === index);
    if (!slot || slot.kind !== "user") return { bold: false, italic: false };
    return { bold: Boolean(slot.bold), italic: Boolean(slot.italic) };
  }

  function lineEmphasis(style: PlaqueLineStyle, index: number): { bold: boolean; italic: boolean } {
    if (style.emphasisCustom || !attached) return { bold: style.bold, italic: style.italic };
    return slotEmphasis(index);
  }

  function toggleLineEmphasis(key: "bold" | "italic" | "underline") {
    const style = normalizeStyle(activeStyles?.[focusIndex]);
    if (key === "underline") {
      updateLine(focusIndex, { underline: !style.underline });
      return;
    }
    const effective = lineEmphasis(style, focusIndex);
    updateLine(focusIndex, {
      emphasisCustom: true,
      bold: key === "bold" ? !effective.bold : effective.bold,
      italic: key === "italic" ? !effective.italic : effective.italic,
    });
  }

  function applyLineStyleToAll() {
    const source = normalizeStyle(activeStyles?.[focusIndex]);
    const resolvedFont = source.fontFamily || fontFamily;
    const next = stylesFor(activeStyles, lineCount).map((style) => ({
      ...style,
      fontFamily: resolvedFont,
      sizeScale: source.sizeScale,
      underline: source.underline,
      ...(source.emphasisCustom
        ? { emphasisCustom: true, bold: source.bold, italic: source.italic }
        : {}),
    }));
    commitStyles(next);
  }

  function setActiveLineText(index: number, value: string) {
    const next = textToLines(textDraft, lineCount);
    next[index] = value.replace(/[\r\n]/g, "");
    setActiveText(linesToText(next));
  }

  function applyFormatToAll() {
    if (bulkRows.length === 0) return;
    const styles = cloneStyles(bulkRows[selectedBulkRow]?.lineStyles ?? lineStyles);
    setLineStyles(styles);
    setBulkRows((current) => current.map((row) => ({ ...row, lineStyles: cloneStyles(styles) })));
  }

  function setActiveText(value: string) {
    const draft = clampText(value, lineCount);
    setTextDraft(draft);
    const next = textToLines(draft, lineCount);
    if (bulkMode && bulkRows[selectedBulkRow]) {
      setBulkRows((rows) =>
        rows.map((row, index) => (index === selectedBulkRow ? { ...row, lines: next } : row)),
      );
      return;
    }
    setLines(next);
  }

  async function readImage(file: File): Promise<PlaqueImage> {
    const src = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read that image."));
      reader.onload = () => resolve(String(reader.result || ""));
      reader.readAsDataURL(file);
    });
    const measured = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = src;
    });
    imageFilesRef.current.set(src, file);
    return { src, fileName: file.name, width: measured.width, height: measured.height };
  }

  async function chooseSharedImage(file: File | undefined) {
    if (!file) return;
    try {
      setSharedImage(await readImage(file));
      setCartError("");
    } catch (error) {
      setCartError(error instanceof Error ? error.message : "Could not read that image.");
    }
  }

  async function chooseRowImage(file: File | undefined) {
    if (!file || !bulkRows[selectedBulkRow]) return;
    try {
      const image = await readImage(file);
      setBulkRows((rows) =>
        rows.map((row, index) => (index === selectedBulkRow ? { ...row, image } : row)),
      );
      setCartError("");
    } catch (error) {
      setCartError(error instanceof Error ? error.message : "Could not read that image.");
    }
  }

  function applyImageToAll() {
    const image = bulkRows[selectedBulkRow]?.image ?? sharedImage;
    if (!image) return;
    setSharedImage(image);
    setBulkRows((rows) => rows.map((row) => ({ ...row, image: undefined })));
  }

  function applyBulkCsv(csv: string) {
    setBulkError("");
    try {
      const result = parsePlaqueBulkCsv(csv, lineCount, labels);
      const seeded = result.rows.map((row) => ({
        ...row,
        lineStyles: cloneStyles(lineStyles.length === lineCount ? lineStyles : emptyStyles(lineCount)),
      }));
      setBulkMode(true);
      setBulkRows(seeded);
      setBulkCsvWarning(result.warning);
      setSelectedBulkRow(0);
      setTextDraft(linesToText(seeded[0]?.lines ?? []));
      setBulkPane("all");
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "The list could not be read.");
    }
  }

  async function importBulkCsv(file: File) {
    try {
      const text = await file.text();
      setBulkCsvText(text);
      applyBulkCsv(text);
    } catch {
      setBulkError("Could not read that file.");
    } finally {
      if (bulkCsvInputRef.current) bulkCsvInputRef.current.value = "";
    }
  }

  function downloadBulkCsvTemplate() {
    const url = URL.createObjectURL(
      new Blob([plaqueBulkCsvTemplate(labels)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "plaque-bulk-personalization.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function exitBulkMode() {
    setBulkMode(false);
    setBulkRows([]);
    setBulkCsvText("");
    setBulkCsvWarning("");
    setBulkError("");
    setBulkSearch("");
    setSelectedBulkRow(0);
    setBulkPane("add");
  }

  function selectBulkRow(index: number) {
    setSelectedBulkRow(index);
    const row = bulkRows[index];
    if (row) setTextDraft(linesToText(row.lines));
    if (row?.lineStyles) setLineStyles(cloneStyles(row.lineStyles));
  }

  function chooseBulkPlaque(index: number) {
    selectBulkRow(index);
    setBulkPane("edit");
    requestAnimationFrame(() => {
      document.querySelector(".md-bulk-one")?.scrollIntoView({ block: "nearest" });
    });
  }

  function stepBulkRow(delta: number) {
    const next = selectedBulkRow + delta;
    if (next < 0 || next >= bulkRows.length) return;
    selectBulkRow(next);
  }

  function updateBulkQuantity(rowIndex: number, raw: string) {
    const current = bulkRows[rowIndex];
    if (!current) return;
    const parsed = Math.round(Number(raw));
    let nextQuantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    const others = bulkRows.reduce((sum, row, index) => (index === rowIndex ? sum : sum + row.quantity), 0);
    const room = PLAQUE_MAX_QUANTITY - others;
    if (room < 1) {
      nextQuantity = current.quantity;
      setBulkCsvWarning(`Online pricing supports up to ${PLAQUE_MAX_QUANTITY} plaques.`);
    } else if (nextQuantity > room) {
      nextQuantity = room;
      setBulkCsvWarning(`Online pricing supports up to ${PLAQUE_MAX_QUANTITY} plaques.`);
    }
    setBulkRows((rows) => rows.map((row, index) => (index === rowIndex ? { ...row, quantity: nextQuantity } : row)));
  }

  function removeBulkRow(rowIndex: number) {
    const next = bulkRows.filter((_, index) => index !== rowIndex);
    let nextIndex = selectedBulkRow;
    if (next.length === 0) nextIndex = 0;
    else if (rowIndex < selectedBulkRow) nextIndex = selectedBulkRow - 1;
    else if (rowIndex === selectedBulkRow) nextIndex = Math.min(selectedBulkRow, next.length - 1);
    setBulkRows(next);
    setSelectedBulkRow(nextIndex);
    setTextDraft(linesToText(next[nextIndex]?.lines ?? []));
    if (next[nextIndex]?.lineStyles) setLineStyles(cloneStyles(next[nextIndex].lineStyles!));
    if (next.length === 0) setBulkPane("add");
  }

  function reset(options?: { keepAdded?: boolean }) {
    skipNextPersist.current = true;
    localStorage.removeItem(CACHE_KEY);
    designIdRef.current = newDesignId();
    allowUrlDefaults.current = false;
    setStep("layout");
    setVisited(["layout"]);
    setLayoutId("");
    setLayoutPane("layouts");
    setCatalogSlug("");
    setNeedsDesignChoice(false);
    setNeedsLayoutChoice(false);
    setSize(DEFAULT_PLAQUE_SIZE);
    setFormatId(DEFAULT_PLAQUE_ATTACHED_FORMAT_ID);
    setPlate(PLAQUE_DEFAULT_BRUSH_GOLD_HEX);
    setTextColor(DEFAULT_TEXT_COLOR);
    setFontFamily("Georgia");
    setLines(textToLines("", 4));
    setTextDraft("");
    setLineStyles(emptyStyles(4));
    setLineFocus(0);
    setWordingMode("all");
    setQuantity(1);
    setSharedImage(null);
    setPlacementChoice("top");
    setCartError("");
    setCartAdded(Boolean(options?.keepAdded));
    setProofOpen(false);
    setProofUrl(null);
    pendingOrderRef.current = null;
    exitBulkMode();
  }

  function orderRows(): Array<{ lines: string[]; styles: PlaqueLineStyle[]; quantity: number; image: PlaqueImage | null }> {
    const styles = lineStyles.length === lineCount ? lineStyles : emptyStyles(lineCount);
    if (bulkMode && bulkRows.length > 0) {
      return bulkRows.map((row) => ({
        lines: textToLines(linesToText(row.lines), lineCount),
        styles: row.lineStyles?.length ? row.lineStyles : styles,
        quantity: row.quantity,
        image: row.image === undefined ? sharedImage : row.image,
      }));
    }
    return [{ lines, styles, quantity, image: sharedImage }];
  }

  async function reviewProof() {
    if (!designReady) {
      setCartError(
        attached && !imageReady
          ? "Add an image, and enter line 1, before reviewing your preview."
          : "Enter line 1 before reviewing your preview.",
      );
      return;
    }
    setBusy(true);
    setCartError("");
    try {
      const designId = designIdRef.current;
      const rows = orderRows();
      const badges = rows.map((row, index) => badgeFor(row.lines, row.styles, row.image, `plaque-${index}`));
      const assets = await mapWithConcurrency(badges, 2, async (badge) => {
        const template = await loadTemplateById(badge.templateId || templateId, "plaque");
        const [dataUrl, svgBlob, printSvgBlob] = await Promise.all([
          generateFullBadgeImage(badge, "plaque", DRAFT_FULL_BADGE_IMAGE_OPTIONS),
          generateSVGAsBlob(badge, template, "plaque"),
          generatePrintSVGAsBlob(badge, template, "plaque"),
        ]);
        return { dataUrl, pngBlob: dataUrlToBlob(dataUrl), svgBlob, printSvgBlob };
      });
      const proofPdf = await generatePDFAsBlob(
        badges[0],
        undefined,
        [rows[0]?.quantity ?? 1],
        "Plaque",
        "plaque",
        { mockupDataUrls: [assets[0]?.dataUrl] },
      );
      const urlBySrc = new Map<string, string>();
      const uploadUrl = getDesignerLibraryApiPaths("plaque").uploadLogo;
      for (const badge of badges) {
        const src = badge.logo?.src ?? "";
        if (!src.startsWith("data:") || urlBySrc.has(src)) continue;
        const file = imageFilesRef.current.get(src);
        if (!file || !uploadUrl) continue;
        const body = new FormData();
        body.set("designId", designId);
        body.set("file", file);
        const uploaded = await fetch(uploadUrl, { method: "POST", body });
        const payload = (await uploaded.json().catch(() => ({}))) as { publicUrl?: string };
        if (uploaded.ok && payload.publicUrl) urlBySrc.set(src, payload.publicUrl);
      }
      const badgesForSave = badges.map((badge) => {
        const nextSrc = badge.logo?.src ? urlBySrc.get(badge.logo.src) : "";
        if (!nextSrc || !badge.logo) return badge;
        return { ...badge, logo: { ...badge.logo, src: nextSrc } };
      });
      const form = new FormData();
      form.append("designId", designId);
      form.append(
        "designData",
        JSON.stringify({
          designId,
          productId: readQueryParam("product") || templateId,
          shopId: readQueryParam("shop") || readQueryParam("storeUrl"),
          allBadges: badgesForSave,
          selectedPlaqueLayoutId: layoutId,
          selectedPlaqueSize: size,
          ...(selectedCatalogDesign
            ? {
                plaqueCatalogSlug: selectedCatalogDesign.slug,
                plaqueCatalogSchemaVersion: selectedCatalogDesign.schemaVersion,
                plaqueFormatSnapshot: selectedCatalogDesign.format,
              }
            : {}),
          isQaTest: readQueryParam("qaTest") === "1" || undefined,
        }),
      );
      const customerId = readQueryParam("customerId");
      if (customerId) form.append("shopifyCustomerId", customerId);
      if (readQueryParam("qaTest") === "1") form.append("isQaTest", "1");
      assets.forEach((asset, index) => {
        form.append(`svg_${index}`, asset.svgBlob, `plaque-${index}-design.svg`);
        form.append(`print_svg_${index}`, asset.printSvgBlob, `plaque-${index}-print.svg`);
        form.append(`thumbnail_png_${index}`, asset.pngBlob, `plaque-${index}-thumbnail.jpg`);
      });
      const sharedFile = sharedImage ? imageFilesRef.current.get(sharedImage.src) : undefined;
      if (sharedFile) form.append("logo_0", sharedFile, sharedFile.name);
      const response = await fetch(getDesignerApiPaths("plaque").saveDraft, { method: "POST", body: form });
      if (!response.ok) throw new Error(`Could not save the plaque draft. ${await response.text()}`);
      pendingOrderRef.current = {
        designId,
        pdf: proofPdf,
        badges: badgesForSave,
        quantities: rows.map((row) => row.quantity),
        unitPrice,
        layoutLabel,
        sizeLabel,
        plateName,
        formatName: attached && format ? format.name : "",
        catalogSlug: selectedCatalogDesign?.slug ?? "",
        catalogSchemaVersion: selectedCatalogDesign?.schemaVersion ?? 0,
        formatSnapshot: selectedCatalogDesign?.format ?? null,
      };
      if (proofUrl) URL.revokeObjectURL(proofUrl);
      setProofUrl(URL.createObjectURL(proofPdf));
      setProofOpen(true);
    } catch (error) {
      setCartError(error instanceof Error ? error.message : "Could not build your preview.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmAddToCart() {
    const pending = pendingOrderRef.current;
    if (!pending) return;
    const variantId = priced?.variantId || readQueryParam("variantIdSign") || readQueryParam("variantId");
    if (!variantId) {
      setCartError("Open this designer from a plaque product page so it can add to cart.");
      return;
    }
    setBusy(true);
    setCartError("");
    try {
      const finalize = new FormData();
      finalize.append("designId", pending.designId);
      finalize.append("designer", "plaque");
      finalize.append("pdf", pending.pdf, "plaque-design_proof.pdf");
      const response = await fetch("/api/finalize-draft", { method: "POST", body: finalize });
      const finalized = await response.json().catch(() => ({}));
      if (!response.ok || finalized.success === false) {
        throw new Error(finalized.error || "Could not finalize the plaque preview.");
      }
      const definition = getDesignerConfig("plaque");
      const cartLines = pending.badges.map((badge, index) => ({
        variantId,
        quantity: pending.quantities[index] ?? 1,
        properties: buildDesignerCartLineProperties({
          designerId: "plaque",
          designId: pending.designId,
          lineIndex: index,
          indexPropertyPrimary: definition.cartIndexPropertyPrimary,
          indexPropertyFallbacks: definition.cartIndexPropertyFallbacks,
          lines: badge.lines,
          backgroundColor: badge.backgroundColor,
          linePrice: pending.unitPrice.toFixed(2),
          thumbnailUrl: finalized.thumbnailUrls?.[index] ?? "",
          pdfUrl: finalized.pdfUrl ?? "",
          orderQuantity: pending.quantities[index] ?? 1,
          uploadedLogo: badge.logo?.fileName || null,
          extraHidden: {
            ...buildProductionLineProperties("Plaque", badge.lines, { includeText: true }),
            "_Plaque Layout": pending.layoutLabel,
            "_Plaque Size": pending.sizeLabel,
            "_Plate Finish": pending.plateName,
            "_Text Color": textColor,
            ...(pending.formatName ? { "_Award Format": pending.formatName } : {}),
            ...(pending.catalogSlug ? { "_Plaque Design": pending.catalogSlug } : {}),
          },
        }),
      }));
      const result = await apiRef.current.addToCartMultiple(cartLines);
      if (!result.success) throw new Error(result.message || "Could not add the plaque to cart.");
      reset({ keepAdded: true });
    } catch (error) {
      setCartError(error instanceof Error ? error.message : "Could not add to cart.");
    } finally {
      setBusy(false);
    }
  }

  const imageCopy = isPlaqueDetachedLayoutId(layoutId)
    ? "The framed opening is for a printed photo. An icon on the metal plate is optional — choose left or right if you add one."
    : selectedCatalogDesign
      ? "Add the logo that sits above the wording. PNG, JPEG, WebP, or GIF."
      : "Your image sits on the metal plate above the text. PNG, JPEG, WebP, or GIF.";

  const wordingEditor = (
    <div className="pd-wording">
      <div className="pd-wording-switch" role="tablist" aria-label="How to edit the wording">
        <button type="button" role="tab" aria-selected={wordingMode === "all"} className={wordingMode === "all" ? "is-on" : ""} onClick={() => setWordingMode("all")}>
          Edit all
        </button>
        <button type="button" role="tab" aria-selected={wordingMode === "line"} className={wordingMode === "line" ? "is-on" : ""} onClick={() => setWordingMode("line")}>
          Edit line by line
        </button>
      </div>
      {wordingMode === "line" ? (
        <div className="pd-line-editor">
          <div className="pd-line-picks" role="tablist" aria-label="Line to edit">
            {labels.map((label, index) => (
              <button
                type="button"
                key={`${label}-${index}`}
                role="tab"
                aria-selected={focusIndex === index}
                className={focusIndex === index ? "is-on" : ""}
                title={activeLines[index]?.trim() || placeholders[index] || label}
                onClick={() => setLineFocus(index)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="md-text-label" htmlFor="pd-line-text">
            {labels[focusIndex] ?? "Line"}
            <input
              id="pd-line-text"
              className="gf-input"
              value={activeLines[focusIndex] ?? ""}
              placeholder={placeholders[focusIndex] || ""}
              onChange={(event) => setActiveLineText(focusIndex, event.target.value)}
            />
          </label>
          <div className="md-format-row">
            <label>
              Font
              <select
                className="gf-input"
                aria-label={`Font for ${labels[focusIndex] ?? "this line"}`}
                value={focusFont}
                onChange={(event) => updateLine(focusIndex, { fontFamily: event.target.value })}
              >
                {FONT_OPTIONS.map((font) => <option key={font}>{font}</option>)}
              </select>
            </label>
            <div className="pd-size-field">
              <span className="pd-field-label" id="pd-size-label">Size</span>
              <div className="pd-size-stepper" role="group" aria-labelledby="pd-size-label">
                <button
                  type="button"
                  aria-label={`Smaller text for ${labels[focusIndex] ?? "this line"}`}
                  disabled={focusSizeIndex <= 0}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => updateLine(focusIndex, { sizeScale: SIZE_STEPS[focusSizeIndex - 1] })}
                >
                  −
                </button>
                <span>{Math.round(focusStyle.sizeScale * 100)}%</span>
                <button
                  type="button"
                  aria-label={`Larger text for ${labels[focusIndex] ?? "this line"}`}
                  disabled={focusSizeIndex >= SIZE_STEPS.length - 1}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => updateLine(focusIndex, { sizeScale: SIZE_STEPS[focusSizeIndex + 1] })}
                >
                  +
                </button>
              </div>
            </div>
            <PlaqueFormatButtons
              style={{ ...focusStyle, bold: focusEmphasis.bold, italic: focusEmphasis.italic }}
              onToggle={toggleLineEmphasis}
            />
          </div>
          <button type="button" className="gf-csv-link pd-line-apply" onClick={applyLineStyleToAll}>
            Use this font and size on every line
          </button>
          {attached ? <p className="gf-note">Dividers stay with the award format.</p> : null}
        </div>
      ) : (
        <>
          <label className="md-text-label" htmlFor="pd-wording">Custom text</label>
          <textarea
            id="pd-wording"
            className="gf-input md-wording"
            rows={Math.min(lineCount, 6)}
            value={textDraft}
            placeholder={placeholders.filter(Boolean).join("\n")}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              const newlines = event.currentTarget.value.split("\n").length - 1;
              if (newlines >= lineCount - 1) event.preventDefault();
            }}
            onChange={(event) => setActiveText(event.target.value)}
          />
          <p className="gf-note">
            Press Enter for a new line. Up to {lineCount} lines.
            {attached ? ` ${labels.map((label, index) => `Line ${index + 1} is ${label}`).join(". ")}.` : ""}
          </p>
        </>
      )}
    </div>
  );

  return (
    <div className="gf-designer-root gf-wizard-root md-designer pd-designer is-preview-step">
      <div className="gf-page-title">
        <p className="gf-eyebrow">Personalization tool</p>
        <h1 className="gf-page-h1">Customize your plaque</h1>
      </div>
      <div className="gf-hero">
        <div className="gf-stepper">
          {steps.map((id, index) => {
            const state = step === id ? "active" : index < stepIndex ? "done" : "todo";
            const reachable = visited.includes(id);
            return (
              <div className="gf-stepper-step" key={id}>
                {index > 0 ? <span className={`gf-stepper-line ${index <= stepIndex ? "is-done" : ""}`} /> : null}
                <button
                  type="button"
                  className={`gf-stepper-circle is-${state}`}
                  disabled={!reachable}
                  onClick={() => reachable && goToStep(id)}
                  aria-current={step === id ? "step" : undefined}
                >
                  {index < stepIndex ? "✓" : index + 1}
                </button>
                <small className={step === id ? "is-active" : ""}>{STEP_LABELS[id]}</small>
              </div>
            );
          })}
        </div>
        <div className="gf-stepper-compact">
          <p className="gf-stepper-compact-label">
            {`Step ${stepIndex + 1} of ${steps.length} — ${STEP_LABELS[steps[stepIndex] ?? "layout"]}`}
          </p>
          <div className="gf-stepper-compact-rule">
            <span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
          </div>
        </div>
        <div className="gf-panel">
          <p className="gf-panel-title">{panel.title}</p>
          <div className="gf-panel-lead">
            <p className="gf-panel-sub gf-panel-sub-lead">{panel.sub}</p>
            <p className="gf-preview-label">Live preview</p>
          </div>
          <div className="gf-design-grid">
            <div className="gf-controls-col">
              {step === "layout" && layoutPane === "designs" ? (
                <div className="md-product-grid pd-layout-grid pd-design-grid">
                  {attachedCatalogDesigns.map((design) => {
                    const photo =
                      design.slug === "your-award"
                        ? { imageUrl: YOUR_AWARD_FRAME["black-white"] }
                        : plaqueCatalogVariantForPlate(design, "black-white") ??
                          representativePlaqueCatalogVariant(design);
                    return (
                      <button
                        type="button"
                        key={design.slug}
                        className={`gf-toggle-card ${catalogSlug === design.slug ? "is-selected" : ""}`}
                        onClick={() => selectCatalogDesign(design)}
                      >
                        <span className="pd-choice-art pd-plate-frame">
                          {photo ? (
                            <span className="pd-plate-photo">
                              <img src={photo.imageUrl} alt="" />
                            </span>
                          ) : null}
                        </span>
                        <span className="gf-toggle-label">{design.name}</span>
                        <span className="gf-toggle-sub">{design.description}</span>
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    className={`gf-toggle-card ${customPlate ? "is-selected" : ""}`}
                    onClick={selectCustomPlate}
                  >
                    <span className="pd-choice-art pd-plate-frame">
                      <span className="pd-plate-photo">
                        <img src={blankPlaquePlateImage("black-white")} alt="" />
                      </span>
                    </span>
                    <span className="gf-toggle-label">Make your own</span>
                    <span className="gf-toggle-sub">A blank plate for your own image and wording.</span>
                  </button>
                  {needsDesignChoice ? <p className="md-help">Choose a design to continue.</p> : null}
                </div>
              ) : null}
              {step === "layout" && layoutPane === "layouts" ? (
                <div className="md-product-grid pd-layout-grid">
                  {layoutPreviews.map(({ option, badge }) => {
                    const attachedCard = option.id === "plaque-attached";
                    return (
                      <button
                        type="button"
                        key={option.id}
                        className={`gf-toggle-card ${layoutId === option.id ? "is-selected" : ""}`}
                        onClick={() => attachedCard ? openAttachedDesigns() : selectLayout(option.id)}
                      >
                        {attachedCard && attachedPlatePhoto ? (
                          <span className="pd-choice-art pd-plate-frame">
                            <span className="pd-plate-photo">
                              <img src={attachedPlatePhoto.imageUrl} alt="" />
                            </span>
                          </span>
                        ) : photoPlaqueFrame(option.id) === "portrait" ? (
                          <span className="pd-choice-art pd-plate-frame">
                            <span className="pd-plate-photo">
                              <img src="/images/plaque/photo/portrait-card.jpg" alt="" />
                            </span>
                          </span>
                        ) : photoPlaqueFrame(option.id) === "landscape" ? (
                          <span className="pd-choice-art pd-plate-frame">
                            <span className="pd-plate-photo">
                              <img src="/images/plaque/photo/landscape-card.jpg" alt="" />
                            </span>
                          </span>
                        ) : badge ? <PlaqueArt badge={badge} frame="choice" /> : null}
                        <span className="gf-toggle-label">{LAYOUT_COPY[option.id]?.title ?? option.name}</span>
                        <span className="gf-toggle-sub">{LAYOUT_COPY[option.id]?.detail ?? option.description}</span>
                      </button>
                    );
                  })}
                  {needsLayoutChoice ? <p className="md-help">Choose a layout to continue.</p> : null}
                </div>
              ) : null}
              {step === "size" ? (
                <div className="pd-size-grid">
                  {getPlaqueSizeStepOptionsForLayout(layoutId).map((option) => {
                    const display = getPlaqueSizeStepDisplay(layoutId, option.value);
                    return (
                      <button
                        type="button"
                        key={option.value}
                        className={`gf-toggle-card pd-size-card ${size === option.value ? "is-selected" : ""}`}
                        onClick={() => selectSize(option.value)}
                      >
                        <span className="gf-toggle-label">{display.primaryLine}</span>
                        {display.detailLines.map((line) => (
                          <span className="gf-toggle-sub" key={line}>{line}</span>
                        ))}
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {step === "format" ? (
                <>
                  <div className="md-product-grid pd-format-grid">
                    {formatPreviews.map(({ item }) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`gf-toggle-card ${formatId === item.id ? "is-selected" : ""}`}
                        onClick={() => selectFormat(item.id)}
                      >
                        <span className="pd-choice-art pd-real-plate">
                          <span className="pd-real-plate-frame">
                          <img src={blankPlaquePlateImage(stagePlate) ?? blankPlaquePlateImage("gold")} alt="" />
                          <span className="pd-photo-plate">
                            <span className="pd-photo-lines" style={{ color: textColor, fontFamily }}>
                              {formatEngraving(item, [], true).map((row, index) => (
                                <p
                                  key={`${row.text}-${index}`}
                                  style={{
                                    fontWeight: row.bold ? 700 : 400,
                                    fontStyle: row.italic ? "italic" : "normal",
                                  }}
                                >
                                  {row.text}
                                </p>
                              ))}
                            </span>
                          </span>
                          </span>
                        </span>
                        <span className="gf-toggle-label">{item.name}</span>
                      </button>
                    ))}
                  </div>
                  {plaqueAwardFormatsPickerHasExtras() ? (
                    <button type="button" className="gf-csv-link" onClick={() => setFormatsExpanded((value) => !value)}>
                      {formatsExpanded ? "Fewer award formats" : "More award formats"}
                    </button>
                  ) : null}
                </>
              ) : null}
              {step === "metal" ? (
                <div className="md-product-grid pd-finish-grid">
                  {PLATE_FINISHES.map((finish) => {
                    const src = plateFinishImage(finish.value);
                    return (
                      <button
                        type="button"
                        key={finish.value}
                        className={`gf-toggle-card ${plate.toLowerCase() === finish.value.toLowerCase() ? "is-selected" : ""}`}
                        onClick={() => applyPlate(finish.value)}
                      >
                        <span className="pd-choice-art pd-plate-frame">
                          {src ? (
                            <span className="pd-plate-photo">
                              <img src={src} alt="" />
                            </span>
                          ) : null}
                        </span>
                        <span className="gf-toggle-label">{finish.name}</span>
                        <span className="gf-toggle-sub">{finish.detail}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {step === "design" ? (
                <>
                  <div className="pd-text-color">
                    <span className="pd-text-color-label" id="pd-text-color-label">Text color</span>
                    <div className="pd-text-swatches" role="group" aria-labelledby="pd-text-color-label">
                      {PLAQUE_TEXT_COLORS.map((color) => (
                        <button
                          type="button"
                          key={color.value}
                          className={`pd-text-swatch${textColor.toLowerCase() === color.value.toLowerCase() ? " is-selected" : ""}${color.value === "#FFFFFF" ? " is-light" : ""}`}
                          style={{ background: color.value }}
                          aria-label={color.name}
                          aria-pressed={textColor.toLowerCase() === color.value.toLowerCase()}
                          onClick={() => setTextColor(color.value)}
                        />
                      ))}
                    </div>
                  </div>
                  {bulkMode ? (
                    <>
                      <div className="md-bulk-switch" role="tablist" aria-label="Bulk order">
                        <button type="button" role="tab" aria-selected={bulkPane === "edit"} className={bulkPane === "edit" ? "is-on" : ""} disabled={bulkRows.length === 0} onClick={() => setBulkPane("edit")}>
                          This plaque
                        </button>
                        <button type="button" role="tab" aria-selected={bulkPane === "all"} className={bulkPane === "all" ? "is-on" : ""} disabled={bulkRows.length === 0} onClick={() => setBulkPane("all")}>
                          View all
                        </button>
                        <button type="button" role="tab" aria-selected={bulkPane === "add"} className={bulkPane === "add" ? "is-on" : ""} onClick={() => setBulkPane("add")}>
                          Add names
                        </button>
                      </div>
                      {bulkRows.length === 0 || bulkPane === "add" ? (
                        <div className="gf-bulk-paste">
                          <label className="gf-bulk-paste-label" htmlFor="pd-bulk-paste">Paste names</label>
                          <p className="gf-note">
                            {bulkRows.length > 0
                              ? "One plaque per line, with a bar between the lines of text. Applying this replaces the current list. The image above stays on every plaque."
                              : "One plaque per line. Separate the lines of text with a bar, so a comma in a name stays put."}
                          </p>
                          <p className="gf-bulk-paste-example">
                            {pasteExamples.map((row) => <span key={row}>{row}</span>)}
                          </p>
                          <textarea
                            id="pd-bulk-paste"
                            className="gf-bulk-paste-input"
                            rows={4}
                            spellCheck={false}
                            placeholder={pasteExamples.join("\n")}
                            value={bulkCsvText}
                            onChange={(event) => {
                              setBulkCsvText(event.target.value);
                              setBulkError("");
                            }}
                          />
                          {bulkPastePreview?.error || bulkError ? <p className="gf-bulk-paste-error">{bulkError || bulkPastePreview?.error}</p> : null}
                          {bulkPastePreview?.warning ? <p className="gf-bulk-paste-warning">{bulkPastePreview.warning}</p> : null}
                          {bulkCsvWarning ? <p className="gf-bulk-paste-warning">{bulkCsvWarning}</p> : null}
                          <div className="gf-bulk-paste-foot">
                            <span className="gf-note">
                              {bulkPastePreview && !bulkPastePreview.error
                                ? `${bulkPastePreview.rows.length} design${bulkPastePreview.rows.length === 1 ? "" : "s"} ready`
                                : `Up to ${PLAQUE_MAX_QUANTITY} total plaques.`}
                            </span>
                            <button
                              type="button"
                              className="gf-nav-primary"
                              disabled={!bulkPastePreview || Boolean(bulkPastePreview.error) || bulkPastePreview.rows.length === 0}
                              onClick={() => applyBulkCsv(bulkCsvText)}
                            >
                              Apply this list
                            </button>
                          </div>
                          <div className="md-bulk-links">
                            <button type="button" className="gf-csv-link" onClick={downloadBulkCsvTemplate}>Download template</button>
                            <button type="button" className="gf-csv-link" onClick={() => bulkCsvInputRef.current?.click()}>Upload CSV</button>
                            <button type="button" className="gf-csv-link" onClick={() => { setTextDraft(linesToText(lines)); exitBulkMode(); }}>
                              Use one design
                            </button>
                            <input
                              ref={bulkCsvInputRef}
                              type="file"
                              accept=".csv,text/csv"
                              className="gf-visually-hidden"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                if (file) void importBulkCsv(file);
                              }}
                            />
                          </div>
                        </div>
                      ) : bulkPane === "all" ? (
                        <div className="md-medal-grid-wrap">
                          {bulkRows.length > 4 ? (
                            <label className="md-medal-search">
                              <span className="gf-visually-hidden">Search plaques</span>
                              <input type="search" className="gf-input" placeholder="Search plaques" value={bulkSearch} onChange={(event) => setBulkSearch(event.target.value)} />
                            </label>
                          ) : null}
                          <div className="md-medal-grid" aria-label="All plaques">
                            {visibleBulkRows.map(({ row, index }) => {
                              const title = row.lines.find((line) => line.trim()) || "No text yet";
                              const detail = row.lines.slice(1).map((line) => line.trim()).filter(Boolean).join(" · ");
                              const cardBadge = badgeFor(
                                row.lines,
                                row.lineStyles ?? lineStyles,
                                row.image === undefined ? sharedImage : row.image,
                                row.id,
                              );
                              return (
                                <button
                                  key={row.id}
                                  type="button"
                                  className={`md-medal-card${selectedBulkRow === index ? " is-selected" : ""}${row.lines[0]?.trim() ? "" : " is-empty"}`}
                                  aria-label={`Edit plaque ${index + 1}, ${title}, quantity ${row.quantity}`}
                                  onClick={() => chooseBulkPlaque(index)}
                                >
                                  <PlaqueArt badge={cardBadge} frame="card" />
                                  <span className="md-medal-card-meta">
                                    <span>Plaque {index + 1}</span>
                                    <span className="md-medal-card-qty">Qty {row.quantity}</span>
                                  </span>
                                  <span className="md-medal-card-name">{title}</span>
                                  {detail ? <span className="md-medal-card-detail">{detail}</span> : null}
                                  {row.lines[0]?.trim() ? null : <span className="md-medal-card-flag">Needs line 1</span>}
                                </button>
                              );
                            })}
                          </div>
                          {visibleBulkRows.length === 0 ? <p className="gf-note">No plaques match that search.</p> : null}
                        </div>
                      ) : bulkRows[selectedBulkRow] ? (
                        <div className="md-bulk-one">
                          <div className="md-bulk-one-nav">
                            <button type="button" className="gf-csv-link" disabled={selectedBulkRow <= 0} onClick={() => stepBulkRow(-1)}>Previous</button>
                            <strong>Plaque {selectedBulkRow + 1} of {bulkRows.length}</strong>
                            <button type="button" className="gf-csv-link" disabled={selectedBulkRow >= bulkRows.length - 1} onClick={() => stepBulkRow(1)}>Next</button>
                          </div>
                          {wordingEditor}
                          {showImageUpload ? <div className="pd-image-actions">
                            <button type="button" className="gf-csv-link" onClick={() => rowImageInputRef.current?.click()}>
                              {bulkRows[selectedBulkRow].image ? "Replace this plaque's image" : "Different image for this plaque"}
                            </button>
                            {bulkRows[selectedBulkRow].image ? (
                              <button
                                type="button"
                                className="gf-csv-link"
                                onClick={() => setBulkRows((rows) => rows.map((row, index) => index === selectedBulkRow ? { ...row, image: undefined } : row))}
                              >
                                Use the shared image
                              </button>
                            ) : null}
                            {bulkRows[selectedBulkRow].image || sharedImage ? (
                              <button type="button" className="gf-csv-link" onClick={applyImageToAll}>Use this image on all</button>
                            ) : null}
                            <input
                              ref={rowImageInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                              className="gf-visually-hidden"
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = "";
                                void chooseRowImage(file);
                              }}
                            />
                          </div> : null}
                          <div className="md-copy-row">
                            <span>Quantity</span>
                            <div className="md-copy-stepper">
                              <button type="button" aria-label="Decrease quantity" onClick={() => updateBulkQuantity(selectedBulkRow, String(bulkRows[selectedBulkRow].quantity - 1))}>−</button>
                              <input type="number" min={1} max={PLAQUE_MAX_QUANTITY} aria-label="Quantity for this plaque" value={bulkRows[selectedBulkRow].quantity} onChange={(event) => updateBulkQuantity(selectedBulkRow, event.target.value)} />
                              <button type="button" aria-label="Increase quantity" onClick={() => updateBulkQuantity(selectedBulkRow, String(bulkRows[selectedBulkRow].quantity + 1))}>+</button>
                            </div>
                          </div>
                          {bulkCsvWarning ? <p className="gf-bulk-paste-warning">{bulkCsvWarning}</p> : null}
                          <div className="md-bulk-links">
                            <button type="button" className="gf-csv-link" onClick={() => removeBulkRow(selectedBulkRow)}>Remove this plaque</button>
                            {!attached && bulkRows.length > 1 ? (
                              <button type="button" className="gf-csv-link" onClick={applyFormatToAll}>Use this style on all</button>
                            ) : null}
                          </div>
                          {!designReady ? <p className="md-help">Every plaque needs a first line{imageRequired ? " and an image" : ""} before adding to cart.</p> : null}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {wordingEditor}
                      {!textReady ? <p className="md-help">Enter line 1 before adding to cart.</p> : null}
                    </>
                  )}
                  {showImageUpload ? (
                    <div className="pd-image-block">
                      <p className="md-text-label">Image</p>
                      <p className="gf-note">{imageCopy}</p>
                      <div className="pd-image-actions">
                        {sharedImage ? <img className="pd-image-thumb" src={sharedImage.src} alt="" /> : null}
                        <button type="button" className="gf-nav-secondary" onClick={() => sharedImageInputRef.current?.click()}>
                          {sharedImage ? "Replace image" : "Choose image"}
                        </button>
                        {sharedImage ? (
                          <button type="button" className="gf-csv-link" onClick={() => setSharedImage(null)}>
                            Remove image
                          </button>
                        ) : null}
                        <input
                          ref={sharedImageInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                          className="gf-visually-hidden"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            void chooseSharedImage(file);
                          }}
                        />
                      </div>
                      {sharedImage && placementOptions.length > 1 ? (
                        <div className="pd-placement" role="group" aria-label="Image placement">
                          {placementOptions.map((option) => (
                            <button
                              type="button"
                              key={option}
                              className={`gf-nav-secondary ${placement === option ? "is-selected" : ""}`}
                              onClick={() => setPlacementChoice(option)}
                            >
                              {PLACEMENT_LABEL[option]}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {imageRequired && !imageReady ? <p className="md-help">Add an image before adding to cart.</p> : null}
                    </div>
                  ) : null}
                  {!bulkMode ? (
                    <>
                      <div className="md-quantity-card">
                        <p className="gf-sub-title">How many of this plaque?</p>
                        <div className="md-quantity-control">
                          <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
                          <input
                            type="number"
                            min={1}
                            max={PLAQUE_MAX_QUANTITY}
                            value={quantity}
                            aria-label="Plaque quantity"
                            onChange={(event) => setQuantity(Math.max(1, Math.min(PLAQUE_MAX_QUANTITY, Number(event.target.value) || 1)))}
                          />
                          <button type="button" onClick={() => setQuantity((value) => Math.min(PLAQUE_MAX_QUANTITY, value + 1))}>+</button>
                        </div>
                        <div className="md-price-summary">
                          <span>${price.perUnit.toFixed(2)} each</span>
                          <strong>${price.total.toFixed(2)} total</strong>
                        </div>
                      </div>
                      <div className="md-group-order">
                        <p className="md-group-order-title">Ordering for a group?</p>
                        <button type="button" className="gf-nav-primary" onClick={() => { setBulkMode(true); setBulkPane("add"); }}>
                          Bulk Order
                        </button>
                      </div>
                    </>
                  ) : null}
                </>
              ) : null}
              {step === "design" && bulkMode && bulkRows.length > 0 ? (
                <div className="md-price-summary md-bulk-total">
                  <span>{bulkQuantity} plaques · ${price.perUnit.toFixed(2)} each</span>
                  <strong>${price.total.toFixed(2)} total</strong>
                </div>
              ) : null}
              {cartAdded ? <p className="gf-note">Added to your cart. This designer is ready for a new plaque.</p> : null}
              {cartError && !proofOpen ? <p className="gf-note" role="alert">{cartError}</p> : null}
              <div className="gf-step-nav">
                <div className="md-nav-secondary">
                  {stepIndex > 0 || (step === "layout" && layoutPane === "designs") ? <button type="button" className="gf-nav-secondary" onClick={goBack}>Back</button> : null}
                  <button type="button" className="gf-nav-secondary" onClick={() => window.confirm("Reset this plaque design?") && reset()}>Reset design</button>
                </div>
                {step !== "design" ? (
                  <button type="button" className="gf-nav-primary" onClick={goForward}>Continue</button>
                ) : (
                  <button type="button" className="gf-nav-primary" disabled={busy || !designReady} onClick={() => void reviewProof()}>
                    {busy ? "Preparing preview…" : "Add to cart"}
                  </button>
                )}
              </div>
            </div>
            <div className="gf-preview-pane">
              <div className="md-preview-stage">
                {stagePhoto ? (
                  <PlaquePhotoStage
                    src={stagePhoto}
                    lines={
                      photoFrame
                        ? activeLines.some((line) => line.trim())
                          ? activeLines
                          : placeholders
                        : customPlate
                          ? formatEngraving(format, activeLines, !activeLines.some((line) => line.trim())).map((row) => row.text)
                          : activeLines
                    }
                    styles={
                      photoFrame
                        ? activeLines.some((line) => line.trim())
                          ? stylesFor(activeStyles, lineCount)
                          : emptyStyles(lineCount)
                        : customPlate
                          ? engravingStyles(
                              formatEngraving(format, activeLines, !activeLines.some((line) => line.trim())),
                              activeStyles,
                            )
                          : stylesFor(activeStyles, lineCount)
                    }
                    image={showImageUpload ? activeImage : null}
                    ink={stageInk}
                    fontFamily={fontFamily}
                    catalog={Boolean(selectedCatalogDesign)}
                    catalogLayout={selectedCatalogDesign ? catalogLinePlan(format, activeLines) : null}
                    photo={photoFrame ?? undefined}
                  />
                ) : layoutId ? (
                  <PlaqueArt badge={previewBadge} frame="stage" />
                ) : (
                  <div className="pd-preview-frame pd-photo-empty">
                    <p>Choose a layout to see your plaque.</p>
                  </div>
                )}
              </div>
              <p className="md-preview-caption">Preview is an approximation. Final placement may vary slightly.</p>
            </div>
          </div>
        </div>
      </div>
      {proofOpen && proofUrl ? (
        <div className="gf-modal-backdrop" role="dialog" aria-modal="true">
          <div className="gf-modal md-proof-modal">
            <h2 className="gf-modal-title">Your plaque preview</h2>
            <div className="md-proof-body">
              <p className="gf-muted">
                Check the artwork, then approve it to add this{" "}
                {bulkMode && bulkRows.length > 0 ? `${bulkRows.length}-design bulk order` : "plaque"} to your cart.
                {bulkMode && bulkRows.length > 1
                  ? " The preview shows the first plaque. Every plaque is added with its own text."
                  : ""}
              </p>
              <ProofPdfViewer url={proofUrl} title="Plaque preview" loadingLabel="Loading preview..." failureLabel="Could not render the preview." />
              {cartError ? <div className="gf-error">{cartError}</div> : null}
            </div>
            <div className="gf-modal-actions">
              <button type="button" className="gf-btn-secondary" onClick={() => setProofOpen(false)} disabled={busy}>Edit design</button>
              <button type="button" className="gf-btn-primary" onClick={() => void confirmAddToCart()} disabled={busy}>{busy ? "Adding…" : "Approve and add to cart"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
