import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { Badge, BadgeLine } from "~/types/badge";
import {
  PEN_ARTWORK_MODE_LABELS,
  PEN_DEFAULT_PRICE,
  PEN_DEFAULT_FONT,
  PEN_FONTS,
  PEN_LIMITS,
  PEN_PREVIEW_PHOTOS,
  penArtworkMode,
  type PenFontId,
} from "~/constants/pen";
import { PenPreviewArt } from "~/components/PenPreviewArt";
import {
  penCapToSvgString,
  penCaseBandToSvgString,
  penProofBoardToPng,
  type PenLogoInk,
  type PenSurfaceArtwork,
} from "~/utils/penRender";
import { blackInkLogoFromSrc } from "~/utils/logoBlackInk";
import { generatePenProofPdf } from "~/utils/penPdf";
import { createApi } from "~/utils/api";
import {
  getDesignerApiPaths,
  getDesignerConfig,
} from "~/config/designers";
import { buildDesignerCartLineProperties } from "~/utils/cartLineProperties";
import "../styles/penDesigner.css";

type PenStep = "product" | "band" | "cap" | "quantity" | "review";
type PreviewSurface = "band" | "cap";

interface PenDesignerProps {
  productId?: string | null;
  shop?: string | null;
  customerId?: string | null;
  variantId?: string | null;
  unitPrice?: number | null;
}

interface CachedPenDesign {
  step: PenStep;
  bandText: string;
  capText: string;
  fontFamily: PenFontId;
  bold: boolean;
  italic: boolean;
  quantity: number;
}

const STEPS: readonly { id: PenStep; label: string }[] = [
  { id: "product", label: "Pen" },
  { id: "cap", label: "Pen cap" },
  { id: "band", label: "Case band" },
  { id: "quantity", label: "Quantity" },
  { id: "review", label: "Review" },
];

const CACHE_KEY = "aqb-pen-designer-draft-v1";

function queryValue(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name)?.trim() ?? "";
}

function makeLine(
  id: string,
  text: string,
  fontFamily: PenFontId,
  bold: boolean,
  italic: boolean,
): BadgeLine {
  return {
    id,
    text,
    xNorm: 0.5,
    yNorm: 0.5,
    sizeNorm: 0.28,
    align: "center",
    color: "#f3f4f5",
    fontFamily,
    bold,
    italic,
  };
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Could not read that logo."));
    reader.onerror = () => reject(new Error("Could not read that logo."));
    reader.readAsDataURL(file);
  });
}

/** How a surface reads on the proof and the order: the message, the mark, or both. */
function describeArtwork(text: string, file: File | null): string {
  const message = text.trim();
  const logo = file?.name ?? "";
  if (message && logo) return `${message} + ${logo}`;
  return message || logo || "—";
}

function clampQuantity(value: number): number {
  if (!Number.isFinite(value)) return PEN_LIMITS.quantityMin;
  return Math.min(
    PEN_LIMITS.quantityMax,
    Math.max(PEN_LIMITS.quantityMin, Math.round(value)),
  );
}

export default function PenDesigner({
  productId,
  shop,
  customerId,
  variantId: suppliedVariantId,
  unitPrice: suppliedUnitPrice,
}: PenDesignerProps) {
  const [step, setStep] = useState<PenStep>("product");
  const [furthestStep, setFurthestStep] = useState(0);
  const [previewSurface, setPreviewSurface] =
    useState<PreviewSurface>("cap");
  const [bandText, setBandText] = useState("");
  const [capText, setCapText] = useState("");
  const [fontFamily, setFontFamily] = useState<PenFontId>(PEN_DEFAULT_FONT);
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [capLogoFile, setCapLogoFile] = useState<File | null>(null);
  const [bandLogoFile, setBandLogoFile] = useState<File | null>(null);
  /** Uploads reduced to printable single-colour art, ready to tint per surface. */
  const [capLogoInk, setCapLogoInk] = useState<PenLogoInk | null>(null);
  const [bandLogoInk, setBandLogoInk] = useState<PenLogoInk | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofPdf, setProofPdf] = useState<Blob | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const designIdRef = useRef(
    `design_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
  );
  const commerceApiRef = useRef(
    createApi(undefined, undefined, { designerId: "pen" }),
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const stepperRef = useRef<HTMLElement>(null);
  const controlsRef = useRef<HTMLElement>(null);

  const currentIndex = STEPS.findIndex((candidate) => candidate.id === step);
  const unitPrice = useMemo(() => {
    const parsed = Number(suppliedUnitPrice);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : PEN_DEFAULT_PRICE;
  }, [suppliedUnitPrice]);
  const variantId = suppliedVariantId?.trim() ?? "";

  const bandMode = penArtworkMode(bandText, Boolean(bandLogoInk));
  const capMode = penArtworkMode(capText, Boolean(capLogoInk));

  const bandArtwork: PenSurfaceArtwork = useMemo(
    () => ({
      mode: bandMode,
      text: bandText,
      fontFamily,
      bold,
      italic,
      logo: bandLogoInk,
    }),
    [bandLogoInk, bandMode, bandText, bold, fontFamily, italic],
  );
  const capArtwork: PenSurfaceArtwork = useMemo(
    () => ({
      mode: capMode,
      text: capText,
      fontFamily,
      bold,
      italic,
      logo: capLogoInk,
    }),
    [bold, capLogoInk, capMode, capText, fontFamily, italic],
  );
  const fontStack = useMemo(
    () =>
      PEN_FONTS.find((font) => font.id === fontFamily)?.sample ??
      `"${PEN_DEFAULT_FONT}", Arial, sans-serif`,
    [fontFamily],
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as Partial<CachedPenDesign>;
        if (typeof cached.bandText === "string") setBandText(cached.bandText);
        if (typeof cached.capText === "string") setCapText(cached.capText);
        if (PEN_FONTS.some((font) => font.id === cached.fontFamily)) {
          setFontFamily(cached.fontFamily as PenFontId);
        }
        setBold(Boolean(cached.bold));
        setItalic(Boolean(cached.italic));
        if (typeof cached.quantity === "number") {
          setQuantity(clampQuantity(cached.quantity));
        }
        const restoredIndex = STEPS.findIndex(
          (candidate) => candidate.id === cached.step,
        );
        if (restoredIndex >= 0) {
          const restored = STEPS[restoredIndex].id;
          setStep(restored);
          setFurthestStep(restoredIndex);
          if (restored === "band" || restored === "cap") {
            setPreviewSurface(restored);
          }
        }
      }
    } catch {
      window.localStorage.removeItem(CACHE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timeout = window.setTimeout(() => {
      const cached: CachedPenDesign = {
        step,
        bandText,
        capText,
        fontFamily,
        bold,
        italic,
        quantity,
      };
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(cached));
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [
    bandText,
    bold,
    capText,
    fontFamily,
    hydrated,
    italic,
    quantity,
    step,
  ]);

  useEffect(
    () => () => {
      if (proofUrl) URL.revokeObjectURL(proofUrl);
    },
    [proofUrl],
  );

  /*
   * Below 900px the designer is a fixed, full-height app shell so the preview
   * and the Back/Continue row stay on screen while the fields scroll. iOS
   * anchors fixed elements to the layout viewport, so the on-screen keyboard
   * would otherwise push the preview above the visible area; mirroring the
   * visual viewport keeps the shell inside the region that is actually shown.
   */
  useEffect(() => {
    if (!hydrated) return;
    const root = rootRef.current;
    if (!root) return;

    const mq = window.matchMedia("(max-width: 900px)");
    const html = document.documentElement;
    const { body } = document;
    const previousHtmlOverflow = html.style.overflow;
    const previousBodyOverflow = body.style.overflow;

    const syncViewport = () => {
      const viewport = window.visualViewport;
      root.style.setProperty(
        "--pen-vv-height",
        `${Math.round(viewport?.height ?? window.innerHeight)}px`,
      );
      root.style.setProperty(
        "--pen-vv-top",
        `${Math.round(viewport?.offsetTop ?? 0)}px`,
      );
      html.style.overflow = mq.matches ? "hidden" : previousHtmlOverflow;
      body.style.overflow = mq.matches ? "hidden" : previousBodyOverflow;
    };

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncViewport);
    viewport?.addEventListener("scroll", syncViewport);
    window.addEventListener("resize", syncViewport);
    mq.addEventListener("change", syncViewport);
    syncViewport();

    return () => {
      viewport?.removeEventListener("resize", syncViewport);
      viewport?.removeEventListener("scroll", syncViewport);
      window.removeEventListener("resize", syncViewport);
      mq.removeEventListener("change", syncViewport);
      html.style.overflow = previousHtmlOverflow;
      body.style.overflow = previousBodyOverflow;
      root.style.removeProperty("--pen-vv-height");
      root.style.removeProperty("--pen-vv-top");
    };
  }, [hydrated]);

  /* The stepper scrolls sideways on narrow screens, so bring the open step's
     label into view rather than leaving the user to find it. */
  useEffect(() => {
    const stepper = stepperRef.current;
    if (!stepper || stepper.scrollWidth <= stepper.clientWidth) return;
    const active = stepper.querySelector<HTMLElement>("button.is-active");
    if (!active) return;
    stepper.scrollTo({
      left: Math.max(
        0,
        active.offsetLeft - (stepper.clientWidth - active.offsetWidth) / 2,
      ),
      behavior: "smooth",
    });
  }, [step]);

  function buildBadge(): Badge {
    const lines = [
      makeLine("pen-band", bandText, fontFamily, bold, italic),
      makeLine("pen-cap", capText, fontFamily, bold, italic),
    ];
    return {
      lines,
      backgroundColor: "#315c7d",
      backing: "magnetic",
      logo: bandLogoInk ? { src: bandLogoInk.href } : undefined,
      penStyle: "blue-gift-set",
      penCaseBandMode: bandMode,
      penCaseBandText: bandText,
      penCapMode: capMode,
      penCapText: capText,
    };
  }

  function buildDesignPayload() {
    const badge = buildBadge();
    return {
      designId: designIdRef.current,
      designer: "pen",
      badge,
      allBadges: [badge],
      multipleBadges: [],
      penCaseBandMode: bandMode,
      penCaseBandText: bandText,
      penCaseBandLogoFileName: bandLogoFile?.name ?? null,
      penCapMode: capMode,
      penCapText: capText,
      penCapLogoFileName: capLogoFile?.name ?? null,
      totalPrice: unitPrice * quantity,
      quantity,
      timestamp: new Date().toISOString(),
      shopId: shop || queryValue("shop") || "test-shop",
      productId: productId || queryValue("product") || "test-product",
    };
  }

  function validateStep(candidate: PenStep): string | null {
    if (candidate === "band" && !bandText.trim() && !bandLogoInk) {
      return "Add a message or a logo for the case band.";
    }
    if (candidate === "cap" && !capText.trim() && !capLogoInk) {
      return "Add a message or a logo for the pen cap.";
    }
    return null;
  }

  function goTo(next: PenStep) {
    const nextIndex = STEPS.findIndex((candidate) => candidate.id === next);
    setStep(next);
    setFurthestStep((value) => Math.max(value, nextIndex));
    if (next === "cap" || next === "band") {
      setPreviewSurface(next);
    }
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    // On mobile the page itself does not scroll; the field panel does.
    controlsRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  function continueForward() {
    const validation = validateStep(step);
    if (validation) {
      setError(validation);
      return;
    }
    const next = STEPS[Math.min(STEPS.length - 1, currentIndex + 1)];
    goTo(next.id);
  }

  async function onLogoChange(
    event: ChangeEvent<HTMLInputElement>,
    surface: PreviewSurface,
  ) {
    const file = event.target.files?.[0] ?? null;
    // Let the same file be picked again after a removal.
    event.target.value = "";
    setError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a PNG, JPG, WEBP, or SVG logo.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setError("Logo files must be smaller than 8 MB.");
      return;
    }
    const setFile = surface === "cap" ? setCapLogoFile : setBandLogoFile;
    const setInk = surface === "cap" ? setCapLogoInk : setBandLogoInk;
    setFile(file);
    // Reduce the upload to printable single-colour art once, so the preview,
    // the proof, and the production file all engrave the same shapes.
    const ink = await readDataUrl(file)
      .then(blackInkLogoFromSrc)
      .catch(() => null);
    if (!ink) {
      setFile(null);
      setInk(null);
      setError(
        "That logo could not be converted to engravable art. Try a PNG or JPG.",
      );
      return;
    }
    setInk(ink);
  }

  function removeLogo(surface: PreviewSurface) {
    if (surface === "cap") {
      setCapLogoFile(null);
      setCapLogoInk(null);
    } else {
      setBandLogoFile(null);
      setBandLogoInk(null);
    }
    setError(null);
  }

  async function saveDraft(thumbnailBlob: Blob) {
    const form = new FormData();
    form.append("designId", designIdRef.current);
    form.append("designData", JSON.stringify(buildDesignPayload()));
    const effectiveCustomer = customerId || queryValue("customerId");
    if (effectiveCustomer) {
      form.append("shopifyCustomerId", effectiveCustomer);
    }
    form.append("thumbnail_png_0", thumbnailBlob, "pen-thumbnail.png");
    // The draft API keeps a single shared logo slot. Both surfaces carry their
    // converted art inside the production SVGs below, so this is the original
    // upload kept for reference.
    const originalLogo = capLogoFile ?? bandLogoFile;
    if (originalLogo) {
      form.append("logo_0", originalLogo, originalLogo.name);
    }
    const bandSvg = penCaseBandToSvgString(bandArtwork);
    const capSvg = penCapToSvgString(capArtwork);
    form.append(
      "svg_0",
      new Blob([bandSvg], { type: "image/svg+xml" }),
      "pen-case-band-design.svg",
    );
    form.append(
      "print_svg_0",
      new Blob([bandSvg], { type: "image/svg+xml" }),
      "pen-case-band-print.svg",
    );
    form.append(
      "secondary_svg_0",
      new Blob([capSvg], { type: "image/svg+xml" }),
      "pen-cap-print.svg",
    );
    form.append("secondary_svg_kind_0", "cap");

    const response = await fetch(getDesignerApiPaths("pen").saveDraft, {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Could not save the pen draft (${response.status}). ${body}`);
    }
  }

  async function buildProof() {
    const capError = validateStep("cap");
    const bandError = validateStep("band");
    if (capError || bandError) {
      setError(capError || bandError);
      goTo(capError ? "cap" : "band");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const thumbnail = await penProofBoardToPng({
        band: bandArtwork,
        cap: capArtwork,
      });
      await saveDraft(thumbnail.blob);
      const pdf = await generatePenProofPdf({
        designId: designIdRef.current,
        thumbnailDataUrl: thumbnail.dataUrl,
        bandSummary: describeArtwork(bandText, bandLogoFile),
        capSummary: describeArtwork(capText, capLogoFile),
        quantity,
        unitPrice,
      });
      if (proofUrl) URL.revokeObjectURL(proofUrl);
      const nextUrl = URL.createObjectURL(pdf);
      setProofPdf(pdf);
      setProofUrl(nextUrl);
      setProofOpen(true);
      goTo("review");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not build the proof.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function addToCart() {
    if (!proofPdf) return;
    if (!variantId) {
      setError(
        "No Shopify variant was supplied. Open this designer from the pen product page.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const finalize = new FormData();
      finalize.append("designId", designIdRef.current);
      finalize.append("designer", "pen");
      finalize.append("pdf", proofPdf, "pen-design-proof.pdf");
      const finalizeResponse = await fetch("/api/finalize-draft", {
        method: "POST",
        body: finalize,
      });
      const finalized = await finalizeResponse.json().catch(() => ({}));
      if (!finalizeResponse.ok || finalized.success === false) {
        throw new Error(finalized.error || "Could not finalize the pen proof.");
      }

      const definition = getDesignerConfig("pen");
      const properties = buildDesignerCartLineProperties({
        designerId: "pen",
        designId: designIdRef.current,
        lineIndex: 0,
        indexPropertyPrimary: definition.cartIndexPropertyPrimary,
        indexPropertyFallbacks: definition.cartIndexPropertyFallbacks,
        lines: buildBadge().lines,
        backgroundColor: "#315c7d",
        linePrice: unitPrice.toFixed(2),
        thumbnailUrl: finalized.thumbnailUrls?.[0] ?? "",
        pdfUrl: finalized.pdfUrl ?? "",
        orderQuantity: quantity,
        extraHidden: {
          "_Pen Style": "Blue gift set",
          "_Case Band Artwork": describeArtwork(bandText, bandLogoFile),
          "_Pen Cap Artwork": describeArtwork(capText, capLogoFile),
          "_Case Band Mode": PEN_ARTWORK_MODE_LABELS[bandMode],
          "_Pen Cap Mode": PEN_ARTWORK_MODE_LABELS[capMode],
        },
      });
      const result = await commerceApiRef.current.addToCartMultiple([
        { variantId, quantity, properties },
      ]);
      if (!result.success) {
        throw new Error(result.message || "Could not add the pen to cart.");
      }
      window.localStorage.removeItem(CACHE_KEY);
      setProofOpen(false);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not add to cart.",
      );
    } finally {
      setBusy(false);
    }
  }

  function resetDesign() {
    if (!window.confirm("Reset the case band, pen cap, and quantity?")) return;
    setStep("product");
    setFurthestStep(0);
    setPreviewSurface("cap");
    setBandText("");
    setCapText("");
    setFontFamily(PEN_DEFAULT_FONT);
    setBold(false);
    setItalic(false);
    setQuantity(1);
    setCapLogoFile(null);
    setCapLogoInk(null);
    setBandLogoFile(null);
    setBandLogoInk(null);
    setError(null);
    window.localStorage.removeItem(CACHE_KEY);
  }

  if (!hydrated) {
    return (
      <div className="pen-designer-root">
        <div className="pen-loading">Loading pen designer…</div>
      </div>
    );
  }

  return (
    <div className="pen-designer-root" ref={rootRef}>
      <header className="pen-header">
        <div>
          <p className="pen-eyebrow">Personalization tool</p>
          <h1>Design your custom pen set</h1>
          <p>Engrave the pen cap and personalize the presentation case band.</p>
        </div>
        <button type="button" className="pen-reset" onClick={resetDesign}>
          Reset design
        </button>
      </header>

      <nav className="pen-stepper" aria-label="Pen design steps" ref={stepperRef}>
        {STEPS.map((item, index) => {
          const state =
            item.id === step
              ? "is-active"
              : index < currentIndex
                ? "is-done"
                : "";
          const reachable = index <= furthestStep;
          return (
            <button
              key={item.id}
              type="button"
              className={state}
              disabled={!reachable}
              onClick={() => goTo(item.id)}
            >
              <span>{index < currentIndex ? "✓" : index + 1}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <main className="pen-workspace">
        <section className="pen-controls" ref={controlsRef}>
          {step === "product" && (
            <div className="pen-panel">
              <p className="pen-step-label">Step 1</p>
              <h2>Premium blue pen gift set</h2>
              <p className="pen-lead">
                Includes the engraved pen, presentation case, and customizable
                metal case band.
              </p>
              <button type="button" className="pen-product-card is-selected">
                <img src="/images/pen/gift-set.jpg" alt="" />
                <span>
                  <strong>Blue rollerball gift set</strong>
                  <small>Pen cap + case band personalization</small>
                </span>
                <b>${unitPrice.toFixed(2)}</b>
              </button>
            </div>
          )}

          {step === "cap" && (
            <div className="pen-panel">
              <p className="pen-step-label">Step 2</p>
              <h2>Engrave the pen cap</h2>
              <p className="pen-lead">
                Engrave a short message on the upper barrel, and add your logo
                to sit beside it.
              </p>
              <label className="pen-field">
                <span>Pen cap text</span>
                <input
                  value={capText}
                  maxLength={PEN_LIMITS.capText}
                  onChange={(event) => setCapText(event.target.value)}
                  placeholder="You Got This"
                />
                <small>
                  {capText.length}/{PEN_LIMITS.capText} characters
                </small>
              </label>
              <TextStyleControls
                fontFamily={fontFamily}
                setFontFamily={setFontFamily}
                bold={bold}
                setBold={setBold}
                italic={italic}
                setItalic={setItalic}
              />
              <LogoUploadField
                surface="cap"
                file={capLogoFile}
                onChange={onLogoChange}
                onRemove={removeLogo}
              />
            </div>
          )}

          {step === "band" && (
            <div className="pen-panel">
              <p className="pen-step-label">Step 3</p>
              <h2>Customize the case band</h2>
              <p className="pen-lead">
                Add a message, your logo, or both to the metal band.
              </p>
              <label className="pen-field">
                <span>Case band message</span>
                <input
                  value={bandText}
                  maxLength={PEN_LIMITS.caseBandText}
                  onChange={(event) => setBandText(event.target.value)}
                  placeholder="Your company or special message"
                />
                <small>
                  {bandText.length}/{PEN_LIMITS.caseBandText} characters
                </small>
              </label>
              <TextStyleControls
                fontFamily={fontFamily}
                setFontFamily={setFontFamily}
                bold={bold}
                setBold={setBold}
                italic={italic}
                setItalic={setItalic}
              />
              <LogoUploadField
                surface="band"
                file={bandLogoFile}
                onChange={onLogoChange}
                onRemove={removeLogo}
              />
            </div>
          )}

          {step === "quantity" && (
            <div className="pen-panel">
              <p className="pen-step-label">Step 4</p>
              <h2>Choose your quantity</h2>
              <p className="pen-lead">
                Each set receives the same case band and cap design.
              </p>
              <div className="pen-quantity">
                <button
                  type="button"
                  onClick={() => setQuantity((value) => clampQuantity(value - 1))}
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <input
                  type="number"
                  min={PEN_LIMITS.quantityMin}
                  max={PEN_LIMITS.quantityMax}
                  value={quantity}
                  onChange={(event) =>
                    setQuantity(clampQuantity(Number(event.target.value)))
                  }
                  aria-label="Quantity"
                />
                <button
                  type="button"
                  onClick={() => setQuantity((value) => clampQuantity(value + 1))}
                  aria-label="Increase quantity"
                >
                  +
                </button>
              </div>
              <div className="pen-price-summary">
                <span>{quantity} personalized set{quantity === 1 ? "" : "s"}</span>
                <strong>${(unitPrice * quantity).toFixed(2)}</strong>
              </div>
            </div>
          )}

          {step === "review" && (
            <div className="pen-panel">
              <p className="pen-step-label">Step 5</p>
              <h2>Review your pen set</h2>
              <dl className="pen-review-list">
                <div>
                  <dt>Pen cap</dt>
                  <dd>{describeArtwork(capText, capLogoFile)}</dd>
                </div>
                <div>
                  <dt>Case band</dt>
                  <dd>{describeArtwork(bandText, bandLogoFile)}</dd>
                </div>
                <div>
                  <dt>Quantity</dt>
                  <dd>{quantity}</dd>
                </div>
                <div>
                  <dt>Total</dt>
                  <dd>${(unitPrice * quantity).toFixed(2)}</dd>
                </div>
              </dl>
            </div>
          )}

          {error && (
            <div className="pen-error" role="alert">
              {error}
            </div>
          )}

          <div className="pen-navigation">
            <button
              type="button"
              className="pen-secondary"
              disabled={currentIndex === 0 || busy}
              onClick={() => goTo(STEPS[currentIndex - 1].id)}
            >
              Back
            </button>
            {/* The review step's action lives here too, so the primary button
                is always in the same place instead of below the summary. */}
            {step === "review" ? (
              <button
                type="button"
                className="pen-proof-button"
                disabled={busy}
                onClick={buildProof}
              >
                {busy ? "Building proof…" : "Open proof & add to cart"}
              </button>
            ) : (
              <button
                type="button"
                className="pen-primary"
                disabled={busy}
                onClick={continueForward}
              >
                Continue
              </button>
            )}
          </div>
        </section>

        <section className="pen-preview" aria-label="Live product preview">
          <div className="pen-preview-head">
            <div>
              <p className="pen-step-label">Live preview</p>
              <h2>{previewSurface === "band" ? "Presentation case" : "Pen cap"}</h2>
            </div>
            <div className="pen-preview-tabs">
              <button
                type="button"
                className={previewSurface === "cap" ? "is-selected" : ""}
                onClick={() => setPreviewSurface("cap")}
              >
                Pen cap
              </button>
              <button
                type="button"
                className={previewSurface === "band" ? "is-selected" : ""}
                onClick={() => setPreviewSurface("band")}
              >
                Case band
              </button>
            </div>
          </div>
          <div className={`pen-product-preview is-${previewSurface}`}>
            {previewSurface === "band" ? (
              <div className="pen-photo">
                <img
                  className="pen-photo-base"
                  src={PEN_PREVIEW_PHOTOS.caseBand.src}
                  alt={PEN_PREVIEW_PHOTOS.caseBand.alt}
                  width={PEN_PREVIEW_PHOTOS.caseBand.width}
                  height={PEN_PREVIEW_PHOTOS.caseBand.height}
                />
                <PenPreviewArt
                  photo={PEN_PREVIEW_PHOTOS.caseBand}
                  text={bandText || (bandLogoInk ? "" : "Your design")}
                  fontStack={fontStack}
                  bold={bold}
                  italic={italic}
                  logo={bandLogoInk}
                />
              </div>
            ) : (
              <div className="pen-photo">
                <img
                  className="pen-photo-base"
                  src={PEN_PREVIEW_PHOTOS.cap.src}
                  alt={PEN_PREVIEW_PHOTOS.cap.alt}
                  width={PEN_PREVIEW_PHOTOS.cap.width}
                  height={PEN_PREVIEW_PHOTOS.cap.height}
                />
                <PenPreviewArt
                  photo={PEN_PREVIEW_PHOTOS.cap}
                  text={capText || (capLogoInk ? "" : "Your message")}
                  fontStack={fontStack}
                  bold={bold}
                  italic={italic}
                  logo={capLogoInk}
                />
              </div>
            )}
          </div>
          <p className="pen-preview-note">
            The preview shows your artwork on the engraving area. Production
            files are generated separately for the case band and the pen cap.
          </p>
        </section>
      </main>

      {proofOpen && proofUrl && (
        <div className="pen-modal-backdrop" role="presentation">
          <div
            className="pen-proof-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pen-proof-title"
          >
            <div className="pen-proof-modal-head">
              <div>
                <p className="pen-step-label">Production proof</p>
                <h2 id="pen-proof-title">Confirm your design</h2>
              </div>
              <button type="button" onClick={() => setProofOpen(false)}>
                Close
              </button>
            </div>
            <iframe src={proofUrl} title="Custom pen design proof" />
            {error && (
              <div className="pen-error" role="alert">
                {error}
              </div>
            )}
            <div className="pen-proof-actions">
              <button
                type="button"
                className="pen-secondary"
                onClick={() => setProofOpen(false)}
                disabled={busy}
              >
                Keep editing
              </button>
              <button
                type="button"
                className="pen-primary"
                onClick={addToCart}
                disabled={busy}
              >
                {busy
                  ? "Adding…"
                  : `Approve & add ${quantity} to cart · $${(
                      unitPrice * quantity
                    ).toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LogoUploadField({
  surface,
  file,
  onChange,
  onRemove,
}: {
  surface: PreviewSurface;
  file: File | null;
  onChange: (
    event: ChangeEvent<HTMLInputElement>,
    surface: PreviewSurface,
  ) => void;
  onRemove: (surface: PreviewSurface) => void;
}) {
  const label = surface === "cap" ? "pen cap" : "case band";
  return (
    <div className="pen-upload-field">
      <label className="pen-upload">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={(event) => onChange(event, surface)}
        />
        <span>{file ? file.name : `Add a ${label} logo (optional)`}</span>
        <small>
          Engraved as single-colour art to the left of your text · transparent
          PNG or SVG recommended · maximum 8 MB
        </small>
      </label>
      {file && (
        <button
          type="button"
          className="pen-secondary"
          onClick={() => onRemove(surface)}
        >
          Remove logo
        </button>
      )}
    </div>
  );
}

function TextStyleControls({
  fontFamily,
  setFontFamily,
  bold,
  setBold,
  italic,
  setItalic,
}: {
  fontFamily: PenFontId;
  setFontFamily: (font: PenFontId) => void;
  bold: boolean;
  setBold: (value: boolean) => void;
  italic: boolean;
  setItalic: (value: boolean) => void;
}) {
  return (
    <div className="pen-style-controls">
      <label className="pen-field">
        <span>Lettering style</span>
        <select
          value={fontFamily}
          onChange={(event) => setFontFamily(event.target.value as PenFontId)}
        >
          {PEN_FONTS.map((font) => (
            <option key={font.id} value={font.id}>
              {font.label}
            </option>
          ))}
        </select>
      </label>
      <div className="pen-format-buttons" aria-label="Text formatting">
        <button
          type="button"
          className={bold ? "is-selected" : ""}
          onClick={() => setBold(!bold)}
          aria-pressed={bold}
        >
          Bold
        </button>
        <button
          type="button"
          className={italic ? "is-selected" : ""}
          onClick={() => setItalic(!italic)}
          aria-pressed={italic}
        >
          Italic
        </button>
      </div>
    </div>
  );
}
