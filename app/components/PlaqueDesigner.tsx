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
} from "~/utils/plaqueAwardFormatPreview";
import { PLAQUE_DEFAULT_BRUSH_GOLD_HEX } from "~/utils/plaqueRender";
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
};

const DETACHED_LINE_COUNT = 6;
const FONT_OPTIONS = ["Georgia", "Times New Roman", "Arial", "Montserrat", "Open Sans"];
const CACHE_KEY = "plaque-designer-wizard-v1";
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
  { value: PLAQUE_DEFAULT_BRUSH_GOLD_HEX, name: "Brushed Gold" },
  { value: FEATURED_BRUSHED_SILVER_HEX, name: "Brushed Silver" },
  { value: "#FFFFFF", name: "White" },
  { value: "#000000", name: "Black" },
  { value: "#0000FF", name: "Blue" },
  { value: "#FF0000", name: "Red" },
] as const;
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
  metal: "Metal",
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
    sub: "This is the metal color behind your text. Photo-plaque frames use the same metal.",
  },
  design: {
    title: "Add your image and text",
    sub: "Upload an image where the layout has room for one, then add the wording.",
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

function emptyStyles(count: number): PlaqueLineStyle[] {
  return Array.from({ length: count }, () => ({ bold: false, italic: false, underline: false }));
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

function colorInputValue(hex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : PLAQUE_DEFAULT_BRUSH_GOLD_HEX;
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

function PlaqueArt({ badge, frame }: { badge: Badge; frame: "choice" | "card" | "stage" }) {
  const templateId = badge.templateId || defaultPlaqueTemplateId();
  return (
    <div className={frame === "stage" ? "pd-preview-frame" : frame === "card" ? "pd-card-art" : "pd-choice-art"}>
      <BadgeSvgRenderer variant="plaque" badge={badge} templateId={templateId} height="100%" />
    </div>
  );
}

export default function PlaqueDesigner() {
  const [step, setStep] = useState<StepId>("layout");
  const [visited, setVisited] = useState<StepId[]>(["layout"]);
  const [layoutId, setLayoutId] = useState(DEFAULT_PLAQUE_LAYOUT_ID);
  const [size, setSize] = useState<PlaqueSizeKey>(DEFAULT_PLAQUE_SIZE);
  const [formatId, setFormatId] = useState(DEFAULT_PLAQUE_ATTACHED_FORMAT_ID);
  const [plate, setPlate] = useState(PLAQUE_DEFAULT_BRUSH_GOLD_HEX);
  const [fontFamily, setFontFamily] = useState("Georgia");
  const [lines, setLines] = useState<string[]>(() => textToLines("", 4));
  const [textDraft, setTextDraft] = useState("");
  const [lineStyles, setLineStyles] = useState<PlaqueLineStyle[]>(() => emptyStyles(4));
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
  const format = getPlaqueAwardFormatById(formatId) ?? getPlaqueAwardFormatById(DEFAULT_PLAQUE_ATTACHED_FORMAT_ID);
  const lineCount = attached && format ? Math.max(1, plaqueAwardFormatUserLineCount(format)) : DETACHED_LINE_COUNT;
  const steps = useMemo<StepId[]>(
    () =>
      attached
        ? ["layout", "size", "format", "metal", "design"]
        : ["layout", "size", "metal", "design"],
    [attached],
  );
  const stepIndex = Math.max(0, steps.indexOf(step));
  const templateId = buildPlaqueTemplateId(layoutId, normalizePlaqueSizeForLayout(layoutId, size));
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
  const activeImage =
    bulkMode && bulkRows[selectedBulkRow]?.image !== undefined
      ? bulkRows[selectedBulkRow].image
      : sharedImage;
  const imageReady = !attached || (
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
  const plateName = PLATE_FINISHES.find((finish) => finish.value.toLowerCase() === plate.toLowerCase())?.name ?? plate;
  const layoutLabel = LAYOUT_COPY[layoutId]?.title ?? layoutId;
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
    const ink = inkForPlate(plate);
    const shown = texts.some((line) => line.trim())
      ? texts
      : attached
        ? texts
        : placeholders.map((placeholder) => placeholder || "");
    const badgeLines: BadgeLine[] = shown.slice(0, lineCount).map((text, index) => ({
      id: `line-${index + 1}`,
      text,
      xNorm: 0.5,
      yNorm: 0.5,
      sizeNorm: 0.22,
      align: "center",
      color: ink,
      fontFamily,
      bold: styles[index]?.bold ?? false,
      italic: styles[index]?.italic ?? false,
      underline: styles[index]?.underline ?? false,
    }));
    const logo = image
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
      ...(logo ? { logo } : {}),
    };
  }

  const previewBadge = badgeFor(
    activeLines,
    activeStyles ?? emptyStyles(lineCount),
    activeImage,
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
        size?: PlaqueSizeKey;
        formatId?: string;
        plate?: string;
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
      if (draft.size === "small" || draft.size === "medium" || draft.size === "large") {
        setSize(normalizePlaqueSizeForLayout(draft.layoutId || DEFAULT_PLAQUE_LAYOUT_ID, draft.size));
      }
      if (draft.formatId && getPlaqueAwardFormatById(draft.formatId)) setFormatId(draft.formatId);
      if (typeof draft.plate === "string" && draft.plate.startsWith("#")) setPlate(draft.plate);
      if (FONT_OPTIONS.includes(draft.fontFamily ?? "")) setFontFamily(draft.fontFamily!);
      if (draft.placement) setPlacementChoice(draft.placement);
      const restoredLines = Array.isArray(draft.lines) ? draft.lines.map((line) => String(line ?? "")) : [];
      if (restoredLines.length > 0) {
        setLines(restoredLines);
        setTextDraft(linesToText(restoredLines));
      }
      if (Array.isArray(draft.lineStyles) && draft.lineStyles.length > 0) setLineStyles(draft.lineStyles);
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
              lineStyles: Array.isArray(row.lineStyles) ? row.lineStyles : undefined,
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
    if (nextSize) setSize(normalizePlaqueSizeForLayout(nextLayout || DEFAULT_PLAQUE_LAYOUT_ID, nextSize));
  }, [catalog]);

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
      size,
      formatId,
      plate,
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
    formatId,
    layoutId,
    lineStyles,
    lines,
    placementChoice,
    plate,
    quantity,
    restored,
    size,
    step,
    visited,
  ]);

  function goToStep(next: StepId) {
    if (!steps.includes(next)) return;
    setStep(next);
    setVisited((current) => (current.includes(next) ? current : [...current, next]));
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
        lineStyles: row.lineStyles ? textToLines(linesToText(row.lines), count).map((_, index) => row.lineStyles?.[index] ?? { bold: false, italic: false, underline: false }) : row.lineStyles,
      })),
    );
  }

  function selectLayout(nextLayout: string) {
    allowUrlDefaults.current = false;
    const nextSize = normalizePlaqueSizeForLayout(nextLayout, size);
    const nextAttached = nextLayout === "plaque-attached";
    const count = nextAttached && format ? Math.max(1, plaqueAwardFormatUserLineCount(format)) : DETACHED_LINE_COUNT;
    setLayoutId(nextLayout);
    setSize(nextSize);
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

  function updateFormat(update: Partial<PlaqueLineStyle>) {
    const next = (activeStyles ?? emptyStyles(lineCount)).map((style) => ({ ...style, ...update }));
    setLineStyles(next);
    if (bulkMode && bulkRows.length > 0) {
      setBulkRows((rows) =>
        rows.map((row, rowIndex) =>
          rowIndex === selectedBulkRow ? { ...row, lineStyles: cloneStyles(next) } : row,
        ),
      );
    }
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
    setLayoutId(DEFAULT_PLAQUE_LAYOUT_ID);
    setSize(DEFAULT_PLAQUE_SIZE);
    setFormatId(DEFAULT_PLAQUE_ATTACHED_FORMAT_ID);
    setPlate(PLAQUE_DEFAULT_BRUSH_GOLD_HEX);
    setFontFamily("Georgia");
    setLines(textToLines("", 4));
    setTextDraft("");
    setLineStyles(emptyStyles(4));
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
            ...(pending.formatName ? { "_Award Format": pending.formatName } : {}),
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
    : "Your image sits on the metal plate above the text. PNG, JPEG, WebP, or GIF.";

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
              {step === "layout" ? (
                <div className="md-product-grid pd-layout-grid">
                  {layoutPreviews.map(({ option, badge }) => (
                    <button
                      type="button"
                      key={option.id}
                      className={`gf-toggle-card ${layoutId === option.id ? "is-selected" : ""}`}
                      onClick={() => selectLayout(option.id)}
                    >
                      {badge ? <PlaqueArt badge={badge} frame="choice" /> : null}
                      <span className="gf-toggle-label">{LAYOUT_COPY[option.id]?.title ?? option.name}</span>
                      <span className="gf-toggle-sub">{LAYOUT_COPY[option.id]?.detail ?? option.description}</span>
                    </button>
                  ))}
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
                    {formatPreviews.map(({ item, badge }) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`gf-toggle-card ${formatId === item.id ? "is-selected" : ""}`}
                        onClick={() => selectFormat(item.id)}
                      >
                        {badge ? <PlaqueArt badge={badge} frame="choice" /> : null}
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
                <div className="pd-swatches">
                  {PLATE_FINISHES.map((finish) => (
                    <button
                      type="button"
                      key={finish.value}
                      className={`pd-swatch ${plate.toLowerCase() === finish.value.toLowerCase() ? "is-selected" : ""}`}
                      onClick={() => setPlate(finish.value)}
                    >
                      <span className="pd-swatch-chip" style={{ background: finish.value }} />
                      <span>{finish.name}</span>
                    </button>
                  ))}
                  <label className="pd-custom-color">
                    Custom
                    <input
                      type="color"
                      aria-label="Custom plate color"
                      value={colorInputValue(plate)}
                      onChange={(event) => setPlate(event.target.value)}
                    />
                  </label>
                </div>
              ) : null}
              {step === "design" ? (
                <>
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
                    {attached && !imageReady ? <p className="md-help">Add an image before adding to cart.</p> : null}
                  </div>
                  <div className="md-format-row">
                    <label>
                      Font
                      <select className="gf-input" value={fontFamily} onChange={(event) => setFontFamily(event.target.value)}>
                        {FONT_OPTIONS.map((font) => <option key={font}>{font}</option>)}
                      </select>
                    </label>
                    {!attached && (bulkMode ? bulkPane === "edit" || bulkRows.length === 0 : true) ? (
                      <PlaqueFormatButtons
                        style={activeStyles?.[0] ?? { bold: false, italic: false, underline: false }}
                        onToggle={(formatKey) => updateFormat({ [formatKey]: !(activeStyles?.[0]?.[formatKey]) })}
                      />
                    ) : null}
                  </div>
                  {attached ? <p className="gf-note">Bold, italic, and dividers follow the award format.</p> : null}
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
                          <label className="md-text-label" htmlFor="pd-wording">Text</label>
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
                          <div className="pd-image-actions">
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
                          </div>
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
                          {!designReady ? <p className="md-help">Every plaque needs a first line{attached ? " and an image" : ""} before adding to cart.</p> : null}
                        </div>
                      ) : null}
                    </>
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
                      {!textReady ? <p className="md-help">Enter line 1 before adding to cart.</p> : null}
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
                  )}
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
                  {stepIndex > 0 ? <button type="button" className="gf-nav-secondary" onClick={() => goToStep(steps[stepIndex - 1])}>Back</button> : null}
                  <button type="button" className="gf-nav-secondary" onClick={() => window.confirm("Reset this plaque design?") && reset()}>Reset design</button>
                </div>
                {step !== "design" ? (
                  <button type="button" className="gf-nav-primary" onClick={() => goToStep(steps[stepIndex + 1])}>Continue</button>
                ) : (
                  <button type="button" className="gf-nav-primary" disabled={busy || !designReady} onClick={() => void reviewProof()}>
                    {busy ? "Preparing preview…" : "Add to cart"}
                  </button>
                )}
              </div>
            </div>
            <div className="gf-preview-pane">
              <div className="md-preview-stage">
                <PlaqueArt badge={previewBadge} frame="stage" />
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
