import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import type { Badge, BadgeLine } from "~/types/badge";
import {
  clampGavelLogoGapScale,
  clampGavelLogoScale,
  GAVEL_BAND_FINISHES,
  GAVEL_BAND_FINISH_IDS,
  GAVEL_DEFAULT_FONT,
  GAVEL_LOGO_GAP_SCALE_MAX,
  GAVEL_LOGO_GAP_SCALE_MIN,
  GAVEL_LOGO_SCALE_MAX,
  GAVEL_LOGO_SCALE_MIN,
  GAVEL_DEFAULT_TEXT_COLOR,
  GAVEL_MAX_CHARS_PER_LINE,
  GAVEL_MAX_LINES,
  GAVEL_PRODUCT_TYPE_OPTIONS,
  GAVEL_PRODUCT_TYPES,
  GAVEL_PRODUCTION_METHOD_IDS,
  GAVEL_PRODUCTION_METHOD_OPTIONS,
  GAVEL_SAMPLE_PRICING,
  GAVEL_SOUND_BLOCK_IDS,
  GAVEL_SOUND_BLOCK_OPTIONS,
  GAVEL_SOUND_BLOCK_SHAPE_IDS,
  GAVEL_SOUND_BLOCK_SHAPE_OPTIONS,
  GAVEL_STYLE_IDS,
  GAVEL_STYLES,
  GAVEL_TEXT_SIZE_PRESETS,
  GAVEL_UV_TEXT_COLORS,
  SOUND_BLOCK_MAX_CHARS,
  SOUND_BLOCK_MAX_LINES,
  STAND_PLATE_MAX_LINES,
  clampGavelLineText,
  clampSoundBlockLineText,
  formatGavelMoney,
  formatGavelOptionSummary,
  formatGavelOrderFinish,
  getGavelBandFinish,
  getGavelProductPhoto,
  getGavelProductionMethod,
  getGavelSoundBlock,
  getGavelSoundBlockPhoto,
  getGavelSoundBlockShape,
  getGavelStandFinish,
  getGavelStyle,
  getSoundBlockTopTextColor,
  isGavelRoundSoundBlockAvailable,
  isGavelSoundBlockOffered,
  isGavelStandOffered,
  joinSoundBlockText,
  quoteGavelPrice,
  soundBlockCharCount,
  type GavelBagSelectionId,
  type GavelBandFinishId,
  type GavelProductionMethodId,
  type GavelProductType,
  type GavelSoundBlockId,
  type GavelSoundBlockShapeId,
  type GavelStyleId,
  type GavelTextSizePreset,
} from "~/constants/gavelStyles";
import { gavelLineFieldStyle, preloadGavelFonts } from "~/utils/gavelFonts";
import { GavelSpinPreviewGate } from "~/components/GavelSpinPreviewGate";
import type {
  GavelPreviewFocus,
  GavelPreviewSubject,
  GavelSpinPreviewHandle,
} from "~/components/GavelSpinPreview";
import { GavelUnwrappedBandStrip } from "~/components/GavelUnwrappedBandStrip";
import {
  GavelBulkRowEditor,
  GavelBulkRowsTable,
  type GavelBulkSortKey,
} from "~/components/gavel/GavelBulkRowsTable";
import {
  GavelLineStyleControls,
  GavelSurfaceStyleRow,
  linesShareStyle,
  unifyLineStyles,
} from "~/components/gavel/GavelLineStyleControls";
import { BadgeQtyStepper } from "~/components/BadgeQtyStepper";
import { ProofPdfViewer } from "~/components/ProofPdfViewer";
import {
  gavelBandToDataUrl,
  gavelBandToSvgString,
  gavelStandPlateToDataUrl,
  gavelStandPlateToSvgString,
  paintGavelStandPlateCanvas,
  soundBlockTopToDataUrl,
  soundBlockTopToSvgString,
  type GavelPlateLogo,
} from "~/utils/gavelBandTexture";
import {
  getGavelMetalTexturesVersion,
  getServerGavelMetalTexturesVersion,
  preloadGavelMetalTextures,
  subscribeGavelMetalTextures,
} from "~/utils/gavelMetalTexture";
import { generateGavelProofPdf } from "~/utils/gavelPdf";
import { createApi } from "~/utils/api";
import { createDesignerAnalytics } from "~/utils/designerAnalytics";
import {
  GAVEL_PRODUCT_HANDLES,
  BAG_PRODUCT_HANDLES,
  isGavelVariantInStock,
  resolveGavelVariant,
  resolveSuedeBagVariant,
} from "~/utils/gavelShopifyCatalog";
import {
  isShopifyProductJsPayload,
  type ShopifyProductJs,
} from "~/utils/signShopifyCatalog";
import {
  getDesignerApiPaths,
  getDesignerConfig,
} from "~/config/designers";
import {
  buildDesignerCartLineProperties,
  buildProductionLineProperties,
} from "~/utils/cartLineProperties";
import { clampBadgeLineQty } from "~/utils/badgeLineQuantities";
import {
  GAVEL_BULK_PASTE_EXAMPLE_ROWS,
  blankGavelBulkRow,
  gavelBulkCsvTemplate,
  gavelBulkRowIsBlank,
  gavelBulkRowsToCsv,
  mergeGavelBulkRows,
  newGavelBulkRowId,
  parseGavelBulkCsv,
  parseGavelTextSize,
  secondaryLineCount,
  sharedSecondaryTexts,
  checkGavelBulkRows,
  type GavelBulkColumnLabels,
  type GavelBulkCsvResult,
  type GavelBulkRow,
  type GavelBulkSecondaryMode,
} from "~/utils/gavelBulkCsv";
import "../styles/gavelDesigner.css";

/** One decision per screen — the gavel flow adds a wood/handle step. */
type StepId = "product" | "style" | "design" | "quantity" | "done";
type GavelLogoSurface = "stand" | "sound-block";
const STEP_IDS: StepId[] = ["product", "style", "design", "quantity", "done"];

/**
 * Tab-scoped draft so a reload or a backgrounded phone tab returns to the same
 * step. sessionStorage is the source of truth; localStorage is only a fallback
 * for drafts saved before this, and for browsers that block session storage.
 */
const GAVEL_DESIGNER_CACHE_PREFIX = "gavel-designer-draft";
const GAVEL_CACHE_VERSION = 3;
/** Last uncaught error, so a reload can report what happened just before it. */
const GAVEL_LAST_ERROR_KEY = "gavel-designer-last-error";
/** Skip caching huge logos so we do not blow the storage quota. */
const GAVEL_CACHE_MAX_LOGO_CHARS = 1_500_000;

function getGavelDesignerDraftCacheKey(
  shop?: string | null,
  productId?: string | null,
): string {
  return `${GAVEL_DESIGNER_CACHE_PREFIX}-${shop ?? "default"}-${
    productId ?? "default"
  }`;
}

function gavelDraftLogoKey(cacheKey: string): string {
  return `${cacheKey}:logo`;
}

function readStorageItem(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageItem(storage: Storage, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeStorageItem(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // ignore quota or private-mode errors
  }
}

/** sessionStorage first, then a legacy localStorage draft. */
function readGavelDesignerDraft(
  shop?: string | null,
  productId?: string | null,
): string | null {
  const key = getGavelDesignerDraftCacheKey(shop, productId);
  return (
    readStorageItem(sessionStorage, key) ||
    readStorageItem(localStorage, key)
  );
}

function readGavelDesignerDraftLogo(
  shop?: string | null,
  productId?: string | null,
): string | null {
  const key = gavelDraftLogoKey(getGavelDesignerDraftCacheKey(shop, productId));
  return readStorageItem(sessionStorage, key) || readStorageItem(localStorage, key);
}

/**
 * Writes the wizard immediately. The logo lives in its own key and is skipped
 * when it has not changed, so a keystroke does not rewrite a large image.
 * Returns false when even the slim draft could not be stored.
 */
function writeGavelDesignerDraft(
  shop: string | null | undefined,
  productId: string | null | undefined,
  payload: GavelDesignerCachePayload,
  previousLogoJson: string | null,
): { ok: boolean; logoJson: string | null } {
  const key = getGavelDesignerDraftCacheKey(shop, productId);
  const logo = payload.logo ?? null;
  let draftJson: string;
  let logoJson: string | null = null;
  try {
    draftJson = JSON.stringify({ ...payload, logo: null });
    logoJson = logo ? JSON.stringify(logo) : null;
  } catch {
    return { ok: false, logoJson: previousLogoJson };
  }

  const storages = [sessionStorage, localStorage];
  let ok = false;
  for (const storage of storages) {
    if (writeStorageItem(storage, key, draftJson)) ok = true;
  }
  if (logoJson !== previousLogoJson) {
    for (const storage of storages) {
      if (logoJson) writeStorageItem(storage, gavelDraftLogoKey(key), logoJson);
      else removeStorageItem(storage, gavelDraftLogoKey(key));
    }
  }
  return { ok, logoJson };
}

function removeGavelDesignerDraftCache(
  shop?: string | null,
  productId?: string | null,
): void {
  const key = getGavelDesignerDraftCacheKey(shop, productId);
  for (const storage of [sessionStorage, localStorage]) {
    removeStorageItem(storage, key);
    removeStorageItem(storage, gavelDraftLogoKey(key));
  }
}

const PREVIEW_CAPTIONS: Record<GavelPreviewSubject, string> = {
  gavel: "Spin to view your gavel from any angle.",
  band: "Your engraving, shown flat on the metal band.",
  soundBlock: "Personalization sits on the wood top of the sound block.",
  stand: "Spin to view your gavel and stand from any angle.",
  plate: "Your stand plate, shown flat.",
  product: "Product photo — shows the real materials and finish, not your text.",
};

type GavelEditSurface = "band" | "plate" | "soundBlock";
/** Desktop section tabs on the Design step; the logo gets its own tab there. */
type GavelDesignTab = GavelEditSurface | "logo";

function editSurfaceForSubject(
  subject: GavelPreviewSubject,
): GavelEditSurface | null {
  // The Stand tab is the whole set, and band line 1 is the required field.
  if (subject === "gavel" || subject === "band" || subject === "stand") {
    return "band";
  }
  if (subject === "plate") return "plate";
  if (subject === "soundBlock") return "soundBlock";
  return null;
}

function previewFocusArea(target: EventTarget | null): GavelPreviewFocus["area"] {
  if (!(target instanceof Element)) return null;
  const area = target
    .closest("[data-preview-focus]")
    ?.getAttribute("data-preview-focus");
  return area === "band" || area === "plate" || area === "soundBlock"
    ? area
    : null;
}

function isStepId(value: unknown): value is StepId {
  return typeof value === "string" && STEP_IDS.includes(value as StepId);
}

function includesId<T extends string>(ids: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (ids as readonly string[]).includes(value);
}

function sanitizeCachedLines(
  raw: unknown,
  count: number,
  fallback: () => BadgeLine[],
): BadgeLine[] {
  if (!Array.isArray(raw)) return fallback();
  const next = raw.slice(0, count).map((item, index): BadgeLine => {
    const line =
      item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const align =
      line.align === "left" || line.align === "right" || line.align === "center"
        ? line.align
        : "center";
    return {
      id: typeof line.id === "string" ? line.id : `gavel-line-${index}`,
      text: typeof line.text === "string" ? line.text : "",
      xNorm: typeof line.xNorm === "number" ? line.xNorm : 0.5,
      yNorm: typeof line.yNorm === "number" ? line.yNorm : 0.5,
      sizeNorm: typeof line.sizeNorm === "number" ? line.sizeNorm : 0.2,
      color: typeof line.color === "string" ? line.color : GAVEL_DEFAULT_TEXT_COLOR,
      align,
      fontFamily:
        typeof line.fontFamily === "string" ? line.fontFamily : GAVEL_DEFAULT_FONT,
      bold: Boolean(line.bold),
      italic: Boolean(line.italic),
      underline: Boolean(line.underline),
    };
  });
  while (next.length < count) next.push(newLine());
  return next;
}

function sanitizeCachedBulkRows(raw: unknown): GavelBulkRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item, index): GavelBulkRow[] => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    if (!Array.isArray(row.texts)) return [];
    const texts = [0, 1, 2, 3].map((lineIndex) =>
      typeof row.texts[lineIndex] === "string" ? row.texts[lineIndex] : "",
    ) as GavelBulkRow["texts"];
    const rawSecondary = Array.isArray(row.secondaryTexts)
      ? row.secondaryTexts
      : row.texts;
    const secondaryTexts = [0, 1, 2, 3].map((lineIndex) =>
      typeof rawSecondary[lineIndex] === "string"
        ? rawSecondary[lineIndex]
        : "",
    ) as GavelBulkRow["secondaryTexts"];
    if (![...texts, ...secondaryTexts].some((text) => text.trim())) return [];
    return [
      {
        id:
          typeof row.id === "string" && row.id
            ? row.id
            : `bulk-gavel-cached-${index}`,
        texts,
        secondaryTexts,
        quantity:
          typeof row.quantity === "number"
            ? clampBadgeLineQty(row.quantity)
            : 1,
        ...(parseGavelTextSize(row.textSize)
          ? { textSize: parseGavelTextSize(row.textSize) }
          : {}),
      },
    ];
  });
}

function sanitizeCachedColumnLabels(raw: unknown): GavelBulkColumnLabels | null {
  if (!raw || typeof raw !== "object") return null;
  const labels = raw as Record<string, unknown>;
  const pick = (value: unknown) =>
    [0, 1, 2, 3].map((index) =>
      Array.isArray(value) && typeof value[index] === "string"
        ? value[index].slice(0, 40)
        : "",
    ) as GavelBulkColumnLabels["band"];
  return { band: pick(labels.band), secondary: pick(labels.secondary) };
}

function dataUrlToFile(
  dataUrl: string,
  name: string,
  type: string,
): File | null {
  try {
    const comma = dataUrl.indexOf(",");
    if (comma < 0) return null;
    const header = dataUrl.slice(0, comma);
    const mime =
      type || header.match(/data:([^;]+)/)?.[1] || "application/octet-stream";
    const binary = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], name || "logo", { type: mime });
  } catch {
    return null;
  }
}

type GavelDesignerCachePayload = {
  version?: number;
  step?: StepId;
  visited?: StepId[];
  productType?: GavelProductType;
  soundBlock?: GavelSoundBlockId;
  soundBlockShape?: GavelSoundBlockShapeId;
  soundBlockLines?: BadgeLine[];
  suedeBag?: boolean;
  productionMethod?: GavelProductionMethodId;
  logoScale?: number;
  logoGapScale?: number;
  logoSurface?: GavelLogoSurface;
  uvTextColor?: string;
  plateLines?: BadgeLine[];
  gavelStyle?: GavelStyleId;
  bandFinish?: GavelBandFinishId;
  textSize?: GavelTextSizePreset;
  lines?: BadgeLine[];
  qty?: number;
  bulkMode?: boolean;
  bulkRows?: GavelBulkRow[];
  bulkCsvText?: string;
  bulkCsvWarning?: string;
  bulkSecondaryMode?: GavelBulkSecondaryMode;
  bulkRowsEdited?: boolean;
  bulkColumnLabels?: GavelBulkColumnLabels | null;
  selectedBulkRow?: number;
  bagSelection?: GavelBagSelectionId;
  designId?: string;
  logo?: { name: string; type: string; dataUrl: string } | null;
};

const STEP_LABELS: Record<StepId, string> = {
  product: "Product",
  style: "Options",
  design: "Design",
  quantity: "Quantity",
  done: "Checkout",
};

const QTY_SLIDER_MAX = 50;

/**
 * Copy from the product photography. A fresh design opens with it so the
 * preview reads like the plaque the customer is buying.
 */
const GAVEL_EXAMPLE_HEADLINE = "JUSTICE SERVES ALL";
const GAVEL_EXAMPLE_SUBTITLE = "WITH INTEGRITY AND FAIRNESS";

/** The logo sliders move continuously; keep stored values tidy for the payload. */
function roundAdjust(value: number): number {
  return Math.round(value * 1000) / 1000;
}

type GavelDesignerProps = {
  productId?: string | null;
  shop?: string | null;
  customerId?: string | null;
  gadgetApiUrl?: string;
  gadgetApiKey?: string;
};

function newLine(partial?: Partial<BadgeLine>): BadgeLine {
  return {
    id: `gavel-line-${Math.random().toString(36).slice(2, 8)}`,
    text: "",
    xNorm: 0.5,
    yNorm: 0.5,
    sizeNorm: 0.2,
    color: GAVEL_DEFAULT_TEXT_COLOR,
    align: "center",
    fontFamily: GAVEL_DEFAULT_FONT,
    bold: false,
    italic: false,
    underline: false,
    ...partial,
  };
}

function defaultLines(): BadgeLine[] {
  return [newLine(), newLine(), newLine(), newLine()];
}

/**
 * The example copy as artwork. It stands in for the customer's text in the
 * preview only, so an untouched designer shows a finished-looking plaque
 * instead of a blank plate.
 */
function exampleArtLines(styleSource?: readonly BadgeLine[]): BadgeLine[] {
  return [GAVEL_EXAMPLE_HEADLINE, GAVEL_EXAMPLE_SUBTITLE].map((text, index) => {
    const style = styleSource?.[index];
    return newLine({
      id: `gavel-example-${index}`,
      text,
      fontFamily: style?.fontFamily,
      bold: style?.bold,
      italic: style?.italic,
    });
  });
}

function defaultPlateLines(): BadgeLine[] {
  return Array.from({ length: STAND_PLATE_MAX_LINES }, () => newLine());
}

function defaultSoundBlockLines(): BadgeLine[] {
  return Array.from({ length: SOUND_BLOCK_MAX_LINES }, () => newLine());
}

function soundBlockLineIsCustom(line: BadgeLine): boolean {
  return Boolean(
    (line.text ?? "").trim() ||
      line.bold ||
      line.italic ||
      line.underline ||
      (line.fontFamily && line.fontFamily !== GAVEL_DEFAULT_FONT),
  );
}

/** Band line 1 until the customer types or formats the sound-block top. */
function resolvedSoundBlockLines(
  soundBlockLines: BadgeLine[],
  bandLines: BadgeLine[],
): BadgeLine[] {
  if (soundBlockLines.some(soundBlockLineIsCustom)) return soundBlockLines;
  const source = bandLines[0];
  if (!source) return soundBlockLines;
  return soundBlockLines.map((line, index) =>
    index === 0
      ? {
          ...line,
          text: (source.text ?? "").trim(),
          fontFamily: source.fontFamily || GAVEL_DEFAULT_FONT,
          bold: Boolean(source.bold),
          italic: Boolean(source.italic),
          underline: Boolean(source.underline),
        }
      : line,
  );
}

/**
 * Restoring the cached draft has to happen before the browser paints, or the
 * user sees step 1 flash first. On the server there is no layout phase.
 */
const useBeforePaintEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

function readQueryParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name)?.trim() || "";
}

function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * Which Shopify product prices the chosen kit. The embed passes the handle of
 * the page the designer is on, so that one wins for its own product type;
 * switching type inside the wizard falls back to the known handles.
 */
function gavelProductHandleFor(productType: GavelProductType): string {
  const embedHandle = readQueryParam("productHandle");
  if (embedHandle && readQueryParam("productType") === productType) {
    return embedHandle;
  }
  return GAVEL_PRODUCT_HANDLES[productType];
}

/** Live variants/prices for one product handle, or null when unavailable. */
async function fetchStoreProduct(
  handle: string,
  shopHost: string,
): Promise<ShopifyProductJs | null> {
  const params = new URLSearchParams({ handle });
  if (shopHost) params.set("shop", shopHost);
  try {
    const res = await fetch(`/api/shopify-product?${params.toString()}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return isShopifyProductJsPayload(data) ? data : null;
  } catch {
    return null;
  }
}

/** Layout position in the document, ignoring transforms. */
function documentOffsetTop(el: HTMLElement): number {
  let top = 0;
  for (let node: HTMLElement | null = el; node; node = node.offsetParent as HTMLElement | null) {
    top += node.offsetTop;
  }
  return top;
}

/**
 * Storefront embed on desktop: report the tool's content height so the
 * product page can size the iframe to it and stay the only scroller. The page
 * answers with the screen height left under its header, which becomes the
 * tool's minimum height. Phones keep the fixed, viewport-sized iframe.
 *
 * The iframe itself never scrolls, so CSS sticky cannot keep the preview in
 * view next to a long form; the page reports its scroll position instead and
 * the preview is shifted down to follow it.
 */
function useEmbedAutoHeight() {
  useEffect(() => {
    if (window.parent === window) return;
    const desktop = window.matchMedia("(min-width: 901px)");
    const docEl = document.documentElement;
    let frame = 0;
    let lastSent: number | null | undefined;
    let viewTop: number | null = null;
    let viewHeight: number | null = null;

    /* Back / Continue ride the bottom edge of the visible page, like sticky. */
    const pinStepNav = () => {
      const nav = document.querySelector<HTMLElement>(
        ".gf-design-grid .gf-controls-col > .gf-step-nav",
      );
      if (!nav) return;
      const column = nav.parentElement;
      if (
        !column ||
        viewTop === null ||
        viewHeight === null ||
        !desktop.matches ||
        !docEl.classList.contains("gf-autosized")
      ) {
        nav.style.transform = "";
        return;
      }
      const navTop = documentOffsetTop(nav);
      const visibleBottom = viewTop + viewHeight;
      const lift = Math.max(
        documentOffsetTop(column) - navTop,
        Math.min(0, visibleBottom - (navTop + nav.offsetHeight)),
      );
      nav.style.transform = lift < 0 ? `translateY(${Math.round(lift)}px)` : "";
    };

    const followViewport = () => {
      pinStepNav();
      const pane = document.querySelector<HTMLElement>(
        ".gf-wizard-root.is-preview-step .gf-design-grid:not(.is-single) > .gf-preview-pane",
      );
      if (!pane) return;
      const grid = pane.parentElement;
      if (
        !grid ||
        viewTop === null ||
        !desktop.matches ||
        !docEl.classList.contains("gf-autosized")
      ) {
        pane.style.transform = "";
        return;
      }
      const paneTop = documentOffsetTop(pane);
      const room =
        documentOffsetTop(grid) + grid.offsetHeight - paneTop - pane.offsetHeight;
      const shift = Math.max(0, Math.min(viewTop + 16 - paneTop, room));
      pane.style.transform = shift > 0 ? `translateY(${Math.round(shift)}px)` : "";
    };

    const send = () => {
      frame = 0;
      followViewport();
      let height: number | null = null;
      if (desktop.matches) {
        let bottom = 0;
        document
          .querySelectorAll<HTMLElement>(".gf-wizard-root, .gf-modal")
          .forEach((el) => {
            const gap = el.classList.contains("gf-modal") ? 24 : 0;
            bottom = Math.max(
              bottom,
              el.getBoundingClientRect().bottom + window.scrollY + gap,
            );
          });
        height = bottom > 0 ? Math.ceil(bottom) : null;
      }
      if (height === lastSent) return;
      lastSent = height;
      window.parent.postMessage({ action: "gavel-designer-height", height }, "*");
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(send);
    };

    const resizeObserver = new ResizeObserver(schedule);
    const observeTargets = () => {
      resizeObserver.disconnect();
      document
        .querySelectorAll(".gf-designer-page, .gf-wizard-root, .gf-modal")
        .forEach((el) => resizeObserver.observe(el));
      schedule();
    };
    const mutationObserver = new MutationObserver(observeTargets);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    observeTargets();

    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      const data = event.data as
        | { action?: string; height?: unknown; top?: unknown }
        | null;
      if (data?.action === "gavel-designer-viewport") {
        const top = Number(data.top);
        viewTop = Number.isFinite(top) ? top : null;
        const height = Number(data.height);
        viewHeight = Number.isFinite(height) && height > 0 ? height : null;
        followViewport();
        return;
      }
      if (!data || data.action !== "gavel-designer-fit") return;
      const fit = Number(data.height);
      if (!(fit > 0)) return;
      docEl.style.setProperty("--gf-fit-height", `${Math.round(fit)}px`);
      docEl.classList.add("gf-autosized");
      schedule();
    };
    const onBreakpoint = () => {
      lastSent = undefined;
      schedule();
    };
    window.addEventListener("message", onMessage);
    desktop.addEventListener("change", onBreakpoint);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener("message", onMessage);
      desktop.removeEventListener("change", onBreakpoint);
    };
  }, []);
}

export default function GavelDesigner({
  productId,
  shop,
  customerId,
  gadgetApiUrl,
  gadgetApiKey,
}: GavelDesignerProps) {
  useEmbedAutoHeight();
  const [step, setStep] = useState<StepId>("product");
  const [visited, setVisited] = useState<StepId[]>(["product"]);

  const [productType, setProductType] = useState<GavelProductType>("gavel");
  const [soundBlock, setSoundBlock] = useState<GavelSoundBlockId>("none");
  const [soundBlockShape, setSoundBlockShape] =
    useState<GavelSoundBlockShapeId>("square");
  const [soundBlockLines, setSoundBlockLines] = useState<BadgeLine[]>(
    defaultSoundBlockLines,
  );
  const [bagSelection, setBagSelection] =
    useState<GavelBagSelectionId>("none");
  const suedeBag = bagSelection !== "none";
  const [productionMethod, setProductionMethod] =
    useState<GavelProductionMethodId>("engrave");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoScale, setLogoScale] = useState(1);
  const [logoGapScale, setLogoGapScale] = useState(1);
  const [logoSurface, setLogoSurface] =
    useState<GavelLogoSurface>("sound-block");
  const [uvTextColor, setUvTextColor] = useState(GAVEL_UV_TEXT_COLORS[0]);
  const [plateLines, setPlateLines] = useState<BadgeLine[]>(defaultPlateLines);

  const [gavelStyle, setGavelStyle] = useState<GavelStyleId>("walnut");
  const [bandFinish, setBandFinish] = useState<GavelBandFinishId>("gold");
  const [textSize, setTextSize] = useState<GavelTextSizePreset>("medium");
  const [lines, setLines] = useState<BadgeLine[]>(defaultLines);
  const [qty, setQty] = useState(1);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkRows, setBulkRows] = useState<GavelBulkRow[]>([]);
  const [selectedBulkRow, setSelectedBulkRow] = useState(0);
  const [bulkCsvText, setBulkCsvText] = useState("");
  const [bulkCsvWarning, setBulkCsvWarning] = useState("");
  const [bulkSecondaryMode, setBulkSecondaryMode] =
    useState<GavelBulkSecondaryMode>("shared");
  const [bulkSearch, setBulkSearch] = useState("");
  /** Last column the list was sorted by; sorting reorders the rows themselves. */
  const [bulkSortKey, setBulkSortKey] = useState<GavelBulkSortKey | null>(null);
  const [bulkSortAscending, setBulkSortAscending] = useState(true);
  /** Set once the customer changes the list by hand, so a re-import asks first. */
  const [bulkRowsEdited, setBulkRowsEdited] = useState(false);
  const [pendingBulkImport, setPendingBulkImport] =
    useState<GavelBulkCsvResult | null>(null);
  const [bulkNotice, setBulkNotice] = useState("");
  const [bulkColumnLabels, setBulkColumnLabels] =
    useState<GavelBulkColumnLabels | null>(null);
  const [bulkProblemsOnly, setBulkProblemsOnly] = useState(false);
  const bulkFocusRowRef = useRef<string | null>(null);
  const bulkCsvInputRef = useRef<HTMLInputElement>(null);
  const bulkPasteRef = useRef<HTMLTextAreaElement>(null);
  const bulkModeLocked = readQueryParam("audience") === "model-un";
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  /** Bumped when the CSV modal closes so a blank WebGL canvas is recreated. */
  const [previewRevive, setPreviewRevive] = useState(0);
  /** Bumped after the requested font faces finish downloading. */
  const [fontEpoch, setFontEpoch] = useState(0);
  const csvModalOpenRef = useRef(false);
  csvModalOpenRef.current = csvModalOpen;

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lineError, setLineError] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [pendingPdfBlob, setPendingPdfBlob] = useState<Blob | null>(null);
  const [variantId, setVariantId] = useState("");
  const [storeUnitPrice, setStoreUnitPrice] = useState<number | null>(null);
  /** Live catalog for the current product type, used to price wood + sound block. */
  const [storeProduct, setStoreProduct] = useState<ShopifyProductJs | null>(
    null,
  );
  const [storeProductLoading, setStoreProductLoading] = useState(true);
  /** Suede bag add-on product; billed as its own cart line. */
  const [bagProduct, setBagProduct] = useState<ShopifyProductJs | null>(null);
  const [bagProductLoading, setBagProductLoading] = useState(true);
  /** Canvas textures only exist in the browser; keep first paint SSR-identical. */
  const [isClient, setIsClient] = useState(false);
  /**
   * The server cannot read the saved draft, so it renders a neutral shell and
   * the wizard itself only mounts once the cached step has been restored.
   */
  const [hydrated, setHydrated] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const previousStepRef = useRef<StepId>("product");
  const designIdRef = useRef(
    `design_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
  );
  /** True after we have tried localStorage restore once (prevents writing defaults over a draft). */
  const cacheHydratedRef = useRef(false);
  /** Skip one cache write after add-to-cart so we do not persist the completed flow. */
  const skipCacheSaveRef = useRef(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  /** Decoded logo, needed before it can be painted into the plate artwork. */
  const [logoImage, setLogoImage] = useState<HTMLImageElement | null>(null);
  const previewRef = useRef<GavelSpinPreviewHandle>(null);
  const [previewSubject, setPreviewSubject] =
    useState<GavelPreviewSubject>("gavel");
  /**
   * Which surface's fields the phone layout shows on the Design step. Follows
   * the preview tab, and holds its value on the Real photo tab.
   */
  const [editSurface, setEditSurface] = useState<GavelEditSurface>("band");
  useEffect(() => {
    const next = editSurfaceForSubject(previewSubject);
    if (next) setEditSurface(next);
  }, [previewSubject]);
  const [designTab, setDesignTab] = useState<GavelDesignTab>("band");
  const [previewFocus, setPreviewFocus] = useState<GavelPreviewFocus>({
    area: null,
    token: 0,
  });
  const followPreviewFocus = (target: EventTarget) => {
    const area = previewFocusArea(target);
    if (!area) return;
    setPreviewFocus((prev) =>
      prev.area === area ? prev : { area, token: prev.token + 1 },
    );
  };
  /** Last 3D capture, kept so the proof works after the canvas unmounts. */
  const mockupRef = useRef<{ dataUrl: string | null; blob: Blob | null }>({
    dataUrl: null,
    blob: null,
  });
  const apiRef = useRef(
    createApi(gadgetApiUrl, gadgetApiKey, { designerId: "gavel" }),
  );
  const analytics = useMemo(
    () =>
      createDesignerAnalytics({
        tool: "gavel",
        getEntry: () => "full-funnel",
      }),
    [],
  );

  useEffect(() => {
    analytics.opened();
  }, [analytics]);

  useEffect(() => {
    const record = (kind: string, error: unknown) => {
      const message = error instanceof Error ? error.message : String(error ?? "");
      const stack = error instanceof Error ? error.stack : undefined;
      console.error("[GavelDesigner]", kind, message);
      try {
        sessionStorage.setItem(
          GAVEL_LAST_ERROR_KEY,
          JSON.stringify({
            kind,
            message,
            stack,
            at: new Date().toISOString(),
          }),
        );
      } catch {
        // ignore private-mode storage errors
      }
    };
    const onError = (event: ErrorEvent) => {
      record("error", event.error ?? event.message);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      record("unhandledrejection", event.reason);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  const isStand = productType === "stand";
  const styleDef = getGavelStyle(gavelStyle);
  const bandDef = getGavelBandFinish(bandFinish);
  /**
   * The band and the stand plate are the same metal on the physical product, so
   * one choice drives both — picking a finish on either step moves the other.
   */
  const standDef = getGavelStandFinish(bandFinish);
  const standFinish = standDef.id;
  const maxChars = GAVEL_MAX_CHARS_PER_LINE[textSize];
  /** A bulk row's own size override wins in the preview and its proof. */
  const previewTextSize =
    (bulkMode ? bulkRows[selectedBulkRow]?.textSize : undefined) ?? textSize;

  const canPickTextColor = isStand && productionMethod === "uvprint";
  const showProductionMethod = isStand && standDef.allowsUvPrint;
  const soundBlockEngraved = !isStand && soundBlock === "engraved";
  const hasSoundBlock = !isStand && soundBlock !== "none";
  const logoAllowed = isStand || soundBlockEngraved;

  const sequence: StepId[] = useMemo(
    () =>
      bulkMode
        ? ["product", "style", "design", "done"]
        : ["product", "style", "design", "quantity", "done"],
    [bulkMode],
  );
  const stepIndex = Math.max(0, sequence.indexOf(step));
  const showPreview = step === "style" || step === "design";

  /**
   * Phone layout hides the flat proof strips under the preview, so only there
   * does the preview need its own Band/Plate tabs. Same breakpoint the
   * stylesheet uses to drop `.gf-band-strip`.
   */
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /**
   * Desktop shows one personalization section at a time. The tabs and the
   * preview move together: a tab points the preview at its surface, and a
   * preview tab that names a surface opens that section.
   */
  const logoHomeTab: GavelEditSurface = isStand ? "plate" : "soundBlock";
  const designTabs: { id: GavelDesignTab; label: string }[] = [
    { id: "band", label: "Gavel band" },
    ...(isStand ? [{ id: "plate" as const, label: "Stand plate" }] : []),
    ...(soundBlockEngraved
      ? [{ id: "soundBlock" as const, label: "Sound block" }]
      : []),
    ...(logoAllowed ? [{ id: "logo" as const, label: "Logo" }] : []),
  ];
  const activeDesignTab = designTabs.some((tab) => tab.id === designTab)
    ? designTab
    : "band";
  useEffect(() => {
    if (previewSubject === "product" || previewSubject === "stand") return;
    const next = editSurfaceForSubject(previewSubject);
    if (!next) return;
    setDesignTab((current) => {
      if (current === "logo" && next === logoHomeTab) return current;
      // The whole-gavel view does not say which section is wanted; only leave
      // a sound-block section once the preview stops showing the block.
      if (previewSubject === "gavel" && current !== "soundBlock") {
        return current === "logo" && logoHomeTab === "soundBlock"
          ? "band"
          : current;
      }
      return next;
    });
  }, [previewSubject, logoHomeTab]);
  const openDesignTab = (tab: GavelDesignTab) => {
    setDesignTab(tab);
    const area = tab === "logo" ? logoHomeTab : tab;
    setPreviewFocus((prev) => ({ area, token: prev.token + 1 }));
  };
  /** A loaded list on desktop is edited as a spreadsheet across the card. */
  const bulkWide = step === "design" && bulkRows.length > 0 && !isNarrow;

  /**
   * With nothing typed anywhere, the preview shows the example copy from the
   * product photography rather than bare metal. This never reaches a proof or
   * the cart: ordering already requires the customer's own band text.
   * A bulk order with no list yet shows the example on every surface, so
   * leftover single-design text cannot fill one proof and not the other.
   */
  const bulkAwaitingRows = bulkMode && bulkRows.length === 0;
  const usingExampleCopy =
    bulkAwaitingRows ||
    (!lines.some((line) => (line.text ?? "").trim()) &&
      !plateLines.some((line) => (line.text ?? "").trim()) &&
      !soundBlockLines.some((line) => (line.text ?? "").trim()));

  /** Band/plate art always renders with the color the flow allows. */
  const bandArtLines = useMemo(
    () =>
      lines.map((line) => ({
        ...line,
        align: "center" as const,
        color: GAVEL_DEFAULT_TEXT_COLOR,
      })),
    [lines],
  );

  const plateSourceLines = useMemo(() => {
    const filled = plateLines.filter((l) => (l.text ?? "").trim());
    if (filled.length > 0) return plateLines;
    return bandArtLines.slice(0, STAND_PLATE_MAX_LINES);
  }, [bandArtLines, plateLines]);

  const plateArtLines = useMemo(
    () =>
      plateSourceLines.map((line) => ({
        ...line,
        align: "center" as const,
        color: canPickTextColor ? uvTextColor : GAVEL_DEFAULT_TEXT_COLOR,
      })),
    [canPickTextColor, plateSourceLines, uvTextColor],
  );

  /** What the preview draws: the customer's copy, or the example standing in. */
  const bandPreviewLines = useMemo(
    () => (usingExampleCopy ? exampleArtLines(lines) : bandArtLines),
    [bandArtLines, lines, usingExampleCopy],
  );

  const platePreviewLines = useMemo(
    () =>
      usingExampleCopy
        ? exampleArtLines(plateLines).map((line) => ({
            ...line,
            color: canPickTextColor ? uvTextColor : GAVEL_DEFAULT_TEXT_COLOR,
          }))
        : plateArtLines,
    [canPickTextColor, plateArtLines, plateLines, usingExampleCopy, uvTextColor],
  );

  /** Logo art for the plate; SVG uploads can report no intrinsic size. */
  const makePlateLogo = useCallback(
    (scale: number, gapScale: number): GavelPlateLogo | null => {
      if (!logoImage) return null;
      const w = logoImage.naturalWidth || logoImage.width;
      const h = logoImage.naturalHeight || logoImage.height;
      return {
        image: logoImage,
        href: logoDataUrl,
        aspect: w > 0 && h > 0 ? w / h : 1,
        scale,
        gapScale,
      };
    },
    [logoDataUrl, logoImage],
  );

  /** The placement the customer has committed to: proof PDF and print SVG. */
  const plateLogo = useMemo(
    () => makePlateLogo(logoScale, logoGapScale),
    [logoGapScale, logoScale, makePlateLogo],
  );
  const standLogo = isStand && logoSurface === "stand" ? plateLogo : null;
  const soundBlockLogo =
    soundBlockEngraved && logoSurface === "sound-block" ? plateLogo : null;

  /**
   * The scanned brushed finishes arrive after first paint. Tracking their
   * version repaints the band and plate artwork off the scan once it lands,
   * instead of leaving the procedural stand-in on screen.
   */
  const metalScanVersion = useSyncExternalStore(
    subscribeGavelMetalTextures,
    getGavelMetalTexturesVersion,
    getServerGavelMetalTexturesVersion,
  );

  useEffect(() => {
    if (isClient) preloadGavelMetalTextures();
  }, [isClient]);

  const bandTextureUrl = useMemo(
    () =>
      isClient
        ? gavelBandToDataUrl(bandPreviewLines, previewTextSize, bandDef.color)
        : "",
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metalScanVersion busts this when the scanned finish lands; the painter reads it out of module state
    [bandDef.color, bandPreviewLines, fontEpoch, isClient, metalScanVersion, previewTextSize],
  );

  const renderPlateTexture = useCallback(
    (logo: GavelPlateLogo | null, shaped = false) => {
      if (!isClient || !isStand) return "";
      return gavelStandPlateToDataUrl(
        platePreviewLines,
        previewTextSize,
        standDef.plateHex,
        { shaped, logo },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metalScanVersion busts this when the scanned finish lands; the painter reads it out of module state
    [
      fontEpoch,
      isClient,
      isStand,
      metalScanVersion,
      platePreviewLines,
      previewTextSize,
      standDef.plateHex,
    ],
  );

  /**
   * The 3D plaque reads this canvas directly. It is repainted in place, once per
   * animation frame at most, so dragging the logo sliders costs one repaint per
   * frame instead of a PNG encode and decode per pointer event.
   */
  const plateCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [plateCanvas, setPlateCanvas] = useState<HTMLCanvasElement | null>(null);
  const [plateCanvasVersion, setPlateCanvasVersion] = useState(0);

  useEffect(() => {
    if (!isClient || !isStand) return;
    if (!plateCanvasRef.current) {
      plateCanvasRef.current = document.createElement("canvas");
    }
    const canvas = plateCanvasRef.current;
    const frame = requestAnimationFrame(() => {
      paintGavelStandPlateCanvas(
        canvas,
        platePreviewLines,
        previewTextSize,
        standDef.plateHex,
        { logo: standLogo },
      );
      setPlateCanvas(canvas);
      setPlateCanvasVersion((v) => v + 1);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    fontEpoch,
    isClient,
    isStand,
    metalScanVersion,
    platePreviewLines,
    previewTextSize,
    standLogo,
    standDef.plateHex,
  ]);

  /**
   * Same art cut to the plaque silhouette for the flat proof strips. This one
   * still costs a PNG encode for the `<img>`, so it trails the sliders by a
   * deferred render rather than running mid-drag.
   */
  const deferredPreviewLogo = useDeferredValue(standLogo);
  const plateProofUrl = useMemo(
    () => renderPlateTexture(deferredPreviewLogo, true),
    [deferredPreviewLogo, renderPlateTexture],
  );

  const roundBlockAvailable =
    hasSoundBlock &&
    isGavelRoundSoundBlockAvailable(soundBlock, gavelStyle) &&
    isGavelVariantInStock(storeProduct, {
      productType: "gavel",
      styleId: gavelStyle,
      soundBlock,
      soundBlockShape: "round",
    });
  const squareBlockAvailable =
    hasSoundBlock &&
    isGavelVariantInStock(storeProduct, {
      productType: "gavel",
      styleId: gavelStyle,
      soundBlock,
      soundBlockShape: "square",
    });
  /** Never price or draw a round block the store cannot make. */
  const effectiveSoundBlockShape: GavelSoundBlockShapeId =
    soundBlockShape === "round" && roundBlockAvailable ? "round" : "square";
  const currentVariantInStock = isGavelVariantInStock(storeProduct, {
    productType,
    styleId: gavelStyle,
    soundBlock: isStand ? "none" : soundBlock,
    soundBlockShape: effectiveSoundBlockShape,
  });
  const currentSelectionOutOfStock =
    storeProduct !== null && !currentVariantInStock;
  const soundBlockArtLines = useMemo(
    () => resolvedSoundBlockLines(soundBlockLines, lines),
    [lines, soundBlockLines],
  );
  const soundBlockArtText = joinSoundBlockText(soundBlockArtLines);
  const soundBlockPreviewLines = useMemo(
    () =>
      usingExampleCopy
        ? [
            newLine({
              text: GAVEL_EXAMPLE_HEADLINE,
              fontFamily: soundBlockLines[0]?.fontFamily,
              bold: soundBlockLines[0]?.bold,
              italic: soundBlockLines[0]?.italic,
            }),
          ]
        : soundBlockArtLines,
    [soundBlockArtLines, soundBlockLines, usingExampleCopy],
  );
  const soundBlockTextureUrl = useMemo(() => {
    if (
      !isClient ||
      !soundBlockEngraved ||
      (!joinSoundBlockText(soundBlockPreviewLines) && !soundBlockLogo)
    ) {
      return "";
    }
    return soundBlockTopToDataUrl(
      soundBlockPreviewLines,
      getSoundBlockTopTextColor(gavelStyle),
      { logo: soundBlockLogo },
    );
  }, [
    fontEpoch,
    gavelStyle,
    isClient,
    soundBlockEngraved,
    soundBlockLogo,
    soundBlockPreviewLines,
  ]);

  const shopHost =
    shop || readQueryParam("shop") || readQueryParam("storeUrl");

  useEffect(() => {
    let cancelled = false;
    setStoreProduct(null);
    setStoreProductLoading(true);
    fetchStoreProduct(gavelProductHandleFor(productType), shopHost).then(
      (product) => {
        if (!cancelled) {
          setStoreProduct(product);
          setStoreProductLoading(false);
          setCatalogByType((prev) => ({ ...prev, [productType]: product }));
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [productType, shopHost]);

  /**
   * Both catalogs, keyed by product. Stock is per product, so a wood sold out
   * with the stand can still be in stock as a gavel. Keying by product also
   * keeps the previous product's stock from being read during a switch.
   */
  const [catalogByType, setCatalogByType] = useState<
    Partial<Record<GavelProductType, ShopifyProductJs | null>>
  >({});
  useEffect(() => {
    let cancelled = false;
    const other: GavelProductType = productType === "stand" ? "gavel" : "stand";
    fetchStoreProduct(gavelProductHandleFor(other), shopHost).then((product) => {
      if (!cancelled) {
        setCatalogByType((prev) => ({ ...prev, [other]: product }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [productType, shopHost]);
  const gavelCatalog = catalogByType.gavel ?? null;
  const standCatalog = catalogByType.stand ?? null;
  const currentCatalog = productType === "stand" ? standCatalog : gavelCatalog;

  useEffect(() => {
    let cancelled = false;
    setBagProductLoading(true);
    (async () => {
      for (const handle of BAG_PRODUCT_HANDLES) {
        const product = await fetchStoreProduct(handle, shopHost);
        if (cancelled) return;
        if (product) {
          setBagProduct(product);
          setBagProductLoading(false);
          return;
        }
      }
      if (!cancelled) {
        setBagProduct(null);
        setBagProductLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopHost]);

  const bagVariants = useMemo(
    () => ({
      gavel: resolveSuedeBagVariant(bagProduct, "gavel"),
      secondary: resolveSuedeBagVariant(bagProduct, "secondary"),
      both: resolveSuedeBagVariant(bagProduct, "both"),
    }),
    [bagProduct],
  );
  const bagVariant =
    bagSelection === "none" ? null : bagVariants[bagSelection];

  /** Prices shown alongside the choices come from the same live variants used at checkout. */
  const woodPrices = useMemo(() => {
    const prices = {} as Partial<Record<GavelStyleId, number>>;
    for (const style of GAVEL_STYLES) {
      if (productType === "stand" && !isGavelStandOffered(style.id)) continue;
      const match = resolveGavelVariant(storeProduct, {
        productType,
        styleId: style.id,
        soundBlock: "none",
        soundBlockShape: "square",
      });
      if (match) prices[style.id] = match.price;
    }
    return prices;
  }, [productType, storeProduct]);

  /**
   * Why a wood can or cannot be ordered with the current product:
   * - `no-stand`: Ebony is never made with a stand.
   * - `stand-sold-out`: sold out on the stand product but still in stock as a gavel.
   * - `sold-out`: out everywhere we can see.
   * Missing catalog data fails open, matching isGavelVariantInStock.
   */
  const woodAvailability = (
    id: GavelStyleId,
  ): "ok" | "no-stand" | "stand-sold-out" | "sold-out" => {
    if (productType === "stand" && !isGavelStandOffered(id)) return "no-stand";
    const inStock = isGavelVariantInStock(currentCatalog, {
      productType,
      styleId: id,
      soundBlock: productType === "stand" ? "none" : soundBlock,
      soundBlockShape: effectiveSoundBlockShape,
    });
    if (inStock) return "ok";
    if (
      productType === "stand" &&
      gavelCatalog !== null &&
      isGavelVariantInStock(gavelCatalog, {
        productType: "gavel",
        styleId: id,
        soundBlock: "none",
      })
    ) {
      return "stand-sold-out";
    }
    return "sold-out";
  };
  const standWoods = standCatalog
    ? GAVEL_STYLES.filter(
        (s) =>
          isGavelStandOffered(s.id) &&
          isGavelVariantInStock(standCatalog, {
            productType: "stand",
            styleId: s.id,
            soundBlock: "none",
          }),
      )
    : null;
  const selectableWoods = GAVEL_STYLES.filter(
    (s) => woodAvailability(s.id) === "ok",
  );
  /** Catalog known and exactly one wood orderable: show it as a fact, not a menu. */
  const onlyWood =
    currentCatalog !== null && selectableWoods.length === 1
      ? selectableWoods[0]
      : null;

  const soundBlockPriceAdds = useMemo(() => {
    const adds = {} as Partial<Record<GavelSoundBlockId, number>>;
    const base = resolveGavelVariant(storeProduct, {
      productType: "gavel",
      styleId: gavelStyle,
      soundBlock: "none",
      soundBlockShape: "square",
    });
    if (!base) return adds;
    adds.none = 0;
    for (const option of GAVEL_SOUND_BLOCK_OPTIONS) {
      if (!isGavelSoundBlockOffered(option.id, gavelStyle)) continue;
      const match = resolveGavelVariant(storeProduct, {
        productType: "gavel",
        styleId: gavelStyle,
        soundBlock: option.id,
        soundBlockShape: "square",
      });
      if (match) adds[option.id] = Math.max(0, match.price - base.price);
    }
    return adds;
  }, [gavelStyle, storeProduct]);

  const hasText = lines.some((l) => (l.text ?? "").trim());
  const designReady = bulkMode ? bulkRows.length > 0 : hasText;
  const bulkQuantity = bulkRows.reduce((sum, row) => sum + row.quantity, 0);
  const orderQuantity = bulkRows.length > 0 ? bulkQuantity : qty;
  const bulkSecondarySurface = isStand
    ? ("stand" as const)
    : soundBlockEngraved
      ? ("sound-block" as const)
      : null;
  const effectiveBulkSecondaryMode = bulkSecondarySurface
    ? bulkSecondaryMode
    : "shared";
  const bulkSecondaryCount =
    effectiveBulkSecondaryMode === "separate" && bulkSecondarySurface
      ? secondaryLineCount(bulkSecondarySurface)
      : 0;
  const bulkCheck = useMemo(
    () =>
      checkGavelBulkRows(bulkRows, {
        textSize,
        secondaryCount: bulkSecondaryCount,
        secondarySurface: bulkSecondarySurface,
      }),
    [bulkRows, bulkSecondaryCount, bulkSecondarySurface, textSize],
  );
  const visibleBulkRows = useMemo(() => {
    const query = bulkSearch.trim().toLocaleLowerCase();
    return bulkRows
      .map((row, index) => ({ row, index, issues: bulkCheck.issues[index] }))
      .filter(
        ({ row, index, issues }) =>
          // The row being edited stays put even once it stops matching.
          index === selectedBulkRow ||
          ((!bulkProblemsOnly ||
            issues.overCells.size > 0 ||
            issues.missingRequired ||
            issues.duplicateOf !== null) &&
            (!query ||
              [...row.texts, ...row.secondaryTexts].some((text) =>
                text.toLocaleLowerCase().includes(query),
              ))),
      );
  }, [bulkCheck, bulkProblemsOnly, bulkRows, bulkSearch, selectedBulkRow]);
  const bulkErrorRowNumbers = bulkCheck.issues.flatMap((issues, index) =>
    issues.overCells.size > 0 || issues.missingRequired ? [index + 1] : [],
  );
  /** Header names from the customer's file, falling back to the line number. */
  const bulkBandLabels = [0, 1, 2, 3].map(
    (index) => bulkColumnLabels?.band[index] || `Line ${index + 1}`,
  );
  /**
   * Why a bulk order cannot go to the cart yet, shown beside the button so a
   * disabled or bounced call to action is never silent.
   */
  const bulkCartBlocker = (() => {
    if (!bulkMode) return null;
    if (bulkRows.length === 0) {
      return "Add your list of names to preview it before adding to cart.";
    }
    if (bulkCheck.errorRows === 0) return null;
    const parts: string[] = [];
    if (bulkCheck.overRows > 0) {
      const limits = new Set<number>();
      let soundBlockOver = false;
      bulkCheck.issues.forEach((issues, index) => {
        if (issues.overCells.size === 0) return;
        if (
          bulkSecondarySurface === "sound-block" &&
          [...issues.overCells].some((cell) => cell.startsWith("secondary"))
        ) {
          soundBlockOver = true;
        }
        limits.add(
          GAVEL_MAX_CHARS_PER_LINE[bulkRows[index]?.textSize ?? textSize],
        );
      });
      const n = bulkCheck.overRows;
      parts.push(
        limits.size === 1 && !soundBlockOver
          ? `${n} row${n === 1 ? "" : "s"} exceed${n === 1 ? "s" : ""} ${[...limits][0]} characters`
          : `${n} row${n === 1 ? " is" : "s are"} too long for ${n === 1 ? "its" : "their"} text size`,
      );
    }
    if (bulkCheck.missingRows > 0) {
      const n = bulkCheck.missingRows;
      parts.push(
        `${n} row${n === 1 ? " is" : "s are"} missing ${bulkBandLabels[0]}`,
      );
    }
    return `${parts.join(" · ")}. Fix ${bulkCheck.errorRows === 1 ? "it" : "them"} before adding to cart.`;
  })();
  const bulkSecondaryLabels = [0, 1, 2, 3].map(
    (index) =>
      bulkColumnLabels?.secondary[index] ||
      `${isStand ? "Plate" : "Block"} line ${index + 1}`,
  );
  const bulkOrderSummary = `${bulkQuantity} gavel${bulkQuantity === 1 ? "" : "s"} · ${
    bulkCheck.designs
  } different design${bulkCheck.designs === 1 ? "" : "s"}`;
  /** Live read-out for the paste box, so mistakes surface before applying. */
  const bulkPastePreview = useMemo(() => {
    if (!bulkCsvText.trim()) return null;
    try {
      const { rows, warning } = parseGavelBulkCsv(bulkCsvText, {
        secondaryMode: effectiveBulkSecondaryMode,
        secondarySurface: bulkSecondarySurface ?? undefined,
      });
      return { rows, warning, error: "" };
    } catch (err) {
      return {
        rows: [] as GavelBulkRow[],
        warning: "",
        error: err instanceof Error ? err.message : "Could not read that file.",
      };
    }
  }, [bulkCsvText, effectiveBulkSecondaryMode, bulkSecondarySurface]);
  const quote = quoteGavelPrice({
    productType,
    soundBlock: isStand ? "none" : soundBlock,
    suedeBag,
    bagSelection,
    quantity: orderQuantity,
    storeUnitPrice,
    suedeBagUnitPrice: bagVariant?.price ?? null,
    styleId: gavelStyle,
  });
  const optionSummary = formatGavelOptionSummary({
    productType,
    soundBlock: isStand ? "none" : soundBlock,
    suedeBag,
    bagSelection,
    standFinish,
    productionMethod,
    soundBlockShape: effectiveSoundBlockShape,
  });
  const finishSummary = isStand
    ? `${formatGavelOrderFinish(gavelStyle, bandFinish)} · ${standDef.label} plate`
    : formatGavelOrderFinish(gavelStyle, bandFinish);

  useEffect(() => {
    setIsClient(true);
    void import("~/utils/gavelWoodTexture").then(({ preloadGavelWoodMaps }) => {
      preloadGavelWoodMaps(GAVEL_STYLES);
    });
  }, []);

  /** Restore wizard progress from the tab draft (once), then let the product URL win. */
  useBeforePaintEffect(() => {
    if (cacheHydratedRef.current) return;
    let restoredBulkRowsAvailable = false;
    try {
      const raw = readGavelDesignerDraft(shop, productId);
      if (raw) {
        const payload = JSON.parse(raw) as GavelDesignerCachePayload;
        if (!payload.logo) {
          const logoRaw = readGavelDesignerDraftLogo(shop, productId);
          if (logoRaw) {
            const logo = JSON.parse(logoRaw) as GavelDesignerCachePayload["logo"];
            if (logo && typeof logo === "object") payload.logo = logo;
          }
        }
        if (payload.version === GAVEL_CACHE_VERSION) {
          const restoredBulkRows = sanitizeCachedBulkRows(payload.bulkRows);
          const restoredBulkMode =
            Boolean(payload.bulkMode) && restoredBulkRows.length > 0;
          restoredBulkRowsAvailable = restoredBulkMode;
          const restoredStep = isStepId(payload.step) ? payload.step : "product";
          const activeStep =
            restoredStep === "done" ||
            (restoredBulkMode && restoredStep === "quantity")
              ? restoredBulkMode
                ? "design"
                : "quantity"
              : restoredStep;
          setStep(activeStep);
          const impliedVisited = STEP_IDS.slice(
            0,
            STEP_IDS.indexOf(activeStep) + 1,
          ).filter((id) => id !== "done");
          const restoredVisited = Array.isArray(payload.visited)
            ? payload.visited.filter(isStepId)
            : [];
          setVisited(
            [...impliedVisited, ...restoredVisited].filter(
              (id, i, all) => id !== "done" && all.indexOf(id) === i,
            ),
          );
          if (includesId(GAVEL_PRODUCT_TYPES, payload.productType)) {
            setProductType(payload.productType);
          }
          if (includesId(GAVEL_SOUND_BLOCK_IDS, payload.soundBlock)) {
            setSoundBlock(payload.soundBlock);
          }
          if (
            includesId(GAVEL_SOUND_BLOCK_SHAPE_IDS, payload.soundBlockShape)
          ) {
            setSoundBlockShape(payload.soundBlockShape);
          }
          setSoundBlockLines(
            sanitizeCachedLines(
              payload.soundBlockLines,
              SOUND_BLOCK_MAX_LINES,
              defaultSoundBlockLines,
            ),
          );
          if (
            payload.bagSelection === "none" ||
            payload.bagSelection === "gavel" ||
            payload.bagSelection === "secondary" ||
            payload.bagSelection === "both"
          ) {
            setBagSelection(payload.bagSelection);
          } else if (typeof payload.suedeBag === "boolean") {
            setBagSelection(payload.suedeBag ? "gavel" : "none");
          }
          if (includesId(GAVEL_PRODUCTION_METHOD_IDS, payload.productionMethod)) {
            setProductionMethod(payload.productionMethod);
          }
          if (typeof payload.logoScale === "number") {
            setLogoScale(clampGavelLogoScale(payload.logoScale));
          }
          if (typeof payload.logoGapScale === "number") {
            setLogoGapScale(clampGavelLogoGapScale(payload.logoGapScale));
          }
          if (
            payload.logoSurface === "stand" ||
            payload.logoSurface === "sound-block"
          ) {
            setLogoSurface(payload.logoSurface);
          }
          if (
            typeof payload.uvTextColor === "string" &&
            (GAVEL_UV_TEXT_COLORS as readonly string[]).includes(
              payload.uvTextColor,
            )
          ) {
            setUvTextColor(payload.uvTextColor);
          }
          setPlateLines(
            sanitizeCachedLines(
              payload.plateLines,
              STAND_PLATE_MAX_LINES,
              defaultPlateLines,
            ),
          );
          if (includesId(GAVEL_STYLE_IDS, payload.gavelStyle)) {
            setGavelStyle(payload.gavelStyle);
          }
          if (includesId(GAVEL_BAND_FINISH_IDS, payload.bandFinish)) {
            setBandFinish(payload.bandFinish);
          }
          if (includesId(GAVEL_TEXT_SIZE_PRESETS, payload.textSize)) {
            setTextSize(payload.textSize);
          }
          setLines(
            sanitizeCachedLines(payload.lines, GAVEL_MAX_LINES, defaultLines),
          );
          if (typeof payload.qty === "number") {
            setQty(clampBadgeLineQty(payload.qty));
          }
          setBulkMode(restoredBulkMode);
          setBulkRows(restoredBulkRows);
          if (typeof payload.bulkCsvText === "string") {
            setBulkCsvText(payload.bulkCsvText);
          }
          if (typeof payload.bulkCsvWarning === "string") {
            setBulkCsvWarning(payload.bulkCsvWarning);
          }
          if (
            payload.bulkSecondaryMode === "shared" ||
            payload.bulkSecondaryMode === "separate"
          ) {
            setBulkSecondaryMode(payload.bulkSecondaryMode);
          }
          setBulkRowsEdited(
            restoredBulkMode && payload.bulkRowsEdited === true,
          );
          setBulkColumnLabels(
            restoredBulkMode
              ? sanitizeCachedColumnLabels(payload.bulkColumnLabels)
              : null,
          );
          const restoredBulkIndex =
            typeof payload.selectedBulkRow === "number"
              ? Math.max(
                  0,
                  Math.min(
                    restoredBulkRows.length - 1,
                    Math.floor(payload.selectedBulkRow),
                  ),
                )
              : 0;
          setSelectedBulkRow(restoredBulkIndex);
          const restoredSelectedRow = restoredBulkRows[restoredBulkIndex];
          if (restoredBulkMode && restoredSelectedRow) {
            setLines((current) =>
              current.map((line, index) => ({
                ...line,
                text: restoredSelectedRow.texts[index] ?? "",
              })),
            );
            if (payload.productType === "stand") {
              setPlateLines((current) =>
                current.map((line, index) => ({
                  ...line,
                  text: restoredSelectedRow.secondaryTexts[index] ?? "",
                })),
              );
            } else if (payload.soundBlock === "engraved") {
              setSoundBlockLines((current) =>
                current.map((line, index) => ({
                  ...line,
                  text: restoredSelectedRow.secondaryTexts[index] ?? "",
                })),
              );
            }
          }
          if (typeof payload.designId === "string" && payload.designId) {
            designIdRef.current = payload.designId;
          }
          const logo = payload.logo;
          if (
            logo &&
            typeof logo.dataUrl === "string" &&
            logo.dataUrl.startsWith("data:") &&
            logo.dataUrl.length <= GAVEL_CACHE_MAX_LOGO_CHARS
          ) {
            const file = dataUrlToFile(
              logo.dataUrl,
              typeof logo.name === "string" ? logo.name : "logo",
              typeof logo.type === "string" ? logo.type : "",
            );
            if (file) {
              setLogoFile(file);
              setLogoDataUrl(logo.dataUrl);
            }
          }
        }
      }
    } catch {
      // ignore quota, parse, or private-mode errors
    }
    cacheHydratedRef.current = true;
    try {
      const priorError = sessionStorage.getItem(GAVEL_LAST_ERROR_KEY);
      if (priorError) {
        sessionStorage.removeItem(GAVEL_LAST_ERROR_KEY);
        console.warn(
          "[GavelDesigner] The previous visit ended with an error:",
          priorError,
        );
      }
    } catch {
      // ignore private-mode storage errors
    }

    const requested = readQueryParam("productType") as GavelProductType;
    if (GAVEL_PRODUCT_TYPES.includes(requested)) {
      setProductType(requested);
      if (requested === "stand") setSoundBlock("none");
    }
    const requestedSoundBlock = readQueryParam(
      "soundBlock",
    ) as GavelSoundBlockId;
    if (
      requested !== "stand" &&
      GAVEL_SOUND_BLOCK_IDS.includes(requestedSoundBlock)
    ) {
      setSoundBlock(requestedSoundBlock);
    }
    const requestedBulkMode = readQueryParam("bulk") === "1";
    if (requestedBulkMode) {
      setBulkMode(true);
      if (!restoredBulkRowsAvailable) {
        const blank = (current: BadgeLine[]) =>
          current.map((line) => ({ ...line, text: "" }));
        setLines(blank);
        setPlateLines(blank);
        setSoundBlockLines(blank);
      }
    }
    const requestedLogoSurface = readQueryParam("logoSurface");
    if (
      requestedLogoSurface === "stand" ||
      requestedLogoSurface === "sound-block"
    ) {
      setLogoSurface(requestedLogoSurface);
    } else if (requested === "stand") {
      setLogoSurface("stand");
    } else {
      setLogoSurface("sound-block");
    }
    setHydrated(true);
  }, [productId, shop]);

  useEffect(() => {
    if (!logoFile) {
      setLogoDataUrl(null);
      return;
    }
    let cancelled = false;
    const reader = new FileReader();
    reader.onload = () => {
      if (cancelled || typeof reader.result !== "string") return;
      setLogoDataUrl(reader.result);
    };
    reader.readAsDataURL(logoFile);
    return () => {
      cancelled = true;
    };
  }, [logoFile]);

  useEffect(() => {
    if (!logoDataUrl) {
      setLogoImage(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setLogoImage(img);
    };
    img.onerror = () => {
      if (!cancelled) setLogoImage(null);
    };
    img.src = logoDataUrl;
    return () => {
      cancelled = true;
    };
  }, [logoDataUrl]);

  const lastWrittenLogoJsonRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    // `hydrated` flips only after the draft has been read, so this never
    // writes the blank first render over a saved design.
    if (!hydrated) return;
    if (skipCacheSaveRef.current) {
      skipCacheSaveRef.current = false;
      lastWrittenLogoJsonRef.current = null;
      return;
    }
    const payload: GavelDesignerCachePayload = {
      version: GAVEL_CACHE_VERSION,
      step,
      visited,
      productType,
      soundBlock,
      soundBlockShape,
      soundBlockLines,
      suedeBag,
      bagSelection,
      productionMethod,
      logoScale,
      logoGapScale,
      logoSurface,
      uvTextColor,
      plateLines,
      gavelStyle,
      bandFinish,
      textSize,
      lines,
      qty,
      bulkMode,
      bulkRows,
      bulkCsvText,
      bulkCsvWarning,
      bulkSecondaryMode,
      bulkRowsEdited,
      bulkColumnLabels,
      selectedBulkRow,
      designId: designIdRef.current,
      logo:
        logoFile &&
        logoDataUrl &&
        logoDataUrl.length <= GAVEL_CACHE_MAX_LOGO_CHARS
          ? {
              name: logoFile.name,
              type: logoFile.type,
              dataUrl: logoDataUrl,
            }
          : null,
    };
    const written = writeGavelDesignerDraft(
      shop,
      productId,
      payload,
      lastWrittenLogoJsonRef.current,
    );
    if (written.ok) lastWrittenLogoJsonRef.current = written.logoJson;
  }, [
    bandFinish,
    bagSelection,
    bulkCsvText,
    bulkCsvWarning,
    bulkMode,
    bulkColumnLabels,
    bulkRows,
    bulkRowsEdited,
    bulkSecondaryMode,
    gavelStyle,
    hydrated,
    lines,
    logoDataUrl,
    logoFile,
    logoGapScale,
    logoScale,
    logoSurface,
    plateLines,
    productId,
    productType,
    productionMethod,
    qty,
    selectedBulkRow,
    shop,
    soundBlock,
    soundBlockLines,
    soundBlockShape,
    step,
    suedeBag,
    textSize,
    uvTextColor,
    visited,
  ]);

  /**
   * Price and variant follow the wood + sound block the customer picked. The
   * `variantId`/`price` query params the embed passes are only a fallback: they
   * describe the product's first variant, not the chosen combination.
   */
  useEffect(() => {
    const match = resolveGavelVariant(storeProduct, {
      productType,
      styleId: gavelStyle,
      soundBlock: productType === "stand" ? "none" : soundBlock,
      soundBlockShape: effectiveSoundBlockShape,
    });
    if (match) {
      setVariantId(match.variantId);
      setStoreUnitPrice(match.price);
      return;
    }
    const key = `variantId${gavelStyle.charAt(0).toUpperCase()}${gavelStyle.slice(1)}`;
    const styleVariant =
      readQueryParam(key) ||
      readQueryParam("variantId") ||
      readQueryParam("variantIdSign");
    setVariantId(styleVariant);
    setStoreUnitPrice(parsePrice(readQueryParam("price")));
  }, [
    effectiveSoundBlockShape,
    gavelStyle,
    productType,
    soundBlock,
    storeProduct,
  ]);

  useEffect(() => {
    setPlateLines((prev) =>
      prev.map((line) => ({
        ...line,
        text: clampGavelLineText(line.text ?? "", textSize),
      })),
    );
  }, [textSize]);

  useEffect(() => {
    if (!standDef.allowsUvPrint) setProductionMethod("engrave");
  }, [standDef.allowsUvPrint]);

  /** Drop back to the square block when the round one is not offered. */
  useEffect(() => {
    if (!roundBlockAvailable) setSoundBlockShape("square");
  }, [roundBlockAvailable]);

  /**
   * Ebony has no stand, and any wood can sell out. Either way the preselected
   * wood would be a card the customer cannot click, so move to one they can
   * actually order. When nothing is in stock we stay put, leaving the disabled
   * card and its notice on screen rather than silently picking a sold-out wood.
   */
  useEffect(() => {
    const selectable = (id: GavelStyleId) => woodAvailability(id) === "ok";
    if (selectable(gavelStyle)) return;
    const fallback = GAVEL_STYLES.find((s) => selectable(s.id));
    if (fallback) setGavelStyle(fallback.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- woodAvailability reads only the values listed here
  }, [
    effectiveSoundBlockShape,
    catalogByType,
    gavelStyle,
    productType,
    soundBlock,
    storeProduct,
  ]);

  useEffect(() => {
    if (!isGavelSoundBlockOffered(soundBlock, gavelStyle)) {
      setSoundBlock("plain");
    }
  }, [gavelStyle, soundBlock]);

  useEffect(() => {
    if (
      !isStand &&
      !hasSoundBlock &&
      (bagSelection === "secondary" || bagSelection === "both")
    ) {
      setBagSelection("gavel");
    }
  }, [bagSelection, hasSoundBlock, isStand]);

  useEffect(() => {
    if (isStand && logoSurface !== "stand") {
      setLogoSurface("stand");
    } else if (!isStand && logoSurface !== "sound-block") {
      setLogoSurface("sound-block");
    }
  }, [isStand, logoSurface]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const mq = window.matchMedia("(max-width: 900px)");
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;

    const syncViewport = () => {
      const vv = window.visualViewport;
      const overlap = vv
        ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
        : 0;
      root.style.setProperty(
        "--gf-vv-height",
        `${Math.round(vv?.height ?? window.innerHeight)}px`,
      );
      root.style.setProperty(
        "--gf-vv-top",
        `${Math.round(vv?.offsetTop ?? 0)}px`,
      );
      root.style.setProperty("--gf-keyboard-inset", `${Math.round(overlap)}px`);
      root.classList.toggle("is-keyboard", overlap > 80);

      if (mq.matches) {
        html.style.overflow = "hidden";
        body.style.overflow = "hidden";
        body.style.overscrollBehavior = "none";
      } else {
        html.style.overflow = prevHtmlOverflow;
        body.style.overflow = prevBodyOverflow;
        body.style.overscrollBehavior = prevBodyOverscroll;
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      if (csvModalOpenRef.current) return;
      syncViewport();
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!target.matches("input, textarea, select")) return;
      window.setTimeout(() => {
        const scroller = target.closest(".gf-controls-col");
        if (scroller instanceof HTMLElement) {
          const scrollerRect = scroller.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const offset =
            targetRect.top - scrollerRect.top - scroller.clientHeight * 0.22;
          scroller.scrollBy({ top: offset, behavior: "smooth" });
          return;
        }
        target.scrollIntoView({ block: "center", behavior: "smooth" });
      }, 300);
    };

    const vv = window.visualViewport;
    vv?.addEventListener("resize", syncViewport);
    vv?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    mq.addEventListener("change", syncViewport);
    root.addEventListener("focusin", onFocusIn);
    root.addEventListener("focusout", syncViewport);
    syncViewport();

    return () => {
      vv?.removeEventListener("resize", syncViewport);
      vv?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
      mq.removeEventListener("change", syncViewport);
      root.removeEventListener("focusin", onFocusIn);
      root.removeEventListener("focusout", syncViewport);
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
      root.classList.remove("is-keyboard");
      root.style.removeProperty("--gf-vv-height");
      root.style.removeProperty("--gf-vv-top");
      root.style.removeProperty("--gf-keyboard-inset");
    };
    // `hydrated` gates the wizard markup, so the root node only exists after it flips.
  }, [hydrated]);

  useEffect(() => {
    return () => {
      if (proofUrl) URL.revokeObjectURL(proofUrl);
    };
  }, [proofUrl]);

  const linesForBulkRow = useCallback(
    (row: GavelBulkRow): BadgeLine[] =>
      bandArtLines.map((line, index) => ({
        ...line,
        id: `${row.id}-line-${index}`,
        text: row.texts[index] ?? "",
      })),
    [bandArtLines],
  );

  const secondaryLinesForBulkRow = useCallback(
    (row: GavelBulkRow): BadgeLine[] => {
      const base = isStand ? plateArtLines : soundBlockArtLines;
      return base.map((line, index) => ({
        ...line,
        id: `${row.id}-secondary-line-${index}`,
        text: row.secondaryTexts[index] ?? "",
      }));
    },
    [isStand, plateArtLines, soundBlockArtLines],
  );

  const badgeForSave = useCallback((
    overrideLines?: BadgeLine[],
    overrideSecondaryLines?: BadgeLine[],
    overrideTextSize?: GavelTextSizePreset,
  ): Badge => {
    return {
      lines: overrideLines ?? bandArtLines,
      backgroundColor: bandDef.color,
      backing: "pin",
      gavelStyle,
      gavelBandFinish: bandFinish,
      gavelTextSizePreset: overrideTextSize ?? textSize,
      gavelHandleLength: "standard",
      gavelProductType: productType,
      gavelSoundBlock: isStand ? "none" : soundBlock,
      gavelSoundBlockShape: isStand ? "square" : effectiveSoundBlockShape,
      gavelSoundBlockText: soundBlockEngraved
        ? joinSoundBlockText(overrideSecondaryLines ?? soundBlockArtLines)
        : "",
      gavelSoundBlockLines: soundBlockEngraved
        ? overrideSecondaryLines ?? soundBlockArtLines
        : undefined,
      gavelSuedeBag: suedeBag,
      gavelBagSelection: bagSelection,
      gavelStandFinish: isStand ? standFinish : undefined,
      gavelProductionMethod: isStand ? productionMethod : undefined,
      gavelStandPlateLines: isStand
        ? overrideSecondaryLines ?? plateArtLines
        : undefined,
    };
  }, [
    bandArtLines,
    bandDef.color,
    bandFinish,
    bagSelection,
    effectiveSoundBlockShape,
    gavelStyle,
    isStand,
    plateArtLines,
    productType,
    productionMethod,
    soundBlock,
    soundBlockArtLines,
    soundBlockEngraved,
    standFinish,
    suedeBag,
    textSize,
  ]);

  const updateLine = (index: number, changes: Partial<BadgeLine>) => {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...changes };
        if (changes.text != null) {
          next.text = clampGavelLineText(changes.text, textSize);
        }
        return next;
      }),
    );
    if (changes.text != null && bulkRows.length > 0) {
      setBulkRows((prev) =>
        prev.map((row, rowIndex) =>
          rowIndex === selectedBulkRow
            ? {
                ...row,
                texts: row.texts.map((text, textIndex) =>
                  textIndex === index
                    ? clampGavelLineText(changes.text ?? "", textSize)
                    : text,
                ) as GavelBulkRow["texts"],
              }
            : row,
        ),
      );
    }
    if (index === 0 && (changes.text ?? "").trim()) setLineError(false);
  };

  /** Puts one row's wording into the design fields the preview draws from. */
  const showBulkRowInDesign = (row: GavelBulkRow) => {
    setLines((prev) =>
      prev.map((line, lineIndex) => ({
        ...line,
        text: row.texts[lineIndex] ?? "",
      })),
    );
    if (isStand) {
      setPlateLines((prev) =>
        prev.map((line, lineIndex) => ({
          ...line,
          text: row.secondaryTexts[lineIndex] ?? "",
        })),
      );
    } else if (soundBlockEngraved) {
      setSoundBlockLines((prev) =>
        prev.map((line, lineIndex) => ({
          ...line,
          text: row.secondaryTexts[lineIndex] ?? "",
        })),
      );
    }
  };

  const selectBulkRow = (index: number) => {
    const row = bulkRows[index];
    if (!row) return;
    setSelectedBulkRow(index);
    showBulkRowInDesign(row);
    setLineError(false);
  };

  /**
   * Every hand edit goes through here. The rows belong to the order once
   * imported, so the CSV is never consulted again.
   */
  const commitBulkRows = (
    rows: GavelBulkRow[],
    selectIndex: number,
    options: { edited?: boolean } = {},
  ) => {
    const index = Math.max(0, Math.min(rows.length - 1, selectIndex));
    setBulkRows(rows);
    setSelectedBulkRow(index);
    if (rows[index]) showBulkRowInDesign(rows[index]);
    if (options.edited !== false) setBulkRowsEdited(true);
  };

  const patchBulkRow = (
    index: number,
    patch: (row: GavelBulkRow) => GavelBulkRow,
  ) => {
    const row = bulkRows[index];
    if (!row) return;
    commitBulkRows(
      bulkRows.map((item, itemIndex) => (itemIndex === index ? patch(item) : item)),
      index,
    );
  };

  const editBulkBandText = (index: number, lineIndex: number, value: string) => {
    patchBulkRow(index, (row) => {
      const texts = row.texts.map((text, textIndex) =>
        textIndex === lineIndex ? value : text,
      ) as GavelBulkRow["texts"];
      return {
        ...row,
        texts,
        secondaryTexts:
          effectiveBulkSecondaryMode === "shared" && bulkSecondarySurface
            ? sharedSecondaryTexts(texts, bulkSecondarySurface)
            : row.secondaryTexts,
      };
    });
  };

  const editBulkSecondaryText = (
    index: number,
    lineIndex: number,
    value: string,
  ) => {
    patchBulkRow(index, (row) => ({
      ...row,
      secondaryTexts: row.secondaryTexts.map((text, textIndex) =>
        textIndex === lineIndex ? value : text,
      ) as GavelBulkRow["secondaryTexts"],
    }));
  };

  const editBulkQuantity = (index: number, value: string) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return;
    patchBulkRow(index, (row) => ({ ...row, quantity: clampBadgeLineQty(parsed) }));
  };

  const editBulkTextSize = (index: number, value: string) => {
    const size = parseGavelTextSize(value);
    patchBulkRow(index, (row) => {
      const next = { ...row, textSize: size };
      if (!size) delete next.textSize;
      return next;
    });
  };

  const duplicateBulkRow = (index: number) => {
    const row = bulkRows[index];
    if (!row) return;
    const copy: GavelBulkRow = {
      ...row,
      id: newGavelBulkRowId(),
      texts: [...row.texts] as GavelBulkRow["texts"],
      secondaryTexts: [...row.secondaryTexts] as GavelBulkRow["secondaryTexts"],
    };
    bulkFocusRowRef.current = copy.id;
    commitBulkRows(
      [...bulkRows.slice(0, index + 1), copy, ...bulkRows.slice(index + 1)],
      index + 1,
    );
  };

  const deleteBulkRow = (index: number) => {
    if (!bulkRows[index]) return;
    const rows = bulkRows.filter((_, rowIndex) => rowIndex !== index);
    const nextSelected =
      selectedBulkRow > index
        ? selectedBulkRow - 1
        : Math.min(selectedBulkRow, rows.length - 1);
    commitBulkRows(rows, nextSelected);
  };

  const addBlankBulkRow = () => {
    const row = blankGavelBulkRow();
    bulkFocusRowRef.current = row.id;
    setBulkMode(true);
    setBulkSearch("");
    commitBulkRows([...bulkRows, row], bulkRows.length);
  };

  /* A new or duplicated row takes keyboard focus so typing can start at once. */
  useEffect(() => {
    const id = bulkFocusRowRef.current;
    if (!id) return;
    bulkFocusRowRef.current = null;
    const key = CSS.escape(id);
    const field =
      document.querySelector<HTMLInputElement>(
        `.gf-modal [data-bulk-row="${key}"] input`,
      ) ??
      document.querySelector<HTMLInputElement>(
        `[data-bulk-editor-row="${key}"] input`,
      );
    field?.focus();
    field?.select();
  }, [bulkRows]);

  const loadBulkRows = (
    { rows, warning, columnLabels }: GavelBulkCsvResult,
    how: "replace" | "merge",
  ) => {
    setBulkMode(true);
    setBulkCsvWarning(warning);
    setBulkCsvText("");
    setPendingBulkImport(null);
    setBulkProblemsOnly(false);
    if (how === "merge") {
      // Merged rows keep the names the list already shows.
      if (!bulkColumnLabels) setBulkColumnLabels(columnLabels);
      const merged = mergeGavelBulkRows(bulkRows, rows);
      commitBulkRows(merged.rows, selectedBulkRow);
      setBulkNotice(
        `Added ${merged.added} row${merged.added === 1 ? "" : "s"}` +
          (merged.skipped
            ? ` · ${merged.skipped} already in your list ${merged.skipped === 1 ? "was" : "were"} skipped`
            : "") +
          ".",
      );
      return;
    }
    commitBulkRows(rows, 0, { edited: false });
    setBulkColumnLabels(columnLabels);
    setBulkRowsEdited(false);
    setBulkSortKey(null);
    setBulkNotice("");
  };

  /**
   * Returns true when the list was applied straight away; false when it failed
   * or is waiting on the Merge / Replace choice.
   */
  const applyBulkCsv = (csv: string): boolean => {
    setError(null);
    try {
      const result = parseGavelBulkCsv(csv, {
        secondaryMode: effectiveBulkSecondaryMode,
        secondarySurface: bulkSecondarySurface ?? undefined,
      });
      if (bulkRows.length > 0) {
        setPendingBulkImport(result);
        return false;
      }
      loadBulkRows(result, "replace");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import that file.");
      return false;
    }
  };

  const downloadCurrentBulkRows = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          gavelBulkRowsToCsv(
            bulkRows.filter((row) => !gavelBulkRowIsBlank(row)),
            effectiveBulkSecondaryMode,
            bulkSecondarySurface,
          ),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "gavel-names-current.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  /** Switching surface modes converts the rows instead of discarding them. */
  const changeBulkSecondaryMode = (mode: GavelBulkSecondaryMode) => {
    setBulkSecondaryMode(mode);
    setPendingBulkImport(null);
    if (mode !== "shared" || bulkRows.length === 0 || !bulkSecondarySurface) {
      return;
    }
    commitBulkRows(
      bulkRows.map((row) => ({
        ...row,
        secondaryTexts: sharedSecondaryTexts(row.texts, bulkSecondarySurface),
      })),
      selectedBulkRow,
      { edited: bulkRowsEdited },
    );
  };

  const closeCsvModal = (options?: { keepBulk?: boolean }) => {
    setCsvModalOpen(false);
    // Rows applied in this same click are not in state yet, so the caller
    // passes keepBulk to avoid undoing that import.
    if (!options?.keepBulk && !bulkModeLocked && bulkRows.length === 0) {
      setBulkMode(false);
    }
    setPreviewRevive((n) => n + 1);
  };

  const openCsvModal = () => {
    setError(null);
    setCsvModalOpen(true);
    if (
      window.parent !== window &&
      document.documentElement.classList.contains("gf-autosized")
    ) {
      window.parent.postMessage(
        {
          action: "gavel-designer-scroll-into-view",
          behavior: "smooth",
          block: "start",
        },
        "*",
      );
    }
  };

  /* The pasted list grows the box instead of scrolling inside it. */
  useLayoutEffect(() => {
    const field = bulkPasteRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight + 2}px`;
  }, [bulkCsvText, csvModalOpen]);

  const fontSignature = useMemo(() => {
    const parts: string[] = [];
    for (const line of [...lines, ...plateLines, ...soundBlockLines]) {
      parts.push(
        `${line.fontFamily ?? ""}|${line.bold ? 1 : 0}|${line.italic ? 1 : 0}`,
      );
    }
    return parts.join(";");
  }, [lines, plateLines, soundBlockLines]);

  useEffect(() => {
    if (!isClient) return;
    let cancelled = false;
    const families = fontSignature
      .split(";")
      .filter(Boolean)
      .map((part) => part.split("|")[0] || GAVEL_DEFAULT_FONT);
    void preloadGavelFonts(families).then(() => {
      if (!cancelled) setFontEpoch((n) => n + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [fontSignature, isClient]);

  useEffect(() => {
    if (!csvModalOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCsvModal();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [csvModalOpen, bulkModeLocked, bulkRows.length]);

  const importBulkCsv = async (file: File) => {
    try {
      const text = await file.text();
      setBulkCsvText(text);
      applyBulkCsv(text);
    } catch {
      setError("Could not read that file.");
    } finally {
      if (bulkCsvInputRef.current) bulkCsvInputRef.current.value = "";
    }
  };

  const downloadBulkCsvTemplate = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          gavelBulkCsvTemplate(
            effectiveBulkSecondaryMode,
            bulkSecondarySurface,
          ),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "gavel-bulk-personalization.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const exitBulkMode = () => {
    if (bulkModeLocked) return;
    setBulkMode(false);
    setBulkRows([]);
    setSelectedBulkRow(0);
    setBulkSearch("");
    setBulkCsvWarning("");
    setBulkRowsEdited(false);
    setPendingBulkImport(null);
    setBulkNotice("");
    setError(null);
  };

  /**
   * Sorting reorders the list itself rather than the view, so a row being
   * edited never jumps to a new position mid-word.
   */
  const toggleBulkSort = (key: GavelBulkSortKey) => {
    const ascending = bulkSortKey === key ? !bulkSortAscending : true;
    setBulkSortKey(key);
    setBulkSortAscending(ascending);
    const valueFor = (row: GavelBulkRow) => {
      if (key === "quantity") return row.quantity;
      const lineIndex = Number(key.slice(-1)) - 1;
      return key.startsWith("secondary")
        ? row.secondaryTexts[lineIndex] ?? ""
        : row.texts[lineIndex] ?? "";
    };
    const selectedId = bulkRows[selectedBulkRow]?.id;
    const sorted = [...bulkRows].sort((a, b) => {
      const aValue = valueFor(a);
      const bValue = valueFor(b);
      const comparison =
        typeof aValue === "number" && typeof bValue === "number"
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue), undefined, {
              numeric: true,
              sensitivity: "base",
            });
      return ascending ? comparison : -comparison;
    });
    setBulkRows(sorted);
    setSelectedBulkRow(
      Math.max(0, sorted.findIndex((row) => row.id === selectedId)),
    );
  };

  /*
   * Lines that already differ (a restored draft, or styled one by one) keep
   * their per-line controls open, so a differing line is never hidden.
   */
  const [bandStyleSplit, setBandStyleSplit] = useState(false);
  const [plateStyleSplit, setPlateStyleSplit] = useState(false);
  const bandStyleIndividual = bandStyleSplit || !linesShareStyle(lines);
  const plateStyleIndividual = plateStyleSplit || !linesShareStyle(plateLines);

  const updateAllLines = (changes: Partial<BadgeLine>) => {
    setLines((prev) => prev.map((line) => ({ ...line, ...changes })));
  };

  const updateAllPlateLines = (changes: Partial<BadgeLine>) => {
    setPlateLines((prev) => prev.map((line) => ({ ...line, ...changes })));
  };

  const setBandStyleIndividual = (individual: boolean) => {
    setBandStyleSplit(individual);
    if (!individual) setLines((prev) => unifyLineStyles(prev));
  };

  const setPlateStyleIndividual = (individual: boolean) => {
    setPlateStyleSplit(individual);
    if (!individual) setPlateLines((prev) => unifyLineStyles(prev));
  };

  const updatePlateLine = (index: number, changes: Partial<BadgeLine>) => {
    setPlateLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...changes };
        if (changes.text != null) {
          next.text = clampGavelLineText(changes.text, textSize);
        }
        return next;
      }),
    );
  };

  const updateSoundBlockLine = (index: number, changes: Partial<BadgeLine>) => {
    setSoundBlockLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...changes };
        if (changes.text != null) {
          const others = soundBlockCharCount(
            prev.filter((_, lineIndex) => lineIndex !== index),
          );
          next.text = clampSoundBlockLineText(changes.text, others);
        }
        return next;
      }),
    );
  };

  const captureMockup = useCallback(async () => {
    const handle = previewRef.current;
    if (!handle) return;
    const dataUrl = handle.capturePngDataUrl();
    const blob = await handle.capturePngBlob();
    if (dataUrl) mockupRef.current = { dataUrl, blob };
  }, []);

  const centerDesignerForStep = useCallback((resetNestedScroll = true) => {
    if (typeof window === "undefined") return;

    /*
     * Preview steps scroll their controls in a nested column on phones. Reset
     * both possible scrollers after React has painted the new step, then center
     * the tool itself. The postMessage lets the Shopify product page center the
     * iframe too; scrollIntoView alone cannot move a parent document.
     */
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const root = rootRef.current;
        if (!root) return;

        if (resetNestedScroll) {
          root
            .querySelectorAll<HTMLElement>(".gf-panel, .gf-controls-col")
            .forEach((scroller) => {
              scroller.scrollTo({ top: 0, behavior: "auto" });
            });
        }
        root.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });

        if (window.parent !== window) {
          window.parent.postMessage(
            {
              action: "gavel-designer-scroll-into-view",
              behavior: "smooth",
              block: "center",
            },
            "*",
          );
        }
      });
    });
  }, []);

  const centerDesignerCanvas = useCallback(() => {
    centerDesignerForStep(false);
  }, [centerDesignerForStep]);

  useLayoutEffect(() => {
    if (!hydrated) return;
    if (previousStepRef.current === step) return;
    previousStepRef.current = step;
    centerDesignerForStep();
  }, [centerDesignerForStep, hydrated, step]);

  function goToStep(next: StepId) {
    const fromIdx = sequence.indexOf(step);
    const toIdx = sequence.indexOf(next);
    if (toIdx > fromIdx && step !== "done") {
      analytics.stepCompleted(step);
    }
    setStep(next);
    setVisited((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setError(null);
  }

  function goBack() {
    const prev = sequence[Math.max(0, stepIndex - 1)];
    goToStep(prev);
  }

  async function onContinue() {
    const next = sequence[Math.min(sequence.length - 1, stepIndex + 1)];
    if (step === "design") {
      if (bulkMode && bulkRows.length === 0) {
        setError("Add your list before continuing.");
        return;
      }
      if (bulkMode && bulkErrorRowNumbers.length > 0) {
        const count = bulkErrorRowNumbers.length;
        const shown = bulkErrorRowNumbers.slice(0, 5).join(", ");
        selectBulkRow(bulkErrorRowNumbers[0] - 1);
        setBulkProblemsOnly(true);
        if (bulkWide) openDesignTab("band");
        else openCsvModal();
        setError(
          `${count} row${count === 1 ? " needs" : "s need"} fixing before you continue ` +
            `(${count === 1 ? "row" : "rows"} ${shown}${count > 5 ? ", …" : ""}). ` +
            "They are marked in red in your list.",
        );
        return;
      }
      if (!bulkMode && !(lines[0]?.text ?? "").trim()) {
        setLineError(true);
        // Phones show one surface at a time; bring the band fields back so the
        // error next to line 1 is on screen.
        setEditSurface("band");
        setPreviewFocus((prev) => ({ area: "band", token: prev.token + 1 }));
        return;
      }
      setLineError(false);
      await captureMockup();
      if (bulkMode) {
        await onReviewProof();
        return;
      }
    }
    goToStep(next);
  }

  function buildDesignPayload() {
    const allBadges =
      bulkRows.length > 0
        ? bulkRows.map((row) =>
            badgeForSave(
              linesForBulkRow(row),
              secondaryLinesForBulkRow(row),
              row.textSize,
            ),
          )
        : [badgeForSave()];
    const badge = allBadges[0];
    return {
      designId: designIdRef.current,
      badge,
      allBadges,
      multipleBadges: allBadges.slice(1),
      gavelBulkRows:
        bulkRows.length > 0
          ? bulkRows.map((row) => ({
              quantity: row.quantity,
              lines: row.texts,
              secondaryLines: row.secondaryTexts,
              secondaryMode: effectiveBulkSecondaryMode,
              textSize: row.textSize ?? textSize,
            }))
          : [],
      gavelStyle,
      gavelBandFinish: bandFinish,
      gavelTextSizePreset: textSize,
      gavelHandleLength: "standard" as const,
      gavelProductType: productType,
      gavelSoundBlock: soundBlock,
      gavelSoundBlockShape: effectiveSoundBlockShape,
      gavelSoundBlockText: soundBlockEngraved
        ? joinSoundBlockText(
            bulkRows[selectedBulkRow]
              ? secondaryLinesForBulkRow(bulkRows[selectedBulkRow])
              : soundBlockArtLines,
          )
        : "",
      gavelSoundBlockLines: soundBlockEngraved
        ? bulkRows[selectedBulkRow]
          ? secondaryLinesForBulkRow(bulkRows[selectedBulkRow])
          : soundBlockArtLines
        : undefined,
      gavelSuedeBag: suedeBag,
      gavelBagSelection: bagSelection,
      gavelStandFinish: isStand ? standFinish : null,
      gavelProductionMethod: isStand ? productionMethod : null,
      gavelStandPlateLines: isStand
        ? bulkRows[selectedBulkRow]
          ? secondaryLinesForBulkRow(bulkRows[selectedBulkRow])
          : plateArtLines
        : null,
      gavelBandColor: bandDef.color,
      gavelPlateColor: isStand ? standDef.plateHex : null,
      gavelLogoFileName: logoAllowed ? (logoFile?.name ?? null) : null,
      gavelLogoScale: logoFile && logoAllowed ? logoScale : null,
      gavelLogoGapScale: logoFile && logoAllowed ? logoGapScale : null,
      gavelLogoSurface: logoFile && logoAllowed ? logoSurface : null,
      gavelLogoColorMode:
        logoFile && logoAllowed ? (isStand ? "full-color" : "black") : null,
      totalPrice: quote.total,
      timestamp: new Date().toISOString(),
      shopId: shop || readQueryParam("shop") || "test-shop",
      productId: productId || readQueryParam("product") || "test-product",
    };
  }

  async function saveDraft(opts?: {
    thumbnailBlob?: Blob | null;
  }) {
    const designId = designIdRef.current;
    const designData = buildDesignPayload();
    const form = new FormData();
    form.append("designId", designId);
    form.append("designData", JSON.stringify(designData));
    const customer = customerId || readQueryParam("customerId");
    if (customer) form.append("shopifyCustomerId", customer);
    if (opts?.thumbnailBlob && opts.thumbnailBlob.size > 0) {
      form.append("thumbnail_png_0", opts.thumbnailBlob, "gavel-0-thumbnail.png");
    }
    if (logoFile && logoAllowed) {
      form.append("logo_0", logoFile, logoFile.name);
    }
    const rowsToSave =
      bulkRows.length > 0
        ? bulkRows.map(linesForBulkRow)
        : [bandArtLines];
    const svgBlob = (svg: string) =>
      new Blob([svg], { type: "image/svg+xml" });
    rowsToSave.forEach((rowLines, index) => {
      const rowTextSize = bulkRows[index]?.textSize ?? textSize;
      // Every gavel ships with an engraved band, stand or no stand, so the band
      // is always the primary manufacturing file.
      const bandSvg = gavelBandToSvgString(rowLines, rowTextSize, bandDef.color);
      form.append(`svg_${index}`, svgBlob(bandSvg), `gavel-${index}-design.svg`);
      form.append(
        `print_svg_${index}`,
        svgBlob(bandSvg),
        `gavel-${index}-print.svg`,
      );

      // A stand plate and an engraved sound block are second engraved surfaces
      // on the same line, never alternatives to the band. `standLogo` and
      // `soundBlockLogo` are already null unless the logo belongs to that
      // surface, so the surface owns its own art.
      const bulkRow = bulkRows[index];
      const rowSecondaryLines = bulkRow
        ? secondaryLinesForBulkRow(bulkRow)
        : null;
      const rowSoundBlockLines = rowSecondaryLines ?? soundBlockArtLines;
      const secondary = isStand
        ? {
            kind: "plate",
            svg: gavelStandPlateToSvgString(
              rowSecondaryLines ?? plateArtLines,
              rowTextSize,
              standDef.plateHex,
              { logo: standLogo },
            ),
          }
        : soundBlockEngraved
          ? {
              kind: "sound-block",
              svg: soundBlockTopToSvgString(
                rowSoundBlockLines,
                getSoundBlockTopTextColor(gavelStyle),
                { logo: soundBlockLogo },
              ),
            }
          : null;
      if (secondary) {
        form.append(
          `secondary_svg_${index}`,
          svgBlob(secondary.svg),
          `gavel-${index}-${secondary.kind}.svg`,
        );
        form.append(`secondary_svg_kind_${index}`, secondary.kind);
      }
    });
    const paths = getDesignerApiPaths("gavel");
    const res = await fetch(paths.saveDraft, { method: "POST", body: form });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Draft save failed (${res.status}) ${text}`.trim());
    }
  }

  async function onReviewProof() {
    setError(null);
    if (!designReady) {
      setError(
        bulkMode
          ? "Add your list before reviewing the preview."
          : "Enter at least one line of custom text.",
      );
      goToStep("design");
      return;
    }
    if (bagSelection !== "none" && !bagVariant) {
      setError(
        bagProductLoading
          ? "Bag pricing is still loading. Try again in a moment."
          : "That bag option is not available yet. Update the velour bag product variants in Shopify or choose another option.",
      );
      return;
    }
    setBusy(true);
    try {
      const latestProduct = await fetchStoreProduct(
        gavelProductHandleFor(productType),
        shopHost,
      );
      if (latestProduct) {
        setStoreProduct(latestProduct);
        setCatalogByType((prev) => ({ ...prev, [productType]: latestProduct }));
        if (
          !isGavelVariantInStock(latestProduct, {
            productType,
            styleId: gavelStyle,
            soundBlock: isStand ? "none" : soundBlock,
            soundBlockShape: effectiveSoundBlockShape,
          })
        ) {
          throw new Error(
            "That configuration is currently out of stock. Choose another available option.",
          );
        }
      }
      await captureMockup();
      await saveDraft({
        thumbnailBlob: mockupRef.current.blob,
      });
      const pdfBlob = await generateGavelProofPdf({
        styleId: gavelStyle,
        bandFinishId: bandFinish,
        textSizePreset: previewTextSize,
        lines: bandArtLines,
        quantity: orderQuantity,
        mockupDataUrl: mockupRef.current.dataUrl || bandTextureUrl,
        unwrappedDataUrl: bandTextureUrl,
        productType,
        soundBlock: isStand ? "none" : soundBlock,
        soundBlockShape: effectiveSoundBlockShape,
        soundBlockText: soundBlockEngraved ? soundBlockArtText : "",
        soundBlockDataUrl: soundBlockTextureUrl || null,
        suedeBag,
        bagSelection,
        standFinish: isStand ? standFinish : undefined,
        productionMethod: isStand ? productionMethod : undefined,
        plateLines: isStand ? plateArtLines : undefined,
        // Rendered from the committed placement, since the on-screen texture can
        // still be a deferred render behind the sliders.
        plateDataUrl: renderPlateTexture(standLogo) || null,
        unitPrice: quote.unitPrice,
        estimatedTotal: quote.total,
        logoFileName: logoAllowed ? (logoFile?.name ?? null) : null,
      });
      if (proofUrl) URL.revokeObjectURL(proofUrl);
      const url = URL.createObjectURL(pdfBlob);
      setProofUrl(url);
      setPendingPdfBlob(pdfBlob);
      setProofOpen(true);
      analytics.previewGenerated();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not build the preview.";
      setError(message);
      analytics.previewError(message);
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmAddToCart() {
    if (!pendingPdfBlob) return;
    setBusy(true);
    setError(null);
    analytics.addToCartClicked();
    let checkoutVariantId = variantId;
    try {
      const latestProduct = await fetchStoreProduct(
        gavelProductHandleFor(productType),
        shopHost,
      );
      if (latestProduct) {
        setStoreProduct(latestProduct);
        setCatalogByType((prev) => ({ ...prev, [productType]: latestProduct }));
        const selection = {
          productType,
          styleId: gavelStyle,
          soundBlock: isStand ? ("none" as const) : soundBlock,
          soundBlockShape: effectiveSoundBlockShape,
        };
        if (!isGavelVariantInStock(latestProduct, selection)) {
          throw new Error(
            "That configuration just went out of stock. Choose another available option.",
          );
        }
        checkoutVariantId =
          resolveGavelVariant(latestProduct, selection)?.variantId ??
          checkoutVariantId;
      }
      const designId = designIdRef.current;
      const form = new FormData();
      form.append("designId", designId);
      form.append("designer", "gavel");
      form.append("pdf", pendingPdfBlob, "gavel-design_proof.pdf");
      const finalizeRes = await fetch("/api/finalize-draft", {
        method: "POST",
        body: form,
      });
      const finalizeJson = await finalizeRes.json().catch(() => ({}));
      const thumbnailUrl =
        Array.isArray(finalizeJson.thumbnailUrls) && finalizeJson.thumbnailUrls[0]
          ? String(finalizeJson.thumbnailUrls[0])
          : "";
      const pdfUrl =
        typeof finalizeJson.pdfUrl === "string" ? finalizeJson.pdfUrl : "";

      let gadgetDesignId: string | undefined;
      try {
        const saved = await apiRef.current.saveBadgeDesign(
          buildDesignPayload(),
          {
            shopId: shop || readQueryParam("shop") || "test-shop",
            customerId: customerId || readQueryParam("customerId") || undefined,
          },
        );
        gadgetDesignId = saved?.id;
      } catch (gadgetErr) {
        console.warn("[GavelDesigner] Gadget save failed; continuing ATC", gadgetErr);
      }

      const def = getDesignerConfig("gavel");
      const buildProperties = (
        rowLines: BadgeLine[],
        lineIndex: number,
        rowQuantity: number,
      ) => {
        const bulkRow = bulkRows[lineIndex];
        const rowTextSize = bulkRow?.textSize ?? textSize;
        const rowSecondaryLines = bulkRow
          ? secondaryLinesForBulkRow(bulkRow)
          : null;
        const rowSoundBlockLines = rowSecondaryLines ?? soundBlockArtLines;
        const rowSoundBlockText = joinSoundBlockText(rowSoundBlockLines);
        return buildDesignerCartLineProperties({
          designerId: "gavel",
          designId,
          lineIndex,
          indexPropertyPrimary: def.cartIndexPropertyPrimary,
          indexPropertyFallbacks: def.cartIndexPropertyFallbacks,
          lines: rowLines,
          backgroundColor: bandDef.color,
          linePrice: quote.unitPrice.toFixed(2),
          thumbnailUrl,
          gadgetDesignId,
          pdfUrl,
          orderQuantity: rowQuantity,
          uploadedLogo:
            logoFile && logoAllowed ? logoFile.name : undefined,
          extraHidden: {
            ...buildProductionLineProperties("Gavel", rowLines, {
              fontSizeLabels: rowLines.map(() => rowTextSize),
            }),
            "_Product Type": isStand ? "Gavel + stand" : "Gavel",
            "_Gavel Style": styleDef.label,
            "_Band Finish": bandDef.label,
            "_Velour Bag":
              bagSelection === "gavel"
                ? "Velour gavel bag"
                : bagSelection === "secondary"
                  ? isStand
                    ? "Velour stand bag"
                    : "Velour sound block bag"
                  : bagSelection === "both"
                    ? "Both velour bags"
                    : "No",
            ...(logoFile && logoAllowed
              ? {
                  "_Logo File": logoFile.name,
                  "_Logo Surface":
                    logoSurface === "stand"
                      ? "Stand plate"
                      : "Sound block top",
                  "_Logo Ink": isStand ? "Full color" : "Black ink only",
                }
              : {}),
            ...(isStand
              ? {
                  "_Plate Finish": standDef.label,
                  "_Production Method":
                    getGavelProductionMethod(productionMethod).label,
                  ...Object.fromEntries(
                    (rowSecondaryLines ?? plateArtLines)
                      .map((line, i) =>
                        (line.text ?? "").trim()
                          ? [
                              `Stand Plate Line ${i + 1}`,
                              (line.text ?? "").trim(),
                            ]
                          : null,
                      )
                      .filter(
                        (entry): entry is [string, string] => Boolean(entry),
                      ),
                  ),
                  ...buildProductionLineProperties(
                    "Stand Plate",
                    rowSecondaryLines ?? plateArtLines,
                  ),
                }
              : {
                  "_Sound Block": getGavelSoundBlock(soundBlock).label,
                  ...(hasSoundBlock
                    ? {
                        "_Sound Block Shape": getGavelSoundBlockShape(
                          effectiveSoundBlockShape,
                        ).label,
                      }
                    : {}),
                  ...(soundBlockEngraved && rowSoundBlockText
                    ? { "Sound Block Text": rowSoundBlockText }
                    : {}),
                  ...(soundBlockEngraved
                    ? buildProductionLineProperties(
                        "Sound Block",
                        rowSoundBlockLines,
                        { includeText: true },
                      )
                    : {}),
                }),
            "_Text Size": rowTextSize,
            ...(bulkRows.length > 0 ? { "_Bulk Order": "Yes" } : {}),
          },
        });
      };

      const vid = checkoutVariantId || "0";
      const cartLines =
        bulkRows.length > 0
          ? bulkRows.map((row, index) => ({
              variantId: vid,
              quantity: clampBadgeLineQty(row.quantity),
              properties: buildProperties(
                linesForBulkRow(row),
                index,
                row.quantity,
              ),
            }))
          : [
              {
                variantId: vid,
                quantity: clampBadgeLineQty(qty),
                properties: buildProperties(bandArtLines, 0, qty),
              },
            ];
      /**
       * The bag is its own product, so it bills as a second line carrying the
       * same Design ID — that is what the theme matches on when an edited
       * design replaces the lines it came from. It deliberately omits
       * `_Designer`, which is how the order webhook tells design lines apart
       * from add-ons; tagging it would queue a duplicate proof for production.
       */
      if (bagSelection !== "none" && bagVariant) {
        const bagRows = bulkRows.length > 0 ? bulkRows : [{ quantity: qty }];
        bagRows.forEach((row) => {
          cartLines.push({
            variantId: bagVariant.variantId,
            quantity: clampBadgeLineQty(row.quantity),
            properties: {
              "_Design ID": designId,
              For:
                bagSelection === "gavel"
                  ? `${styleDef.label} gavel`
                  : bagSelection === "secondary"
                    ? isStand
                      ? `${styleDef.label} stand`
                      : `${styleDef.label} sound block`
                    : `${styleDef.label} gavel and ${
                        isStand ? "stand" : "sound block"
                      }`,
              "_Bag Selection": bagSelection,
            },
          });
        });
      }
      const result = await apiRef.current.addToCartMultiple(cartLines);
      if (!result.success) {
        throw new Error(result.message || "Add to cart failed");
      }
      analytics.addToCartResult(true);
      removeGavelDesignerDraftCache(shop, productId);
      skipCacheSaveRef.current = true;
      setProofOpen(false);
      goToStep("done");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Add to cart failed.";
      setError(message);
      analytics.addToCartResult(false, message);
    } finally {
      setBusy(false);
    }
  }

  const designSubtitle = isStand
    ? "Custom band, plus a personalized plate with optional full-color logo."
    : "Custom gavel band — black text on the metal band.";

  const panelCopy: Record<StepId, { title: string; sub: string }> = {
    product: {
      title: "What are you customizing?",
      sub: "Choose your product and wood tone to see the right options.",
    },
    style: {
      title: isStand ? "Customize the finish" : "Sound block & finish",
      sub: isStand
        ? "The stand uses the same wood. Pick the matching band and plate metal."
        : "Add a sound block if you want one, then pick the band finish.",
    },
    design: { title: "Design it", sub: designSubtitle },
    quantity: {
      title: "Quantity & pricing",
      sub: "Set your quantity, then generate a preview to review.",
    },
    done: {
      title: "Added to cart",
      sub: "Your design and quantity are saved to your cart.",
    },
  };

  /* The click-time error already says the same thing once it is showing. */
  const showBulkCartBlocker =
    step === "design" &&
    !busy &&
    !error &&
    !currentSelectionOutOfStock &&
    bulkCartBlocker !== null;

  const continueLabel: Partial<Record<StepId, string>> = {
    product: "Continue to options →",
    style: "Continue to design →",
    design: bulkMode
      ? "Review your preview & add to cart →"
      : "Continue to quantity →",
  };

  /** Phone stepper: one line and a thin rule instead of five labelled circles. */
  const compactStepper = (current: StepId | null) => {
    const index = current ? STEP_IDS.indexOf(current) : -1;
    return (
      <div className="gf-stepper-compact" aria-hidden={current ? undefined : true}>
        <p className="gf-stepper-compact-label">
          {current
            ? `Step ${index + 1} of ${STEP_IDS.length} — ${STEP_LABELS[current]}`
            : "Loading…"}
        </p>
        <div className="gf-stepper-compact-rule">
          <span
            style={{
              width: `${Math.max(0, ((index + 1) / STEP_IDS.length) * 100)}%`,
            }}
          />
        </div>
      </div>
    );
  };

  if (!hydrated) {
    return (
      <div className="gf-designer-root gf-wizard-root">
        <div className="gf-page-title">
          <p className="gf-eyebrow">Personalization tool</p>
          <h1 className="gf-page-h1">Customize your gavel</h1>
        </div>
        <div className="gf-hero">
          {compactStepper(null)}
          <div className="gf-stepper" aria-hidden="true">
            {STEP_IDS.map((id, i) => (
              <div className="gf-stepper-step" key={id}>
                {i > 0 ? <span className="gf-stepper-line" /> : null}
                <span className="gf-stepper-circle is-todo">{i + 1}</span>
                <small>{STEP_LABELS[id]}</small>
              </div>
            ))}
          </div>
          <div className="gf-panel gf-boot-panel" role="status">
            <span className="gf-boot-spinner" aria-hidden="true" />
            <p className="gf-boot-text">Loading your design…</p>
          </div>
        </div>
      </div>
    );
  }

  /** The editable list: inside Add Multiple, or across the card on desktop. */
  const bulkListPanel =
    bulkRows.length > 0 ? (
      <div className="gf-bulk-list">
        <p className="gf-bulk-status">{bulkOrderSummary}</p>
        {bulkCheck.errorRows > 0 ||
        bulkCheck.duplicateRows > 0 ? (
          <div
            className={`gf-bulk-problems ${
              bulkCheck.errorRows > 0 ? "is-error" : "is-warn"
            }`}
            role="status"
          >
            <span>
              {bulkCheck.errorRows > 0 ? (
                <strong>
                  {bulkCheck.errorRows} row
                  {bulkCheck.errorRows === 1 ? " needs" : "s need"}{" "}
                  fixing
                </strong>
              ) : null}
              {[
                bulkCheck.overRows > 0
                  ? `${bulkCheck.overRows} too long for ${
                      bulkCheck.overRows === 1 ? "its" : "their"
                    } text size`
                  : "",
                bulkCheck.missingRows > 0
                  ? `${bulkCheck.missingRows} missing ${bulkBandLabels[0]}`
                  : "",
                bulkCheck.duplicateRows > 0
                  ? `${bulkCheck.duplicateRows} duplicate${
                      bulkCheck.duplicateRows === 1 ? "" : "s"
                    } of an earlier row`
                  : "",
              ]
                .filter(Boolean)
                .map((part, index) =>
                  index === 0 && bulkCheck.errorRows > 0
                    ? `: ${part}`
                    : index === 0
                      ? part.charAt(0).toUpperCase() + part.slice(1)
                      : ` · ${part}`,
                )
                .join("")}
            </span>
            <button
              type="button"
              className="gf-csv-link"
              aria-pressed={bulkProblemsOnly}
              onClick={() =>
                setBulkProblemsOnly((current) => !current)
              }
            >
              {bulkProblemsOnly
                ? "Show all rows"
                : "Show only these rows"}
            </button>
          </div>
        ) : null}
        {bulkNotice ? (
          <p className="gf-bulk-notice" role="status">
            {bulkNotice}
          </p>
        ) : null}
        {bulkCsvWarning ? (
          <p className="gf-bulk-paste-warning">
            {bulkCsvWarning}
          </p>
        ) : null}
        <div className="gf-bulk-grid-tools">
          <label>
            <span className="gf-visually-hidden">
              Search names
            </span>
            <input
              type="search"
              className="gf-input"
              placeholder="Search any text…"
              value={bulkSearch}
              onChange={(event) =>
                setBulkSearch(event.target.value)
              }
            />
          </label>
          {visibleBulkRows.length < bulkRows.length ? (
            <span className="gf-note">
              Showing {visibleBulkRows.length} of{" "}
              {bulkRows.length} rows
            </span>
          ) : null}
        </div>
        <GavelBulkRowsTable
          entries={visibleBulkRows}
          selectedIndex={selectedBulkRow}
          textSize={textSize}
          secondaryCount={bulkSecondaryCount}
          bandLabels={bulkBandLabels}
          secondaryLabels={bulkSecondaryLabels}
          secondaryUsesBandLimit={isStand}
          sortKey={bulkSortKey}
          sortAscending={bulkSortAscending}
          searchQuery={bulkSearch}
          onSort={toggleBulkSort}
          onSelect={selectBulkRow}
          onEditBand={editBulkBandText}
          onEditSecondary={editBulkSecondaryText}
          onEditQuantity={editBulkQuantity}
          onEditTextSize={editBulkTextSize}
          onDuplicate={duplicateBulkRow}
          onDelete={deleteBulkRow}
        />
        <div className="gf-bulk-grid-foot">
          <button
            type="button"
            className="gf-nav-secondary"
            onClick={addBlankBulkRow}
          >
            + Add blank row
          </button>
          <p className="gf-note">
            Click any cell to edit it — the preview follows
            the row you&apos;re on. Use Size for a row whose
            wording needs smaller text.
          </p>
        </div>
      </div>
    ) : null;

  return (
    <div
      ref={rootRef}
      className={`gf-designer-root gf-wizard-root${
        showPreview ? " is-preview-step" : ""
      }${csvModalOpen ? " is-csv-modal" : ""}${
        step === "design"
          ? ` is-surface-${
              (editSurface === "plate" && !isStand) ||
              (editSurface === "soundBlock" && !hasSoundBlock)
                ? "band"
                : editSurface
            }`
          : ""
      }`}
      data-design-tab={
        step === "design" && !isNarrow && designTabs.length > 1
          ? activeDesignTab
          : undefined
      }
    >
      <div className="gf-page-title">
        <p className="gf-eyebrow">Personalization tool</p>
        <h1 className="gf-page-h1">Customize your gavel</h1>
      </div>

      <div className="gf-hero">
        {compactStepper(step)}
        <div className="gf-stepper">
          {/* Every step is always drawn so the bar never grows mid-flow;
              steps this order skips (Quantity in bulk mode) are greyed out. */}
          {STEP_IDS.map((id, i) => {
            const activeIdx = STEP_IDS.indexOf(step);
            const skipped = !sequence.includes(id);
            const state = skipped
              ? "skipped"
              : step === id
                ? "active"
                : i < activeIdx
                  ? "done"
                  : "todo";
            const reachable =
              !skipped && visited.includes(id) && id !== "done";
            return (
              <div
                className={`gf-stepper-step${skipped ? " is-skipped" : ""}`}
                key={id}
              >
                {i > 0 ? (
                  <span
                    className={`gf-stepper-line ${i <= activeIdx ? "is-done" : ""}`}
                  />
                ) : null}
                <button
                  type="button"
                  className={`gf-stepper-circle is-${state}`}
                  disabled={!reachable}
                  onClick={() => reachable && goToStep(id)}
                  aria-current={step === id ? "step" : undefined}
                  aria-label={
                    skipped
                      ? `${STEP_LABELS[id]} (not needed for this order)`
                      : undefined
                  }
                >
                  {state === "done" ? "✓" : i + 1}
                </button>
                <small className={step === id ? "is-active" : ""}>
                  {STEP_LABELS[id]}
                </small>
              </div>
            );
          })}
        </div>

        <div className="gf-panel">
          <p className="gf-panel-title">{panelCopy[step].title}</p>
          {/* The preview label shares this row so the preview frame below it
              starts level with the first card in the controls column. */}
          <div className="gf-panel-lead">
            <p className="gf-panel-sub gf-panel-sub-lead">
              {panelCopy[step].sub}
            </p>
            {showPreview ? (
              <p className="gf-preview-label">Live preview</p>
            ) : null}
          </div>

          <div
            className={`gf-design-grid ${showPreview ? "" : "is-single"} ${
              step === "product" ? "is-product" : ""
            } ${step === "style" ? "is-style" : ""} ${
              bulkWide ? "is-bulk-wide" : ""
            }`
              .replace(/\s+/g, " ")
              .trim()}
          >
            <div
              className="gf-controls-col"
              onFocus={(event) => followPreviewFocus(event.target)}
              onInput={(event) => followPreviewFocus(event.target)}
              onBlur={(event) => {
                const next = previewFocusArea(event.relatedTarget);
                if (next) return;
                setPreviewFocus((prev) =>
                  prev.area ? { ...prev, area: null } : prev,
                );
              }}
            >
              {showPreview ? (
                <p className="gf-panel-sub gf-panel-sub-follow" aria-live="polite">
                  {PREVIEW_CAPTIONS[previewSubject]}
                </p>
              ) : null}
              {step === "product" ? (
                <>
                  <div className="gf-toggle-row">
                    {GAVEL_PRODUCT_TYPE_OPTIONS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`gf-toggle-card ${productType === p.id ? "is-selected" : ""}`}
                        onClick={() => {
                          setProductType(p.id);
                          if (p.id === "stand") {
                            setSoundBlock("none");
                            if (!isGavelStandOffered(gavelStyle)) {
                              setGavelStyle("walnut");
                            }
                          }
                        }}
                      >
                        <img
                          className="gf-toggle-photo"
                          src={p.photoSrc}
                          alt=""
                        />
                        <span className="gf-toggle-label">{p.label}</span>
                        <span className="gf-toggle-sub">{p.description}</span>
                        {p.id === "stand" ? (
                          <span className="gf-availability-note">
                            {standWoods === null
                              ? "Ebony is not available with the stand"
                              : standWoods.length === 0
                                ? "Sold out right now"
                                : standWoods.length === 1
                                  ? `Available in ${standWoods[0].label} only right now`
                                  : "Ebony is not available with the stand"}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>

                  <div className="gf-sub-section">
                    <p className="gf-sub-title">Wood tone</p>
                    {onlyWood ? (
                      <div className="gf-only-wood">
                        <img
                          className="gf-style-thumb"
                          src={onlyWood.thumbSrc}
                          alt={`${onlyWood.label} gavel`}
                        />
                        <span>
                          <span className="gf-style-card-title">
                            {onlyWood.label}
                          </span>
                          <span className="gf-style-card-desc">
                            {isStand
                              ? "The only wood available with the stand right now."
                              : "The only wood in stock right now."}
                          </span>
                          {woodPrices[onlyWood.id] != null ? (
                            <span className="gf-option-price">
                              {`${isStand ? "Gavel + stand" : "Gavel"}: ${formatGavelMoney(woodPrices[onlyWood.id]!)}`}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    ) : (
                    <div className="gf-style-grid">
                      {GAVEL_STYLES.map((s) => {
                        const availability = woodAvailability(s.id);
                        const unavailable = availability !== "ok";
                        const price = woodPrices[s.id];
                        return (
                          <button
                            key={s.id}
                            type="button"
                            className={`gf-style-card ${gavelStyle === s.id ? "is-selected" : ""}`}
                            disabled={unavailable}
                            onClick={() => {
                              if (unavailable) return;
                              setGavelStyle(s.id);
                              if (!isGavelSoundBlockOffered(soundBlock, s.id)) {
                                setSoundBlock("plain");
                              }
                            }}
                          >
                            <img
                              className="gf-style-thumb"
                              src={s.thumbSrc}
                              alt={`${s.label} gavel`}
                            />
                            <span>
                              <span className="gf-style-card-title">{s.label}</span>
                              <span className="gf-style-card-desc">
                                {s.description}
                              </span>
                              <span
                                className={`gf-option-price ${
                                  unavailable ? "is-unavailable" : ""
                                }`}
                              >
                                {availability === "no-stand"
                                  ? "Not made with a stand"
                                  : availability === "stand-sold-out"
                                    ? "Sold out with the stand — still available as a gavel"
                                    : availability === "sold-out"
                                      ? "Back in stock soon"
                                      : price != null
                                    ? `${isStand ? "Gavel + stand" : "Gavel"}: ${formatGavelMoney(price)}`
                                    : storeProductLoading
                                      ? "Loading price…"
                                      : "Price shown at checkout"}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    )}
                    {onlyWood ? (
                      <p className="gf-note">
                        {GAVEL_STYLES.filter((s) => s.id !== onlyWood.id)
                          .map((s) => {
                            const availability = woodAvailability(s.id);
                            return availability === "no-stand"
                              ? `${s.label} isn’t made with a stand.`
                              : availability === "stand-sold-out"
                                ? `${s.label} is sold out with the stand but still available as a gavel.`
                                : `${s.label} is back in stock soon.`;
                          })
                          .join(" ")}
                      </p>
                    ) : null}
                    {GAVEL_STYLES.filter(
                      (s) => woodAvailability(s.id) === "sold-out",
                    ).map((s) => (
                      <p className="gf-note" key={`restock-${s.id}`}>
                        <a
                          href={`mailto:info@gavelsfast.com?subject=${encodeURIComponent(
                            `Back in stock: ${s.label}${isStand ? " gavel + stand" : " gavel"}`,
                          )}&body=${encodeURIComponent(
                            `Please email me when the ${s.label}${isStand ? " gavel and stand" : " gavel"} is back in stock.`,
                          )}`}
                        >
                          Email me when {s.label} is back
                        </a>
                      </p>
                    ))}
                    <p className="gf-note">
                      {gavelStyle === "ebony"
                        ? "Ebony is a gavel only — no stand, and no personalized sound block."
                        : isStand
                          ? "The stand is the same wood as the gavel."
                          : "Every gavel shares the same head — this sets the wood for the gavel and any sound block."}
                    </p>
                  </div>

                </>
              ) : null}

              {step === "style" ? (
                <>
                  {isStand ? null : (
                    <div className="gf-sub-section">
                      <p className="gf-sub-title">Include a sound block?</p>
                      <div className="gf-toggle-row is-compact">
                        {GAVEL_SOUND_BLOCK_OPTIONS.filter((o) =>
                          isGavelSoundBlockOffered(o.id, gavelStyle),
                        ).map((o) => {
                          const squareInStock = isGavelVariantInStock(
                            storeProduct,
                            {
                              productType: "gavel",
                              styleId: gavelStyle,
                              soundBlock: o.id,
                              soundBlockShape: "square",
                            },
                          );
                          const roundInStock =
                            isGavelRoundSoundBlockAvailable(
                              o.id,
                              gavelStyle,
                            ) &&
                            isGavelVariantInStock(storeProduct, {
                              productType: "gavel",
                              styleId: gavelStyle,
                              soundBlock: o.id,
                              soundBlockShape: "round",
                            });
                          const outOfStock =
                            storeProduct !== null &&
                            !squareInStock &&
                            !roundInStock;
                          const blocked = outOfStock;
                          const priceAdd = soundBlockPriceAdds[o.id];
                          return (
                            <button
                              key={o.id}
                              type="button"
                              className={`gf-toggle-card is-compact ${soundBlock === o.id ? "is-selected" : ""}`}
                              disabled={blocked}
                              onClick={() => {
                                if (blocked) return;
                                setSoundBlock(o.id);
                                if (!squareInStock && roundInStock) {
                                  setSoundBlockShape("round");
                                }
                              }}
                            >
                              <img
                                className="gf-toggle-photo"
                                src={getGavelSoundBlockPhoto(
                                  o.id,
                                  gavelStyle,
                                )}
                                alt={`${getGavelStyle(gavelStyle).label} ${o.label.toLowerCase()}`}
                              />
                              <span className="gf-toggle-label">{o.label}</span>
                              <span
                                className={`gf-option-price ${
                                  blocked ? "is-unavailable" : ""
                                }`}
                              >
                                {blocked
                                  ? "Out of stock"
                                  : priceAdd != null
                                    ? priceAdd === 0
                                      ? "Included"
                                      : `+${formatGavelMoney(priceAdd)}`
                                    : storeProductLoading
                                      ? "Loading price…"
                                      : "Price shown at checkout"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="gf-note">
                        {gavelStyle === "ebony"
                          ? "Ebony is not offered with a personalized sound block. A blank square block is available."
                          : "Personalization goes on the wood top of the sound block, independent of the gavel band — you can customize one, both, or neither."}
                      </p>
                    </div>
                  )}

                  <div className="gf-sub-section">
                    <p className="gf-sub-title">
                      {isStand ? "Metal finish (band & plate)" : "Band finish"}
                    </p>
                    <div className="gf-pill-row">
                      {GAVEL_BAND_FINISHES.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          className={`gf-pill ${bandFinish === f.id ? "is-selected" : ""}`}
                          onClick={() => setBandFinish(f.id)}
                        >
                          <span
                            className="gf-swatch"
                            style={{ background: f.color }}
                            aria-hidden
                          />
                          {f.label}
                        </button>
                      ))}
                    </div>
                    <p className="gf-note">
                      Drag the preview to spin it.
                      {isStand
                        ? " The stand uses this wood, with a plate on the front. The band and stand plate always match."
                        : ""}
                    </p>
                  </div>

                  {hasSoundBlock ? (
                    <div className="gf-sub-section">
                      <p className="gf-sub-title">Sound block shape</p>
                      <div className="gf-pill-row">
                        {GAVEL_SOUND_BLOCK_SHAPE_OPTIONS.map((s) => {
                          const unavailable =
                            s.id === "round"
                              ? !roundBlockAvailable
                              : !squareBlockAvailable;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              className={`gf-pill ${
                                effectiveSoundBlockShape === s.id
                                  ? "is-selected"
                                  : ""
                              }`}
                              disabled={unavailable}
                              onClick={() => setSoundBlockShape(s.id)}
                            >
                              {s.label}
                              {unavailable &&
                              storeProduct !== null &&
                              (s.id === "square" ||
                                isGavelRoundSoundBlockAvailable(
                                  soundBlock,
                                  gavelStyle,
                                ))
                                ? " — Out of stock"
                                : ""}
                            </button>
                          );
                        })}
                      </div>
                      <p className="gf-note">
                        {roundBlockAvailable
                          ? "The round block is plain in every wood — personalization is on the square top only."
                          : gavelStyle === "ebony"
                            ? "Ebony sound blocks are square only."
                            : "Personalized sound blocks are square. Choose the plain block above for the round option."}
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}

              {step === "design" ? (
                <>
                  {bulkRows.length > 0 ? (
                    <div className="gf-bulk-summary-bar">
                      {bulkWide ? null : <span>{bulkOrderSummary}</span>}
                      <button
                        type="button"
                        className="gf-csv-link"
                        onClick={openCsvModal}
                      >
                        {bulkWide ? "Paste or upload more names" : "Edit list"}
                      </button>
                      {!bulkModeLocked ? (
                        <button
                          type="button"
                          className="gf-csv-link"
                          onClick={exitBulkMode}
                        >
                          Use one design
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  {!isNarrow && designTabs.length > 1 ? (
                    <div
                      className="gf-design-tabs"
                      role="tablist"
                      aria-label="Personalization sections"
                    >
                      {designTabs.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={activeDesignTab === tab.id}
                          className={`gf-design-tab${
                            activeDesignTab === tab.id ? " is-on" : ""
                          }`}
                          onClick={() => openDesignTab(tab.id)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div
                    data-surface="band"
                    data-tab="band"
                    className="gf-band-fields"
                  >
                  {isStand ? (
                    <p className="gf-sub-title">Gavel band</p>
                  ) : null}

                  {csvModalOpen && typeof document !== "undefined"
                    ? createPortal(
                        // Escape is handled by the document keydown listener.
                        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
                        <div
                          className="gf-modal-backdrop"
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby="gf-csv-modal-title"
                          onClick={(event) => {
                            if (event.target === event.currentTarget) {
                              closeCsvModal();
                            }
                          }}
                        >
                          <div className="gf-modal is-csv">
                            <div className="gf-csv-modal-head">
                              <h2
                                id="gf-csv-modal-title"
                                className="gf-modal-title"
                              >
                                Add Multiple
                              </h2>
                              <button
                                type="button"
                                className="gf-nav-secondary"
                                onClick={() => closeCsvModal()}
                              >
                                Close
                              </button>
                            </div>
                    <div
                      className={`gf-bulk-import${
                        bulkRows.length > 0 && !bulkWide ? " has-rows" : ""
                      }`}
                    >
                      <div className="gf-bulk-import-head">
                        <div>
                          <p className="gf-note">
                            Paste a list of names. One design is applied to
                            every piece. Style, formatting, and any uploaded
                            logo are shared across the order.
                          </p>
                        </div>
                      </div>

                      {bulkSecondarySurface ? (
                        <div className="gf-bulk-surface-mode">
                          <div>
                            <strong>Text across both surfaces</strong>
                            <span>
                              Choose whether the gavel band and{" "}
                              {isStand ? "stand plate" : "sound block"} use the
                              same wording or different wording.
                            </span>
                          </div>
                          <div className="gf-pill-row">
                            <button
                              type="button"
                              className={`gf-pill ${
                                bulkSecondaryMode === "shared"
                                  ? "is-selected"
                                  : ""
                              }`}
                              onClick={() => changeBulkSecondaryMode("shared")}
                            >
                              Same text on both
                            </button>
                            <button
                              type="button"
                              className={`gf-pill ${
                                bulkSecondaryMode === "separate"
                                  ? "is-selected"
                                  : ""
                              }`}
                              onClick={() => changeBulkSecondaryMode("separate")}
                            >
                              Different text for each
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div className="gf-bulk-paste">
                        <label
                          className="gf-bulk-paste-label"
                          htmlFor="gf-bulk-paste"
                        >
                          {bulkRows.length > 0
                            ? "Paste more names"
                            : "Paste your list of names"}
                        </label>
                        <p className="gf-bulk-paste-example">
                          {bulkSecondaryMode === "shared"
                            ? GAVEL_BULK_PASTE_EXAMPLE_ROWS.map((row) => (
                                <span key={row}>{row}</span>
                              ))
                            : "Use the downloadable template to enter separate band and secondary-surface columns."}
                        </p>
                        <textarea
                          ref={bulkPasteRef}
                          id="gf-bulk-paste"
                          className="gf-bulk-paste-input"
                          rows={4}
                          spellCheck={false}
                          placeholder={
                            "MODEL UNITED NATIONS,Secretary-General\nMODEL UNITED NATIONS,Delegate,Lincoln High School"
                          }
                          value={bulkCsvText}
                          onChange={(event) =>
                            setBulkCsvText(event.target.value)
                          }
                        />
                        {bulkPastePreview?.error ? (
                          <p className="gf-bulk-paste-error">
                            {bulkPastePreview.error}
                          </p>
                        ) : null}
                        {bulkPastePreview?.warning ? (
                          <p className="gf-bulk-paste-warning">
                            {bulkPastePreview.warning}
                          </p>
                        ) : null}
                        <div className="gf-bulk-paste-foot">
                          <span className="gf-note">
                            {bulkPastePreview && !bulkPastePreview.error
                              ? `${bulkPastePreview.rows.length} row${
                                  bulkPastePreview.rows.length === 1 ? "" : "s"
                                } ready to add`
                              : "Add as many rows as you need."}
                          </span>
                          <button
                            type="button"
                            className="gf-nav-primary"
                            disabled={
                              !bulkPastePreview ||
                              Boolean(bulkPastePreview.error) ||
                              bulkPastePreview.rows.length === 0
                            }
                            onClick={() => {
                              if (applyBulkCsv(bulkCsvText)) {
                                closeCsvModal({ keepBulk: true });
                              }
                            }}
                          >
                            Apply this list
                          </button>
                        </div>
                        <div className="gf-bulk-actions">
                          <button
                            type="button"
                            className="gf-nav-secondary"
                            onClick={downloadBulkCsvTemplate}
                          >
                            Download template
                          </button>
                          <button
                            type="button"
                            className="gf-nav-secondary"
                            onClick={() => bulkCsvInputRef.current?.click()}
                          >
                            Upload CSV
                          </button>
                          {bulkRows.length > 0 ? (
                            <button
                              type="button"
                              className="gf-nav-secondary"
                              onClick={downloadCurrentBulkRows}
                            >
                              Download current rows
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="gf-nav-secondary"
                              onClick={addBlankBulkRow}
                            >
                              Type names instead
                            </button>
                          )}
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
                        {pendingBulkImport ? (
                          <div
                            className="gf-bulk-merge"
                            role="alertdialog"
                            aria-labelledby="gf-bulk-merge-title"
                          >
                            <p id="gf-bulk-merge-title">
                              <strong>
                                You already have {bulkRows.length} row
                                {bulkRows.length === 1 ? "" : "s"}
                                {bulkRowsEdited ? ", including your edits" : ""}.
                              </strong>{" "}
                              This list has {pendingBulkImport.rows.length} row
                              {pendingBulkImport.rows.length === 1 ? "" : "s"}.
                              Merge adds the names that aren&apos;t already in your
                              list. Replace discards your current rows.
                            </p>
                            <div className="gf-bulk-merge-actions">
                              <button
                                type="button"
                                className="gf-nav-primary"
                                onClick={() =>
                                  loadBulkRows(pendingBulkImport, "merge")
                                }
                              >
                                Merge
                              </button>
                              <button
                                type="button"
                                className="gf-nav-secondary"
                                onClick={() =>
                                  loadBulkRows(pendingBulkImport, "replace")
                                }
                              >
                                Replace
                              </button>
                              <button
                                type="button"
                                className="gf-csv-link"
                                onClick={() => setPendingBulkImport(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {bulkWide ? null : bulkListPanel}
                    </div>
                            {!bulkModeLocked && bulkRows.length > 0 ? (
                              <div className="gf-modal-actions">
                                <button
                                  type="button"
                                  className="gf-nav-secondary"
                                  onClick={() => {
                                    exitBulkMode();
                                    closeCsvModal();
                                  }}
                                >
                                  Use one design instead
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>,
                        document.body,
                      )
                    : null}

                  <div
                    className="gf-line-tools gf-text-size-row"
                    style={{ marginBottom: 12 }}
                    data-preview-focus="band"
                  >
                    <span className="gf-muted">Text size</span>
                    <div className="gf-chip-row">
                      {GAVEL_TEXT_SIZE_PRESETS.map((p) => (
                        <button
                          key={p}
                          type="button"
                          className={`gf-chip ${textSize === p ? "is-on" : ""}`}
                          onClick={() => setTextSize(p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <span className="gf-char-count">
                      {GAVEL_MAX_LINES} lines · {maxChars} chars
                    </span>
                  </div>

                  {!bulkMode ? (
                    <div className="gf-band-style" data-preview-focus="band">
                      <GavelSurfaceStyleRow
                        lines={lines}
                        surfaceLabel="band"
                        individual={bandStyleIndividual}
                        onChangeAll={updateAllLines}
                        onIndividualChange={setBandStyleIndividual}
                      />
                    </div>
                  ) : null}

                  {usingExampleCopy && !bulkMode ? (
                    <p
                      className="gf-note gf-example-note"
                      style={{ marginBottom: 12 }}
                    >
                      The preview shows example wording. Enter your own text
                      below and it replaces it.
                    </p>
                  ) : null}

                  {!bulkMode ? lines.map((line, index) => (
                    <div
                      key={line.id}
                      className="gf-line-block"
                      data-preview-focus="band"
                    >
                      <div className="gf-line-head">
                        <div className="gf-line-label">
                          Line {index + 1}
                          {index === 0 ? " (required)" : " (optional)"}
                        </div>
                        <span
                          className={`gf-char-count ${(line.text ?? "").length >= maxChars ? "is-warn" : ""}`}
                        >
                          {(line.text ?? "").length}/{maxChars}
                        </span>
                      </div>
                      <input
                        className="gf-input"
                        value={line.text ?? ""}
                        maxLength={maxChars}
                        placeholder={
                          index === 0
                            ? GAVEL_EXAMPLE_HEADLINE
                            : index === 1
                              ? GAVEL_EXAMPLE_SUBTITLE
                              : "Optional line"
                        }
                        onChange={(e) =>
                          updateLine(index, { text: e.target.value })
                        }
                        style={gavelLineFieldStyle(line)}
                      />
                      {index === 0 && lineError ? (
                        <div className="gf-error">
                          Enter text for line 1 before continuing.
                        </div>
                      ) : null}
                      {bandStyleIndividual ? (
                        <div className="gf-line-tools">
                          <GavelLineStyleControls
                            line={line}
                            ariaLabel={`Font for line ${index + 1}`}
                            onChange={(changes) => updateLine(index, changes)}
                          />
                        </div>
                      ) : null}
                    </div>
                  )) : bulkWide ? (
                    bulkListPanel
                  ) : bulkRows.length > 0 ? (
                    <GavelBulkRowEditor
                      row={bulkRows[selectedBulkRow]}
                      index={selectedBulkRow}
                      total={bulkRows.length}
                      textSize={textSize}
                      secondaryCount={bulkSecondaryCount}
                      bandLabels={bulkBandLabels}
                      secondaryLabels={bulkSecondaryLabels}
                      issues={bulkCheck.issues[selectedBulkRow]}
                      secondaryTitle={
                        bulkSecondarySurface
                          ? isStand
                            ? "Stand plate"
                            : "Sound block"
                          : null
                      }
                      secondaryUsesBandLimit={isStand}
                      onSelect={selectBulkRow}
                      onEditBand={editBulkBandText}
                      onEditSecondary={editBulkSecondaryText}
                      onEditQuantity={editBulkQuantity}
                      onEditTextSize={editBulkTextSize}
                      onOpenList={openCsvModal}
                    />
                  ) : (
                    <div className="gf-bulk-empty">
                      <p>
                        Add your list of names. One design is applied to every
                        piece, and the preview shows row 1 as soon as the list
                        is in.
                      </p>
                      <div className="gf-bulk-empty-actions">
                        <button
                          type="button"
                          className="gf-nav-primary"
                          onClick={openCsvModal}
                        >
                          Add Multiple
                        </button>
                        <button
                          type="button"
                          className="gf-nav-secondary"
                          onClick={addBlankBulkRow}
                        >
                          Type names one by one
                        </button>
                      </div>
                    </div>
                  )}
                  </div>

                  {isStand ? (
                    <div data-surface="plate">
                      <div
                        className="gf-sub-section"
                        style={{ marginTop: 12 }}
                        data-preview-focus="plate"
                        data-tab="plate"
                      >
                        <p className="gf-sub-title">Stand plate</p>
                        {showProductionMethod ? (
                          <div className="gf-pill-row" style={{ marginBottom: 10 }}>
                            {GAVEL_PRODUCTION_METHOD_OPTIONS.map((m) => (
                              <button
                                key={m.id}
                                type="button"
                                className={`gf-pill ${productionMethod === m.id ? "is-selected" : ""}`}
                                onClick={() => setProductionMethod(m.id)}
                              >
                                {m.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                        <p className="gf-note">
                          {bulkMode
                            ? bulkSecondaryMode === "shared"
                              ? "Each stand plate repeats the first two lines from its list entry."
                              : "Each stand plate uses its own two lines from the list."
                            : "Independent of the band — leave blank to repeat the band text on the plate. Line 1 prints large, line 2 smaller beneath it."}
                        </p>
                        {!bulkMode ? (
                          <GavelSurfaceStyleRow
                            lines={plateLines}
                            surfaceLabel="plate"
                            individual={plateStyleIndividual}
                            onChangeAll={updateAllPlateLines}
                            onIndividualChange={setPlateStyleIndividual}
                          />
                        ) : null}
                        {!bulkMode ? plateLines.map((line, index) => (
                          <div key={line.id} className="gf-line-block">
                            <div className="gf-line-head">
                              <div className="gf-line-label">
                                {index === 0
                                  ? "Plate line 1 — large (optional)"
                                  : "Plate line 2 — smaller (optional)"}
                              </div>
                              <span
                                className={`gf-char-count ${
                                  (line.text ?? "").length >= maxChars
                                    ? "is-warn"
                                    : ""
                                }`}
                              >
                                {(line.text ?? "").length}/{maxChars}
                              </span>
                            </div>
                            <input
                              className="gf-input"
                              value={line.text ?? ""}
                              maxLength={maxChars}
                              placeholder={
                                index === 0
                                  ? GAVEL_EXAMPLE_HEADLINE
                                  : GAVEL_EXAMPLE_SUBTITLE
                              }
                              onChange={(e) =>
                                updatePlateLine(index, { text: e.target.value })
                              }
                              style={gavelLineFieldStyle(line)}
                            />
                            {plateStyleIndividual ? (
                              <div className="gf-line-tools">
                                <GavelLineStyleControls
                                  line={line}
                                  ariaLabel={`Font for plate line ${index + 1}`}
                                  onChange={(changes) =>
                                    updatePlateLine(index, changes)
                                  }
                                />
                              </div>
                            ) : null}
                          </div>
                        )) : null}
                      </div>
                      <div
                        className="gf-sub-section"
                        style={{ marginTop: 12 }}
                        data-preview-focus="plate"
                        data-tab="logo"
                      >
                        <p className="gf-sub-title">
                          Full-color stand logo (optional)
                        </p>
                        <label className="gf-upload">
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/svg+xml"
                            onChange={(e) =>
                              setLogoFile(e.target.files?.[0] ?? null)
                            }
                          />
                          <span>
                            {logoFile
                              ? logoFile.name
                              : "Upload full-color logo (JPG, PNG, SVG)"}
                          </span>
                        </label>
                        {logoFile ? (
                          <div className="gf-logo-adjust">
                            <div className="gf-logo-adjust-row">
                              <label htmlFor="gf-logo-size">Logo size</label>
                              <span className="gf-logo-adjust-value">
                                {Math.round(logoScale * 100)}%
                              </span>
                            </div>
                            <input
                              id="gf-logo-size"
                              type="range"
                              className="gf-range is-inline"
                              min={GAVEL_LOGO_SCALE_MIN}
                              max={GAVEL_LOGO_SCALE_MAX}
                              step="any"
                              value={logoScale}
                              onChange={(e) =>
                                setLogoScale(
                                  clampGavelLogoScale(
                                    roundAdjust(Number(e.target.value)),
                                  ),
                                )
                              }
                            />
                            <div className="gf-logo-adjust-row">
                              <label htmlFor="gf-logo-gap">
                                Space before text
                              </label>
                              <span className="gf-logo-adjust-value">
                                {Math.round(logoGapScale * 100)}%
                              </span>
                            </div>
                            <input
                              id="gf-logo-gap"
                              type="range"
                              className="gf-range is-inline"
                              min={GAVEL_LOGO_GAP_SCALE_MIN}
                              max={GAVEL_LOGO_GAP_SCALE_MAX}
                              step="any"
                              value={logoGapScale}
                              onChange={(e) =>
                                setLogoGapScale(
                                  clampGavelLogoGapScale(
                                    roundAdjust(Number(e.target.value)),
                                  ),
                                )
                              }
                            />
                            {logoScale !== 1 || logoGapScale !== 1 ? (
                              <button
                                type="button"
                                className="gf-link-btn"
                                onClick={() => {
                                  setLogoScale(1);
                                  setLogoGapScale(1);
                                }}
                              >
                                Reset logo placement
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                        <p className="gf-note">
                          The logo is printed in color on every stand plate. The
                          original file is attached to the order. Logos are not
                          available on the gavel band.
                        </p>
                      </div>
                      {canPickTextColor ? (
                        <div
                          className="gf-sub-section"
                          style={{ marginTop: 12 }}
                          data-tab="plate"
                        >
                          <p className="gf-sub-title">Text color</p>
                          <div className="gf-swatch-row">
                            {GAVEL_UV_TEXT_COLORS.map((hex) => (
                              <button
                                key={hex}
                                type="button"
                                aria-label={`Text color ${hex}`}
                                className={`gf-swatch ${uvTextColor === hex ? "is-selected" : ""}`}
                                style={{ background: hex }}
                                onClick={() => setUvTextColor(hex)}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {hasSoundBlock && !soundBlockEngraved ? (
                    <p className="gf-note gf-surface-only" data-surface="soundBlock">
                      This sound block is plain, with nothing to personalize.
                      Switch to the Band tab to edit your engraving.
                    </p>
                  ) : null}

                  {!isStand && soundBlockEngraved ? (
                    <div
                      className="gf-sub-section"
                      style={{ marginTop: 12 }}
                      data-surface="soundBlock"
                      data-tab="logo"
                    >
                      <p className="gf-sub-title">
                        Black-ink sound block logo (optional)
                      </p>
                      <label className="gf-upload">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/svg+xml"
                          onChange={(event) =>
                            setLogoFile(event.target.files?.[0] ?? null)
                          }
                        />
                        <span>
                          {logoFile
                            ? logoFile.name
                            : "Upload logo for black-ink printing (JPG, PNG, SVG)"}
                        </span>
                      </label>
                      {logoFile ? (
                        <div className="gf-logo-adjust">
                          <div className="gf-logo-adjust-row">
                            <label htmlFor="gf-logo-size-gavel">Logo size</label>
                            <span className="gf-logo-adjust-value">
                              {Math.round(logoScale * 100)}%
                            </span>
                          </div>
                          <input
                            id="gf-logo-size-gavel"
                            type="range"
                            className="gf-range is-inline"
                            min={GAVEL_LOGO_SCALE_MIN}
                            max={GAVEL_LOGO_SCALE_MAX}
                            step="any"
                            value={logoScale}
                            onChange={(event) =>
                              setLogoScale(
                                clampGavelLogoScale(
                                  roundAdjust(Number(event.target.value)),
                                ),
                              )
                            }
                          />
                        </div>
                      ) : null}
                      <p className="gf-note">
                        The same logo is converted to black ink on every square
                        sound block top: plain backgrounds drop out and colors
                        become ink, so a JPG or PNG both work. Logos are not
                        available on the gavel band.
                      </p>
                    </div>
                  ) : null}

                  {soundBlockEngraved ? (
                    <div
                      className="gf-sub-section"
                      style={{ marginTop: 12 }}
                      data-preview-focus="soundBlock"
                      data-surface="soundBlock"
                      data-tab="soundBlock"
                    >
                      <p className="gf-sub-title">Sound block top</p>
                      <p className="gf-note">
                        {bulkMode
                          ? bulkSecondaryMode === "shared"
                            ? "Each sound block repeats the band text from its list entry."
                            : "Each sound block uses its own lines from the list."
                          : "Leave all fields blank to repeat line 1 of the band. Blank optional lines stay blank so you can create spacing. Formatting is independent of the band."}
                      </p>
                      {!bulkMode ? (
                        <>
                          <div className="gf-line-tools" style={{ marginBottom: 12 }}>
                            <span
                              className={`gf-char-count ${
                                soundBlockCharCount(soundBlockLines) >=
                                SOUND_BLOCK_MAX_CHARS
                                  ? "is-warn"
                                  : ""
                              }`}
                            >
                              {SOUND_BLOCK_MAX_LINES} lines ·{" "}
                              {soundBlockCharCount(soundBlockLines)}/
                              {SOUND_BLOCK_MAX_CHARS} chars
                            </span>
                          </div>
                          {soundBlockLines.map((line, index) => {
                            const others = soundBlockCharCount(
                              soundBlockLines.filter(
                                (_, lineIndex) => lineIndex !== index,
                              ),
                            );
                            const remaining = Math.max(
                              0,
                              SOUND_BLOCK_MAX_CHARS - others,
                            );
                            return (
                              <div key={line.id} className="gf-line-block">
                                <div className="gf-line-label">
                                  Line {index + 1}
                                  {index === 0 ? " (defaults to band line 1)" : " (optional)"}
                                </div>
                                <input
                                  className="gf-input"
                                  value={line.text ?? ""}
                                  maxLength={remaining}
                                  placeholder={
                                    index === 0
                                      ? (lines[0]?.text ?? "").trim() ||
                                        "Same as band line 1"
                                      : "Optional line"
                                  }
                                  onChange={(e) =>
                                    updateSoundBlockLine(index, {
                                      text: e.target.value,
                                    })
                                  }
                                  style={gavelLineFieldStyle(line)}
                                />
                                <div className="gf-line-tools">
                                  <GavelLineStyleControls
                                    line={line}
                                    ariaLabel={`Sound block font for line ${index + 1}`}
                                    onChange={(changes) =>
                                      updateSoundBlockLine(index, changes)
                                    }
                                  />
                                  <button
                                    type="button"
                                    className={`gf-chip ${line.underline ? "is-on" : ""}`}
                                    onClick={() =>
                                      updateSoundBlockLine(index, {
                                        underline: !line.underline,
                                      })
                                    }
                                  >
                                    Underline
                                  </button>
                                  <span
                                    className={`gf-char-count ${
                                      (line.text ?? "").length >= remaining
                                        ? "is-warn"
                                        : ""
                                    }`}
                                  >
                                    {(line.text ?? "").length}/{remaining}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="gf-sub-section" style={{ marginTop: 12 }}>
                    <p className="gf-sub-title">Add velour storage bags?</p>
                    <div className="gf-pill-row">
                      <button
                        type="button"
                        className={`gf-pill ${
                          bagSelection === "none" ? "is-selected" : ""
                        }`}
                        onClick={() => setBagSelection("none")}
                      >
                        No thanks
                      </button>
                      <button
                        type="button"
                        className={`gf-pill ${
                          bagSelection === "gavel" ? "is-selected" : ""
                        }`}
                        disabled={
                          bagProduct !== null && !bagVariants.gavel
                        }
                        onClick={() => setBagSelection("gavel")}
                      >
                        Velour gavel bag — +
                        {formatGavelMoney(
                          bagVariants.gavel?.price ??
                            GAVEL_SAMPLE_PRICING.suedeBagAdd,
                        )}
                      </button>
                      <button
                        type="button"
                        className={`gf-pill ${
                          bagSelection === "secondary" ? "is-selected" : ""
                        }`}
                        disabled={
                          (!isStand && !hasSoundBlock) ||
                          (bagProduct !== null && !bagVariants.secondary)
                        }
                        onClick={() => setBagSelection("secondary")}
                      >
                        {isStand ? "Velour stand" : "Velour sound block"} bag — +
                        {formatGavelMoney(
                          bagVariants.secondary?.price ??
                            GAVEL_SAMPLE_PRICING.suedeBagAdd,
                        )}
                      </button>
                      <button
                        type="button"
                        className={`gf-pill ${
                          bagSelection === "both" ? "is-selected" : ""
                        }`}
                        disabled={
                          (!isStand && !hasSoundBlock) ||
                          (bagProduct !== null && !bagVariants.both)
                        }
                        onClick={() => setBagSelection("both")}
                      >
                        Both velour bags — +
                        {formatGavelMoney(
                          bagVariants.both?.price ??
                            GAVEL_SAMPLE_PRICING.suedeBagBothAdd,
                        )}
                      </button>
                    </div>
                    {!isStand && !hasSoundBlock ? (
                      <p className="gf-note">
                        Add a sound block in Options to choose its bag or the
                        two-bag set.
                      </p>
                    ) : null}
                  </div>
                  {!bulkMode ? (
                    <div className="gf-add-multiple">
                      <p className="gf-note">
                        Ordering for a group? Add Multiple — paste your list of
                        names and one design is applied to every piece.
                      </p>
                      <button
                        type="button"
                        className="gf-nav-primary"
                        onClick={openCsvModal}
                      >
                        Add Multiple
                      </button>
                    </div>
                  ) : null}
                  </>
              ) : null}

              {step === "quantity" ? (
                <div className="gf-calc-box">
                  <div className="gf-calc-qty-row">
                    <span className="gf-sub-title" style={{ margin: 0 }}>
                      {bulkRows.length > 0 ? "List quantity" : "Quantity"}
                    </span>
                    {bulkRows.length > 0 ? (
                      <strong>{bulkQuantity} gavels</strong>
                    ) : (
                      <BadgeQtyStepper value={qty} onChange={setQty} />
                    )}
                  </div>
                  {bulkRows.length === 0 ? (
                    <input
                      type="range"
                      className="gf-range"
                      min={1}
                      max={QTY_SLIDER_MAX}
                      value={Math.min(qty, QTY_SLIDER_MAX)}
                      onChange={(e) => setQty(Number(e.target.value))}
                      aria-label="Quantity"
                    />
                  ) : (
                    <p className="gf-note">
                      {bulkRows.length} personalized cart lines will be created
                      from your list.
                    </p>
                  )}
                  <div className="gf-calc-summary">
                    <div className="gf-calc-item">
                      <p>Price per unit</p>
                      <p>{formatGavelMoney(quote.unitPrice)}</p>
                    </div>
                    <div className="gf-calc-item is-right">
                      <p>Estimated total</p>
                      <p>{formatGavelMoney(quote.total)}</p>
                    </div>
                  </div>
                  {quote.isSample ? (
                    <p className="gf-note is-warn">{quote.tierNote}</p>
                  ) : null}
                  <div className="gf-summary-list">
                    <div>
                      <span>Product</span>
                      <span>{isStand ? "Gavel + stand" : "Gavel"}</span>
                    </div>
                    <div>
                      <span>Finish</span>
                      <span>{finishSummary}</span>
                    </div>
                    <div>
                      <span>Options</span>
                      <span>{optionSummary}</span>
                    </div>
                  </div>
                </div>
              ) : null}

              {step === "done" ? (
                <div className="gf-calc-box">
                  <p className="gf-success">
                    {orderQuantity} × {isStand ? "gavel + stand" : "gavel"}{" "}
                    added to your cart.
                  </p>
                  <div className="gf-summary-list">
                    <div>
                      <span>Finish</span>
                      <span>{finishSummary}</span>
                    </div>
                    <div>
                      <span>Options</span>
                      <span>{optionSummary}</span>
                    </div>
                    <div>
                      <span>Estimated total</span>
                      <span>{formatGavelMoney(quote.total)}</span>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="gf-step-nav">
                {stepIndex > 0 && step !== "done" ? (
                  <button
                    type="button"
                    className="gf-nav-secondary"
                    onClick={goBack}
                  >
                    ← Back
                  </button>
                ) : (
                  <span />
                )}

                {continueLabel[step] ? (
                  <button
                    type="button"
                    className="gf-nav-primary"
                    disabled={
                      step === "design" &&
                      bulkMode &&
                      (busy || !designReady || currentSelectionOutOfStock)
                    }
                    aria-describedby={
                      showBulkCartBlocker ? "gf-cart-blocker" : undefined
                    }
                    onClick={() => void onContinue()}
                  >
                    {step === "design" && bulkMode && busy
                      ? "Preparing preview…"
                      : continueLabel[step]}
                  </button>
                ) : null}
                {showBulkCartBlocker ? (
                  <p
                    id="gf-cart-blocker"
                    className="gf-nav-reason"
                    role="status"
                  >
                    {bulkCartBlocker}
                  </p>
                ) : null}
                {step === "quantity" ? (
                  <button
                    type="button"
                    className="gf-nav-primary"
                    disabled={busy || !designReady || currentSelectionOutOfStock}
                    onClick={() => void onReviewProof()}
                  >
                    {busy ? "Preparing preview…" : "Review your preview & add to cart →"}
                  </button>
                ) : null}
                {step === "done" ? (
                  <button
                    type="button"
                    className="gf-nav-primary"
                    onClick={() => goToStep("product")}
                  >
                    Design another →
                  </button>
                ) : null}
              </div>

              {currentSelectionOutOfStock ? (
                <div className="gf-error">
                  That configuration is currently out of stock. Choose another
                  available option.
                </div>
              ) : error ? (
                <div className="gf-error">{error}</div>
              ) : null}

              {step === "design" || step === "quantity" ? (
                <p className="gf-disclaimer">
                  Your personalized design may differ slightly from on-screen color
                  and spacing. We may adjust layout so the finished{" "}
                  {isStand ? "band and plate look" : "band looks"} its
                  best.
                </p>
              ) : null}

              {showPreview ? (
                <p className="gf-disclaimer">
                  The 3D preview is an illustration to help you place your
                  personalization. The actual product may differ — see the
                  product photo in the preview for accurate product details.
                </p>
              ) : null}
            </div>

            {showPreview ? (
              <div className="gf-preview-pane">
                {step === "design" && bulkRows[selectedBulkRow] ? (
                  <p className="gf-bulk-preview-row" aria-live="polite">
                    Previewing row {selectedBulkRow + 1} of {bulkRows.length}
                    {bulkRows[selectedBulkRow].texts[0].trim()
                      ? ` — ${bulkRows[selectedBulkRow].texts[0].trim()}`
                      : ""}
                  </p>
                ) : null}
                <GavelSpinPreviewGate
                  previewRef={previewRef}
                  style={styleDef}
                  bandTextureUrl={bandTextureUrl}
                  bandHex={bandDef.color}
                  showSoundBlockToggle={hasSoundBlock}
                  soundBlockTextureUrl={soundBlockTextureUrl}
                  soundBlockShape={effectiveSoundBlockShape}
                  showStandToggle={isStand}
                  showFlatProofTabs={isNarrow}
                  previewRevive={previewRevive}
                  plateCanvas={plateCanvas}
                  plateCanvasVersion={plateCanvasVersion}
                  plateProofUrl={plateProofUrl}
                  plateHex={standDef.plateHex}
                  productPhotoSrc={getGavelProductPhoto(
                    styleDef.id,
                    productType,
                    soundBlock,
                    bandFinish,
                    effectiveSoundBlockShape,
                  )}
                  onViewChange={centerDesignerCanvas}
                  focus={step === "design" ? previewFocus : undefined}
                  onSubjectChange={setPreviewSubject}
                />
                {step === "design" ? (
                  <GavelUnwrappedBandStrip
                    dataUrl={bandTextureUrl}
                    empty={!hasText && !usingExampleCopy}
                    label={
                      usingExampleCopy
                        ? "Unwrapped band (example)"
                        : "Unwrapped band (custom preview)"
                    }
                    emptyText={
                      bulkMode
                        ? `Row ${selectedBulkRow + 1} has no band text yet. Type it in the row editor.`
                        : "Enter text to see it laid out on the band"
                    }
                  />
                ) : null}
                {isStand && step === "design" ? (
                  <GavelUnwrappedBandStrip
                    dataUrl={plateProofUrl}
                    empty={!plateProofUrl}
                    shaped
                    label={
                      usingExampleCopy
                        ? "Stand plate (example)"
                        : "Stand plate (custom preview)"
                    }
                    emptyText="Enter band or plate text"
                  />
                ) : null}
                {soundBlockEngraved && step === "design" ? (
                  <GavelUnwrappedBandStrip
                    dataUrl={soundBlockTextureUrl}
                    empty={!joinSoundBlockText(soundBlockPreviewLines)}
                    square
                    label={
                      usingExampleCopy
                        ? "Sound block top (example)"
                        : "Sound block top (custom preview)"
                    }
                    emptyText="Enter band or sound block text"
                  />
                ) : null}
              </div>
            ) : null}

          </div>
        </div>
      </div>

      {proofOpen && proofUrl ? (
        <div className="gf-modal-backdrop" role="dialog" aria-modal="true">
          <div className="gf-modal">
            <h2 className="gf-modal-title">Your preview</h2>
            <p className="gf-muted" style={{ marginBottom: 12 }}>
              Confirm the personalization, then add this{" "}
              {bulkRows.length > 0
                ? `${bulkRows.length}-design bulk order`
                : isStand
                  ? "gavel and stand"
                  : "gavel"}{" "}
              to your cart.{" "}
              {bulkRows.length > 0
                ? "The preview shows the selected name; every piece is added with the same style."
                : ""}
            </p>
            <ProofPdfViewer
              url={proofUrl}
              title="Gavel band preview"
              loadingLabel="Loading preview..."
              failureLabel="Could not render the preview."
            />
            {error ? <div className="gf-error">{error}</div> : null}
            <div className="gf-modal-actions">
              <button
                type="button"
                className="gf-btn-secondary"
                onClick={() => setProofOpen(false)}
                disabled={busy}
              >
                Edit design
              </button>
              <button
                type="button"
                className="gf-btn-primary"
                onClick={() => void onConfirmAddToCart()}
                disabled={busy || currentSelectionOutOfStock}
              >
                {busy ? "Adding…" : "Add to cart"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
