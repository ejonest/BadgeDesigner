import { useEffect, useMemo, useRef, useState } from "react";
import { ProofPdfViewer } from "~/components/ProofPdfViewer";
import { getDesignerApiPaths, getDesignerConfig } from "~/config/designers";
import {
  MEDAL_BACKGROUNDS,
  MEDAL_MAX_QUANTITY,
  MEDAL_PRODUCTS,
  getMedalPrice,
  getMedalProduct,
  medalBackgroundFor,
  medalIdForChoice,
  medalIdForShopifyStyle,
  medalShapeFor,
  type MedalProduct,
  type MedalShape,
} from "~/constants/medalOptions";
import type { Badge, BadgeLine } from "~/types/badge";
import { createApi } from "~/utils/api";
import {
  findShopifyVariantByLabel,
  isShopifyProductJsPayload,
  type ShopifyProductJs,
} from "~/utils/signShopifyCatalog";
import {
  buildDesignerCartLineProperties,
  buildProductionLineProperties,
} from "~/utils/cartLineProperties";
import { generateMedalProofPdf } from "~/utils/medalPdf";
import {
  MEDAL_BULK_CSV_TEMPLATE,
  MEDAL_BULK_PASTE_EXAMPLES,
  parseMedalBulkCsv,
  type MedalBulkRow,
} from "~/utils/medalBulkCsv";
import {
  medalArtworkToSvgString,
  medalFittedSize,
  medalPreviewToPng,
  type MedalLineStyle,
} from "~/utils/medalRender";
import "../styles/gavelDesigner.css";
import "../styles/medalDesigner.css";

type StepId = "shape" | "background" | "design" | "quantity" | "done";
type PendingMedalOrder = {
  designId: string;
  pdf: Blob;
  medalLabel: string;
  fontFamily: string;
  unitPrice: number;
  rows: Array<{ lines: string[]; lineStyles: MedalLineStyle[]; quantity: number }>;
};

type MedalBulkSortKey = "line1" | "line2" | "line3" | "quantity";

const STEPS: StepId[] = ["shape", "background", "design", "quantity", "done"];
const STEP_LABELS: Record<StepId, string> = {
  shape: "Shape",
  background: "Background",
  design: "Design",
  quantity: "Quantity",
  done: "Review",
};
const MEDAL_LINE_LIMIT = 3;
const PANEL_COPY: Record<StepId, { title: string; sub: string }> = {
  shape: {
    title: "Choose the medal shape",
    sub: "Start with a stars medal or a wreath medal. You will pick the center artwork next.",
  },
  background: {
    title: "Choose the background",
    sub: "This is the artwork behind your text. The shape you picked stays the same.",
  },
  design: {
    title: "Add your custom text",
    sub: "Press Enter for a new line. Your text stays centered and scales to fill the open area.",
  },
  quantity: {
    title: "How many do you need?",
    sub: "Choose the quantity for this personalized medal.",
  },
  done: {
    title: "Review your medal",
    sub: "Check the style, text, and quantity before approving the proof.",
  },
};
const FONT_OPTIONS = ["Arial", "Montserrat", "Open Sans", "Georgia", "Times New Roman"];
const CACHE_KEY = "medal-designer-draft-v1";
const DEFAULT_STYLE: MedalLineStyle = {
  size: "medium",
  bold: true,
  italic: false,
  underline: false,
};

function newDesignId(): string {
  return `design_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function readQueryParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name)?.trim() || "";
}

function defaultStyles(): MedalLineStyle[] {
  return Array.from({ length: MEDAL_LINE_LIMIT }, () => ({ ...DEFAULT_STYLE }));
}

function linesToText(lines: string[]): string {
  let last = -1;
  lines.forEach((line, index) => {
    if (line.length > 0) last = index;
  });
  return last < 0 ? "" : lines.slice(0, last + 1).join("\n");
}

function clampMedalText(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n");
  return parts.length <= MEDAL_LINE_LIMIT
    ? normalized
    : parts.slice(0, MEDAL_LINE_LIMIT).join("\n");
}

function textToLines(value: string): string[] {
  const parts = value.replace(/\r\n/g, "\n").split("\n").slice(0, MEDAL_LINE_LIMIT);
  return Array.from({ length: MEDAL_LINE_LIMIT }, (_, index) => parts[index] ?? "");
}

function isStepId(value: string): value is StepId {
  return (STEPS as string[]).includes(value);
}

function cloneStyles(styles: MedalLineStyle[]): MedalLineStyle[] {
  return styles.map((style) => ({ ...style }));
}

function medalLines(
  texts: string[],
  fontFamily: string,
  styles: MedalLineStyle[],
  product: MedalProduct,
): BadgeLine[] {
  const fitted = medalFittedSize({
    lines: texts,
    fontFamily,
    lineStyles: styles,
    fieldShape: product.fieldShape,
    textArea: product.textArea,
  });
  return texts.map((text, index) => ({
    id: `medal-line-${index}`,
    text,
    xNorm: 0.5,
    yNorm: 0.24 + index * 0.26,
    sizeNorm: fitted,
    align: "center",
    fontFamily,
    color: product.textColor,
    bold: styles[index].bold,
    italic: styles[index].italic,
    underline: styles[index].underline,
  }));
}

function MedalPreview({
  product,
  lines,
  fontFamily,
  lineStyles,
}: {
  product: MedalProduct;
  lines: string[];
  fontFamily: string;
  lineStyles: MedalLineStyle[];
}) {
  const lastLine = Math.max(
    ...lines.map((line, index) => (line.trim() ? index : -1)),
  );
  const shown =
    lastLine >= 0 ? lines.slice(0, lastLine + 1) : ["YOUR", "CUSTOM TEXT", "HERE"];
  const bounds = product.textArea;
  const fitted = medalFittedSize({
    lines,
    fontFamily,
    lineStyles,
    fieldShape: product.fieldShape,
    textArea: product.textArea,
  });
  return (
    <div className="md-medal-artwork">
      <img
        src={product.artworkSrc ?? product.imageSrc}
        crossOrigin="anonymous"
        alt={`${product.shortLabel} preview`}
        draggable={false}
      />
      <div
        className={`md-custom-area is-${product.fieldShape}${product.textOnArtwork ? " is-on-artwork" : ""}`}
        style={{
          left: `${bounds.left}%`,
          top: `${bounds.top}%`,
          width: `${bounds.width}%`,
          height: `${bounds.height}%`,
          color: product.textColor,
          background: product.textOnArtwork ? "transparent" : product.fieldColor,
          fontFamily,
        }}
      >
        {shown.map((line, index) => {
          const style = lineStyles[index] ?? lineStyles[0];
          return (
            <span
              key={`${index}-${line}`}
              style={{
                fontSize: `${bounds.width * fitted}cqw`,
                fontWeight: style.bold ? 700 : 400,
                fontStyle: style.italic ? "italic" : "normal",
                textDecoration: style.underline ? "underline" : "none",
              }}
            >
              {line || "\u00a0"}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function MedalDesigner() {
  const [step, setStep] = useState<StepId>("shape");
  const [visited, setVisited] = useState<StepId[]>(["shape"]);
  const [productId, setProductId] = useState("gold-wreath");
  const [lines, setLines] = useState(["", "", ""]);
  const [textDraft, setTextDraft] = useState("");
  const [fontFamily, setFontFamily] = useState("Arial");
  const [lineStyles, setLineStyles] = useState<MedalLineStyle[]>(defaultStyles);
  const [quantity, setQuantity] = useState(1);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkRows, setBulkRows] = useState<MedalBulkRow[]>([]);
  const [bulkCsvText, setBulkCsvText] = useState("");
  const [bulkCsvWarning, setBulkCsvWarning] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [selectedBulkRow, setSelectedBulkRow] = useState(0);
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkSortKey, setBulkSortKey] = useState<MedalBulkSortKey>("line1");
  const [bulkSortAscending, setBulkSortAscending] = useState(true);
  const bulkCsvInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [cartError, setCartError] = useState("");
  const [cartAdded, setCartAdded] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  const designIdRef = useRef(newDesignId());
  const pendingOrderRef = useRef<PendingMedalOrder | null>(null);
  const catalogRef = useRef<ShopifyProductJs | null>(null);
  const apiRef = useRef(createApi(undefined, undefined, { designerId: "medal" }));

  const product = getMedalProduct(productId);
  const stepIndex = STEPS.indexOf(step);
  const showPreview = true;
  const bulkQuantity = bulkRows.reduce((sum, row) => sum + row.quantity, 0);
  const orderQuantity = bulkMode && bulkRows.length > 0 ? bulkQuantity : quantity;
  const previewLines =
    bulkMode && bulkRows[selectedBulkRow]
      ? bulkRows[selectedBulkRow].lines
      : lines;
  const previewStyles =
    bulkMode && bulkRows[selectedBulkRow]?.lineStyles
      ? bulkRows[selectedBulkRow].lineStyles
      : lineStyles;
  const designReady = bulkMode
    ? bulkRows.length > 0
    : Boolean(lines[0].trim());
  const queryPrice = Number(readQueryParam("price"));
  const price = getMedalPrice(
    orderQuantity,
    Number.isFinite(queryPrice) && queryPrice > 0 ? queryPrice : 13.99,
  );
  const bulkPastePreview = useMemo(() => {
    if (!bulkCsvText.trim()) return null;
    try {
      return { ...parseMedalBulkCsv(bulkCsvText), error: "" };
    } catch (error) {
      return {
        rows: [] as MedalBulkRow[],
        warning: "",
        error: error instanceof Error ? error.message : "The list could not be read.",
      };
    }
  }, [bulkCsvText]);
  const visibleBulkRows = useMemo(() => {
    const query = bulkSearch.trim().toLocaleLowerCase();
    return bulkRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) =>
        query
          ? row.lines.some((line) => line.toLocaleLowerCase().includes(query))
          : true,
      )
      .sort((a, b) => {
        const left =
          bulkSortKey === "quantity"
            ? String(a.row.quantity)
            : a.row.lines[Number(bulkSortKey.slice(-1)) - 1];
        const right =
          bulkSortKey === "quantity"
            ? String(b.row.quantity)
            : b.row.lines[Number(bulkSortKey.slice(-1)) - 1];
        const comparison = left.localeCompare(right, undefined, { numeric: true });
        return bulkSortAscending ? comparison : -comparison;
      });
  }, [bulkRows, bulkSearch, bulkSortAscending, bulkSortKey]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      const handle = readQueryParam("productHandle");
      const styleId = medalIdForShopifyStyle(readQueryParam("style"));
      const matched = MEDAL_PRODUCTS.find((item) => item.productHandle === handle);
      if (!raw) {
        if (styleId) setProductId(styleId);
        else if (matched) setProductId(matched.id);
        return;
      }
      const draft = JSON.parse(raw) as {
        step?: string;
        visited?: string[];
        productId?: string;
        lines?: string[];
        fontFamily?: string;
        lineStyles?: MedalLineStyle[];
        quantity?: number;
        bulkMode?: boolean;
        bulkRows?: MedalBulkRow[];
        bulkCsvText?: string;
        bulkCsvWarning?: string;
      };
      const savedStep = draft.step === "medal" ? "shape" : draft.step;
      if (savedStep && isStepId(savedStep)) setStep(savedStep);
      if (draft.visited) {
        const migrated = draft.visited.flatMap((id) =>
          id === "medal" ? (["shape", "background"] as StepId[]) : isStepId(id) ? [id] : [],
        );
        setVisited(migrated.length > 0 ? [...new Set(migrated)] : ["shape"]);
      }
      const legacyIds: Record<string, string> = {
        stars: "gold-stars",
        wreath: "gold-wreath",
      };
      const restoredId = legacyIds[draft.productId ?? ""] ?? draft.productId;
      if (styleId) {
        setProductId(styleId);
      } else if (matched) {
        setProductId(matched.id);
      } else if (restoredId && MEDAL_PRODUCTS.some((item) => item.id === restoredId)) {
        setProductId(restoredId);
      }
      const restoredLines = Array.from({ length: 3 }, (_, index) => String(draft.lines?.[index] ?? ""));
      if (draft.lines) setLines(restoredLines);
      if (FONT_OPTIONS.includes(draft.fontFamily ?? "")) setFontFamily(draft.fontFamily!);
      if (draft.lineStyles?.length === 3) setLineStyles(draft.lineStyles);
      if (typeof draft.quantity === "number") {
        setQuantity(Math.max(1, Math.min(MEDAL_MAX_QUANTITY, Math.round(draft.quantity))));
      }
      if (Array.isArray(draft.bulkRows) && draft.bulkRows.length > 0) {
        setBulkRows(
          draft.bulkRows.flatMap((row, index): MedalBulkRow[] => {
            if (!row || !Array.isArray(row.lines)) return [];
            return [{
              id: row.id || `bulk-medal-cached-${index}`,
              lines: [
                String(row.lines[0] ?? ""),
                String(row.lines[1] ?? ""),
                String(row.lines[2] ?? ""),
              ],
              quantity: Math.max(1, Math.round(Number(row.quantity) || 1)),
              lineStyles: row.lineStyles?.length === 3 ? row.lineStyles : undefined,
            }];
          }),
        );
        if (draft.bulkMode) setBulkMode(true);
      }
      const restoredBulkLines = draft.bulkMode && Array.isArray(draft.bulkRows) && draft.bulkRows[0]?.lines
        ? draft.bulkRows[0].lines
        : restoredLines;
      setTextDraft(linesToText(restoredBulkLines.map((line) => String(line ?? ""))));
      if (typeof draft.bulkCsvText === "string") setBulkCsvText(draft.bulkCsvText);
      if (typeof draft.bulkCsvWarning === "string") setBulkCsvWarning(draft.bulkCsvWarning);
    } catch {
      localStorage.removeItem(CACHE_KEY);
    } finally {
      setRestored(true);
    }
  }, []);

  useEffect(() => {
    const shop = readQueryParam("storeUrl") || readQueryParam("shop");
    const handle = readQueryParam("productHandle");
    let cancelled = false;
    function accept(payload: unknown) {
      if (!cancelled && isShopifyProductJsPayload(payload)) {
        catalogRef.current = payload;
      }
    }
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; payload?: unknown } | null;
      if (data?.type === "MEDAL_DESIGNER_SHOPIFY_PRODUCT") accept(data.payload);
    }
    window.addEventListener("message", onMessage);
    if (shop && handle) {
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
  }, []);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        step,
        visited,
        productId,
        lines,
        fontFamily,
        lineStyles,
        quantity,
        bulkMode,
        bulkRows,
        bulkCsvText,
        bulkCsvWarning,
      }),
    );
  }, [
    bulkCsvText,
    bulkCsvWarning,
    bulkMode,
    bulkRows,
    fontFamily,
    lineStyles,
    lines,
    productId,
    quantity,
    restored,
    step,
    visited,
  ]);

  useEffect(
    () => () => {
      if (proofUrl) URL.revokeObjectURL(proofUrl);
    },
    [proofUrl],
  );

  const summary = useMemo(
    () => [
      ["Medal", product.shortLabel],
      [
        "Text",
        bulkMode && bulkRows.length > 0
          ? `${bulkRows.length} personalized design${bulkRows.length === 1 ? "" : "s"}`
          : lines.filter((line) => line.trim()).join(" / "),
      ],
      ["Quantity", String(orderQuantity)],
      ["Price", `$${price.total.toFixed(2)}`],
    ],
    [bulkMode, bulkRows.length, lines, orderQuantity, price.total, product.shortLabel],
  );

  function goToStep(next: StepId) {
    setStep(next);
    setVisited((current) => (current.includes(next) ? current : [...current, next]));
  }

  function updateFormat(update: Partial<MedalLineStyle>) {
    const next = lineStyles.map((style) => ({ ...style, ...update }));
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
    const styles = cloneStyles(lineStyles);
    setBulkRows((current) => current.map((row) => ({ ...row, lineStyles: cloneStyles(styles) })));
  }

  function setActiveText(value: string) {
    const draft = clampMedalText(value);
    setTextDraft(draft);
    const next = textToLines(draft);
    if (bulkMode && bulkRows[selectedBulkRow]) {
      setBulkRows((rows) =>
        rows.map((row, index) =>
          index === selectedBulkRow
            ? { ...row, lines: [next[0] ?? "", next[1] ?? "", next[2] ?? ""] }
            : row,
        ),
      );
      return;
    }
    setLines(next);
  }

  function applyBulkCsv(csv: string) {
    setBulkError("");
    try {
      const result = parseMedalBulkCsv(csv);
      const seeded = result.rows.map((row) => ({
        ...row,
        lineStyles: cloneStyles(lineStyles),
      }));
      setBulkMode(true);
      setBulkRows(seeded);
      setBulkCsvWarning(result.warning);
      setSelectedBulkRow(0);
      setTextDraft(linesToText(seeded[0]?.lines ?? []));
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
      new Blob([MEDAL_BULK_CSV_TEMPLATE], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "medal-bulk-personalization.csv";
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
  }

  function toggleBulkSort(key: MedalBulkSortKey) {
    if (bulkSortKey === key) setBulkSortAscending((current) => !current);
    else {
      setBulkSortKey(key);
      setBulkSortAscending(true);
    }
  }

  function selectBulkRow(index: number) {
    setSelectedBulkRow(index);
    const row = bulkRows[index];
    if (row) setTextDraft(linesToText(row.lines));
    const styles = row?.lineStyles;
    if (styles) setLineStyles(cloneStyles(styles));
  }

  function reset() {
    localStorage.removeItem(CACHE_KEY);
    designIdRef.current = newDesignId();
    setStep("shape");
    setVisited(["shape"]);
    setProductId("gold-wreath");
    setLines(["", "", ""]);
    setTextDraft("");
    setFontFamily("Arial");
    setLineStyles(defaultStyles());
    setQuantity(1);
    setCartError("");
    setCartAdded(false);
    setProofOpen(false);
    setProofUrl(null);
    pendingOrderRef.current = null;
    exitBulkMode();
  }

  async function reviewProof() {
    if (!designReady) {
      setCartError("Enter line 1 before reviewing your preview.");
      return;
    }
    setBusy(true);
    setCartError("");
    try {
      const designId = designIdRef.current;
      const shop = readQueryParam("shop") || readQueryParam("storeUrl");
      const customerId = readQueryParam("customerId");
      const isQaTest = readQueryParam("qaTest") === "1";
      const rows =
        bulkMode && bulkRows.length > 0
          ? bulkRows.map((row) => ({
              lines: [...row.lines],
              lineStyles: cloneStyles(row.lineStyles ?? lineStyles),
              quantity: row.quantity,
            }))
          : [{ lines, lineStyles, quantity }];
      const allBadges: Badge[] = rows.map((row) => ({
        lines: medalLines(row.lines, fontFamily, row.lineStyles, product),
        backgroundColor: "#ffffff",
        backing: "pin",
        medalProductId: product.id,
        medalProductLabel: product.label,
      }));
      const designData = {
        designId,
        productId: readQueryParam("product") || product.id,
        shopId: shop,
        allBadges,
        isQaTest: isQaTest || undefined,
      };
      const form = new FormData();
      form.append("designId", designId);
      form.append("designData", JSON.stringify(designData));
      if (customerId) form.append("shopifyCustomerId", customerId);
      if (isQaTest) form.append("isQaTest", "1");
      let proofPdf: Blob | null = null;
      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const svg = medalArtworkToSvgString({
          product,
          lines: row.lines,
          fontFamily,
          lineStyles: row.lineStyles,
        });
        const svgBlob = new Blob([svg], { type: "image/svg+xml" });
        form.append(`svg_${index}`, svgBlob, `medal-${index}-design.svg`);
        form.append(`print_svg_${index}`, svgBlob, `medal-${index}-print.svg`);
        const thumb = await medalPreviewToPng({
          product,
          lines: row.lines,
          fontFamily,
          lineStyles: row.lineStyles,
        });
        form.append(`thumbnail_png_${index}`, thumb.blob, `medal-${index}-thumbnail.jpg`);
        if (index === 0) {
          proofPdf = await generateMedalProofPdf({
            designId,
            thumbnailDataUrl: thumb.dataUrl,
            medalLabel: product.label,
            lines: row.lines,
            quantity: orderQuantity,
            unitPrice: price.perUnit,
          });
        }
      }
      if (!proofPdf) throw new Error("Could not build your preview.");
      const response = await fetch(getDesignerApiPaths("medal").saveDraft, {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        throw new Error(`Could not save the medal draft. ${await response.text()}`);
      }
      pendingOrderRef.current = {
        designId,
        pdf: proofPdf,
        medalLabel: product.label,
        fontFamily,
        unitPrice: price.perUnit,
        rows,
      };
      if (proofUrl) URL.revokeObjectURL(proofUrl);
      const nextUrl = URL.createObjectURL(proofPdf);
      setProofUrl(nextUrl);
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
    const matchedVariant = findShopifyVariantByLabel(
      catalogRef.current,
      product.shortLabel,
    );
    const variantId = matchedVariant
      ? String(matchedVariant.id)
      : readQueryParam("variantId");
    if (!variantId) {
      setCartError("Open this designer from a personalized medal product page so it can add to cart.");
      return;
    }
    setBusy(true);
    setCartError("");
    try {
      const finalize = new FormData();
      finalize.append("designId", pending.designId);
      finalize.append("designer", "medal");
      finalize.append("pdf", pending.pdf, "medal-design_proof.pdf");
      const response = await fetch("/api/finalize-draft", { method: "POST", body: finalize });
      const finalized = await response.json().catch(() => ({}));
      if (!response.ok || finalized.success === false) {
        throw new Error(finalized.error || "Could not finalize the medal preview.");
      }
      const definition = getDesignerConfig("medal");
      const cartLines = pending.rows.map((row, index) => {
        const productionLines = medalLines(
          row.lines,
          pending.fontFamily,
          row.lineStyles,
          product,
        );
        return {
          variantId,
          quantity: row.quantity,
          properties: buildDesignerCartLineProperties({
            designerId: "medal",
            designId: pending.designId,
            lineIndex: index,
            indexPropertyPrimary: definition.cartIndexPropertyPrimary,
            indexPropertyFallbacks: definition.cartIndexPropertyFallbacks,
            lines: productionLines,
            backgroundColor: "#ffffff",
            linePrice: pending.unitPrice.toFixed(2),
            thumbnailUrl: finalized.thumbnailUrls?.[index] ?? "",
            pdfUrl: finalized.pdfUrl ?? "",
            orderQuantity: row.quantity,
            extraHidden: {
              ...buildProductionLineProperties("Medal", productionLines, {
                fontSizeLabels: row.lineStyles.map(() => "Fitted"),
              }),
              "_Medal Style": pending.medalLabel,
            },
          }),
        };
      });
      const result = await apiRef.current.addToCartMultiple(cartLines);
      if (!result.success) throw new Error(result.message || "Could not add the medal to cart.");
      localStorage.removeItem(CACHE_KEY);
      setProofOpen(false);
      setCartAdded(true);
    } catch (error) {
      setCartError(error instanceof Error ? error.message : "Could not add to cart.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`gf-designer-root gf-wizard-root md-designer ${showPreview ? "is-preview-step" : ""}`}>
      <div className="gf-page-title">
        <p className="gf-eyebrow">Personalization tool</p>
        <h1 className="gf-page-h1">Customize your medal</h1>
      </div>
      <div className="gf-hero">
        <div className="gf-stepper">
          {STEPS.map((id, index) => {
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
        <div className="gf-panel">
          <p className="gf-panel-title">{PANEL_COPY[step].title}</p>
          <div className="gf-panel-lead">
            <p className="gf-panel-sub gf-panel-sub-lead">{PANEL_COPY[step].sub}</p>
            {showPreview ? <p className="gf-preview-label">Live preview</p> : null}
          </div>
          <div className={`gf-design-grid ${showPreview ? "" : "is-single"}`}>
            <div className="gf-controls-col">
              {step === "shape" ? (
                <div className="md-product-grid md-shape-grid">
                  {(["stars", "wreath"] as MedalShape[]).map((option) => {
                    const item = getMedalProduct(medalIdForChoice(option, medalBackgroundFor(product.id).id));
                    const selected = medalShapeFor(product.id) === option;
                    return (
                      <button
                        type="button"
                        key={option}
                        className={`gf-toggle-card ${selected ? "is-selected" : ""}`}
                        onClick={() => setProductId(medalIdForChoice(option, medalBackgroundFor(product.id).id))}
                      >
                        <img className="gf-toggle-photo" src={item.imageSrc} alt="" />
                        <span className="gf-toggle-label">{option === "stars" ? "Stars" : "Wreath"}</span>
                        <span className="gf-toggle-sub">
                          {option === "stars"
                            ? "Star points around the center."
                            : "A laurel wreath around the center."}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {step === "background" ? (
                <div className="md-product-grid">
                  {MEDAL_BACKGROUNDS.map((item) => {
                    const choice = getMedalProduct(medalIdForChoice(medalShapeFor(product.id), item.id));
                    const selected = medalBackgroundFor(product.id).id === item.id;
                    return (
                      <button
                        type="button"
                        key={item.id}
                        className={`gf-toggle-card ${selected ? "is-selected" : ""}`}
                        onClick={() => setProductId(medalIdForChoice(medalShapeFor(product.id), item.id))}
                      >
                        <img className="gf-toggle-photo" src={choice.imageSrc} alt="" />
                        <span className="gf-toggle-label">{item.label}</span>
                        <span className="gf-toggle-sub">{item.description}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              {step === "design" ? (
                <>
                  <div className="md-format-row">
                    <label>
                      Font
                      <select className="gf-input" value={fontFamily} onChange={(event) => setFontFamily(event.target.value)}>
                        {FONT_OPTIONS.map((font) => <option key={font}>{font}</option>)}
                      </select>
                    </label>
                    <div className="md-line-tools" role="group" aria-label="Text formatting">
                      {([
                        ["bold", "Bold", "B"],
                        ["italic", "Italic", "I"],
                        ["underline", "Underline", "U"],
                      ] as const).map(([format, label, mark]) => (
                        <button
                          type="button"
                          key={format}
                          className={lineStyles[0][format] ? "is-on" : ""}
                          aria-label={label}
                          aria-pressed={lineStyles[0][format]}
                          title={label}
                          onClick={() => updateFormat({ [format]: !lineStyles[0][format] })}
                        >
                          {mark}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="md-text-label" htmlFor="md-wording">
                    Custom Text
                  </label>
                  <textarea
                    id="md-wording"
                    className="gf-input md-wording"
                    rows={3}
                    value={textDraft}
                    placeholder={"Your Name\nChampion\nYear"}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      const newlines = event.currentTarget.value.split("\n").length - 1;
                      if (newlines >= MEDAL_LINE_LIMIT - 1) event.preventDefault();
                    }}
                    onChange={(event) => setActiveText(event.target.value)}
                  />
                  <p className="gf-note">Press Enter for a new line. Up to {MEDAL_LINE_LIMIT} lines.</p>
                  {bulkMode && bulkRows.length > 1 ? (
                    <button type="button" className="md-apply-line-format" onClick={applyFormatToAll}>
                      Apply formatting to all medals
                    </button>
                  ) : null}
                  {!bulkMode && !designReady ? <p className="md-help">Enter line 1 to continue.</p> : null}
                  {bulkMode ? (
                    <div className="gf-bulk-import">
                      <div className="gf-bulk-import-head">
                        <div>
                          <p className="gf-add-multiple-title">Bulk Order</p>
                          <p className="gf-note">
                            Paste a list of names. The medal, font, and formatting are shared.
                            Each row keeps its own text.
                          </p>
                        </div>
                      </div>
                      <div className="gf-bulk-paste">
                        <label className="gf-bulk-paste-label" htmlFor="md-bulk-paste">
                          Paste your list of names
                        </label>
                        <p className="gf-bulk-paste-example">
                          {MEDAL_BULK_PASTE_EXAMPLES.map((row) => (
                            <span key={row}>{row}</span>
                          ))}
                        </p>
                        <textarea
                          id="md-bulk-paste"
                          className="gf-bulk-paste-input"
                          rows={4}
                          spellCheck={false}
                          placeholder={MEDAL_BULK_PASTE_EXAMPLES.join("\n")}
                          value={bulkCsvText}
                          onChange={(event) => {
                            setBulkCsvText(event.target.value);
                            setBulkError("");
                          }}
                        />
                        {bulkPastePreview?.error || bulkError ? (
                          <p className="gf-bulk-paste-error">{bulkError || bulkPastePreview?.error}</p>
                        ) : null}
                        {bulkPastePreview?.warning ? (
                          <p className="gf-bulk-paste-warning">{bulkPastePreview.warning}</p>
                        ) : null}
                        <div className="gf-bulk-paste-foot">
                          <span className="gf-note">
                            {bulkPastePreview && !bulkPastePreview.error
                              ? `${bulkPastePreview.rows.length} design${bulkPastePreview.rows.length === 1 ? "" : "s"} ready`
                              : `Up to ${MEDAL_MAX_QUANTITY} total medals.`}
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
                        <div className="gf-bulk-actions">
                          <button type="button" className="gf-nav-secondary" onClick={downloadBulkCsvTemplate}>
                            Download template
                          </button>
                          <button type="button" className="gf-nav-secondary" onClick={() => bulkCsvInputRef.current?.click()}>
                            Upload CSV
                          </button>
                          <button
                            type="button"
                            className="gf-nav-secondary"
                            onClick={() => {
                              setTextDraft(linesToText(lines));
                              exitBulkMode();
                            }}
                          >
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
                      {bulkRows.length > 0 ? (
                        <>
                          <div className="gf-bulk-status">
                            <strong>
                              {bulkRows.length} personalized design{bulkRows.length === 1 ? "" : "s"}
                            </strong>
                            <span>{bulkQuantity} total medals</span>
                          </div>
                          {bulkCsvWarning ? <p className="gf-bulk-paste-warning">{bulkCsvWarning}</p> : null}
                          <div className="gf-bulk-grid-tools">
                            <label>
                              <span className="gf-visually-hidden">Search names</span>
                              <input
                                type="search"
                                className="gf-input"
                                placeholder="Search any text…"
                                value={bulkSearch}
                                onChange={(event) => setBulkSearch(event.target.value)}
                              />
                            </label>
                            <span className="gf-note">
                              Viewing {visibleBulkRows.length} of {bulkRows.length}
                            </span>
                          </div>
                          <div className="gf-bulk-grid md-bulk-grid" role="table" aria-label="All personalized medal designs">
                            <div className="gf-bulk-grid-header" role="row">
                              <span role="columnheader">#</span>
                              {(["line1", "line2", "line3"] as const).map((key, index) => (
                                <button key={key} type="button" role="columnheader" onClick={() => toggleBulkSort(key)}>
                                  Line {index + 1}
                                  {bulkSortKey === key ? (bulkSortAscending ? " ↑" : " ↓") : ""}
                                </button>
                              ))}
                              <button type="button" role="columnheader" onClick={() => toggleBulkSort("quantity")}>
                                Qty
                                {bulkSortKey === "quantity" ? (bulkSortAscending ? " ↑" : " ↓") : ""}
                              </button>
                            </div>
                            {visibleBulkRows.map(({ row, index }) => (
                              <button
                                key={row.id}
                                type="button"
                                role="row"
                                className={`gf-bulk-grid-row ${selectedBulkRow === index ? "is-selected" : ""}`}
                                onClick={() => selectBulkRow(index)}
                              >
                                <span role="cell">{index + 1}</span>
                                {row.lines.map((value, lineIndex) => (
                                  <span key={lineIndex} role="cell" title={value}>{value || "—"}</span>
                                ))}
                                <strong role="cell">{row.quantity}</strong>
                              </button>
                            ))}
                            {visibleBulkRows.length === 0 ? (
                              <p className="gf-bulk-grid-empty">No rows match “{bulkSearch}”.</p>
                            ) : null}
                          </div>
                          <p className="gf-note">Select a row to preview it. Click a heading to sort.</p>
                        </>
                      ) : null}
                    </div>
                  ) : (
                    <div className="md-group-order">
                      <p className="md-group-order-title">Ordering for a group?</p>
                      <button type="button" className="gf-nav-primary" onClick={() => setBulkMode(true)}>
                        Bulk Order
                      </button>
                    </div>
                  )}
                </>
              ) : null}
              {step === "quantity" ? (
                <div className="md-quantity-card">
                  <p className="gf-sub-title">Medal quantity</p>
                  {bulkMode && bulkRows.length > 0 ? (
                    <>
                      <div className="gf-bulk-status md-bulk-quantity">
                        <strong>{bulkQuantity} total medals</strong>
                        <span>{bulkRows.length} personalized designs</span>
                      </div>
                      <p className="gf-note">Quantities come from your list. Return to Design to edit it.</p>
                    </>
                  ) : (
                  <div className="md-quantity-control">
                    <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
                    <input
                      type="number"
                      min={1}
                      max={MEDAL_MAX_QUANTITY}
                      value={quantity}
                      onChange={(event) => setQuantity(Math.max(1, Math.min(MEDAL_MAX_QUANTITY, Number(event.target.value) || 1)))}
                    />
                    <button type="button" onClick={() => setQuantity((value) => Math.min(MEDAL_MAX_QUANTITY, value + 1))}>+</button>
                  </div>
                  )}
                  <div className="md-price-summary">
                    <span>${price.perUnit.toFixed(2)} each</span>
                    <strong>${price.total.toFixed(2)} total</strong>
                  </div>
                </div>
              ) : null}
              {step === "done" ? (
                <div className="md-review">
                  {summary.map(([label, value]) => (
                    <div key={label}><span>{label}</span><strong>{value}</strong></div>
                  ))}
                  <p>{cartAdded ? "Added to your cart. Your approved medal artwork is saved with the order." : "Open the proof to approve the center artwork before adding it to your cart."}</p>
                  {cartError ? <p className="gf-note" role="alert">{cartError}</p> : null}
                </div>
              ) : null}
              <div className="gf-step-nav">
                <div className="md-nav-secondary">
                  {stepIndex > 0 ? <button type="button" className="gf-nav-secondary" onClick={() => goToStep(STEPS[stepIndex - 1])}>Back</button> : null}
                  <button type="button" className="gf-nav-secondary" onClick={() => window.confirm("Reset this medal design?") && reset()}>Reset design</button>
                </div>
                {step !== "done" ? (
                  <button type="button" className="gf-nav-primary" disabled={step === "design" && !designReady} onClick={() => goToStep(STEPS[stepIndex + 1])}>Continue</button>
                ) : cartAdded ? (
                  <button type="button" className="gf-nav-primary" onClick={reset}>Start another</button>
                ) : (
                  <button type="button" className="gf-nav-primary" disabled={busy || !designReady} onClick={() => void reviewProof()}>
                    {busy ? "Preparing preview…" : "Review your preview & add to cart →"}
                  </button>
                )}
              </div>
            </div>
            {showPreview ? (
              <div className="gf-preview-pane">
                <div className="md-preview-stage">
                  <MedalPreview product={product} lines={previewLines} fontFamily={fontFamily} lineStyles={previewStyles} />
                </div>
                <p className="md-preview-caption">Preview is an approximation. Final placement may vary slightly.</p>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {proofOpen && proofUrl ? (
        <div className="gf-modal-backdrop" role="dialog" aria-modal="true">
          <div className="gf-modal">
            <h2 className="gf-modal-title">Your medal preview</h2>
            <p className="gf-muted" style={{ marginBottom: 12 }}>
              Confirm the text stays in the open center, then add this{" "}
              {bulkMode && bulkRows.length > 0
                ? `${bulkRows.length}-design bulk order`
                : "medal"}{" "}
              to your cart.
              {bulkMode && bulkRows.length > 1
                ? " The preview shows the first medal; every piece is added with the same center and font."
                : ""}
            </p>
            <ProofPdfViewer url={proofUrl} title="Medal preview" loadingLabel="Loading preview..." failureLabel="Could not render the preview." />
            {cartError ? <div className="gf-error">{cartError}</div> : null}
            <div className="gf-modal-actions">
              <button type="button" className="gf-btn-secondary" onClick={() => setProofOpen(false)} disabled={busy}>Edit design</button>
              <button type="button" className="gf-btn-primary" onClick={() => void confirmAddToCart()} disabled={busy}>{busy ? "Adding…" : "Add to cart"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
