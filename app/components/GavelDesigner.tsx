import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
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
  GAVEL_STAND_FINISH_OPTIONS,
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
  getGavelStandFinish,
  getGavelStyle,
  getSoundBlockTopTextColor,
  quoteGavelPrice,
  type GavelBandFinishId,
  type GavelProductionMethodId,
  type GavelProductType,
  type GavelSoundBlockId,
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
  type GavelPlateLogo,
} from "~/utils/gavelBandTexture";
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
import "../styles/gavelDesigner.css";

/** One decision per screen — the gavel flow adds a wood/handle step. */
type StepId = "product" | "style" | "design" | "quantity" | "done";

const STEP_IDS: StepId[] = ["product", "style", "design", "quantity", "done"];

/** localStorage draft so refresh keeps wizard progress (same idea as badge designer). */
const GAVEL_DESIGNER_CACHE_PREFIX = "gavel-designer-draft";
const GAVEL_CACHE_VERSION = 1;
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
  soundBlockText?: string;
  suedeBag?: boolean;
  productionMethod?: GavelProductionMethodId;
  logoScale?: number;
  logoGapScale?: number;
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
  style: "Gavel",
  design: "Design",
  quantity: "Quantity",
  done: "Checkout",
};

const QTY_SLIDER_MAX = 50;

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
  return [
    newLine({ text: "GavelsFast" }),
    newLine(),
    newLine(),
    newLine(),
  ];
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
  const [soundBlockText, setSoundBlockText] = useState("");
  const [suedeBag, setSuedeBag] = useState(false);
  const [productionMethod, setProductionMethod] =
    useState<GavelProductionMethodId>("engrave");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoScale, setLogoScale] = useState(1);
  const [logoGapScale, setLogoGapScale] = useState(1);
  const [uvTextColor, setUvTextColor] = useState(GAVEL_UV_TEXT_COLORS[0]);
  const [plateLines, setPlateLines] = useState<BadgeLine[]>(defaultPlateLines);

  const [gavelStyle, setGavelStyle] = useState<GavelStyleId>("walnut");
  const [bandFinish, setBandFinish] = useState<GavelBandFinishId>("gold");
  const [textSize, setTextSize] = useState<GavelTextSizePreset>("medium");
  const [lines, setLines] = useState<BadgeLine[]>(defaultLines);
  const [qty, setQty] = useState(1);

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

  const bandTextureUrl = useMemo(
    () =>
      isClient
        ? gavelBandToDataUrl(bandArtLines, textSize, bandDef.color)
        : "",
    [bandArtLines, bandDef.color, isClient, textSize],
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

  const renderPlateTexture = useCallback(
    (logo: GavelPlateLogo | null, shaped = false) => {
      if (!isClient || !isStand) return "";
      return gavelStandPlateToDataUrl(
        plateArtLines,
        textSize,
        standDef.plateHex,
        { shaped, logo },
      );
    },
    [isClient, isStand, plateArtLines, standDef.plateHex, textSize],
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
        plateArtLines,
        textSize,
        standDef.plateHex,
        { logo: plateLogo },
      );
      setPlateCanvas(canvas);
      setPlateCanvasVersion((v) => v + 1);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    isClient,
    isStand,
    plateArtLines,
    plateLogo,
    standDef.plateHex,
    textSize,
  ]);

  /**
   * Same art cut to the plaque silhouette for the flat proof strips. This one
   * still costs a PNG encode for the `<img>`, so it trails the sliders by a
   * deferred render rather than running mid-drag.
   */
  const deferredPreviewLogo = useDeferredValue(plateLogo);
  const plateProofUrl = useMemo(
    () => renderPlateTexture(deferredPreviewLogo, true),
    [deferredPreviewLogo, renderPlateTexture],
  );

  const soundBlockEngraved = !isStand && soundBlock === "engraved";
  const soundBlockArtText = soundBlockText.trim() || lines[0]?.text?.trim() || "";
  const soundBlockTextureUrl = useMemo(() => {
    if (!isClient || !soundBlockEngraved || !soundBlockArtText) return "";
    return soundBlockTopToDataUrl(
      {
        text: soundBlockArtText,
        fontFamily: lines[0]?.fontFamily || GAVEL_DEFAULT_FONT,
        bold: lines[0]?.bold,
        italic: lines[0]?.italic,
      },
      getSoundBlockTopTextColor(gavelStyle),
    );
  }, [
    gavelStyle,
    isClient,
    lines,
    soundBlockArtText,
    soundBlockEngraved,
  ]);

  const shopHost =
    shop || readQueryParam("shop") || readQueryParam("storeUrl");

  useEffect(() => {
    let cancelled = false;
    fetchStoreProduct(gavelProductHandleFor(productType), shopHost).then(
      (product) => {
        if (!cancelled) setStoreProduct(product);
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

  const hasText = lines.some((l) => (l.text ?? "").trim());
  const quote = quoteGavelPrice({
    productType,
    soundBlock: isStand ? "none" : soundBlock,
    suedeBag,
    quantity: qty,
    storeUnitPrice,
    suedeBagUnitPrice: bagVariant?.price ?? null,
  });
  const optionSummary = formatGavelOptionSummary({
    productType,
    soundBlock: isStand ? "none" : soundBlock,
    suedeBag,
    standFinish,
    productionMethod,
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
        soundBlockText,
        suedeBag,
        productionMethod,
        logoScale,
        logoGapScale,
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
    plateLines,
    productId,
    productType,
    productionMethod,
    qty,
    shop,
    soundBlock,
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
  }, [gavelStyle, productType, soundBlock, storeProduct]);

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

  const badgeForSave = useCallback((): Badge => {
    return {
      lines: bandArtLines,
      backgroundColor: bandDef.color,
      backing: "pin",
      gavelStyle,
      gavelBandFinish: bandFinish,
      gavelTextSizePreset: textSize,
      gavelHandleLength: "standard",
      gavelProductType: productType,
      gavelSoundBlock: isStand ? "none" : soundBlock,
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
    if (index === 0 && (changes.text ?? "").trim()) setLineError(false);
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
      if (!(lines[0]?.text ?? "").trim()) {
        setLineError(true);
        return;
      }
      setLineError(false);
      await captureMockup();
    }
    goToStep(next);
  }

  function buildDesignPayload() {
    const badge = badgeForSave();
    return {
      designId: designIdRef.current,
      badge,
      allBadges: [badge],
      multipleBadges: [],
      gavelStyle,
      gavelBandFinish: bandFinish,
      gavelTextSizePreset: textSize,
      gavelHandleLength: "standard" as const,
      gavelProductType: productType,
      gavelSoundBlock: soundBlock,
      gavelSoundBlockText: soundBlockEngraved ? soundBlockArtText : "",
      gavelSuedeBag: suedeBag,
      gavelStandFinish: isStand ? standFinish : null,
      gavelProductionMethod: isStand ? productionMethod : null,
      gavelStandPlateLines: isStand ? plateArtLines : null,
      gavelBandColor: bandDef.color,
      gavelPlateColor: isStand ? standDef.plateHex : null,
      gavelLogoFileName: logoFile?.name ?? null,
      gavelLogoScale: logoFile ? logoScale : null,
      gavelLogoGapScale: logoFile ? logoGapScale : null,
      totalPrice: quote.total,
      timestamp: new Date().toISOString(),
      shopId: shop || readQueryParam("shop") || "test-shop",
      productId: productId || readQueryParam("product") || "test-product",
    };
  }

  async function saveDraft(opts?: {
    thumbnailBlob?: Blob | null;
    printSvg?: string;
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
    if (opts?.printSvg) {
      form.append(
        "print_svg_0",
        new Blob([opts.printSvg], { type: "image/svg+xml" }),
        "gavel-0-print.svg",
      );
    }
    if (logoFile) form.append("logo_0", logoFile, logoFile.name);
    const svgBlob = new Blob(
      [gavelBandToSvgString(bandArtLines, textSize, bandDef.color)],
      { type: "image/svg+xml" },
    );
    form.append("svg_0", svgBlob, "gavel-0-design.svg");
    if (isStand) {
      form.append(
        "svg_1",
        new Blob(
          [
            gavelStandPlateToSvgString(
              plateArtLines,
              textSize,
              standDef.plateHex,
              { logo: plateLogo },
            ),
          ],
          { type: "image/svg+xml" },
        ),
        "gavel-1-plate.svg",
      );
    }
    const paths = getDesignerApiPaths("gavel");
    const res = await fetch(paths.saveDraft, { method: "POST", body: form });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Draft save failed (${res.status}) ${text}`.trim());
    }
  }

  async function onReviewProof() {
    setError(null);
    if (!hasText) {
      setError("Enter at least one line of custom text.");
      goToStep("design");
      return;
    }
    setBusy(true);
    try {
      await captureMockup();
      const printSvg = gavelBandToSvgString(
        bandArtLines,
        textSize,
        bandDef.color,
      );
      await saveDraft({
        thumbnailBlob: mockupRef.current.blob,
        printSvg,
      });
      const pdfBlob = await generateGavelProofPdf({
        styleId: gavelStyle,
        bandFinishId: bandFinish,
        textSizePreset: textSize,
        lines: bandArtLines,
        quantity: qty,
        mockupDataUrl: mockupRef.current.dataUrl || bandTextureUrl,
        unwrappedDataUrl: bandTextureUrl,
        productType,
        soundBlock: isStand ? "none" : soundBlock,
        soundBlockText: soundBlockEngraved ? soundBlockArtText : "",
        soundBlockDataUrl: soundBlockTextureUrl || null,
        suedeBag,
        standFinish: isStand ? standFinish : undefined,
        productionMethod: isStand ? productionMethod : undefined,
        plateLines: isStand ? plateArtLines : undefined,
        // Rendered from the committed placement, since the on-screen texture can
        // still be a deferred render behind the sliders.
        plateDataUrl: renderPlateTexture(plateLogo) || null,
        unitPrice: quote.unitPrice,
        estimatedTotal: quote.total,
        logoFileName: logoFile?.name ?? null,
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
      const properties = buildDesignerCartLineProperties({
        designerId: "gavel",
        designId,
        lineIndex: 0,
        indexPropertyPrimary: def.cartIndexPropertyPrimary,
        indexPropertyFallbacks: def.cartIndexPropertyFallbacks,
        lines: bandArtLines,
        backgroundColor: bandDef.color,
        linePrice: quote.unitPrice.toFixed(2),
        thumbnailUrl,
        gadgetDesignId,
        pdfUrl,
        orderQuantity: qty,
        extraHidden: {
          "_Product Type": isStand ? "Gavel + stand" : "Gavel",
          "_Gavel Style": styleDef.label,
          "_Band Finish": bandDef.label,
          "_Suede Bag": suedeBag ? "Yes" : "No",
          ...(isStand
            ? {
                "_Plate Finish": standDef.label,
                "_Production Method": getGavelProductionMethod(productionMethod)
                  .label,
                ...(logoFile ? { "_Logo File": logoFile.name } : {}),
                ...Object.fromEntries(
                  plateArtLines
                    .map((line, i) => (line.text ?? "").trim() ? [`Stand Plate Line ${i + 1}`, (line.text ?? "").trim()] : null)
                    .filter((entry): entry is [string, string] => Boolean(entry)),
                ),
              }
            : {
                "_Sound Block": getGavelSoundBlock(soundBlock).label,
                ...(soundBlockEngraved && soundBlockArtText
                  ? { "Sound Block Text": soundBlockArtText }
                  : {}),
              }),
          "_Text Size": textSize,
        },
      });

      const vid = variantId || "0";
      const lineQty = clampBadgeLineQty(qty);
      const cartLines = [
        {
          variantId: vid,
          quantity: lineQty,
          properties,
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
        cartLines.push({
          variantId: bagVariant.variantId,
          quantity: lineQty,
          properties: {
            "_Design ID": designId,
            For: `${styleDef.label} ${isStand ? "gavel + stand" : "gavel"}`,
          },
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
    ? standDef.allowsUvPrint && productionMethod === "uvprint"
      ? "Custom band, plus a full-color plate on the matching wood stand."
      : "Custom band, plus a personalized plate on the matching wood stand."
    : "Custom gavel band — black text on the metal band.";

  const panelCopy: Record<StepId, { title: string; sub: string }> = {
    product: {
      title: "What are you customizing?",
      sub: "Choose your product to see the right options.",
    },
    style: {
      title: "Choose your gavel",
      sub: isStand
        ? "The stand uses the same wood. Pick the wood and band finish."
        : "Every gavel shares the same head — pick the wood and band finish.",
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
    product: "Continue to gavel →",
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
                          if (p.id === "stand") setSoundBlock("none");
                        }}
                      >
                        <img
                          className="gf-toggle-photo"
                          src={p.photoSrc}
                          alt=""
                        />
                        <span className="gf-toggle-label">{p.label}</span>
                        <span className="gf-toggle-sub">{p.description}</span>
                      </button>
                    ))}
                  </div>

                  {isStand ? (
                    <div className="gf-sub-section">
                      <p className="gf-sub-title">Metal finish</p>
                      <div className="gf-pill-row">
                        {GAVEL_STAND_FINISH_OPTIONS.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            className={`gf-pill ${standFinish === f.id ? "is-selected" : ""}`}
                            onClick={() => setBandFinish(f.id)}
                          >
                            <span
                              className="gf-swatch"
                              style={{ background: f.plateHex }}
                              aria-hidden
                            />
                            {f.label}
                          </button>
                        ))}
                      </div>
                      <p className="gf-note">
                        {standDef.note} The band and stand plate always match,
                        and the stand is the same wood as the gavel.
                      </p>
                    </div>
                  ) : (
                    <div className="gf-sub-section">
                      <p className="gf-sub-title">Include a sound block?</p>
                      <div className="gf-toggle-row is-compact">
                        {GAVEL_SOUND_BLOCK_OPTIONS.map((o) => (
                          <button
                            key={o.id}
                            type="button"
                            className={`gf-toggle-card is-compact ${soundBlock === o.id ? "is-selected" : ""}`}
                            onClick={() => setSoundBlock(o.id)}
                          >
                            <img
                              className="gf-toggle-photo"
                              src={o.photoSrc}
                              alt=""
                            />
                            <span className="gf-toggle-label">{o.label}</span>
                          </button>
                        ))}
                      </div>
                      <p className="gf-note">
                        Personalization goes on the wood top of the sound block,
                        independent of the gavel band — you can customize one,
                        both, or neither.
                      </p>
                    </div>
                  )}
                </>
              ) : null}

              {step === "style" ? (
                <>
                  <div className="gf-sub-section">
                    <p className="gf-sub-title">Wood</p>
                    <div className="gf-style-grid">
                      {GAVEL_STYLES.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`gf-style-card ${gavelStyle === s.id ? "is-selected" : ""}`}
                          onClick={() => setGavelStyle(s.id)}
                        >
                          <img className="gf-style-thumb" src={s.thumbSrc} alt="" />
                          <span>
                            <div className="gf-style-card-title">{s.label}</div>
                            <div className="gf-style-card-desc">
                              {s.description}
                            </div>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

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
                        ? " The stand uses this wood, with a plate on the front."
                        : ""}
                    </p>
                  </div>
                </>
              ) : null}

              {step === "design" ? (
                <>
                  {isStand ? (
                    <p className="gf-sub-title">Gavel band</p>
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

                  {lines.map((line, index) => (
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
                            ? "Your name here"
                            : index === 1
                              ? "Title or organization"
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
                  ))}

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
                          Independent of the band — leave blank to repeat the
                          band text on the plate.
                        </p>
                        {plateLines.map((line, index) => (
                          <div key={line.id} className="gf-line-block">
                            <div className="gf-line-label">
                              Plate line {index + 1} (optional)
                            </div>
                            <input
                              className="gf-input"
                              value={line.text ?? ""}
                              maxLength={maxChars}
                              placeholder={
                                index === 0
                                  ? "Name or title"
                                  : "Second line"
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
                        ))}
                      </div>
                      <div className="gf-sub-section" style={{ marginTop: 12 }}>
                        <p className="gf-sub-title">Logo (optional)</p>
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
                              : canPickTextColor
                                ? "Upload logo — full color (JPG, PNG, SVG)"
                                : "Upload logo — vector or silhouette (JPG, PNG, SVG)"}
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
                          Your logo prints to the left of the plate text. The
                          original file is attached to your order so our team
                          works from full-quality art.
                        </p>
                      </div>
                    </>
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
                      <input
                        className="gf-input"
                        value={soundBlockText}
                        maxLength={maxChars}
                        placeholder="Same as band, or enter new text"
                        onChange={(e) => setSoundBlockText(e.target.value)}
                      />
                      <p className="gf-note">
                        Leave blank to repeat line 1 of the band.
                      </p>
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
                      Quantity
                    </span>
                    <BadgeQtyStepper value={qty} onChange={setQty} />
                  </div>
                  <input
                    type="range"
                    className="gf-range"
                    min={1}
                    max={QTY_SLIDER_MAX}
                    value={Math.min(qty, QTY_SLIDER_MAX)}
                    onChange={(e) => setQty(Number(e.target.value))}
                    aria-label="Quantity"
                  />
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
                    {qty} × {isStand ? "gavel + stand" : "gavel"} added to your
                    cart.
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
                    disabled={busy || !hasText}
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
            </div>

            {showPreview ? (
              <div className="gf-preview-pane">
                <GavelSpinPreviewGate
                  previewRef={previewRef}
                  style={styleDef}
                  bandTextureUrl={bandTextureUrl}
                  bandHex={bandDef.color}
                  showSoundBlockToggle={soundBlockEngraved}
                  soundBlockTextureUrl={soundBlockTextureUrl}
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
                  )}
                />
                {step === "design" ? (
                  <GavelUnwrappedBandStrip
                    dataUrl={bandTextureUrl}
                    empty={!hasText}
                    label="Unwrapped band (custom proof)"
                    emptyText="Enter text to see it laid out on the band"
                  />
                ) : null}
                {isStand && step === "design" ? (
                  <GavelUnwrappedBandStrip
                    dataUrl={plateProofUrl}
                    empty={!plateProofUrl}
                    shaped
                    label="Stand plate (custom proof)"
                    emptyText="Enter band or plate text"
                  />
                ) : null}
                {soundBlockEngraved && step === "design" ? (
                  <GavelUnwrappedBandStrip
                    dataUrl={soundBlockTextureUrl}
                    empty={!soundBlockArtText}
                    square
                    label="Sound block top (custom proof)"
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
              {isStand ? "gavel and stand" : "gavel"}{" "}
              to your cart.
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
