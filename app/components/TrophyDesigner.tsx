import { useEffect, useMemo, useRef, useState } from "react";
import { ProofPdfViewer } from "~/components/ProofPdfViewer";
import { getDesignerApiPaths, getDesignerConfig } from "~/config/designers";
import {
  TROPHY_MAX_PRICED_QUANTITY,
  TROPHY_PLATE_RATIO,
  TROPHY_PRODUCTS,
  getTrophyPrice,
  getTrophyProduct,
  type TrophyPlateOption,
  type TrophyProduct,
  type TrophyTextArea,
} from "~/constants/trophyOptions";
import type { Badge, BadgeLine } from "~/types/badge";
import { createApi } from "~/utils/api";
import { buildDesignerCartLineProperties } from "~/utils/cartLineProperties";
import { generateTrophyProofPdf } from "~/utils/trophyPdf";
import {
  trophyPlateToSvgString,
  trophyPreviewToPng,
} from "~/utils/trophyRender";
import {
  TROPHY_BULK_CSV_TEMPLATE,
  TROPHY_BULK_PASTE_EXAMPLES,
  parseTrophyBulkCsv,
  type TrophyBulkRow,
} from "~/utils/trophyBulkCsv";
import "../styles/gavelDesigner.css";
import "../styles/trophyDesigner.css";

type StepId = "trophy" | "plate" | "design" | "quantity" | "done";
type PreviewMode = "plate" | "trophy";
type LineSize = "small" | "medium" | "large";
type TrophyBulkSortKey = "line1" | "line2" | "line3" | "quantity";
type TrophyLineStyle = {
  size: LineSize;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};
type TrophyRowSpec = {
  lines: string[];
  styles: TrophyLineStyle[];
  quantity: number;
};
/** The proofed design, so the cart line matches the PDF the customer approved. */
type PendingTrophyOrder = {
  designId: string;
  pdf: Blob;
  rowSpecs: TrophyRowSpec[];
  awardLabel: string;
  plateLabel: string;
  plateTextColor: string;
  fontFamily: string;
  unitPrice: number;
  logoName: string;
};

const STEPS: StepId[] = ["trophy", "plate", "design", "quantity", "done"];
const STEP_LABELS: Record<StepId, string> = {
  trophy: "Award",
  plate: "Plate",
  design: "Design",
  quantity: "Quantity",
  done: "Review",
};
const PANEL_COPY: Record<StepId, { title: string; sub: string }> = {
  trophy: {
    title: "Choose your award",
    sub: "Select the trophy you want to personalize.",
  },
  plate: {
    title: "Choose a plate",
    sub: "Pick the plate color or themed design for your trophy.",
  },
  design: {
    title: "Add your custom text",
    sub: "Your wording appears instantly in both the plate and trophy views.",
  },
  quantity: {
    title: "How many do you need?",
    sub: "Choose the quantity for this personalized trophy.",
  },
  done: {
    title: "Review your trophy",
    sub: "Check the trophy, plate, wording, and quantity, then approve your proof.",
  },
};

const FONT_OPTIONS = [
  "Arial",
  "Montserrat",
  "Open Sans",
  "Georgia",
  "Times New Roman",
];
const CACHE_KEY = "trophy-designer-draft-v1";
const DEFAULT_LINE_STYLE: TrophyLineStyle = {
  size: "medium",
  bold: false,
  italic: false,
  underline: false,
};
const LINE_SIZE_SCALE: Record<LineSize, number> = {
  small: 0.78,
  medium: 1,
  large: 1.28,
};

function defaultLineStyles(): TrophyLineStyle[] {
  return Array.from({ length: 3 }, () => ({ ...DEFAULT_LINE_STYLE }));
}

function cloneLineStyles(styles: TrophyLineStyle[]): TrophyLineStyle[] {
  return styles.map((style) => ({ ...style }));
}

function restoreLineStyles(
  savedStyles?: TrophyLineStyle[],
  fallbackBold = false,
): TrophyLineStyle[] {
  return Array.from({ length: 3 }, (_, index) => {
    const saved = savedStyles?.[index];
    const size: LineSize =
      saved?.size === "small" ||
      saved?.size === "medium" ||
      saved?.size === "large"
        ? saved.size
        : "medium";
    return {
      size,
      bold: saved ? Boolean(saved.bold) : fallbackBold,
      italic: Boolean(saved?.italic),
      underline: Boolean(saved?.underline),
    };
  });
}

type TrophyDraft = {
  step?: StepId;
  visited?: StepId[];
  /** Legacy v1 drafts keyed off the four original trophy bodies. */
  trophyType?: string;
  productId?: string;
  plateId?: string;
  lines?: string[];
  fontFamily?: string;
  lineStyles?: TrophyLineStyle[];
  /** Legacy v1 drafts used one bold setting for every line. */
  bold?: boolean;
  quantity?: number;
  previewMode?: PreviewMode;
  bulkMode?: boolean;
  bulkRows?: TrophyBulkRow[];
  bulkCsvText?: string;
  bulkCsvWarning?: string;
};

function newDesignId(): string {
  return `design_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function readQueryParam(name: string): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name)?.trim() || "";
}

function trophyTextsToLines(
  texts: string[],
  fontFamily: string,
  lineStyles: TrophyLineStyle[],
): BadgeLine[] {
  return texts.map((text, index) => ({
    id: `trophy-line-${index}`,
    text,
    xNorm: 0.5,
    yNorm: 0.2 + index * 0.25,
    sizeNorm: 0.2,
    align: "center" as const,
    fontFamily,
    bold: lineStyles[index]?.bold,
    italic: lineStyles[index]?.italic,
    underline: lineStyles[index]?.underline,
  }));
}

const LINE_HEIGHT = 1.18;
/** Rough advance width of the offered faces, used before we can measure. */
const AVG_CHAR_EM = 0.58;
const BOLD_CHAR_EM = 0.62;
/** Keeps a lone short line from ballooning to fill the whole plate. */
const MAX_FONT_CQH = 24;

/**
 * Engraving size in `cqh` — 1% of the plate's own height — so one value holds
 * for both the large plate view and the thumbnail-sized plate on the trophy.
 *
 * `widestLineEm` is the longest line's width at a 1em font size.
 */
function fitFontSize(
  lineWidthsEm: number[],
  lineStyles: TrophyLineStyle[],
  area: TrophyTextArea,
  plateRatio: number,
): number {
  const scaledLineHeight = lineStyles.reduce(
    (total, style) => total + LINE_SIZE_SCALE[style.size],
    0,
  );
  const byHeight = area.height / (scaledLineHeight * LINE_HEIGHT);
  // area.width is a share of the plate width, so convert it to height units.
  const widestScaledLine = Math.max(
    ...lineStyles.map(
      (style, index) =>
        (lineWidthsEm[index] ?? 0.01) * LINE_SIZE_SCALE[style.size],
    ),
    0.01,
  );
  // Leave a small safety margin for browser/font rasterization differences.
  const byWidth = (area.width * plateRatio * 0.96) / widestScaledLine;
  return Math.min(byHeight, byWidth, MAX_FONT_CQH);
}

let measureCanvas: HTMLCanvasElement | null = null;

/** Real width of the longest line, in ems of the chosen face. */
function measureLineWidthsEm(
  lines: string[],
  fontFamily: string,
  lineStyles: TrophyLineStyle[],
): number[] {
  measureCanvas ??= document.createElement("canvas");
  const ctx = measureCanvas.getContext("2d");
  if (!ctx) return lines.map(() => 0);
  const probe = 100;
  return lines.map((line, index) => {
    const style = lineStyles[index];
    ctx.font = `${style.italic ? "italic " : ""}${style.bold ? 700 : 400} ${probe}px "${fontFamily}"`;
    return Math.max(ctx.measureText(line).width / probe, 0.01);
  });
}

function PlateArtwork({
  option,
  lines,
  fontFamily,
  lineStyles,
}: {
  option: TrophyPlateOption;
  lines: string[];
  fontFamily: string;
  lineStyles: TrophyLineStyle[];
}) {
  const hasCustomText = lines.some((line) => line.trim());
  // Keep all three positions once any wording is entered. A non-breaking space
  // gives an intentionally blank line the same height as a populated line.
  const shownLines = hasCustomText ? lines : ["YOUR TEXT HERE"];
  const area = option.textArea;
  const plateRatio = option.ratio ?? TROPHY_PLATE_RATIO;
  const linesKey = shownLines.join("\n");

  // Character-count estimate on the server; the real metrics take over on the
  // client, so wide wording can never run past the engraving area.
  const shownStyles = useMemo(
    () =>
      hasCustomText
        ? lineStyles
        : [{ ...DEFAULT_LINE_STYLE }],
    [hasCustomText, lineStyles],
  );
  const estimatedWidths = shownLines.map(
    (line, index) =>
      Math.max(line.length, 1) *
      (shownStyles[index].bold ? BOLD_CHAR_EM : AVG_CHAR_EM) *
      (shownStyles[index].italic ? 1.04 : 1),
  );
  const [lineWidthsEm, setLineWidthsEm] = useState(estimatedWidths);

  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (!cancelled) {
        setLineWidthsEm(
          measureLineWidthsEm(
            linesKey.split("\n"),
            fontFamily,
            shownStyles,
          ),
        );
      }
    };
    measure();
    // Metrics shift once a web font swaps in.
    void document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
    };
  }, [linesKey, fontFamily, shownStyles]);

  const fontSize = fitFontSize(lineWidthsEm, shownStyles, area, plateRatio);

  return (
    <div
      className={`tr-plate-artwork ${option.exact ? "is-exact" : ""}`}
      style={{ aspectRatio: `${plateRatio}` }}
    >
      <img src={option.plateSrc} alt="" draggable={false} />
      <div
        className="tr-custom-text"
        style={{
          top: `${area.top}%`,
          left: `${area.left}%`,
          width: `${area.width}%`,
          height: `${area.height}%`,
          color: option.textColor,
          fontFamily,
          fontSize: `${fontSize.toFixed(2)}cqh`,
        }}
      >
        {shownLines.map((line, index) => {
          const style = shownStyles[index];
          return (
            <span
              key={`${index}-${line}`}
              style={{
                fontSize: `${LINE_SIZE_SCALE[style.size]}em`,
                lineHeight: LINE_HEIGHT,
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

function TrophyPreview({
  product,
  option,
  lines,
  fontFamily,
  lineStyles,
  logoSrc,
  mode,
}: {
  product: TrophyProduct;
  option: TrophyPlateOption;
  lines: string[];
  fontFamily: string;
  lineStyles: TrophyLineStyle[];
  logoSrc?: string | null;
  mode: PreviewMode;
}) {
  if (mode === "plate") {
    return (
      <div className="tr-preview-stage is-plate">
        <PlateArtwork
          option={option}
          lines={lines}
          fontFamily={fontFamily}
          lineStyles={lineStyles}
        />
      </div>
    );
  }

  return (
    <div className="tr-preview-stage is-trophy">
      <div className="tr-trophy-artwork">
        <img className="tr-trophy-photo" src={option.trophySrc} alt="" />
        {product.logoInsert && logoSrc ? (
          <img
            className="tr-trophy-insert"
            src={logoSrc}
            alt="Uploaded logo"
            style={{
              left: `${product.logoInsert.left}%`,
              top: `${product.logoInsert.top}%`,
              width: `${product.logoInsert.width}%`,
              height: `${product.logoInsert.height}%`,
            }}
          />
        ) : null}
        <div
          className="tr-trophy-plate"
          style={{
            left: `${product.plateBounds.left}%`,
            top: `${product.plateBounds.top}%`,
            width: `${product.plateBounds.width}%`,
            height: `${product.plateBounds.height}%`,
          }}
        >
          <PlateArtwork
            option={option}
            lines={lines}
            fontFamily={fontFamily}
            lineStyles={lineStyles}
          />
        </div>
      </div>
    </div>
  );
}

export default function TrophyDesigner() {
  const [step, setStep] = useState<StepId>("trophy");
  const [visited, setVisited] = useState<StepId[]>(["trophy"]);
  const [productId, setProductId] = useState(TROPHY_PRODUCTS[0].id);
  const [plateId, setPlateId] = useState(TROPHY_PRODUCTS[0].options[0].id);
  const [lines, setLines] = useState(["", "", ""]);
  const [fontFamily, setFontFamily] = useState("Arial");
  const [lineStyles, setLineStyles] = useState<TrophyLineStyle[]>(
    defaultLineStyles,
  );
  const [quantity, setQuantity] = useState(1);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoName, setLogoName] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [cartError, setCartError] = useState("");
  const [cartAdded, setCartAdded] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofOpen, setProofOpen] = useState(false);
  const pendingOrderRef = useRef<PendingTrophyOrder | null>(null);
  const designIdRef = useRef(newDesignId());
  const apiRef = useRef(createApi(undefined, undefined, { designerId: "trophy" }));
  const [previewMode, setPreviewMode] = useState<PreviewMode>("plate");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkRows, setBulkRows] = useState<TrophyBulkRow[]>([]);
  const [bulkCsvText, setBulkCsvText] = useState("");
  const [bulkCsvWarning, setBulkCsvWarning] = useState("");
  const [bulkError, setBulkError] = useState("");
  const [selectedBulkRow, setSelectedBulkRow] = useState(0);
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkSortKey, setBulkSortKey] =
    useState<TrophyBulkSortKey>("line1");
  const [bulkSortAscending, setBulkSortAscending] = useState(true);
  const bulkCsvInputRef = useRef<HTMLInputElement>(null);
  const [restored, setRestored] = useState(false);

  const product = getTrophyProduct(productId);
  const option =
    product.options.find((candidate) => candidate.id === plateId) ??
    product.options[0];
  // The insert trophies all ship one plain plate, so their Plate step would
  // be a single choice; drop it rather than show a step with nothing to pick.
  const steps = useMemo(
    () => STEPS.filter((id) => id !== "plate" || product.options.length > 1),
    [product.options.length],
  );
  const stepIndex = Math.max(steps.indexOf(step), 0);
  const showPreview = step !== "trophy";
  const bulkQuantity = bulkRows.reduce((sum, row) => sum + row.quantity, 0);
  const orderQuantity = bulkMode && bulkRows.length > 0 ? bulkQuantity : quantity;
  const previewLines =
    bulkMode && bulkRows[selectedBulkRow]
      ? bulkRows[selectedBulkRow].lines
      : lines;
  const previewLineStyles =
    bulkMode && bulkRows[selectedBulkRow]?.lineStyles
      ? bulkRows[selectedBulkRow].lineStyles
      : lineStyles;
  const price = getTrophyPrice(orderQuantity);
  const designReady = bulkMode
    ? bulkRows.length > 0
    : product.logoInsert
      ? Boolean(logoDataUrl) || Boolean(lines[0].trim())
      : Boolean(lines[0].trim());
  const bulkPastePreview = useMemo(() => {
    if (!bulkCsvText.trim()) return null;
    try {
      return { ...parseTrophyBulkCsv(bulkCsvText), error: "" };
    } catch (error) {
      return {
        rows: [] as TrophyBulkRow[],
        warning: "",
        error:
          error instanceof Error ? error.message : "Could not read that CSV.",
      };
    }
  }, [bulkCsvText]);
  const visibleBulkRows = useMemo(() => {
    const query = bulkSearch.trim().toLocaleLowerCase();
    return bulkRows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) =>
        query
          ? row.lines.some((line) =>
              line.toLocaleLowerCase().includes(query),
            )
          : true,
      )
      .sort((a, b) => {
        const aValue =
          bulkSortKey === "quantity"
            ? a.row.quantity
            : a.row.lines[Number(bulkSortKey.slice(-1)) - 1];
        const bValue =
          bulkSortKey === "quantity"
            ? b.row.quantity
            : b.row.lines[Number(bulkSortKey.slice(-1)) - 1];
        const comparison =
          typeof aValue === "number" && typeof bValue === "number"
            ? aValue - bValue
            : String(aValue).localeCompare(String(bValue));
        return bulkSortAscending ? comparison : -comparison;
      });
  }, [bulkRows, bulkSearch, bulkSortAscending, bulkSortKey]);

  // Switching to a product without a Plate step can strand the wizard there.
  useEffect(() => {
    if (!steps.includes(step)) setStep("design");
  }, [step, steps]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as TrophyDraft;
        // v1 drafts stored only the trophy body, whose ids match the four
        // original products, so they carry straight over.
        const restoredProduct = TROPHY_PRODUCTS.find(
          (item) => item.id === (draft.productId ?? draft.trophyType),
        );
        if (restoredProduct) {
          setProductId(restoredProduct.id);
          setPlateId(
            restoredProduct.options.some((item) => item.id === draft.plateId)
              ? draft.plateId!
              : restoredProduct.options[0].id,
          );
        }
        // Older v1 drafts did not record wizard progress. If they contain
        // wording, resume at Design instead of discarding that working context.
        const restoredStep =
          draft.step && STEPS.includes(draft.step)
            ? draft.step
            : draft.lines?.some(
                  (line) => typeof line === "string" && line.trim(),
                )
              ? "design"
              : undefined;
        if (restoredStep) {
          setStep(restoredStep);
          const restoredIndex = STEPS.indexOf(restoredStep);
          const validVisited = Array.isArray(draft.visited)
            ? draft.visited.filter((item): item is StepId =>
                STEPS.includes(item),
              )
            : [];
          setVisited(
            Array.from(
              new Set([...STEPS.slice(0, restoredIndex + 1), ...validVisited]),
            ),
          );
        }
        if (Array.isArray(draft.lines)) {
          setLines(
            Array.from({ length: 3 }, (_, index) =>
              typeof draft.lines?.[index] === "string"
                ? draft.lines[index].slice(0, 40)
                : "",
            ),
          );
        }
        if (FONT_OPTIONS.includes(draft.fontFamily ?? "")) {
          setFontFamily(draft.fontFamily!);
        }
        setLineStyles(restoreLineStyles(draft.lineStyles, Boolean(draft.bold)));
        if (typeof draft.quantity === "number") {
          setQuantity(
            Math.min(
              TROPHY_MAX_PRICED_QUANTITY,
              Math.max(1, Math.round(draft.quantity)),
            ),
          );
        }
        if (draft.previewMode === "plate" || draft.previewMode === "trophy") {
          setPreviewMode(draft.previewMode);
        }
        if (Array.isArray(draft.bulkRows)) {
          const restoredRows = draft.bulkRows.flatMap(
            (row, index): TrophyBulkRow[] => {
              if (!row || !Array.isArray(row.lines) || !row.lines[0]?.trim()) {
                return [];
              }
              return [
                {
                  id:
                    typeof row.id === "string"
                      ? row.id
                      : `bulk-trophy-cached-${index}`,
                  lines: [0, 1, 2].map((lineIndex) =>
                    String(row.lines[lineIndex] ?? "").slice(0, 40),
                  ) as TrophyBulkRow["lines"],
                  quantity: Math.max(
                    1,
                    Math.min(
                      TROPHY_MAX_PRICED_QUANTITY,
                      Math.round(Number(row.quantity) || 1),
                    ),
                  ),
                  lineStyles: restoreLineStyles(row.lineStyles),
                },
              ];
            },
          );
          const restoredTotal = restoredRows.reduce(
            (sum, row) => sum + row.quantity,
            0,
          );
          if (
            draft.bulkMode &&
            restoredRows.length > 0 &&
            restoredTotal <= TROPHY_MAX_PRICED_QUANTITY
          ) {
            setBulkMode(true);
            setBulkRows(restoredRows);
            setLineStyles(
              cloneLineStyles(restoredRows[0].lineStyles ?? defaultLineStyles()),
            );
          }
        }
        if (typeof draft.bulkCsvText === "string") {
          setBulkCsvText(draft.bulkCsvText);
        }
        if (typeof draft.bulkCsvWarning === "string") {
          setBulkCsvWarning(draft.bulkCsvWarning);
        }
      }
    } catch {
      localStorage.removeItem(CACHE_KEY);
    } finally {
      setRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!restored) return;
    const draft: TrophyDraft = {
      step,
      visited,
      productId,
      plateId: option.id,
      lines,
      fontFamily,
      lineStyles,
      quantity,
      previewMode,
      bulkMode,
      bulkRows,
      bulkCsvText,
      bulkCsvWarning,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(draft));
  }, [
    fontFamily,
    bulkCsvText,
    bulkCsvWarning,
    bulkMode,
    bulkRows,
    lineStyles,
    lines,
    option.id,
    previewMode,
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
      ["Award", product.shortLabel],
      ["Plate", option.label],
      ...(product.logoInsert
        ? ([["Logo", logoName || "No logo uploaded"]] as [string, string][])
        : []),
      [
        "Text",
        bulkMode
          ? `${bulkRows.length} personalized design${bulkRows.length === 1 ? "" : "s"}`
          : lines.filter((line) => line.trim()).join(" / "),
      ],
      ["Quantity", String(orderQuantity)],
      ["Price", `$${price.total.toFixed(2)}`],
    ],
    [
      lines,
      logoName,
      bulkMode,
      bulkRows.length,
      option.label,
      orderQuantity,
      price.total,
      product.logoInsert,
      product.shortLabel,
    ],
  );

  function chooseProduct(nextProduct: TrophyProduct) {
    setProductId(nextProduct.id);
    setPlateId(nextProduct.options[0].id);
    setLines([...nextProduct.defaultLines]);
    setLogoDataUrl(null);
    setLogoName("");
    setLogoFile(null);
    // The logo only reads on the trophy itself, never on the bare plate.
    if (nextProduct.logoInsert) setPreviewMode("trophy");
  }

  function chooseLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setLogoDataUrl(reader.result);
        setLogoName(file.name);
        setLogoFile(file);
      }
    };
    reader.readAsDataURL(file);
  }

  function applyBulkCsv(csv: string) {
    setBulkError("");
    try {
      const result = parseTrophyBulkCsv(csv);
      const seeded = result.rows.map((row) => ({
        ...row,
        lineStyles: cloneLineStyles(lineStyles),
      }));
      setBulkMode(true);
      setBulkRows(seeded);
      setBulkCsvWarning(result.warning);
      setSelectedBulkRow(0);
      setQuantity(
        result.rows.reduce((sum, row) => sum + row.quantity, 0),
      );
    } catch (error) {
      setBulkError(
        error instanceof Error ? error.message : "Could not import the CSV.",
      );
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
      new Blob([TROPHY_BULK_CSV_TEMPLATE], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "trophy-bulk-personalization.csv";
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

  function toggleBulkSort(key: TrophyBulkSortKey) {
    if (bulkSortKey === key) {
      setBulkSortAscending((current) => !current);
    } else {
      setBulkSortKey(key);
      setBulkSortAscending(true);
    }
  }

  function selectBulkRow(index: number) {
    setSelectedBulkRow(index);
    const styles = bulkRows[index]?.lineStyles;
    if (styles) setLineStyles(cloneLineStyles(styles));
  }

  function applyLineFormatToAll(lineIndex: number) {
    const source = lineStyles[lineIndex];
    if (!source || bulkRows.length === 0) return;
    setBulkRows((current) =>
      current.map((row) => {
        const styles = restoreLineStyles(row.lineStyles);
        styles[lineIndex] = { ...source };
        return { ...row, lineStyles: styles };
      }),
    );
  }

  function updateLineStyle(
    index: number,
    update: Partial<TrophyLineStyle>,
  ) {
    const next = lineStyles.map((style, lineIndex) =>
      lineIndex === index ? { ...style, ...update } : style,
    );
    setLineStyles(next);
    if (bulkMode && bulkRows.length > 0) {
      setBulkRows((rows) =>
        rows.map((row, rowIndex) =>
          rowIndex === selectedBulkRow
            ? { ...row, lineStyles: cloneLineStyles(next) }
            : row,
        ),
      );
    }
  }

  function goToStep(next: StepId) {
    setStep(next);
    setVisited((current) =>
      current.includes(next) ? current : [...current, next],
    );
  }

  function goNext() {
    const next = steps[stepIndex + 1];
    if (next) goToStep(next);
  }

  function goBack() {
    const previous = steps[stepIndex - 1];
    if (previous) goToStep(previous);
  }

  function reset() {
    localStorage.removeItem(CACHE_KEY);
    // A fresh id keeps a second design from overwriting the draft rows behind
    // a trophy that is already in the cart.
    designIdRef.current = newDesignId();
    setStep("trophy");
    setVisited(["trophy"]);
    setProductId(TROPHY_PRODUCTS[0].id);
    setPlateId(TROPHY_PRODUCTS[0].options[0].id);
    setLines(["", "", ""]);
    setFontFamily("Arial");
    setLineStyles(defaultLineStyles());
    setQuantity(1);
    setLogoDataUrl(null);
    setLogoName("");
    setLogoFile(null);
    setCartError("");
    setCartAdded(false);
    setProofOpen(false);
    setProofUrl(null);
    pendingOrderRef.current = null;
    setPreviewMode("plate");
    setBulkMode(false);
    setBulkRows([]);
    setBulkCsvText("");
    setBulkCsvWarning("");
    setBulkError("");
    setBulkSearch("");
    setSelectedBulkRow(0);
  }

  /** Builds the proof PDF and saves the draft; the cart line comes later. */
  async function reviewProof() {
    if (!designReady) {
      setCartError("Add wording (or a logo) before reviewing your proof.");
      return;
    }
    setBusy(true);
    setCartError("");
    try {
      const designId = designIdRef.current;
      const isQaTest = readQueryParam("qaTest") === "1";
      const shop = readQueryParam("shop") || readQueryParam("storeUrl");
      const customerId = readQueryParam("customerId");
      const rowSpecs: TrophyRowSpec[] =
        bulkMode && bulkRows.length > 0
          ? bulkRows.map((row) => ({
              lines: row.lines,
              styles: row.lineStyles ?? lineStyles,
              quantity: row.quantity,
            }))
          : [{ lines, styles: lineStyles, quantity }];

      const allBadges: Badge[] = rowSpecs.map((row) => ({
        lines: trophyTextsToLines(row.lines, fontFamily, row.styles),
        backgroundColor: option.textColor,
        backing: "pin",
        trophyProductId: product.id,
        trophyProductLabel: product.label,
        trophyPlateId: option.id,
        trophyPlateLabel: option.label,
        ...(logoDataUrl
          ? { logo: { src: logoDataUrl, fileName: logoName } }
          : {}),
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
      if (logoFile) form.append("logo_0", logoFile, logoFile.name);

      const svgBlob = (svg: string) =>
        new Blob([svg], { type: "image/svg+xml" });
      let proofPdf: Blob | null = null;
      for (let index = 0; index < rowSpecs.length; index += 1) {
        const row = rowSpecs[index];
        const svg = trophyPlateToSvgString({
          option,
          lines: row.lines,
          fontFamily,
          lineStyles: row.styles,
        });
        form.append(`svg_${index}`, svgBlob(svg), `trophy-${index}-design.svg`);
        form.append(
          `print_svg_${index}`,
          svgBlob(svg),
          `trophy-${index}-print.svg`,
        );
        const thumb = await trophyPreviewToPng({
          product,
          option,
          lines: row.lines,
          fontFamily,
          lineStyles: row.styles,
          logoSrc: logoDataUrl,
        });
        form.append(
          `thumbnail_png_${index}`,
          thumb.blob,
          `trophy-${index}-thumbnail.jpg`,
        );
        if (index === 0) {
          proofPdf = await generateTrophyProofPdf({
            designId,
            thumbnailDataUrl: thumb.dataUrl,
            awardLabel: product.label,
            plateLabel: option.label,
            lines: row.lines,
            quantity: orderQuantity,
            unitPrice: price.perUnit,
          });
        }
      }

      const draftRes = await fetch(getDesignerApiPaths("trophy").saveDraft, {
        method: "POST",
        body: form,
      });
      if (!draftRes.ok) {
        const body = await draftRes.text().catch(() => "");
        throw new Error(`Could not save the trophy draft. ${body}`.trim());
      }
      if (!proofPdf || proofPdf.size === 0) {
        throw new Error("Could not build the trophy proof PDF.");
      }

      pendingOrderRef.current = {
        designId,
        pdf: proofPdf,
        rowSpecs,
        awardLabel: product.label,
        plateLabel: option.label,
        plateTextColor: option.textColor,
        fontFamily,
        unitPrice: price.perUnit,
        logoName,
      };
      setProofUrl(URL.createObjectURL(proofPdf));
      setProofOpen(true);
    } catch (caught) {
      setCartError(
        caught instanceof Error
          ? caught.message
          : "Could not build your proof.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmAddToCart() {
    const pending = pendingOrderRef.current;
    if (!pending) return;
    const variantId = readQueryParam("variantId");
    if (!variantId) {
      setCartError(
        "Open this designer from the custom trophy product page so it can add to cart.",
      );
      return;
    }
    setBusy(true);
    setCartError("");
    try {
      const finalize = new FormData();
      finalize.append("designId", pending.designId);
      finalize.append("designer", "trophy");
      finalize.append("pdf", pending.pdf, "trophy-design_proof.pdf");
      const finalizeRes = await fetch("/api/finalize-draft", {
        method: "POST",
        body: finalize,
      });
      const finalized = await finalizeRes.json().catch(() => ({}));
      if (!finalizeRes.ok || finalized.success === false) {
        throw new Error(
          finalized.error || "Could not finalize the trophy proof.",
        );
      }

      const definition = getDesignerConfig("trophy");
      const cartLines = pending.rowSpecs.map((row, index) => ({
        variantId,
        quantity: row.quantity,
        properties: buildDesignerCartLineProperties({
          designerId: "trophy",
          designId: pending.designId,
          lineIndex: index,
          indexPropertyPrimary: definition.cartIndexPropertyPrimary,
          indexPropertyFallbacks: definition.cartIndexPropertyFallbacks,
          lines: trophyTextsToLines(row.lines, pending.fontFamily, row.styles),
          backgroundColor: pending.plateTextColor,
          linePrice: pending.unitPrice.toFixed(2),
          thumbnailUrl: finalized.thumbnailUrls?.[index] ?? "",
          pdfUrl: finalized.pdfUrl ?? "",
          orderQuantity: row.quantity,
          uploadedLogo: pending.logoName || null,
          extraHidden: {
            "_Trophy Award": pending.awardLabel,
            "_Plate Finish": pending.plateLabel,
          },
        }),
      }));
      const result = await apiRef.current.addToCartMultiple(cartLines);
      if (!result.success) {
        throw new Error(result.message || "Could not add the trophy to cart.");
      }
      localStorage.removeItem(CACHE_KEY);
      setProofOpen(false);
      setCartAdded(true);
    } catch (caught) {
      setCartError(
        caught instanceof Error ? caught.message : "Could not add to cart.",
      );
    } finally {
      setBusy(false);
    }
  }

  function confirmReset() {
    if (
      window.confirm(
        "Reset this design? Your trophy choices and custom text will be cleared.",
      )
    ) {
      reset();
    }
  }

  return (
    <div
      className={`gf-designer-root gf-wizard-root tr-designer ${
        showPreview ? "is-preview-step" : ""
      }`}
    >
      <div className="gf-page-title">
        <p className="gf-eyebrow">Personalization tool</p>
        <h1 className="gf-page-h1">Customize your trophy</h1>
      </div>

      <div className="gf-hero">
        <div className="gf-stepper">
          {steps.map((id, index) => {
            const state =
              step === id ? "active" : index < stepIndex ? "done" : "todo";
            const reachable = visited.includes(id);
            return (
              <div className="gf-stepper-step" key={id}>
                {index > 0 ? (
                  <span
                    className={`gf-stepper-line ${
                      index <= stepIndex ? "is-done" : ""
                    }`}
                  />
                ) : null}
                <button
                  type="button"
                  className={`gf-stepper-circle is-${state}`}
                  disabled={!reachable}
                  onClick={() => reachable && goToStep(id)}
                  aria-current={step === id ? "step" : undefined}
                >
                  {index < stepIndex ? "✓" : index + 1}
                </button>
                <small className={step === id ? "is-active" : ""}>
                  {STEP_LABELS[id]}
                </small>
              </div>
            );
          })}
        </div>

        <div className="gf-panel">
          <p className="gf-panel-title">{PANEL_COPY[step].title}</p>
          <div className="gf-panel-lead">
            <p className="gf-panel-sub gf-panel-sub-lead">
              {PANEL_COPY[step].sub}
            </p>
            {showPreview ? (
              <p className="gf-preview-label">Live preview</p>
            ) : null}
          </div>

          <div className={`gf-design-grid ${showPreview ? "" : "is-single"}`}>
            <div className="gf-controls-col">
              {showPreview ? (
                <p className="gf-panel-sub gf-panel-sub-follow">
                  {PANEL_COPY[step].sub}
                </p>
              ) : null}

              {step === "trophy" ? (
                <div className="tr-trophy-grid">
                  {TROPHY_PRODUCTS.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`gf-toggle-card ${
                        product.id === item.id ? "is-selected" : ""
                      }`}
                      onClick={() => chooseProduct(item)}
                    >
                      <img
                        className="gf-toggle-photo"
                        src={item.thumbnailSrc}
                        alt=""
                      />
                      <span className="gf-toggle-label">{item.shortLabel}</span>
                      <span className="gf-toggle-sub">{item.description}</span>
                      <span className="tr-category">{item.category}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {step === "plate" ? (
                <div className="tr-option-grid">
                  {product.options.map((plate) => (
                    <button
                      type="button"
                      key={plate.id}
                      className={`tr-option-card ${
                        option.id === plate.id ? "is-selected" : ""
                      }`}
                      onClick={() => setPlateId(plate.id)}
                    >
                      <img src={plate.plateSrc} alt="" />
                      <span>{plate.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {step === "design" ? (
                <>
                  <div
                    className={`gf-bulk-entry-choice ${bulkMode ? "is-active" : ""}`}
                  >
                    <div>
                      <strong>
                        {bulkMode ? "CSV bulk entry" : "Ordering in bulk?"}
                      </strong>
                      <p>
                        {bulkMode
                          ? "View every personalized trophy below and select any row for a live preview."
                          : "Add many personalized trophies with a CSV file or pasted rows."}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={
                        bulkMode ? "gf-nav-secondary" : "gf-nav-primary"
                      }
                      onClick={
                        bulkMode ? exitBulkMode : () => setBulkMode(true)
                      }
                    >
                      {bulkMode ? "Use individual entry" : "Try CSV entry"}
                    </button>
                  </div>

                  {bulkMode ? (
                    <div className="gf-bulk-import">
                      <div className="gf-bulk-import-head">
                        <div>
                          <p className="gf-sub-title">
                            Bulk trophy personalization
                          </p>
                          <p className="gf-note">
                            One row per design. Award, plate, formatting, and
                            uploaded logo are shared across the order.
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
                            {bulkRows.length > 0
                              ? "Replace CSV"
                              : "Upload CSV"}
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
                          htmlFor="tr-bulk-paste"
                        >
                          Or paste your rows
                        </label>
                        <p className="gf-bulk-paste-example">
                          {TROPHY_BULK_PASTE_EXAMPLES.map((row) => (
                            <span key={row}>{row}</span>
                          ))}
                        </p>
                        <textarea
                          id="tr-bulk-paste"
                          className="gf-bulk-paste-input"
                          rows={4}
                          spellCheck={false}
                          placeholder={TROPHY_BULK_PASTE_EXAMPLES.join("\n")}
                          value={bulkCsvText}
                          onChange={(event) => {
                            setBulkCsvText(event.target.value);
                            setBulkError("");
                          }}
                        />
                        {bulkPastePreview?.error || bulkError ? (
                          <p className="gf-bulk-paste-error">
                            {bulkError || bulkPastePreview?.error}
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
                              ? `${bulkPastePreview.rows.length} design${
                                  bulkPastePreview.rows.length === 1 ? "" : "s"
                                } ready`
                              : `Up to ${TROPHY_MAX_PRICED_QUANTITY} total trophies.`}
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
                            <strong>
                              {bulkRows.length} personalized design
                              {bulkRows.length === 1 ? "" : "s"}
                            </strong>
                            <span>{bulkQuantity} total trophies</span>
                          </div>
                          {bulkCsvWarning ? (
                            <p className="gf-bulk-paste-warning">
                              {bulkCsvWarning}
                            </p>
                          ) : null}
                          <div className="gf-bulk-grid-tools">
                            <label>
                              <span className="gf-visually-hidden">
                                Search CSV text
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
                            <span className="gf-note">
                              Viewing {visibleBulkRows.length} of{" "}
                              {bulkRows.length}
                            </span>
                          </div>
                          <div
                            className="gf-bulk-grid tr-bulk-grid"
                            role="table"
                            aria-label="All personalized trophy designs"
                          >
                            <div className="gf-bulk-grid-header" role="row">
                              <span role="columnheader">#</span>
                              {(
                                ["line1", "line2", "line3"] as const
                              ).map((key, index) => (
                                <button
                                  key={key}
                                  type="button"
                                  role="columnheader"
                                  onClick={() => toggleBulkSort(key)}
                                >
                                  Line {index + 1}
                                  {bulkSortKey === key
                                    ? bulkSortAscending
                                      ? " ↑"
                                      : " ↓"
                                    : ""}
                                </button>
                              ))}
                              <button
                                type="button"
                                role="columnheader"
                                onClick={() => toggleBulkSort("quantity")}
                              >
                                Qty
                                {bulkSortKey === "quantity"
                                  ? bulkSortAscending
                                    ? " ↑"
                                    : " ↓"
                                  : ""}
                              </button>
                            </div>
                            {visibleBulkRows.map(({ row, index }) => (
                              <button
                                key={row.id}
                                type="button"
                                role="row"
                                className={`gf-bulk-grid-row ${
                                  selectedBulkRow === index
                                    ? "is-selected"
                                    : ""
                                }`}
                                onClick={() => selectBulkRow(index)}
                              >
                                <span role="cell">{index + 1}</span>
                                {row.lines.map((line, lineIndex) => (
                                  <span
                                    key={lineIndex}
                                    role="cell"
                                    title={line}
                                  >
                                    {line || "—"}
                                  </span>
                                ))}
                                <strong role="cell">{row.quantity}</strong>
                              </button>
                            ))}
                            {visibleBulkRows.length === 0 ? (
                              <p className="gf-bulk-grid-empty">
                                No rows match “{bulkSearch}”.
                              </p>
                            ) : null}
                          </div>
                          <p className="gf-note">
                            Select a row to preview it. Click a heading to sort.
                          </p>
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  {product.logoInsert ? (
                    <div className="tr-logo-upload">
                      <div className="gf-line-label">
                        Logo for the round insert
                      </div>
                      <label className="tr-logo-picker">
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          onChange={(event) =>
                            chooseLogo(event.target.files?.[0])
                          }
                        />
                        <span>{logoName || "Choose logo file"}</span>
                      </label>
                      {logoDataUrl ? (
                        <button
                          type="button"
                          className="gf-nav-secondary"
                          onClick={() => {
                            setLogoDataUrl(null);
                            setLogoName("");
                            setLogoFile(null);
                          }}
                        >
                          Remove logo
                        </button>
                      ) : null}
                      <p className="gf-note">
                        PNG, JPG, WebP, or SVG. The insert is round, so a square
                        high-resolution image works best.
                      </p>
                    </div>
                  ) : null}
                  <div className="tr-format-row">
                    <label>
                      Font
                      <select
                        className="gf-input"
                        value={fontFamily}
                        onChange={(event) => setFontFamily(event.target.value)}
                      >
                        {FONT_OPTIONS.map((font) => (
                          <option key={font} value={font}>
                            {font}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {lines.map((line, index) => (
                    <div className="gf-line-block" key={index}>
                      <div className="gf-line-label">
                        {bulkMode ? "Formatting for " : ""}
                        Line {index + 1}
                        {!bulkMode
                          ? index === 0
                            ? " (required)"
                            : " (optional)"
                          : ""}
                      </div>
                      <div className="tr-line-style-controls">
                        <div
                          className="tr-line-size-group"
                          role="group"
                          aria-label={`Line ${index + 1} size`}
                        >
                          {(
                            [
                              ["small", "Small"],
                              ["medium", "Med"],
                              ["large", "Large"],
                            ] as const
                          ).map(([size, label]) => (
                            <button
                              type="button"
                              key={size}
                              className={
                                lineStyles[index].size === size ? "is-on" : ""
                              }
                              aria-pressed={lineStyles[index].size === size}
                              onClick={() => updateLineStyle(index, { size })}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <div
                          className="tr-line-format-group"
                          role="group"
                          aria-label={`Line ${index + 1} formatting`}
                        >
                          {(
                            [
                              ["bold", "Bold"],
                              ["italic", "Italic"],
                              ["underline", "Underline"],
                            ] as const
                          ).map(([format, label]) => (
                            <button
                              type="button"
                              key={format}
                              className={
                                lineStyles[index][format] ? "is-on" : ""
                              }
                              aria-label={label}
                              aria-pressed={lineStyles[index][format]}
                              title={label}
                              onClick={() =>
                                updateLineStyle(index, {
                                  [format]: !lineStyles[index][format],
                                })
                              }
                            >
                              {format === "bold"
                                ? "B"
                                : format === "italic"
                                  ? "I"
                                  : "U"}
                            </button>
                          ))}
                        </div>
                      </div>
                      {bulkMode && bulkRows.length > 1 ? (
                        <button
                          type="button"
                          className="tr-apply-line-format"
                          onClick={() => applyLineFormatToAll(index)}
                        >
                          Apply line {index + 1} format to all trophies
                        </button>
                      ) : null}
                      {bulkMode ? (
                        <div className="gf-bulk-text-preview">
                          <div>
                            <span>Selected row</span>
                            <strong>{previewLines[index] || "—"}</strong>
                          </div>
                        </div>
                      ) : (
                        <>
                          <input
                            className="gf-input"
                            value={line}
                            maxLength={40}
                            placeholder={
                              index === 0
                                ? "CHAMPIONS"
                                : index === 1
                                  ? "2026"
                                  : "Optional line"
                            }
                            onChange={(event) =>
                              setLines((current) =>
                                current.map((value, lineIndex) =>
                                  lineIndex === index
                                    ? event.target.value
                                    : value,
                                ),
                              )
                            }
                          />
                          <span className="gf-char-count">
                            {line.length}/40
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                  {!bulkMode && !designReady ? (
                    <p className="tr-help">
                      {product.logoInsert
                        ? "Upload a logo or enter line 1 to continue."
                        : "Enter line 1 to continue."}
                    </p>
                  ) : null}
                </>
              ) : null}

              {step === "quantity" ? (
                <div className="tr-quantity-card">
                  <p className="gf-sub-title">Trophy quantity</p>
                  {bulkMode ? (
                    <>
                      <div className="gf-bulk-status tr-bulk-quantity">
                        <strong>{bulkQuantity} total trophies</strong>
                        <span>{bulkRows.length} personalized designs</span>
                      </div>
                      <p className="gf-note">
                        Quantities come from the CSV. Return to Design to
                        replace or edit the file.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="tr-quantity-control">
                        <button
                          type="button"
                          onClick={() =>
                            setQuantity((current) => Math.max(1, current - 1))
                          }
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={1}
                          max={TROPHY_MAX_PRICED_QUANTITY}
                          value={quantity}
                          onChange={(event) =>
                            setQuantity(
                              Math.min(
                                TROPHY_MAX_PRICED_QUANTITY,
                                Math.max(1, Number(event.target.value) || 1),
                              ),
                            )
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setQuantity((current) =>
                              Math.min(
                                TROPHY_MAX_PRICED_QUANTITY,
                                current + 1,
                              ),
                            )
                          }
                        >
                          +
                        </button>
                      </div>
                      <p className="gf-note">
                        Every trophy in this quantity uses the same plate
                        design and wording.
                      </p>
                    </>
                  )}
                  <div className="tr-price-summary">
                    <span>${price.perUnit.toFixed(2)} each</span>
                    <strong>${price.total.toFixed(2)} total</strong>
                  </div>
                  <p className="gf-note">
                    Need more than {TROPHY_MAX_PRICED_QUANTITY}? Contact us for
                    volume pricing.
                  </p>
                </div>
              ) : null}

              {step === "done" ? (
                <div className="tr-review">
                  {summary.map(([label, value]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                  <p className="tr-review-note">
                    {cartAdded
                      ? "Added to your cart. Your wording and plate art are saved with this order."
                      : "Review the award, plate, and wording, then open your production proof to approve it."}
                  </p>
                  {cartError ? (
                    <p className="gf-note" role="alert">
                      {cartError}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="gf-step-nav">
                <div className="tr-nav-secondary-group">
                  {stepIndex > 0 ? (
                    <button
                      type="button"
                      className="gf-nav-secondary"
                      onClick={goBack}
                    >
                      Back
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="gf-nav-secondary"
                    onClick={confirmReset}
                  >
                    Reset design
                  </button>
                </div>
                {step !== "done" ? (
                  <button
                    type="button"
                    className="gf-nav-primary"
                    disabled={step === "design" && !designReady}
                    onClick={goNext}
                  >
                    Continue
                  </button>
                ) : cartAdded ? (
                  <button
                    type="button"
                    className="gf-nav-primary"
                    onClick={reset}
                  >
                    Start another
                  </button>
                ) : (
                  <button
                    type="button"
                    className="gf-nav-primary"
                    disabled={busy || !designReady}
                    onClick={() => void reviewProof()}
                  >
                    {busy
                      ? "Preparing proof…"
                      : "Review proof & add to cart →"}
                  </button>
                )}
              </div>
            </div>

            {showPreview ? (
              <div className="gf-preview-pane">
                <div className="tr-preview-frame">
                  <div
                    className="gf-preview-switch"
                    role="tablist"
                    aria-label="Preview"
                  >
                    <button
                      type="button"
                      role="tab"
                      aria-selected={previewMode === "plate"}
                      className={previewMode === "plate" ? "is-on" : ""}
                      onClick={() => setPreviewMode("plate")}
                    >
                      <span className="gf-switch-long">Plate view</span>
                      <span className="gf-switch-short">Plate</span>
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={previewMode === "trophy"}
                      className={previewMode === "trophy" ? "is-on" : ""}
                      onClick={() => setPreviewMode("trophy")}
                    >
                      <span className="gf-switch-long">Trophy view</span>
                      <span className="gf-switch-short">Trophy</span>
                    </button>
                  </div>
                  <TrophyPreview
                    product={product}
                    option={option}
                    lines={previewLines}
                    fontFamily={fontFamily}
                    lineStyles={previewLineStyles}
                    logoSrc={logoDataUrl}
                    mode={previewMode}
                  />
                </div>
                <p className="tr-preview-caption">
                  Preview is an approximation. Final engraving placement may
                  vary slightly.
                </p>
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
              Confirm the wording and plate, then add this{" "}
              {bulkMode && bulkRows.length > 0
                ? `${bulkRows.length}-design bulk order`
                : "trophy"}{" "}
              to your cart.{" "}
              {bulkMode && bulkRows.length > 1
                ? "The proof shows the first CSV row; every row is added with the same award, plate, and font."
                : ""}
            </p>
            <ProofPdfViewer url={proofUrl} title="Trophy plate proof" />
            {cartError ? <div className="gf-error">{cartError}</div> : null}
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
                onClick={() => void confirmAddToCart()}
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
