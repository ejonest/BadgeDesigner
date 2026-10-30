import { useEffect, useMemo, useRef, useState } from "react";
import { ProofPdfViewer } from "~/components/ProofPdfViewer";
import { getDesignerApiPaths, getDesignerConfig } from "~/config/designers";
import {
  MEDAL_BACKGROUNDS,
  MEDAL_MAX_QUANTITY,
  MEDAL_PRODUCTS,
  MEDAL_STYLE_PRODUCT_HANDLE,
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
  parseShopifyMoney,
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

type StepId = "shape" | "background" | "design";
type PendingMedalOrder = {
  designId: string;
  pdf: Blob;
  medalLabel: string;
  fontFamily: string;
  unitPrice: number;
  rows: Array<{ lines: string[]; lineStyles: MedalLineStyle[]; quantity: number }>;
};

const STEPS: StepId[] = ["shape", "background", "design"];
const STEP_LABELS: Record<StepId, string> = {
  shape: "Shape",
  background: "Background",
  design: "Design",
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

function MedalFormatButtons({
  style,
  label,
  onToggle,
}: {
  style: MedalLineStyle;
  label: string;
  onToggle: (format: "bold" | "italic" | "underline") => void;
}) {
  return (
    <div className="md-line-tools" role="group" aria-label={label}>
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
      <div className="md-medal-crop">
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
  const [bulkPane, setBulkPane] = useState<"edit" | "all" | "add">("add");
  const [bulkSearch, setBulkSearch] = useState("");
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
  const [catalog, setCatalog] = useState<ShopifyProductJs | null>(null);
  const skipNextPersist = useRef(false);
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
    ? bulkRows.length > 0 && bulkRows.every((row) => row.lines[0].trim())
    : Boolean(lines[0].trim());
  const panel =
    step === "design" && bulkMode
      ? {
          title: bulkRows.length > 0 ? "Review each medal" : "Add your medals",
          sub:
            bulkRows.length > 0
              ? "Work on one medal, look at all of them, or add more names."
              : "Paste a list or upload a CSV. Each medal can say something different.",
        }
      : PANEL_COPY[step];
  const queryPrice = Number(readQueryParam("price"));
  const styleVariant =
    findShopifyVariantByLabel(catalog, product.shortLabel) ??
    findShopifyVariantByLabel(catalog, product.label) ??
    catalog?.variants.find((variant) => String(variant.id) === product.shopifyVariantId) ??
    null;
  const catalogUnit = styleVariant ? parseShopifyMoney(styleVariant.price) : 0;
  const price = getMedalPrice(
    orderQuantity,
    catalogUnit > 0
      ? catalogUnit
      : Number.isFinite(queryPrice) && queryPrice > 0
        ? queryPrice
        : 13.99,
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
      );
  }, [bulkRows, bulkSearch]);

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
      const savedStep =
        draft.step === "medal"
          ? "shape"
          : draft.step === "quantity" || draft.step === "done"
            ? "design"
            : draft.step;
      if (savedStep && isStepId(savedStep)) setStep(savedStep);
      if (draft.visited) {
        const migrated = draft.visited.flatMap((id) =>
          id === "medal"
            ? (["shape", "background"] as StepId[])
            : id === "quantity" || id === "done"
              ? (["design"] as StepId[])
              : isStepId(id)
                ? [id]
                : [],
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
      } else if (restoredId && MEDAL_PRODUCTS.some((item) => item.id === restoredId)) {
        setProductId(restoredId);
      } else if (matched) {
        setProductId(matched.id);
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
        if (draft.bulkMode) {
          setBulkMode(true);
          setBulkPane("edit");
        }
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
      if (cancelled || !isShopifyProductJsPayload(payload)) return;
      const current = catalogRef.current;
      const incomingIsStyle = payload.handle === MEDAL_STYLE_PRODUCT_HANDLE;
      const currentIsStyle = current?.handle === MEDAL_STYLE_PRODUCT_HANDLE;
      if (
        !current ||
        (incomingIsStyle && !currentIsStyle) ||
        (incomingIsStyle === currentIsStyle &&
          payload.variants.length >= current.variants.length)
      ) {
        catalogRef.current = payload;
        setCatalog(payload);
      }
    }
    function onMessage(event: MessageEvent) {
      const data = event.data as { type?: string; payload?: unknown } | null;
      if (data?.type === "MEDAL_DESIGNER_SHOPIFY_PRODUCT") accept(data.payload);
    }
    window.addEventListener("message", onMessage);
    if (shop) {
      const handles = Array.from(
        new Set([handle, MEDAL_STYLE_PRODUCT_HANDLE].filter((value): value is string => Boolean(value))),
      );
      for (const productHandle of handles) {
        const params = new URLSearchParams({ shop, handle: productHandle });
        fetch(`/api/shopify-product?${params}`)
          .then((response) => response.json())
          .then(accept)
          .catch(() => undefined);
      }
    }
    return () => {
      cancelled = true;
      window.removeEventListener("message", onMessage);
    };
  }, []);

  useEffect(() => {
    if (!restored) return;
    if (skipNextPersist.current) {
      skipNextPersist.current = false;
      localStorage.removeItem(CACHE_KEY);
      return;
    }
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

  function goToStep(next: StepId) {
    setCartAdded(false);
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
    const styles = cloneStyles(bulkRows[selectedBulkRow]?.lineStyles ?? lineStyles);
    setLineStyles(styles);
    setBulkRows((current) =>
      current.map((row) => ({ ...row, lineStyles: cloneStyles(styles) })),
    );
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
    setBulkPane("add");
  }

  function selectBulkRow(index: number) {
    setSelectedBulkRow(index);
    const row = bulkRows[index];
    if (row) setTextDraft(linesToText(row.lines));
    const styles = row?.lineStyles;
    if (styles) setLineStyles(cloneStyles(styles));
  }

  function chooseBulkMedal(index: number) {
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
    let quantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
    const others = bulkRows.reduce(
      (sum, row, index) => (index === rowIndex ? sum : sum + row.quantity),
      0,
    );
    const room = MEDAL_MAX_QUANTITY - others;
    if (room < 1) {
      quantity = current.quantity;
      setBulkCsvWarning(
        `Online pricing supports up to ${MEDAL_MAX_QUANTITY} medals.`,
      );
    } else if (quantity > room) {
      quantity = room;
      setBulkCsvWarning(
        `Online pricing supports up to ${MEDAL_MAX_QUANTITY} medals.`,
      );
    }
    setBulkRows((rows) =>
      rows.map((row, index) =>
        index === rowIndex ? { ...row, quantity } : row,
      ),
    );
  }

  function removeBulkRow(rowIndex: number) {
    const next = bulkRows.filter((_, index) => index !== rowIndex);
    let nextIndex = selectedBulkRow;
    if (next.length === 0) nextIndex = 0;
    else if (rowIndex < selectedBulkRow) nextIndex = selectedBulkRow - 1;
    else if (rowIndex === selectedBulkRow) {
      nextIndex = Math.min(selectedBulkRow, next.length - 1);
    }
    setBulkRows(next);
    setSelectedBulkRow(nextIndex);
    setTextDraft(linesToText(next[nextIndex]?.lines ?? []));
    const styles = next[nextIndex]?.lineStyles;
    if (styles) setLineStyles(cloneStyles(styles));
    if (next.length === 0) setBulkPane("add");
  }

  function reset(options?: { keepAdded?: boolean }) {
    skipNextPersist.current = true;
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
    setCartAdded(Boolean(options?.keepAdded));
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
    const variantId =
      (styleVariant ? String(styleVariant.id) : null) ||
      product.shopifyVariantId ||
      readQueryParam("variantId");
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
      reset({ keepAdded: true });
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
        <div className="gf-stepper-compact">
          <p className="gf-stepper-compact-label">
            {`Step ${stepIndex + 1} of ${STEPS.length} — ${STEP_LABELS[step]}`}
          </p>
          <div className="gf-stepper-compact-rule">
            <span style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>
        <div className="gf-panel">
          <p className="gf-panel-title">{panel.title}</p>
          <div className="gf-panel-lead">
            <p className="gf-panel-sub gf-panel-sub-lead">{panel.sub}</p>
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
                    {bulkMode && bulkPane !== "edit" ? null : (
                      <MedalFormatButtons
                        style={lineStyles[0]}
                        label="Text formatting"
                        onToggle={(format) => updateFormat({ [format]: !lineStyles[0][format] })}
                      />
                    )}
                  </div>
                  {bulkMode ? (
                    <>
                      <div className="md-bulk-switch" role="tablist" aria-label="Bulk order">
                        <button
                          type="button"
                          role="tab"
                          aria-selected={bulkPane === "edit"}
                          className={bulkPane === "edit" ? "is-on" : ""}
                          disabled={bulkRows.length === 0}
                          onClick={() => setBulkPane("edit")}
                        >
                          This medal
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={bulkPane === "all"}
                          className={bulkPane === "all" ? "is-on" : ""}
                          disabled={bulkRows.length === 0}
                          onClick={() => setBulkPane("all")}
                        >
                          View all
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={bulkPane === "add"}
                          className={bulkPane === "add" ? "is-on" : ""}
                          onClick={() => setBulkPane("add")}
                        >
                          Add names
                        </button>
                      </div>
                      {bulkRows.length === 0 || bulkPane === "add" ? (
                        <div className="gf-bulk-paste">
                          <label className="gf-bulk-paste-label" htmlFor="md-bulk-paste">
                            Paste names
                          </label>
                          <p className="gf-note">
                            {bulkRows.length > 0
                              ? "One medal per line, with a bar between the lines of text. Applying this replaces the current list."
                              : "One medal per line. Separate the lines of text with a bar, so a comma in a name stays put."}
                          </p>
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
                          {bulkCsvWarning ? <p className="gf-bulk-paste-warning">{bulkCsvWarning}</p> : null}
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
                          <div className="md-bulk-links">
                            <button type="button" className="gf-csv-link" onClick={downloadBulkCsvTemplate}>
                              Download template
                            </button>
                            <button type="button" className="gf-csv-link" onClick={() => bulkCsvInputRef.current?.click()}>
                              Upload CSV
                            </button>
                            <button
                              type="button"
                              className="gf-csv-link"
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
                      ) : bulkPane === "all" ? (
                        <div className="md-medal-grid-wrap">
                          {bulkRows.length > 4 ? (
                            <label className="md-medal-search">
                              <span className="gf-visually-hidden">Search medals</span>
                              <input
                                type="search"
                                className="gf-input"
                                placeholder="Search medals"
                                value={bulkSearch}
                                onChange={(event) => setBulkSearch(event.target.value)}
                              />
                            </label>
                          ) : null}
                          <div className="md-medal-grid" aria-label="All medals">
                            {visibleBulkRows.map(({ row, index }) => {
                              const title = row.lines.find((line) => line.trim()) || "No text yet";
                              const detail = row.lines
                                .slice(1)
                                .map((line) => line.trim())
                                .filter(Boolean)
                                .join(" · ");
                              return (
                                <button
                                  key={row.id}
                                  type="button"
                                  className={`md-medal-card${selectedBulkRow === index ? " is-selected" : ""}${row.lines[0].trim() ? "" : " is-empty"}`}
                                  aria-label={`Edit medal ${index + 1}, ${title}`}
                                  onClick={() => chooseBulkMedal(index)}
                                >
                                  <MedalPreview
                                    product={product}
                                    lines={row.lines}
                                    fontFamily={fontFamily}
                                    lineStyles={row.lineStyles ?? lineStyles}
                                  />
                                  <span className="md-medal-card-meta">
                                    Medal {index + 1}
                                    {row.quantity > 1 ? ` · Qty ${row.quantity}` : ""}
                                  </span>
                                  <span className="md-medal-card-name">{title}</span>
                                  {detail ? <span className="md-medal-card-detail">{detail}</span> : null}
                                  {row.lines[0].trim() ? null : (
                                    <span className="md-medal-card-flag">Needs line 1</span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                          {visibleBulkRows.length === 0 ? (
                            <p className="gf-note">No medals match that search.</p>
                          ) : null}
                        </div>
                      ) : bulkRows[selectedBulkRow] ? (
                        <div className="md-bulk-one">
                          <div className="md-bulk-one-nav">
                            <button
                              type="button"
                              className="gf-csv-link"
                              disabled={selectedBulkRow <= 0}
                              onClick={() => stepBulkRow(-1)}
                            >
                              Previous
                            </button>
                            <strong>
                              Medal {selectedBulkRow + 1} of {bulkRows.length}
                            </strong>
                            <button
                              type="button"
                              className="gf-csv-link"
                              disabled={selectedBulkRow >= bulkRows.length - 1}
                              onClick={() => stepBulkRow(1)}
                            >
                              Next
                            </button>
                          </div>
                          <label className="md-text-label" htmlFor="md-wording">
                            Text
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
                          <div className="md-copy-row">
                            <span>Quantity</span>
                            <div className="md-copy-stepper">
                              <button
                                type="button"
                                aria-label="Decrease quantity"
                                onClick={() =>
                                  updateBulkQuantity(
                                    selectedBulkRow,
                                    String(bulkRows[selectedBulkRow].quantity - 1),
                                  )
                                }
                              >
                                −
                              </button>
                              <input
                                type="number"
                                min={1}
                                max={MEDAL_MAX_QUANTITY}
                                aria-label="Quantity for this medal"
                                value={bulkRows[selectedBulkRow].quantity}
                                onChange={(event) =>
                                  updateBulkQuantity(selectedBulkRow, event.target.value)
                                }
                              />
                              <button
                                type="button"
                                aria-label="Increase quantity"
                                onClick={() =>
                                  updateBulkQuantity(
                                    selectedBulkRow,
                                    String(bulkRows[selectedBulkRow].quantity + 1),
                                  )
                                }
                              >
                                +
                              </button>
                            </div>
                          </div>
                          {bulkCsvWarning ? <p className="gf-bulk-paste-warning">{bulkCsvWarning}</p> : null}
                          <div className="md-bulk-links">
                            <button
                              type="button"
                              className="gf-csv-link"
                              onClick={() => removeBulkRow(selectedBulkRow)}
                            >
                              Remove this medal
                            </button>
                            {bulkRows.length > 1 ? (
                              <button type="button" className="gf-csv-link" onClick={applyFormatToAll}>
                                Use this style on all
                              </button>
                            ) : null}
                          </div>
                          {!designReady ? (
                            <p className="md-help">Every medal needs a first line before adding to cart.</p>
                          ) : null}
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <>
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
                      {!designReady ? <p className="md-help">Enter line 1 before adding to cart.</p> : null}
                      <div className="md-quantity-card">
                        <p className="gf-sub-title">How many of this medal?</p>
                        <div className="md-quantity-control">
                          <button type="button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
                          <input
                            type="number"
                            min={1}
                            max={MEDAL_MAX_QUANTITY}
                            value={quantity}
                            aria-label="Medal quantity"
                            onChange={(event) => setQuantity(Math.max(1, Math.min(MEDAL_MAX_QUANTITY, Number(event.target.value) || 1)))}
                          />
                          <button type="button" onClick={() => setQuantity((value) => Math.min(MEDAL_MAX_QUANTITY, value + 1))}>+</button>
                        </div>
                        <div className="md-price-summary">
                          <span>${price.perUnit.toFixed(2)} each</span>
                          <strong>${price.total.toFixed(2)} total</strong>
                        </div>
                      </div>
                      <div className="md-group-order">
                        <p className="md-group-order-title">Ordering for a group?</p>
                        <button
                          type="button"
                          className="gf-nav-primary"
                          onClick={() => {
                            setBulkMode(true);
                            setBulkPane("add");
                          }}
                        >
                          Bulk Order
                        </button>
                      </div>
                    </>
                  )}
                </>
              ) : null}
              {step === "design" && bulkMode && bulkRows.length > 0 ? (
                <div className="md-price-summary md-bulk-total">
                  <span>{bulkQuantity} medals · ${price.perUnit.toFixed(2)} each</span>
                  <strong>${price.total.toFixed(2)} total</strong>
                </div>
              ) : null}
              {cartAdded ? (
                <p className="gf-note">Added to your cart. This designer is ready for a new medal.</p>
              ) : null}
              {cartError && !proofOpen ? <p className="gf-note" role="alert">{cartError}</p> : null}
              <div className="gf-step-nav">
                <div className="md-nav-secondary">
                  {stepIndex > 0 ? <button type="button" className="gf-nav-secondary" onClick={() => goToStep(STEPS[stepIndex - 1])}>Back</button> : null}
                  <button type="button" className="gf-nav-secondary" onClick={() => window.confirm("Reset this medal design?") && reset()}>Reset design</button>
                </div>
                {step !== "design" ? (
                  <button type="button" className="gf-nav-primary" onClick={() => goToStep(STEPS[stepIndex + 1])}>Continue</button>
                ) : (
                  <button type="button" className="gf-nav-primary" disabled={busy || !designReady} onClick={() => void reviewProof()}>
                    {busy ? "Preparing preview…" : "Add to cart"}
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
          <div className="gf-modal md-proof-modal">
            <h2 className="gf-modal-title">Your medal preview</h2>
            <div className="md-proof-body">
              <p className="gf-muted">
                Check the center artwork, then approve it to add this{" "}
                {bulkMode && bulkRows.length > 0
                  ? `${bulkRows.length}-design bulk order`
                  : "medal"}{" "}
                to your cart.
                {bulkMode && bulkRows.length > 1
                  ? " The preview shows the first medal. Every medal is added with its own text."
                  : ""}
              </p>
              <ProofPdfViewer url={proofUrl} title="Medal preview" loadingLabel="Loading preview..." failureLabel="Could not render the preview." />
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
