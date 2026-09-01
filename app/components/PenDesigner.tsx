import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { Badge, BadgeLine } from "~/types/badge";
import {
  PEN_DEFAULT_PRICE,
  PEN_FONTS,
  PEN_LIMITS,
  type PenBandMode,
  type PenFontId,
} from "~/constants/pen";
import {
  penCapToSvgString,
  penCaseBandToSvgString,
  penProofBoardToPng,
  type PenSurfaceArtwork,
} from "~/utils/penRender";
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
  gadgetApiUrl?: string;
  gadgetApiKey?: string;
  variantId?: string | null;
  unitPrice?: number | null;
}

interface CachedPenDesign {
  step: PenStep;
  bandMode: PenBandMode;
  bandText: string;
  capText: string;
  fontFamily: PenFontId;
  bold: boolean;
  italic: boolean;
  quantity: number;
}

const STEPS: readonly { id: PenStep; label: string }[] = [
  { id: "product", label: "Pen" },
  { id: "band", label: "Case band" },
  { id: "cap", label: "Pen cap" },
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
  gadgetApiUrl,
  gadgetApiKey,
  variantId: suppliedVariantId,
  unitPrice: suppliedUnitPrice,
}: PenDesignerProps) {
  const [step, setStep] = useState<PenStep>("product");
  const [furthestStep, setFurthestStep] = useState(0);
  const [previewSurface, setPreviewSurface] =
    useState<PreviewSurface>("band");
  const [bandMode, setBandMode] = useState<PenBandMode>("text");
  const [bandText, setBandText] = useState("");
  const [capText, setCapText] = useState("");
  const [fontFamily, setFontFamily] = useState<PenFontId>("Montserrat");
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofPdf, setProofPdf] = useState<Blob | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const designIdRef = useRef(
    `design_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
  );
  const apiRef = useRef(
    createApi(gadgetApiUrl, gadgetApiKey, { designerId: "pen" }),
  );

  const currentIndex = STEPS.findIndex((candidate) => candidate.id === step);
  const unitPrice = useMemo(() => {
    const parsed = Number(suppliedUnitPrice);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : PEN_DEFAULT_PRICE;
  }, [suppliedUnitPrice]);
  const variantId = suppliedVariantId?.trim() ?? "";

  const bandArtwork: PenSurfaceArtwork = useMemo(
    () => ({
      mode: bandMode,
      text: bandText,
      fontFamily,
      bold,
      italic,
      logoDataUrl,
    }),
    [bandMode, bandText, bold, fontFamily, italic, logoDataUrl],
  );
  const capArtwork: PenSurfaceArtwork = useMemo(
    () => ({
      mode: "text",
      text: capText,
      fontFamily,
      bold,
      italic,
    }),
    [bold, capText, fontFamily, italic],
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as Partial<CachedPenDesign>;
        if (cached.bandMode === "text" || cached.bandMode === "logo") {
          setBandMode(cached.bandMode);
        }
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
          setStep(STEPS[restoredIndex].id);
          setFurthestStep(restoredIndex);
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
        bandMode,
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
    bandMode,
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

  function buildBadge(): Badge {
    const lines = [
      makeLine("pen-band", bandText, fontFamily, bold, italic),
      makeLine("pen-cap", capText, fontFamily, bold, italic),
    ];
    return {
      lines,
      backgroundColor: "#315c7d",
      backing: "magnetic",
      logo:
        bandMode === "logo" && logoDataUrl
          ? { src: logoDataUrl }
          : undefined,
      penStyle: "blue-gift-set",
      penCaseBandMode: bandMode,
      penCaseBandText: bandMode === "text" ? bandText : "",
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
      penCaseBandText: bandMode === "text" ? bandText : "",
      penCapText: capText,
      penLogoFileName: bandMode === "logo" ? logoFile?.name ?? null : null,
      totalPrice: unitPrice * quantity,
      quantity,
      timestamp: new Date().toISOString(),
      shopId: shop || queryValue("shop") || "test-shop",
      productId: productId || queryValue("product") || "test-product",
    };
  }

  function validateStep(candidate: PenStep): string | null {
    if (candidate === "band") {
      if (bandMode === "text" && !bandText.trim()) {
        return "Enter a message for the case band.";
      }
      if (bandMode === "logo" && !logoFile) {
        return "Upload a logo for the case band.";
      }
    }
    if (candidate === "cap" && !capText.trim()) {
      return "Enter the text to engrave on the pen cap.";
    }
    return null;
  }

  function goTo(next: PenStep) {
    const nextIndex = STEPS.findIndex((candidate) => candidate.id === next);
    setStep(next);
    setFurthestStep((value) => Math.max(value, nextIndex));
    setPreviewSurface(next === "cap" ? "cap" : "band");
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
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

  function onLogoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
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
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setLogoDataUrl(reader.result);
    };
    reader.readAsDataURL(file);
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
    if (logoFile && bandMode === "logo") {
      form.append("logo_0", logoFile, logoFile.name);
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
    const bandError = validateStep("band");
    const capError = validateStep("cap");
    if (bandError || capError) {
      setError(bandError || capError);
      goTo(bandError ? "band" : "cap");
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
        bandSummary:
          bandMode === "text" ? bandText.trim() : logoFile?.name ?? "Uploaded logo",
        capText: capText.trim(),
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

      let gadgetDesignId: string | undefined;
      try {
        const saved = await apiRef.current.saveBadgeDesign(
          buildDesignPayload(),
          {
            shopId: shop || queryValue("shop") || "test-shop",
            customerId: customerId || queryValue("customerId") || undefined,
          },
        );
        gadgetDesignId = saved.id;
      } catch (caught) {
        console.warn("[PenDesigner] Gadget save skipped:", caught);
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
        gadgetDesignId,
        pdfUrl: finalized.pdfUrl ?? "",
        orderQuantity: quantity,
        extraHidden: {
          "_Pen Style": "Blue gift set",
          "_Case Band Artwork":
            bandMode === "text" ? bandText.trim() : logoFile?.name ?? "Logo",
          "_Pen Cap Text": capText.trim(),
          "_Case Band Mode": bandMode === "text" ? "Text" : "Logo",
        },
      });
      const result = await apiRef.current.addToCartMultiple([
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
    setPreviewSurface("band");
    setBandMode("text");
    setBandText("");
    setCapText("");
    setFontFamily("Montserrat");
    setBold(false);
    setItalic(false);
    setQuantity(1);
    setLogoFile(null);
    setLogoDataUrl(null);
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
    <div className="pen-designer-root">
      <header className="pen-header">
        <div>
          <p className="pen-eyebrow">Personalization tool</p>
          <h1>Design your custom pen set</h1>
          <p>Personalize the presentation case band and engrave the pen cap.</p>
        </div>
        <button type="button" className="pen-reset" onClick={resetDesign}>
          Reset design
        </button>
      </header>

      <nav className="pen-stepper" aria-label="Pen design steps">
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
        <section className="pen-controls">
          {step === "product" && (
            <div className="pen-panel">
              <p className="pen-step-label">Step 1</p>
              <h2>Premium blue pen gift set</h2>
              <p className="pen-lead">
                Includes the presentation case, customizable metal case band,
                and engraved pen.
              </p>
              <button type="button" className="pen-product-card is-selected">
                <img src="/images/pen/gift-set.jpg" alt="" />
                <span>
                  <strong>Blue rollerball gift set</strong>
                  <small>Case band + pen cap personalization</small>
                </span>
                <b>${unitPrice.toFixed(2)}</b>
              </button>
            </div>
          )}

          {step === "band" && (
            <div className="pen-panel">
              <p className="pen-step-label">Step 2</p>
              <h2>Customize the case band</h2>
              <p className="pen-lead">Choose a message or upload your logo.</p>
              <div className="pen-segmented">
                <button
                  type="button"
                  className={bandMode === "text" ? "is-selected" : ""}
                  onClick={() => setBandMode("text")}
                >
                  Custom message
                </button>
                <button
                  type="button"
                  className={bandMode === "logo" ? "is-selected" : ""}
                  onClick={() => setBandMode("logo")}
                >
                  Upload logo
                </button>
              </div>
              {bandMode === "text" ? (
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
              ) : (
                <label className="pen-upload">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={onLogoChange}
                  />
                  <span>{logoFile ? logoFile.name : "Choose logo file"}</span>
                  <small>PNG, JPG, WEBP, or SVG · maximum 8 MB</small>
                </label>
              )}
              <TextStyleControls
                fontFamily={fontFamily}
                setFontFamily={setFontFamily}
                bold={bold}
                setBold={setBold}
                italic={italic}
                setItalic={setItalic}
              />
            </div>
          )}

          {step === "cap" && (
            <div className="pen-panel">
              <p className="pen-step-label">Step 3</p>
              <h2>Engrave the pen cap</h2>
              <p className="pen-lead">
                Add a name, title, or short message to the upper barrel.
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
                  <dt>Case band</dt>
                  <dd>
                    {bandMode === "text"
                      ? bandText
                      : logoFile?.name ?? "Uploaded logo"}
                  </dd>
                </div>
                <div>
                  <dt>Pen cap</dt>
                  <dd>{capText}</dd>
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
              <button
                type="button"
                className="pen-proof-button"
                onClick={buildProof}
                disabled={busy}
              >
                {busy ? "Building proof…" : "Open proof & add to cart"}
              </button>
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
            {step !== "review" && (
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
                className={previewSurface === "band" ? "is-selected" : ""}
                onClick={() => setPreviewSurface("band")}
              >
                Case band
              </button>
              <button
                type="button"
                className={previewSurface === "cap" ? "is-selected" : ""}
                onClick={() => setPreviewSurface("cap")}
              >
                Pen cap
              </button>
            </div>
          </div>
          <div className={`pen-product-preview is-${previewSurface}`}>
            {previewSurface === "band" ? (
              <>
                <img
                  src="/images/pen/case-band.jpg"
                  alt="Black presentation case with a silver customizable band"
                />
                <div className="pen-band-overlay">
                  {bandMode === "logo" && logoDataUrl ? (
                    <img src={logoDataUrl} alt="Uploaded logo preview" />
                  ) : (
                    <span
                      style={{
                        fontFamily,
                        fontWeight: bold ? 700 : 500,
                        fontStyle: italic ? "italic" : "normal",
                      }}
                    >
                      {bandText || "Your design"}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <>
                <img
                  src="/images/pen/pen-cap.jpg"
                  alt="Blue pen cap with a customizable engraving area"
                />
                <div
                  className="pen-cap-overlay"
                  style={{
                    fontFamily,
                    fontWeight: bold ? 700 : 500,
                    fontStyle: italic ? "italic" : "normal",
                  }}
                >
                  {capText || "Your message"}
                </div>
              </>
            )}
          </div>
          <p className="pen-preview-note">
            Preview placement is approximate. Production artwork uses separate,
            configurable case-band and cap files.
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
