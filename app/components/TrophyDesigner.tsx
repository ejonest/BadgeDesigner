import { useEffect, useMemo, useState } from "react";
import {
  TROPHY_PLATE_RATIO,
  TROPHY_TYPES,
  getTrophyType,
  type TrophyPlateOption,
  type TrophyTextArea,
  type TrophyTypeId,
} from "~/constants/trophyOptions";
import "../styles/gavelDesigner.css";
import "../styles/trophyDesigner.css";

type StepId = "trophy" | "plate" | "design" | "quantity" | "done";
type PreviewMode = "plate" | "trophy";
type LineSize = "small" | "medium" | "large";
type TrophyLineStyle = {
  size: LineSize;
  bold: boolean;
  italic: boolean;
  underline: boolean;
};

const STEPS: StepId[] = ["trophy", "plate", "design", "quantity", "done"];
const STEP_LABELS: Record<StepId, string> = {
  trophy: "Trophy",
  plate: "Plate",
  design: "Design",
  quantity: "Quantity",
  done: "Review",
};
const PANEL_COPY: Record<StepId, { title: string; sub: string }> = {
  trophy: {
    title: "Choose your trophy",
    sub: "Select the trophy shape you want to personalize.",
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
    sub: "Check the trophy, plate, wording, and quantity before continuing.",
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

function restoreLineStyles(draft: TrophyDraft): TrophyLineStyle[] {
  return Array.from({ length: 3 }, (_, index) => {
    const saved = draft.lineStyles?.[index];
    const size: LineSize =
      saved?.size === "small" ||
      saved?.size === "medium" ||
      saved?.size === "large"
        ? saved.size
        : "medium";
    return {
      size,
      bold: saved ? Boolean(saved.bold) : Boolean(draft.bold),
      italic: Boolean(saved?.italic),
      underline: Boolean(saved?.underline),
    };
  });
}

type TrophyDraft = {
  step?: StepId;
  visited?: StepId[];
  trophyType?: TrophyTypeId;
  plateId?: string;
  lines?: string[];
  fontFamily?: string;
  lineStyles?: TrophyLineStyle[];
  /** Legacy v1 drafts used one bold setting for every line. */
  bold?: boolean;
  quantity?: number;
  previewMode?: PreviewMode;
};

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
  const byWidth =
    (area.width * TROPHY_PLATE_RATIO * 0.96) / widestScaledLine;
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

  const fontSize = fitFontSize(lineWidthsEm, shownStyles, area);

  return (
    <div className="tr-plate-artwork">
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
  trophyType,
  option,
  lines,
  fontFamily,
  lineStyles,
  mode,
}: {
  trophyType: TrophyTypeId;
  option: TrophyPlateOption;
  lines: string[];
  fontFamily: string;
  lineStyles: TrophyLineStyle[];
  mode: PreviewMode;
}) {
  const trophy = getTrophyType(trophyType);

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
        <div
          className="tr-trophy-plate"
          style={{
            left: `${trophy.plateBounds.left}%`,
            top: `${trophy.plateBounds.top}%`,
            width: `${trophy.plateBounds.width}%`,
            height: `${trophy.plateBounds.height}%`,
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
  const [trophyType, setTrophyType] = useState<TrophyTypeId>("baseball");
  const [plateId, setPlateId] = useState("baseball-theme");
  const [lines, setLines] = useState(["", "", ""]);
  const [fontFamily, setFontFamily] = useState("Arial");
  const [lineStyles, setLineStyles] = useState<TrophyLineStyle[]>(
    defaultLineStyles,
  );
  const [quantity, setQuantity] = useState(1);
  const [previewMode, setPreviewMode] = useState<PreviewMode>("plate");
  const [restored, setRestored] = useState(false);

  const trophy = getTrophyType(trophyType);
  const option =
    trophy.options.find((candidate) => candidate.id === plateId) ??
    trophy.options[0];
  const stepIndex = STEPS.indexOf(step);
  const showPreview = step !== "trophy";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as TrophyDraft;
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
        if (TROPHY_TYPES.some((item) => item.id === draft.trophyType)) {
          const restoredType = draft.trophyType as TrophyTypeId;
          const restoredTrophy = getTrophyType(restoredType);
          setTrophyType(restoredType);
          setPlateId(
            restoredTrophy.options.some((item) => item.id === draft.plateId)
              ? draft.plateId!
              : restoredTrophy.options[0].id,
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
        setLineStyles(restoreLineStyles(draft));
        if (typeof draft.quantity === "number") {
          setQuantity(Math.min(500, Math.max(1, Math.round(draft.quantity))));
        }
        if (draft.previewMode === "plate" || draft.previewMode === "trophy") {
          setPreviewMode(draft.previewMode);
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
      trophyType,
      plateId: option.id,
      lines,
      fontFamily,
      lineStyles,
      quantity,
      previewMode,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(draft));
  }, [
    fontFamily,
    lineStyles,
    lines,
    option.id,
    previewMode,
    quantity,
    restored,
    step,
    trophyType,
    visited,
  ]);

  const summary = useMemo(
    () => [
      ["Trophy", trophy.label],
      ["Plate", option.label],
      ["Text", lines.filter((line) => line.trim()).join(" / ")],
      ["Quantity", String(quantity)],
    ],
    [lines, option.label, quantity, trophy.label],
  );

  function chooseTrophy(nextType: TrophyTypeId) {
    const nextTrophy = getTrophyType(nextType);
    setTrophyType(nextType);
    setPlateId(nextTrophy.options[0].id);
  }

  function updateLineStyle(
    index: number,
    update: Partial<TrophyLineStyle>,
  ) {
    setLineStyles((current) =>
      current.map((style, lineIndex) =>
        lineIndex === index ? { ...style, ...update } : style,
      ),
    );
  }

  function goToStep(next: StepId) {
    setStep(next);
    setVisited((current) =>
      current.includes(next) ? current : [...current, next],
    );
  }

  function goNext() {
    const next = STEPS[stepIndex + 1];
    if (next) goToStep(next);
  }

  function goBack() {
    const previous = STEPS[stepIndex - 1];
    if (previous) goToStep(previous);
  }

  function reset() {
    localStorage.removeItem(CACHE_KEY);
    setStep("trophy");
    setVisited(["trophy"]);
    setTrophyType("baseball");
    setPlateId("baseball-theme");
    setLines(["", "", ""]);
    setFontFamily("Arial");
    setLineStyles(defaultLineStyles());
    setQuantity(1);
    setPreviewMode("plate");
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
          {STEPS.map((id, index) => {
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
                  {TROPHY_TYPES.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={`gf-toggle-card ${
                        trophyType === item.id ? "is-selected" : ""
                      }`}
                      onClick={() => chooseTrophy(item.id)}
                    >
                      <img
                        className="gf-toggle-photo"
                        src={item.options[0].trophySrc}
                        alt=""
                      />
                      <span className="gf-toggle-label">{item.label}</span>
                      <span className="gf-toggle-sub">{item.description}</span>
                    </button>
                  ))}
                </div>
              ) : null}

              {step === "plate" ? (
                <div className="tr-option-grid">
                  {trophy.options.map((plate) => (
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
                        Line {index + 1}
                        {index === 0 ? " (required)" : " (optional)"}
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
                              lineIndex === index ? event.target.value : value,
                            ),
                          )
                        }
                      />
                      <span className="gf-char-count">{line.length}/40</span>
                    </div>
                  ))}
                  {!lines[0].trim() ? (
                    <p className="tr-help">Enter line 1 to continue.</p>
                  ) : null}
                </>
              ) : null}

              {step === "quantity" ? (
                <div className="tr-quantity-card">
                  <p className="gf-sub-title">Trophy quantity</p>
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
                      max={500}
                      value={quantity}
                      onChange={(event) =>
                        setQuantity(
                          Math.min(
                            500,
                            Math.max(1, Number(event.target.value) || 1),
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setQuantity((current) => Math.min(500, current + 1))
                      }
                    >
                      +
                    </button>
                  </div>
                  <p className="gf-note">
                    Every trophy in this quantity uses the same plate design
                    and wording.
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
                    Your trophy design is ready. Product and cart integration
                    can use this selection when the trophy catalog is connected.
                  </p>
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
                    disabled={step === "design" && !lines[0].trim()}
                    onClick={goNext}
                  >
                    Continue
                  </button>
                ) : (
                  <button
                    type="button"
                    className="gf-nav-primary"
                    onClick={reset}
                  >
                    Start another
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
                    trophyType={trophyType}
                    option={option}
                    lines={lines}
                    fontFamily={fontFamily}
                    lineStyles={lineStyles}
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
    </div>
  );
}
