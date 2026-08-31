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
  GAVEL_FONT_OPTIONS,
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
  STAND_PLATE_MAX_LINES,
  clampGavelLineText,
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
  quoteGavelPrice,
  type GavelBandFinishId,
  type GavelProductionMethodId,
  type GavelProductType,
  type GavelSoundBlockId,
  type GavelSoundBlockShapeId,
  type GavelStyleId,
  type GavelTextSizePreset,
} from "~/constants/gavelStyles";
import { GavelSpinPreviewGate } from "~/components/GavelSpinPreviewGate";
import type { GavelSpinPreviewHandle } from "~/components/GavelSpinPreview";
import { GavelUnwrappedBandStrip } from "~/components/GavelUnwrappedBandStrip";
import { FontFamilySelect } from "~/components/FontFamilySelect";
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
import {
  GAVEL_PRODUCT_HANDLES,
  SUEDE_BAG_PRODUCT_HANDLE,
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
import { buildDesignerCartLineProperties } from "~/utils/cartLineProperties";
import { clampBadgeLineQty } from "~/utils/badgeLineQuantities";
import {
  GAVEL_BULK_CSV_TEMPLATE,
  GAVEL_BULK_PASTE_EXAMPLE_ROWS,
  parseGavelBulkCsv,
  type GavelBulkRow,
} from "~/utils/gavelBulkCsv";
import "../styles/gavelDesigner.css";

/** One decision per screen — the gavel flow adds a wood/handle step. */
type StepId = "product" | "style" | "design" | "quantity" | "done";
type GavelLogoSurface = "stand" | "sound-block";

const STEP_IDS: StepId[] = ["product", "style", "design", "quantity", "done"];

/** localStorage draft so refresh keeps wizard progress (same idea as badge designer). */
const GAVEL_DESIGNER_CACHE_PREFIX = "gavel-designer-draft";
const GAVEL_CACHE_VERSION = 2;
/** Skip caching huge logos so we do not blow the 5MB localStorage quota. */
const GAVEL_CACHE_MAX_LOGO_CHARS = 1_500_000;

function getGavelDesignerDraftCacheKey(
  shop?: string | null,
  productId?: string | null,
): string {
  return `${GAVEL_DESIGNER_CACHE_PREFIX}-${shop ?? "default"}-${
    productId ?? "default"
  }`;
}

function removeGavelDesignerDraftCache(
  shop?: string | null,
  productId?: string | null,
): void {
  try {
    localStorage.removeItem(getGavelDesignerDraftCacheKey(shop, productId));
  } catch {
    // ignore quota or other storage errors
  }
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
  soundBlockText?: string;
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
function exampleArtLines(): BadgeLine[] {
  return [GAVEL_EXAMPLE_HEADLINE, GAVEL_EXAMPLE_SUBTITLE].map((text, index) =>
    newLine({ id: `gavel-example-${index}`, text }),
  );
}

function defaultPlateLines(): BadgeLine[] {
  return Array.from({ length: STAND_PLATE_MAX_LINES }, () => newLine());
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
    const res = await fetch(`/api/shopify-product?${params.toString()}`);
    if (!res.ok) return null;
    const data = await res.json();
    return isShopifyProductJsPayload(data) ? data : null;
  } catch {
    return null;
  }
}

export default function GavelDesigner({
  productId,
  shop,
  customerId,
  gadgetApiUrl,
  gadgetApiKey,
}: GavelDesignerProps) {
  const [step, setStep] = useState<StepId>("product");
  const [visited, setVisited] = useState<StepId[]>(["product"]);

  const [productType, setProductType] = useState<GavelProductType>("gavel");
  const [soundBlock, setSoundBlock] = useState<GavelSoundBlockId>("none");
  const [soundBlockShape, setSoundBlockShape] =
    useState<GavelSoundBlockShapeId>("square");
  const [soundBlockText, setSoundBlockText] = useState("");
  const [suedeBag, setSuedeBag] = useState(false);
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
  const bulkCsvInputRef = useRef<HTMLInputElement>(null);
  const bulkModeLocked = readQueryParam("audience") === "model-un";

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
  /** Canvas textures only exist in the browser; keep first paint SSR-identical. */
  const [isClient, setIsClient] = useState(false);
  /**
   * The server cannot read the saved draft, so it renders a neutral shell and
   * the wizard itself only mounts once the cached step has been restored.
   */
  const [hydrated, setHydrated] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
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
  /** Last 3D capture, kept so the proof works after the canvas unmounts. */
  const mockupRef = useRef<{ dataUrl: string | null; blob: Blob | null }>({
    dataUrl: null,
    blob: null,
  });
  const apiRef = useRef(
    createApi(gadgetApiUrl, gadgetApiKey, { designerId: "gavel" }),
  );

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

  const canPickTextColor = isStand && productionMethod === "uvprint";
  const showProductionMethod = isStand && standDef.allowsUvPrint;
  const soundBlockEngraved = !isStand && soundBlock === "engraved";
  const hasSoundBlock = !isStand && soundBlock !== "none";
  const logoAllowed = isStand || soundBlockEngraved;

  const sequence: StepId[] = useMemo(
    () => ["product", "style", "design", "quantity", "done"],
    [],
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
   * With nothing typed anywhere, the preview shows the example copy from the
   * product photography rather than bare metal. This never reaches a proof or
   * the cart: ordering already requires the customer's own band text.
   */
  const usingExampleCopy =
    !lines.some((line) => (line.text ?? "").trim()) &&
    !plateLines.some((line) => (line.text ?? "").trim()) &&
    !soundBlockText.trim();

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
    () => (usingExampleCopy ? exampleArtLines() : bandArtLines),
    [bandArtLines, usingExampleCopy],
  );

  const platePreviewLines = useMemo(
    () =>
      usingExampleCopy
        ? exampleArtLines().map((line) => ({
            ...line,
            color: canPickTextColor ? uvTextColor : GAVEL_DEFAULT_TEXT_COLOR,
          }))
        : plateArtLines,
    [canPickTextColor, plateArtLines, usingExampleCopy, uvTextColor],
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
        ? gavelBandToDataUrl(bandPreviewLines, textSize, bandDef.color)
        : "",
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metalScanVersion busts this when the scanned finish lands; the painter reads it out of module state
    [bandDef.color, bandPreviewLines, isClient, metalScanVersion, textSize],
  );

  const renderPlateTexture = useCallback(
    (logo: GavelPlateLogo | null, shaped = false) => {
      if (!isClient || !isStand) return "";
      return gavelStandPlateToDataUrl(
        platePreviewLines,
        textSize,
        standDef.plateHex,
        { shaped, logo },
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metalScanVersion busts this when the scanned finish lands; the painter reads it out of module state
    [
      isClient,
      isStand,
      metalScanVersion,
      platePreviewLines,
      standDef.plateHex,
      textSize,
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
        textSize,
        standDef.plateHex,
        { logo: standLogo },
      );
      setPlateCanvas(canvas);
      setPlateCanvasVersion((v) => v + 1);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    isClient,
    isStand,
    metalScanVersion,
    platePreviewLines,
    standLogo,
    standDef.plateHex,
    textSize,
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
    hasSoundBlock && isGavelRoundSoundBlockAvailable(soundBlock, gavelStyle);
  /** Never price or draw a round block the store cannot make. */
  const effectiveSoundBlockShape: GavelSoundBlockShapeId =
    soundBlockShape === "round" && roundBlockAvailable ? "round" : "square";
  const soundBlockArtText = soundBlockText.trim() || lines[0]?.text?.trim() || "";
  const soundBlockPreviewText = usingExampleCopy
    ? GAVEL_EXAMPLE_HEADLINE
    : soundBlockArtText;
  const soundBlockTextureUrl = useMemo(() => {
    if (
      !isClient ||
      !soundBlockEngraved ||
      (!soundBlockPreviewText && !soundBlockLogo)
    ) {
      return "";
    }
    return soundBlockTopToDataUrl(
      {
        text: soundBlockPreviewText,
        fontFamily: lines[0]?.fontFamily || GAVEL_DEFAULT_FONT,
        bold: lines[0]?.bold,
        italic: lines[0]?.italic,
      },
      getSoundBlockTopTextColor(gavelStyle),
      { logo: soundBlockLogo },
    );
  }, [
    gavelStyle,
    isClient,
    lines,
    soundBlockEngraved,
    soundBlockLogo,
    soundBlockPreviewText,
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
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [productType, shopHost]);

  useEffect(() => {
    let cancelled = false;
    fetchStoreProduct(SUEDE_BAG_PRODUCT_HANDLE, shopHost).then((product) => {
      if (!cancelled) setBagProduct(product);
    });
    return () => {
      cancelled = true;
    };
  }, [shopHost]);

  const bagVariant = useMemo(
    () => resolveSuedeBagVariant(bagProduct),
    [bagProduct],
  );

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
  /** Live read-out for the paste box, so mistakes surface before applying. */
  const bulkPastePreview = useMemo(() => {
    if (!bulkCsvText.trim()) return null;
    try {
      const { rows, warning } = parseGavelBulkCsv(bulkCsvText);
      return { rows, warning, error: "" };
    } catch (err) {
      return {
        rows: [] as GavelBulkRow[],
        warning: "",
        error: err instanceof Error ? err.message : "Could not read that CSV.",
      };
    }
  }, [bulkCsvText]);
  const quote = quoteGavelPrice({
    productType,
    soundBlock: isStand ? "none" : soundBlock,
    suedeBag,
    quantity: orderQuantity,
    storeUnitPrice,
    suedeBagUnitPrice: bagVariant?.price ?? null,
  });
  const optionSummary = formatGavelOptionSummary({
    productType,
    soundBlock: isStand ? "none" : soundBlock,
    suedeBag,
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

  /** Restore wizard progress from localStorage (once), then let the product URL win. */
  useBeforePaintEffect(() => {
    if (cacheHydratedRef.current) return;
    try {
      const raw = localStorage.getItem(
        getGavelDesignerDraftCacheKey(shop, productId),
      );
      if (raw) {
        const payload = JSON.parse(raw) as GavelDesignerCachePayload;
        if (payload.version === GAVEL_CACHE_VERSION) {
          const restoredStep = isStepId(payload.step) ? payload.step : "product";
          const activeStep =
            restoredStep === "done" ? "quantity" : restoredStep;
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
          if (typeof payload.soundBlockText === "string") {
            setSoundBlockText(payload.soundBlockText);
          }
          if (typeof payload.suedeBag === "boolean") {
            setSuedeBag(payload.suedeBag);
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
    setBulkMode(requestedBulkMode);
    if (requestedBulkMode) {
      setLines((current) => current.map((line) => ({ ...line, text: "" })));
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

  useEffect(() => {
    const cacheKey = getGavelDesignerDraftCacheKey(shop, productId);
    const timeoutId = window.setTimeout(() => {
      if (!cacheHydratedRef.current) return;
      if (skipCacheSaveRef.current) {
        skipCacheSaveRef.current = false;
        return;
      }
      const payload: GavelDesignerCachePayload = {
        version: GAVEL_CACHE_VERSION,
        step,
        visited,
        productType,
        soundBlock,
        soundBlockShape,
        soundBlockText,
        suedeBag,
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
      try {
        localStorage.setItem(cacheKey, JSON.stringify(payload));
      } catch {
        // ignore quota or other storage errors
      }
    }, 600);
    return () => window.clearTimeout(timeoutId);
  }, [
    bandFinish,
    gavelStyle,
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
    shop,
    soundBlock,
    soundBlockShape,
    soundBlockText,
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

  /** Ebony has no stand and no personalized sound block. */
  useEffect(() => {
    if (productType === "stand" && !isGavelStandOffered(gavelStyle)) {
      setGavelStyle("walnut");
    }
  }, [gavelStyle, productType]);

  useEffect(() => {
    if (!isGavelSoundBlockOffered(soundBlock, gavelStyle)) {
      setSoundBlock("plain");
    }
  }, [gavelStyle, soundBlock]);

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

  const badgeForSave = useCallback((overrideLines?: BadgeLine[]): Badge => {
    return {
      lines: overrideLines ?? bandArtLines,
      backgroundColor: bandDef.color,
      backing: "pin",
      gavelStyle,
      gavelBandFinish: bandFinish,
      gavelTextSizePreset: textSize,
      gavelHandleLength: "standard",
      gavelProductType: productType,
      gavelSoundBlock: isStand ? "none" : soundBlock,
      gavelSoundBlockShape: isStand ? "square" : effectiveSoundBlockShape,
      gavelSoundBlockText: soundBlockEngraved ? soundBlockArtText : "",
      gavelSuedeBag: suedeBag,
      gavelStandFinish: isStand ? standFinish : undefined,
      gavelProductionMethod: isStand ? productionMethod : undefined,
      gavelStandPlateLines: isStand ? plateArtLines : undefined,
    };
  }, [
    bandArtLines,
    bandDef.color,
    bandFinish,
    effectiveSoundBlockShape,
    gavelStyle,
    isStand,
    plateArtLines,
    productType,
    productionMethod,
    soundBlock,
    soundBlockArtText,
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

  const selectBulkRow = (index: number) => {
    const row = bulkRows[index];
    if (!row) return;
    setSelectedBulkRow(index);
    setLines((prev) =>
      prev.map((line, lineIndex) => ({
        ...line,
        text: row.texts[lineIndex] ?? "",
      })),
    );
    setLineError(false);
  };

  const applyBulkCsv = (csv: string) => {
    setError(null);
    try {
      const { rows, warning } = parseGavelBulkCsv(csv);
      setBulkMode(true);
      setBulkRows(rows);
      setBulkCsvWarning(warning);
      setSelectedBulkRow(0);
      setQty(rows.reduce((sum, row) => sum + row.quantity, 0));
      setLines((prev) =>
        prev.map((line, index) => ({
          ...line,
          text: rows[0].texts[index] ?? "",
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import the CSV.");
    }
  };

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
      new Blob([GAVEL_BULK_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "model-un-gavel-names.csv";
    link.click();
    URL.revokeObjectURL(url);
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

  const captureMockup = useCallback(async () => {
    const handle = previewRef.current;
    if (!handle) return;
    const dataUrl = handle.capturePngDataUrl();
    const blob = await handle.capturePngBlob();
    if (dataUrl) mockupRef.current = { dataUrl, blob };
  }, []);

  function goToStep(next: StepId) {
    setStep(next);
    setVisited((prev) => (prev.includes(next) ? prev : [...prev, next]));
    setError(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  }

  function goBack() {
    const prev = sequence[Math.max(0, stepIndex - 1)];
    goToStep(prev);
  }

  async function onContinue() {
    const next = sequence[Math.min(sequence.length - 1, stepIndex + 1)];
    if (step === "design") {
      if (bulkMode && bulkRows.length === 0) {
        setError("Upload your CSV before continuing.");
        return;
      }
      if (!bulkMode && !(lines[0]?.text ?? "").trim()) {
        setLineError(true);
        return;
      }
      setLineError(false);
      await captureMockup();
    }
    goToStep(next);
  }

  function buildDesignPayload() {
    const allBadges =
      bulkRows.length > 0
        ? bulkRows.map((row) => badgeForSave(linesForBulkRow(row)))
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
            }))
          : [],
      gavelStyle,
      gavelBandFinish: bandFinish,
      gavelTextSizePreset: textSize,
      gavelHandleLength: "standard" as const,
      gavelProductType: productType,
      gavelSoundBlock: soundBlock,
      gavelSoundBlockShape: effectiveSoundBlockShape,
      gavelSoundBlockText: soundBlockEngraved ? soundBlockArtText : "",
      gavelSuedeBag: suedeBag,
      gavelStandFinish: isStand ? standFinish : null,
      gavelProductionMethod: isStand ? productionMethod : null,
      gavelStandPlateLines: isStand ? plateArtLines : null,
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
      // Every gavel ships with an engraved band, stand or no stand, so the band
      // is always the primary manufacturing file.
      const bandSvg = gavelBandToSvgString(rowLines, textSize, bandDef.color);
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
      const rowSoundBlockText =
        soundBlockText.trim() || rowLines[0]?.text?.trim() || "";
      const secondary = isStand
        ? {
            kind: "plate",
            svg: gavelStandPlateToSvgString(
              // Bulk rows carry their plate copy in their own first two lines;
              // a single design uses the plate fields the customer filled in.
              bulkRows.length > 0
                ? rowLines.slice(0, STAND_PLATE_MAX_LINES)
                : plateArtLines,
              textSize,
              standDef.plateHex,
              { logo: standLogo },
            ),
          }
        : soundBlockEngraved
          ? {
              kind: "sound-block",
              svg: soundBlockTopToSvgString(
                {
                  text: rowSoundBlockText,
                  fontFamily: rowLines[0]?.fontFamily,
                  bold: rowLines[0]?.bold,
                  italic: rowLines[0]?.italic,
                },
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
          ? "Upload your CSV before reviewing the proof."
          : "Enter at least one line of custom text.",
      );
      goToStep("design");
      return;
    }
    setBusy(true);
    try {
      await captureMockup();
      await saveDraft({
        thumbnailBlob: mockupRef.current.blob,
      });
      const pdfBlob = await generateGavelProofPdf({
        styleId: gavelStyle,
        bandFinishId: bandFinish,
        textSizePreset: textSize,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build proof.");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmAddToCart() {
    if (!pendingPdfBlob) return;
    setBusy(true);
    setError(null);
    try {
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
        const rowSoundBlockText =
          soundBlockText.trim() || rowLines[0]?.text?.trim() || "";
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
          extraHidden: {
            "_Product Type": isStand ? "Gavel + stand" : "Gavel",
            "_Gavel Style": styleDef.label,
            "_Band Finish": bandDef.label,
            "_Suede Bag": suedeBag ? "Yes" : "No",
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
                    (bulkRows.length > 0
                      ? rowLines.slice(0, STAND_PLATE_MAX_LINES)
                      : plateArtLines
                    )
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
                }),
            "_Text Size": textSize,
            ...(bulkRows.length > 0 ? { "_Bulk Order": "Yes" } : {}),
          },
        });
      };

      const vid = variantId || "0";
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
      if (suedeBag && bagVariant) {
        const bagRows = bulkRows.length > 0 ? bulkRows : [{ quantity: qty }];
        bagRows.forEach((row) => {
          cartLines.push({
            variantId: bagVariant.variantId,
            quantity: clampBadgeLineQty(row.quantity),
            properties: {
              "_Design ID": designId,
              For: `${styleDef.label} ${isStand ? "gavel + stand" : "gavel"}`,
            },
          });
        });
      }
      const result = await apiRef.current.addToCartMultiple(cartLines);
      if (!result.success) {
        throw new Error(result.message || "Add to cart failed");
      }
      removeGavelDesignerDraftCache(shop, productId);
      skipCacheSaveRef.current = true;
      setProofOpen(false);
      goToStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add to cart failed.");
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
      sub: "Set your quantity, then generate a proof to review.",
    },
    done: {
      title: "Added to cart",
      sub: "Your design and quantity are saved to your cart.",
    },
  };

  const continueLabel: Partial<Record<StepId, string>> = {
    product: "Continue to options →",
    style: "Continue to design →",
    design: "Continue to quantity →",
  };

  if (!hydrated) {
    return (
      <div className="gf-designer-root gf-wizard-root">
        <div className="gf-page-title">
          <p className="gf-eyebrow">Personalization tool</p>
          <h1 className="gf-page-h1">Customize your gavel</h1>
        </div>
        <div className="gf-hero">
          <div className="gf-stepper" aria-hidden="true">
            {sequence.map((id, i) => (
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

  return (
    <div
      ref={rootRef}
      className={`gf-designer-root gf-wizard-root${
        showPreview ? " is-preview-step" : ""
      }`}
    >
      <div className="gf-page-title">
        <p className="gf-eyebrow">Personalization tool</p>
        <h1 className="gf-page-h1">Customize your gavel</h1>
      </div>

      <div className="gf-hero">
        <div className="gf-stepper">
          {sequence.map((id, i) => {
            const state =
              step === id ? "active" : i < stepIndex ? "done" : "todo";
            const reachable = visited.includes(id) && id !== "done";
            return (
              <div className="gf-stepper-step" key={id}>
                {i > 0 ? (
                  <span
                    className={`gf-stepper-line ${i <= stepIndex ? "is-done" : ""}`}
                  />
                ) : null}
                <button
                  type="button"
                  className={`gf-stepper-circle is-${state}`}
                  disabled={!reachable}
                  onClick={() => reachable && goToStep(id)}
                  aria-current={step === id ? "step" : undefined}
                >
                  {i < stepIndex ? "✓" : i + 1}
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
            } ${step === "style" ? "is-style" : ""}`
              .replace(/\s+/g, " ")
              .trim()}
          >
            <div className="gf-controls-col">
              {showPreview ? (
                <p className="gf-panel-sub gf-panel-sub-follow">
                  {panelCopy[step].sub}
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
                            Ebony is not available with the stand
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>

                  <div className="gf-sub-section">
                    <p className="gf-sub-title">Wood tone</p>
                    <div className="gf-style-grid">
                      {GAVEL_STYLES.map((s) => {
                        const unavailable =
                          isStand && !isGavelStandOffered(s.id);
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
                                {unavailable
                                  ? "Not available with stand"
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
                    <p className="gf-note">
                      {gavelStyle === "ebony"
                        ? "Ebony is a gavel only — no stand, and no personalized sound block."
                        : isStand
                          ? "The stand is the same wood as the gavel."
                          : "Every gavel shares the same head — this sets the wood for the gavel and any sound block."}
                    </p>
                  </div>

                  <div className="gf-bulk-callout">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={bulkMode}
                      disabled={bulkModeLocked}
                      className={`gf-bulk-switch ${bulkMode ? "is-on" : ""}`}
                      onClick={() => {
                        setBulkMode((current) => {
                          if (current) {
                            setBulkRows([]);
                            setSelectedBulkRow(0);
                          }
                          return !current;
                        });
                      }}
                    >
                      <span />
                    </button>
                    <div>
                      <strong>
                        {bulkModeLocked
                          ? "Personalized bulk order"
                          : "I need personalized gavels in bulk"}
                      </strong>
                      <p>
                        Upload a CSV of names or roles in the design step. One
                        shared style and logo will be applied to every row.
                      </p>
                    </div>
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
                          const blocked = !isGavelSoundBlockOffered(
                            o.id,
                            gavelStyle,
                          );
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
                                  ? "Not available in ebony"
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
                            s.id === "round" && !roundBlockAvailable;
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
                  {isStand ? (
                    <p className="gf-sub-title">Gavel band</p>
                  ) : null}

                  {bulkMode ? (
                    <div className="gf-bulk-import">
                      <div className="gf-bulk-import-head">
                        <div>
                          <p className="gf-sub-title">Bulk personalization</p>
                          <p className="gf-note">
                            One row per gavel, commas between each line of text,
                            up to {GAVEL_MAX_LINES} lines each. A shared
                            uploaded school logo is used on every gavel.
                          </p>
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
                            className="gf-nav-primary"
                            onClick={() => bulkCsvInputRef.current?.click()}
                          >
                            {bulkRows.length > 0 ? "Replace CSV" : "Upload CSV"}
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

                      <div className="gf-bulk-paste">
                        <label
                          className="gf-bulk-paste-label"
                          htmlFor="gf-bulk-paste"
                        >
                          Or paste your rows
                        </label>
                        <p className="gf-bulk-paste-example">
                          {GAVEL_BULK_PASTE_EXAMPLE_ROWS.map((row) => (
                            <span key={row}>{row}</span>
                          ))}
                        </p>
                        <textarea
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
                              ? `${bulkPastePreview.rows.length} gavel${
                                  bulkPastePreview.rows.length === 1 ? "" : "s"
                                } ready`
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
                            onClick={() => applyBulkCsv(bulkCsvText)}
                          >
                            Use these rows
                          </button>
                        </div>
                      </div>

                      {bulkRows.length > 0 ? (
                        <>
                          <div className="gf-bulk-status">
                            <strong>{bulkRows.length} unique designs</strong>
                            <span>{bulkQuantity} total gavels</span>
                          </div>
                          {bulkCsvWarning ? (
                            <p className="gf-bulk-paste-warning">
                              {bulkCsvWarning}
                            </p>
                          ) : null}
                          <div className="gf-bulk-row-list" aria-label="CSV rows">
                            {bulkRows.map((row, index) => (
                              <button
                                key={row.id}
                                type="button"
                                className={
                                  selectedBulkRow === index ? "is-selected" : ""
                                }
                                onClick={() => selectBulkRow(index)}
                              >
                                <span>{index + 1}</span>
                                <strong>{row.texts[0]}</strong>
                                <small>× {row.quantity}</small>
                              </button>
                            ))}
                          </div>
                          <p className="gf-note">
                            Select a row to preview it. Replace the CSV to
                            change wording; style and logo changes apply to the
                            full order.
                          </p>
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="gf-line-tools" style={{ marginBottom: 12 }}>
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

                  {usingExampleCopy ? (
                    <p className="gf-note" style={{ marginBottom: 12 }}>
                      The preview shows example wording. Enter your own text
                      below and it replaces it.
                    </p>
                  ) : null}

                  {!bulkMode ? lines.map((line, index) => (
                    <div key={line.id} className="gf-line-block">
                      <div className="gf-line-label">
                        Line {index + 1}
                        {index === 0 ? " (required)" : " (optional)"}
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
                        style={{
                          fontFamily: line.fontFamily || GAVEL_DEFAULT_FONT,
                        }}
                      />
                      {index === 0 && lineError ? (
                        <div className="gf-error">
                          Enter text for line 1 before continuing.
                        </div>
                      ) : null}
                      <div className="gf-line-tools">
                        <FontFamilySelect
                          value={line.fontFamily || GAVEL_DEFAULT_FONT}
                          options={[...GAVEL_FONT_OPTIONS]}
                          onChange={(fontFamily) =>
                            updateLine(index, { fontFamily })
                          }
                          ariaLabel={`Font for line ${index + 1}`}
                          variant="legacy"
                        />
                        <button
                          type="button"
                          className={`gf-chip ${line.bold ? "is-on" : ""}`}
                          onClick={() => updateLine(index, { bold: !line.bold })}
                        >
                          Bold
                        </button>
                        <button
                          type="button"
                          className={`gf-chip ${line.italic ? "is-on" : ""}`}
                          onClick={() =>
                            updateLine(index, { italic: !line.italic })
                          }
                        >
                          Italic
                        </button>
                        <span
                          className={`gf-char-count ${(line.text ?? "").length >= maxChars ? "is-warn" : ""}`}
                        >
                          {(line.text ?? "").length}/{maxChars}
                        </span>
                      </div>
                    </div>
                  )) : bulkRows.length > 0 ? (
                    <div className="gf-bulk-text-preview">
                      <p className="gf-sub-title">Selected CSV row</p>
                      {lines
                        .filter((line) => (line.text ?? "").trim())
                        .map((line, index) => (
                          <div key={line.id}>
                            <span>Line {index + 1}</span>
                            <strong>{line.text}</strong>
                          </div>
                        ))}
                      <p className="gf-note">
                        Text comes only from the CSV. Replace the CSV to change
                        names or wording.
                      </p>
                    </div>
                  ) : (
                    <div className="gf-bulk-empty">
                      Upload a CSV above to add names and text content.
                    </div>
                  )}

                  {isStand ? (
                    <>
                      <div className="gf-sub-section" style={{ marginTop: 12 }}>
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
                            ? "Stand plate text comes from the first two CSV columns — column one prints large, column two smaller beneath it."
                            : "Independent of the band — leave blank to repeat the band text on the plate. Line 1 prints large, line 2 smaller beneath it."}
                        </p>
                        {!bulkMode ? plateLines.map((line, index) => (
                          <div key={line.id} className="gf-line-block">
                            <div className="gf-line-label">
                              {index === 0
                                ? "Plate line 1 — large (optional)"
                                : "Plate line 2 — smaller (optional)"}
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
                              style={{
                                fontFamily: line.fontFamily || GAVEL_DEFAULT_FONT,
                              }}
                            />
                            <div className="gf-line-tools">
                              <FontFamilySelect
                                value={line.fontFamily || GAVEL_DEFAULT_FONT}
                                options={[...GAVEL_FONT_OPTIONS]}
                                onChange={(fontFamily) =>
                                  updatePlateLine(index, { fontFamily })
                                }
                                ariaLabel={`Font for plate line ${index + 1}`}
                                variant="legacy"
                              />
                              <button
                                type="button"
                                className={`gf-chip ${line.bold ? "is-on" : ""}`}
                                onClick={() =>
                                  updatePlateLine(index, { bold: !line.bold })
                                }
                              >
                                Bold
                              </button>
                              <button
                                type="button"
                                className={`gf-chip ${line.italic ? "is-on" : ""}`}
                                onClick={() =>
                                  updatePlateLine(index, {
                                    italic: !line.italic,
                                  })
                                }
                              >
                                Italic
                              </button>
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
                          </div>
                        )) : null}
                      </div>
                      <div className="gf-sub-section" style={{ marginTop: 12 }}>
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
                    </>
                  ) : null}

                  {!isStand && soundBlockEngraved ? (
                    <div className="gf-sub-section" style={{ marginTop: 12 }}>
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

                  {canPickTextColor ? (
                    <div className="gf-sub-section" style={{ marginTop: 12 }}>
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

                  {soundBlockEngraved ? (
                    <div className="gf-sub-section" style={{ marginTop: 12 }}>
                      <p className="gf-sub-title">Sound block top</p>
                      <p className="gf-note">
                        {bulkMode
                          ? "Each sound block uses Line 1 from its CSV row."
                          : "Leave blank to repeat line 1 of the band."}
                      </p>
                      {!bulkMode ? (
                        <input
                          className="gf-input"
                          value={soundBlockText}
                          maxLength={maxChars}
                          placeholder="Same as band, or enter new text"
                          onChange={(e) => setSoundBlockText(e.target.value)}
                        />
                      ) : null}
                    </div>
                  ) : null}

                  <div className="gf-sub-section" style={{ marginTop: 12 }}>
                    <p className="gf-sub-title">Add a suede bag?</p>
                      <div className="gf-pill-row">
                        <button
                          type="button"
                          className={`gf-pill ${!suedeBag ? "is-selected" : ""}`}
                          onClick={() => setSuedeBag(false)}
                        >
                          No thanks
                        </button>
                        <button
                          type="button"
                          className={`gf-pill ${suedeBag ? "is-selected" : ""}`}
                          onClick={() => setSuedeBag(true)}
                        >
                          Add suede bag — +
                          {formatGavelMoney(GAVEL_SAMPLE_PRICING.suedeBagAdd)}
                        </button>
                      </div>
                    </div>
                  </>
              ) : null}

              {step === "quantity" ? (
                <div className="gf-calc-box">
                  <div className="gf-calc-qty-row">
                    <span className="gf-sub-title" style={{ margin: 0 }}>
                      {bulkRows.length > 0 ? "CSV order quantity" : "Quantity"}
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
                      from your CSV.
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
                  <p className={`gf-note ${quote.isSample ? "is-warn" : ""}`}>
                    {quote.tierNote} Final price is confirmed at checkout.
                  </p>
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
                    onClick={() => void onContinue()}
                  >
                    {continueLabel[step]}
                  </button>
                ) : null}
                {step === "quantity" ? (
                  <button
                    type="button"
                    className="gf-nav-primary"
                    disabled={busy || !designReady}
                    onClick={() => void onReviewProof()}
                  >
                    {busy ? "Preparing proof…" : "Review proof & add to cart →"}
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

              {error ? <div className="gf-error">{error}</div> : null}

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
                />
                {step === "design" ? (
                  <GavelUnwrappedBandStrip
                    dataUrl={bandTextureUrl}
                    empty={!designReady && !usingExampleCopy}
                    label={
                      usingExampleCopy
                        ? "Unwrapped band (example)"
                        : "Unwrapped band (custom proof)"
                    }
                    emptyText="Enter text to see it laid out on the band"
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
                        : "Stand plate (custom proof)"
                    }
                    emptyText="Enter band or plate text"
                  />
                ) : null}
                {soundBlockEngraved && step === "design" ? (
                  <GavelUnwrappedBandStrip
                    dataUrl={soundBlockTextureUrl}
                    empty={!soundBlockPreviewText}
                    square
                    label={
                      usingExampleCopy
                        ? "Sound block top (example)"
                        : "Sound block top (custom proof)"
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
            <h2 className="gf-modal-title">Design proof</h2>
            <p className="gf-muted" style={{ marginBottom: 12 }}>
              Confirm the personalization, then add this{" "}
              {bulkRows.length > 0
                ? `${bulkRows.length}-design bulk order`
                : isStand
                  ? "gavel and stand"
                  : "gavel"}{" "}
              to your cart.{" "}
              {bulkRows.length > 0
                ? "The proof shows the selected CSV row; all rows will be added with the same style."
                : ""}
            </p>
            <ProofPdfViewer url={proofUrl} title="Gavel band proof" />
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
                disabled={busy}
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
