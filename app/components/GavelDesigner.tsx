import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Badge, BadgeLine } from "~/types/badge";
import {
  GAVEL_BAND_FINISHES,
  GAVEL_DEFAULT_FONT,
  GAVEL_DEFAULT_TEXT_COLOR,
  GAVEL_FONT_OPTIONS,
  GAVEL_MAX_CHARS_PER_LINE,
  GAVEL_MAX_LINES,
  GAVEL_PRODUCT_TYPE_OPTIONS,
  GAVEL_PRODUCT_TYPES,
  GAVEL_PRODUCTION_METHOD_OPTIONS,
  GAVEL_SAMPLE_PRICING,
  GAVEL_SOUND_BLOCK_OPTIONS,
  GAVEL_STAND_FINISH_OPTIONS,
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
  type GavelStandFinishId,
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
  soundBlockTopToDataUrl,
} from "~/utils/gavelBandTexture";
import { generateGavelProofPdf } from "~/utils/gavelPdf";
import { createApi } from "~/utils/api";
import {
  getDesignerApiPaths,
  getDesignerConfig,
} from "~/config/designers";
import { buildDesignerCartLineProperties } from "~/utils/cartLineProperties";
import { clampBadgeLineQty } from "~/utils/badgeLineQuantities";
import "../styles/gavelDesigner.css";

/** One decision per screen — the gavel flow adds a wood/handle step. */
type StepId = "product" | "style" | "design" | "quantity" | "done";

const STEP_LABELS: Record<StepId, string> = {
  product: "Product",
  style: "Gavel",
  design: "Design",
  quantity: "Quantity",
  done: "Checkout",
};

const QTY_SLIDER_MAX = 50;

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
  const [standFinish, setStandFinish] = useState<GavelStandFinishId>("gold");
  const [productionMethod, setProductionMethod] =
    useState<GavelProductionMethodId>("engrave");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uvTextColor, setUvTextColor] = useState(GAVEL_UV_TEXT_COLORS[0]);
  const [plateLines, setPlateLines] = useState<BadgeLine[]>(defaultPlateLines);

  const [gavelStyle, setGavelStyle] = useState<GavelStyleId>("walnut");
  const [bandFinish, setBandFinish] = useState<GavelBandFinishId>("gold");
  const [textSize, setTextSize] = useState<GavelTextSizePreset>("medium");
  const [lines, setLines] = useState<BadgeLine[]>(defaultLines);
  const [qty, setQty] = useState(10);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lineError, setLineError] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [pendingPdfBlob, setPendingPdfBlob] = useState<Blob | null>(null);
  const [variantId, setVariantId] = useState("");
  const [storeUnitPrice, setStoreUnitPrice] = useState<number | null>(null);
  /** Canvas textures only exist in the browser; keep first paint SSR-identical. */
  const [isClient, setIsClient] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const designIdRef = useRef(
    `design_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
  );
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
  const standDef = getGavelStandFinish(standFinish);
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

  const plateTextureUrl = useMemo(() => {
    if (!isClient || !isStand) return "";
    return gavelStandPlateToDataUrl(
      plateArtLines,
      textSize,
      standDef.plateHex,
      {
      solidFill: standDef.id === "white",
      },
    );
  }, [isClient, isStand, plateArtLines, standDef, textSize]);

  /** Same art cut to the plaque silhouette, for the flat proofs. */
  const plateProofUrl = useMemo(() => {
    if (!isClient || !isStand) return "";
    return gavelStandPlateToDataUrl(plateArtLines, textSize, standDef.plateHex, {
      solidFill: standDef.id === "white",
      shaped: true,
    });
  }, [isClient, isStand, plateArtLines, standDef, textSize]);

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

  const hasText = lines.some((l) => (l.text ?? "").trim());
  const quote = quoteGavelPrice({
    productType,
    soundBlock: isStand ? "none" : soundBlock,
    suedeBag,
    quantity: qty,
    storeUnitPrice,
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

  /** Storefront product pages each map to one product type, e.g. ?productType=stand. */
  useEffect(() => {
    const requested = readQueryParam("productType") as GavelProductType;
    if (!GAVEL_PRODUCT_TYPES.includes(requested)) return;
    setProductType(requested);
    if (requested === "stand") setSoundBlock("none");
  }, []);

  useEffect(() => {
    const key = `variantId${gavelStyle.charAt(0).toUpperCase()}${gavelStyle.slice(1)}`;
    const styleVariant =
      readQueryParam(key) ||
      readQueryParam("variantId") ||
      readQueryParam("variantIdSign");
    setVariantId(styleVariant);
    setStoreUnitPrice(parsePrice(readQueryParam("price")));
  }, [gavelStyle]);

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
  }, []);

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
        plateDataUrl: plateTextureUrl || null,
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
      const result = await apiRef.current.addToCartMultiple([
        {
          variantId: vid,
          quantity: clampBadgeLineQty(qty),
          properties,
        },
      ]);
      if (!result.success) {
        throw new Error(result.message || "Add to cart failed");
      }
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
          <p className="gf-panel-sub gf-panel-sub-lead">{panelCopy[step].sub}</p>

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
                      <p className="gf-sub-title">Stand plate finish</p>
                      <div className="gf-pill-row">
                        {GAVEL_STAND_FINISH_OPTIONS.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            className={`gf-pill ${standFinish === f.id ? "is-selected" : ""}`}
                            onClick={() => setStandFinish(f.id)}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                      <p className="gf-note">
                        {standDef.note} The stand is the same wood as the gavel.
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
                    <p className="gf-sub-title">Band finish</p>
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
                        <p className="gf-note">
                          Logo art is attached to your order for our team to
                          place — it is not shown in the preview yet.
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
                <p className="gf-preview-label">Live preview</p>
                <GavelSpinPreviewGate
                  previewRef={previewRef}
                  style={styleDef}
                  bandTextureUrl={bandTextureUrl}
                  bandHex={bandDef.color}
                  showSoundBlockToggle={soundBlockEngraved}
                  soundBlockTextureUrl={soundBlockTextureUrl}
                  showStandToggle={isStand}
                  showFlatProofTabs={isNarrow}
                  plateTextureUrl={plateTextureUrl}
                  plateProofUrl={plateProofUrl}
                  plateHex={standDef.plateHex}
                  productPhotoSrc={getGavelProductPhoto(
                    styleDef.id,
                    productType,
                    soundBlock,
                    isStand ? standFinish : bandFinish,
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
