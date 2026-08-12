import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Badge, BadgeLine } from "~/types/badge";
import {
  GAVEL_DEFAULT_FONT,
  GAVEL_DEFAULT_TEXT_COLOR,
  GAVEL_FONT_OPTIONS,
  GAVEL_HANDLE_LENGTHS,
  GAVEL_MAX_CHARS_PER_LINE,
  GAVEL_MAX_LINES,
  GAVEL_STYLES,
  GAVEL_TEXT_SIZE_PRESETS,
  clampGavelLineText,
  formatGavelOrderFinish,
  getGavelBandFinish,
  getGavelHandleLength,
  getGavelStyle,
  type GavelHandleLengthId,
  type GavelStyleId,
  type GavelTextSizePreset,
} from "~/constants/gavelStyles";
import { GavelSpinPreviewGate } from "~/components/GavelSpinPreviewGate";
import type { GavelSpinPreviewHandle } from "~/components/GavelSpinPreview";
import { GavelUnwrappedBandStrip } from "~/components/GavelUnwrappedBandStrip";
import { FontFamilySelect } from "~/components/FontFamilySelect";
import { BadgeQtyStepper } from "~/components/BadgeQtyStepper";
import { ProofPdfViewer } from "~/components/ProofPdfViewer";
import { gavelBandToDataUrl, gavelBandToSvgString } from "~/utils/gavelBandTexture";
import { generateGavelProofPdf } from "~/utils/gavelPdf";
import { createApi } from "~/utils/api";
import {
  getDesignerApiPaths,
  getDesignerConfig,
} from "~/config/designers";
import { buildDesignerCartLineProperties } from "~/utils/cartLineProperties";
import { clampBadgeLineQty } from "~/utils/badgeLineQuantities";
import "../styles/gavelDesigner.css";

type OpenStep = "style" | "text" | "order";

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
  ];
}

function readQueryParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name)?.trim() || "";
}

export default function GavelDesigner({
  productId,
  shop,
  customerId,
  gadgetApiUrl,
  gadgetApiKey,
}: GavelDesignerProps) {
  const [gavelStyle, setGavelStyle] = useState<GavelStyleId>("walnut");
  const [handleLength, setHandleLength] =
    useState<GavelHandleLengthId>("standard");
  const [textSize, setTextSize] = useState<GavelTextSizePreset>("medium");
  const [lines, setLines] = useState<BadgeLine[]>(defaultLines);
  const [openStep, setOpenStep] = useState<OpenStep>("style");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [pendingPdfBlob, setPendingPdfBlob] = useState<Blob | null>(null);
  const [variantId, setVariantId] = useState("");
  const [priceLabel, setPriceLabel] = useState("Price at checkout");
  const designIdRef = useRef(
    `design_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
  );
  const previewRef = useRef<GavelSpinPreviewHandle>(null);
  const apiRef = useRef(
    createApi(gadgetApiUrl, gadgetApiKey, { designerId: "gavel" }),
  );

  const styleDef = getGavelStyle(gavelStyle);
  const bandFinish = styleDef.bandFinish;
  const bandDef = getGavelBandFinish(bandFinish);
  const maxChars = GAVEL_MAX_CHARS_PER_LINE[textSize];

  const bandTextureUrl = useMemo(
    () => gavelBandToDataUrl(lines, textSize, bandDef.color),
    [lines, textSize, bandDef.color],
  );
  const hasText = lines.some((l) => (l.text ?? "").trim());

  useEffect(() => {
    const key = `variantId${gavelStyle.charAt(0).toUpperCase()}${gavelStyle.slice(1)}`;
    const styleVariant =
      readQueryParam(key) ||
      readQueryParam("variantId") ||
      readQueryParam("variantIdSign");
    setVariantId(styleVariant);
    const price = readQueryParam("price");
    if (price) setPriceLabel(price);
  }, [gavelStyle]);

  const badgeForSave = useCallback((): Badge => {
    return {
      lines,
      backgroundColor: bandDef.color,
      backing: "pin",
      gavelStyle,
      gavelBandFinish: bandFinish,
      gavelTextSizePreset: textSize,
      gavelHandleLength: handleLength,
    };
  }, [bandDef.color, bandFinish, gavelStyle, handleLength, lines, textSize]);

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
  };

  const styleComplete = Boolean(gavelStyle);
  const textComplete = hasText;
  const orderComplete = qty >= 1 && textComplete && styleComplete;

  useEffect(() => {
    if (textSize) {
      setLines((prev) =>
        prev.map((line) => ({
          ...line,
          text: clampGavelLineText(line.text ?? "", textSize),
        })),
      );
    }
  }, [textSize]);

  useEffect(() => {
    return () => {
      if (proofUrl) URL.revokeObjectURL(proofUrl);
    };
  }, [proofUrl]);

  async function saveDraft(opts?: {
    thumbnailBlob?: Blob | null;
    printSvg?: string;
  }) {
    const designId = designIdRef.current;
    const badge = badgeForSave();
    const designData = {
      badge,
      allBadges: [badge],
      multipleBadges: [],
      gavelStyle,
      gavelBandFinish: bandFinish,
      gavelTextSizePreset: textSize,
      gavelHandleLength: handleLength,
      timestamp: new Date().toISOString(),
      shopId: shop || readQueryParam("shop") || "test-shop",
      productId: productId || readQueryParam("product") || "test-product",
    };
    const form = new FormData();
    form.append("designId", designId);
    form.append("designData", JSON.stringify(designData));
    const customer = customerId || readQueryParam("customerId");
    if (customer) form.append("shopifyCustomerId", customer);
    if (opts?.thumbnailBlob && opts.thumbnailBlob.size > 0) {
      form.append(
        "thumbnail_png_0",
        opts.thumbnailBlob,
        "gavel-0-thumbnail.png",
      );
    }
    if (opts?.printSvg) {
      form.append(
        "print_svg_0",
        new Blob([opts.printSvg], { type: "image/svg+xml" }),
        "gavel-0-print.svg",
      );
    }
    const svgBlob = new Blob(
      [gavelBandToSvgString(lines, textSize, bandDef.color)],
      { type: "image/svg+xml" },
    );
    form.append("svg_0", svgBlob, "gavel-0-design.svg");
    const paths = getDesignerApiPaths("gavel");
    const res = await fetch(paths.saveDraft, { method: "POST", body: form });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Draft save failed (${res.status}) ${text}`.trim());
    }
  }

  async function onReviewProof() {
    setError(null);
    if (!textComplete) {
      setError("Enter at least one line of band text.");
      setOpenStep("text");
      return;
    }
    setBusy(true);
    try {
      const thumb = await previewRef.current?.capturePngBlob();
      const printSvg = gavelBandToSvgString(lines, textSize, bandDef.color);
      await saveDraft({ thumbnailBlob: thumb, printSvg });
      const mockup =
        previewRef.current?.capturePngDataUrl() || bandTextureUrl;
      const pdfBlob = await generateGavelProofPdf({
        styleId: gavelStyle,
        bandFinishId: bandFinish,
        handleLengthId: handleLength,
        textSizePreset: textSize,
        lines,
        quantity: qty,
        mockupDataUrl: mockup,
        unwrappedDataUrl: bandTextureUrl,
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

      const def = getDesignerConfig("gavel");
      const properties = buildDesignerCartLineProperties({
        designerId: "gavel",
        designId,
        lineIndex: 0,
        indexPropertyPrimary: def.cartIndexPropertyPrimary,
        indexPropertyFallbacks: def.cartIndexPropertyFallbacks,
        lines,
        backgroundColor: bandDef.color,
        linePrice: priceLabel.replace(/^\$/, "") || "0.00",
        thumbnailUrl,
        pdfUrl,
        orderQuantity: qty,
        extraHidden: {
          "_Gavel Style": styleDef.label,
          "_Band Finish": bandDef.label,
          "_Handle Length": getGavelHandleLength(handleLength).label,
          "_Text Size": textSize,
        },
      });

      const vid = variantId || "0";
      const result = await apiRef.current.addToCartMultiple(
        [
          {
            variantId: vid,
            quantity: clampBadgeLineQty(qty),
            properties,
          },
        ],
      );
      if (!result.success) {
        throw new Error(result.message || "Add to cart failed");
      }
      setProofOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add to cart failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gf-designer-root">
      <header className="gf-header">
        <div className="gf-header-kicker">Gavels Fast</div>
        <h1 className="gf-header-title">Custom Gavel Designer</h1>
        <div className="gf-header-sub">
          American walnut, oak, or ebony — drag to spin the custom band.
        </div>
      </header>

      <div className="gf-layout">
        <section className="gf-preview-col">
          <GavelSpinPreviewGate
            previewRef={previewRef}
            style={styleDef}
            bandTextureUrl={bandTextureUrl}
            bandHex={bandDef.color}
            handleLength={handleLength}
          />
          <GavelUnwrappedBandStrip dataUrl={bandTextureUrl} empty={!hasText} />
        </section>

        <aside className="gf-editor-col">
          <div className={`gf-step ${openStep === "style" ? "is-active" : ""} ${styleComplete && openStep !== "style" ? "is-done" : ""}`}>
            <button
              type="button"
              className="gf-step-header"
              onClick={() => setOpenStep("style")}
            >
              <span className="gf-step-num">1</span>
              <span>
                <div className="gf-step-title">Choose gavel</div>
                <div className="gf-step-sub">
                  {formatGavelOrderFinish(gavelStyle, bandFinish, handleLength)}
                </div>
              </span>
            </button>
            {openStep === "style" ? (
              <div className="gf-step-body">
                <div className="gf-style-grid">
                  {GAVEL_STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`gf-style-card ${gavelStyle === s.id ? "is-selected" : ""}`}
                      onClick={() => setGavelStyle(s.id)}
                    >
                      <img
                        className="gf-style-thumb"
                        src={s.thumbSrc}
                        alt=""
                      />
                      <span>
                        <div className="gf-style-card-title">{s.label}</div>
                        <div className="gf-style-card-desc">{s.description}</div>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="gf-line-tools" style={{ marginTop: 14 }}>
                  <span className="gf-muted">Handle length</span>
                  <div className="gf-chip-row">
                    {GAVEL_HANDLE_LENGTHS.map((h) => (
                      <button
                        key={h.id}
                        type="button"
                        className={`gf-chip ${handleLength === h.id ? "is-on" : ""}`}
                        onClick={() => setHandleLength(h.id)}
                      >
                        {h.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          <div className={`gf-step ${openStep === "text" ? "is-active" : ""} ${textComplete && openStep !== "text" ? "is-done" : ""}`}>
            <button
              type="button"
              className="gf-step-header"
              onClick={() => setOpenStep("text")}
            >
              <span className="gf-step-num">2</span>
              <span>
                <div className="gf-step-title">Enter band text</div>
                <div className="gf-step-sub">Up to {GAVEL_MAX_LINES} lines · {maxChars} chars each</div>
              </span>
            </button>
            {openStep === "text" ? (
              <div className="gf-step-body">
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
                </div>
                {lines.map((line, index) => (
                  <div key={line.id} className="gf-line-block">
                    <div className="gf-line-label">Line {index + 1}</div>
                    <input
                      className="gf-input"
                      value={line.text ?? ""}
                      maxLength={maxChars}
                      placeholder={index === 0 ? "Name or organization" : "Optional"}
                      onChange={(e) => updateLine(index, { text: e.target.value })}
                      style={{ fontFamily: line.fontFamily || GAVEL_DEFAULT_FONT }}
                    />
                    <div className="gf-line-tools">
                      <FontFamilySelect
                        value={line.fontFamily || GAVEL_DEFAULT_FONT}
                        options={[...GAVEL_FONT_OPTIONS]}
                        onChange={(fontFamily) => updateLine(index, { fontFamily })}
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
                        onClick={() => updateLine(index, { italic: !line.italic })}
                      >
                        Italic
                      </button>
                      <div className="gf-chip-row">
                        {(["left", "center", "right"] as const).map((a) => (
                          <button
                            key={a}
                            type="button"
                            className={`gf-chip ${(line.align ?? "center") === a ? "is-on" : ""}`}
                            onClick={() => updateLine(index, { align: a })}
                          >
                            {a}
                          </button>
                        ))}
                      </div>
                      <span
                        className={`gf-char-count ${(line.text ?? "").length >= maxChars ? "is-warn" : ""}`}
                      >
                        {(line.text ?? "").length}/{maxChars}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className={`gf-step ${openStep === "order" ? "is-active" : ""} ${orderComplete && openStep !== "order" ? "is-done" : ""}`}>
            <button
              type="button"
              className="gf-step-header"
              onClick={() => setOpenStep("order")}
            >
              <span className="gf-step-num">3</span>
              <span>
                <div className="gf-step-title">Quantity &amp; checkout</div>
                <div className="gf-step-sub">
                  {formatGavelOrderFinish(gavelStyle, bandFinish, handleLength)}
                </div>
              </span>
            </button>
            {openStep === "order" ? (
              <div className="gf-step-body">
                <div className="gf-order-box">
                  <div className="gf-order-row">
                    <span className="gf-price">{priceLabel}</span>
                    <BadgeQtyStepper value={qty} onChange={setQty} />
                  </div>
                  <button
                    type="button"
                    className="gf-btn-primary"
                    disabled={busy || !textComplete}
                    onClick={() => void onReviewProof()}
                  >
                    {busy ? "Preparing proof…" : "Review proof & add to cart"}
                  </button>
                  {error ? <div className="gf-error">{error}</div> : null}
                  <p className="gf-disclaimer">
                    Engraved metal may differ slightly from on-screen color and
                    spacing. We may adjust layout so the finished band looks its
                    best.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      {proofOpen && proofUrl ? (
        <div className="gf-modal-backdrop" role="dialog" aria-modal="true">
          <div className="gf-modal">
            <h2 className="gf-modal-title">Design proof</h2>
            <p className="gf-muted" style={{ marginBottom: 12 }}>
              Confirm the engraving, then add this gavel to your cart.
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
