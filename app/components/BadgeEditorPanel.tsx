import React from "react";
import { Badge, BadgeLine } from "../types/badge";
import { BADGE_CONSTANTS } from "../constants/badge";
import { BadgeLineEditor } from "./BadgeLineEditor";
import BadgeSvgRenderer from "./BadgeSvgRenderer";
import { autoScaleFontSize } from "../utils/textMeasurement";
import { FONT_COLORS } from "../constants/colors";
import { FONT_FAMILIES } from "../constants/fonts";
import { loadTemplateById } from "../utils/templates";

// Helper functions for normalized font size conversion
function sizeNormToPx(sizeNorm: number, designBoxHeight: number): number {
  return Math.round(sizeNorm * designBoxHeight);
}

function sizePxToNorm(sizePx: number, designBoxHeight: number): number {
  return Math.max(0.05, Math.min(0.5, sizePx / designBoxHeight));
}

function getMinMaxSizeNorm(designBoxHeight: number): {
  min: number;
  max: number;
} {
  return {
    min: sizePxToNorm(BADGE_CONSTANTS.MIN_FONT_SIZE, designBoxHeight),
    max: sizePxToNorm(BADGE_CONSTANTS.MAX_FONT_SIZE, designBoxHeight),
  };
}

// Font Size Control Component - extracted to fix hooks violation
interface FontSizeControlProps {
  line: BadgeLine;
  lineIndex: number;
  designBox: { height: number };
  editable: boolean;
  onLineChange: (index: number, changes: Partial<BadgeLine>) => void;
}

const FontSizeControl: React.FC<FontSizeControlProps> = ({
  line,
  lineIndex,
  designBox,
  editable,
  onLineChange,
}) => {
  // Get current size in pixels for display, prefer sizeNorm if available
  const currentSizePx = line.sizeNorm
    ? sizeNormToPx(line.sizeNorm, designBox.height)
    : (line.fontSize || 13);
  const currentSizeNorm =
    line.sizeNorm ??
    sizePxToNorm(line.fontSize || 13, designBox.height);
  const { min: minSizeNorm, max: maxSizeNorm } =
    getMinMaxSizeNorm(designBox.height);
  const minSizePx = Math.round(minSizeNorm * designBox.height);
  const maxSizePx = Math.round(maxSizeNorm * designBox.height);

  // State for editable input
  const [isEditing, setIsEditing] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(
    currentSizePx.toString()
  );

  // Update input value when current size changes
  React.useEffect(() => {
    if (!isEditing) {
      setInputValue(currentSizePx.toString());
    }
  }, [currentSizePx, isEditing]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputValue(e.target.value);
  };

  const handleInputBlur = () => {
    const numValue = parseInt(inputValue, 10);
    if (!isNaN(numValue) && numValue >= minSizePx && numValue <= maxSizePx) {
      const newSizeNorm = sizePxToNorm(numValue, designBox.height);
      onLineChange(lineIndex, { sizeNorm: newSizeNorm });
    } else {
      // Reset to current value if invalid
      setInputValue(currentSizePx.toString());
    }
    setIsEditing(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      setInputValue(currentSizePx.toString());
      setIsEditing(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="control-button w-6 h-6 flex items-center justify-center text-sm p-0"
        onClick={() => {
          const newSizeNorm = Math.max(
            minSizeNorm,
            currentSizeNorm - 0.01,
          );
          onLineChange(lineIndex, { sizeNorm: newSizeNorm });
        }}
        disabled={
          currentSizeNorm <= minSizeNorm || !editable
        }
      >
        -
      </button>
      {isEditing ? (
        <input
          type="number"
          min={minSizePx}
          max={maxSizePx}
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
          className="w-12 text-center text-sm border border-gray-300 rounded px-1 py-0.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
          disabled={!editable}
        />
      ) : (
        <span
          className="w-12 text-center text-sm cursor-text hover:bg-gray-100 rounded px-1 py-0.5 transition-colors"
          onClick={() => editable && setIsEditing(true)}
          title="Click to edit font size"
        >
          {currentSizePx}
        </span>
      )}
      <button
        type="button"
        className="control-button w-6 h-6 flex items-center justify-center text-sm p-0"
        onClick={() => {
          const newSizeNorm = Math.min(
            maxSizeNorm,
            currentSizeNorm + 0.01,
          );
          onLineChange(lineIndex, { sizeNorm: newSizeNorm });
        }}
        disabled={
          currentSizeNorm >= maxSizeNorm || !editable
        }
      >
        +
      </button>
    </>
  );
};

// Convert hex color to RGB values [r, g, b]
function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.trim().toLowerCase();
  let cleanHex = normalized.startsWith("#") ? normalized.slice(1) : normalized;

  // Handle 3-digit hex
  if (cleanHex.length === 3) {
    cleanHex = cleanHex
      .split("")
      .map((c) => c + c)
      .join("");
  }

  if (cleanHex.length !== 6) {
    return [0, 0, 0]; // Fallback to black
  }

  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);

  return [r, g, b];
}

// Calculate Euclidean distance between two colors in RGB space
function colorDistance(color1: string, color2: string): number {
  const [r1, g1, b1] = hexToRgb(color1);
  const [r2, g2, b2] = hexToRgb(color2);

  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;

  return Math.sqrt(dr * dr + dg * dg + db * db);
}

// Check if two colors are similar (within threshold RGB units)
function areColorsSimilar(
  color1: string,
  color2: string,
  threshold: number = 150,
): boolean {
  return colorDistance(color1, color2) <= threshold;
}

// Check if a color is red (high red component, low green/blue)
function isRedColor(color: string): boolean {
  const [r, g, b] = hexToRgb(color);
  return r > 200 && g < 100 && b < 100;
}

export interface BadgeEditorPanelProps {
  badge: Badge;
  onLineChange: (index: number, changes: Partial<BadgeLine>) => void;
  onAlignmentChange: (index: number, alignment: string) => void;
  onBackgroundColorChange: (color: string) => void;
  onRemoveLine: (index: number) => void;
  showRemove: boolean;
  maxLines: number;
  addLineButton: React.ReactNode;
  resetButton: React.ReactNode;
  multiBadgeButton: React.ReactNode;
  editable?: boolean;
  onOpenTextColorModal?: (lineIndex: number) => void;
  onApplyFormattingToAll?: (lineIndex: number) => void;
  hasMultipleBadges?: boolean;
}

export const BadgeEditorPanel: React.FC<BadgeEditorPanelProps> = ({
  badge,
  onLineChange,
  onAlignmentChange,
  onBackgroundColorChange,
  onRemoveLine,
  showRemove,
  maxLines,
  addLineButton,
  resetButton,
  multiBadgeButton,
  editable = true,
  onOpenTextColorModal,
  onApplyFormattingToAll,
  hasMultipleBadges = false,
}) => {
  // Get the current template's designBox for font size calculations
  const [designBox, setDesignBox] = React.useState({
    x: 0,
    y: 0,
    width: 288,
    height: 96,
  });

  React.useEffect(() => {
    if (badge.templateId) {
      loadTemplateById(badge.templateId).then((template) => {
        setDesignBox(template.designBox);
      });
    }
  }, [badge.templateId]);

  const justifyMap = {
    left: "flex-start",
    center: "center",
    right: "flex-end",
  };
  const align =
    justifyMap[
      (badge.lines[0]?.align || badge.lines[0]?.alignment || "center") as
        | "left"
        | "center"
        | "right"
    ];
  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
      {/* Line formatting boxes */}
      <div className="flex flex-col gap-4">
        {badge.lines.map((line: BadgeLine, idx: number) => (
          <div
            key={idx}
            className="rounded-lg p-4 flex flex-col gap-2 relative w-full min-w-0"
            style={{ backgroundColor: "#d5e0f1" }}
          >
            <div className="flex flex-col w-full gap-2 mb-1">
              <label className="font-semibold text-sm">
                Line {idx + 1} Text
              </label>
              <div className="flex flex-col gap-1 min-w-0 w-full">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">Text Color:</span>
                  {line.color &&
                    areColorsSimilar(line.color, badge.backgroundColor, 70) && (
                      <span className="text-xs text-red-600 font-medium">
                        Similar colors may not show
                      </span>
                    )}
                </div>
                <div className="flex items-start gap-1.5">
                  <div className="flex flex-wrap gap-1.5 items-start flex-1">
                    {[
                      ...FONT_COLORS.filter(
                        (fc) => fc.name !== "Brown" && fc.name !== "Ivory",
                      ),
                      { value: "rainbow", name: "More Colors", ring: "ring-gray-400", isRainbow: true },
                    ].map((fc) => {
                      const isRainbow = (fc as any).isRainbow === true;
                      const isDisabled = !isRainbow && areColorsSimilar(
                        fc.value,
                        badge.backgroundColor,
                        70,
                      );
                      const isRed = !isRainbow && isRedColor(fc.value);
                      return (
                        <div
                          key={fc.value}
                          className="flex flex-col items-center gap-1"
                        >
                          <span className="relative inline-block">
                            <button
                              className={`rounded border-2 transition-colors ${
                                line.color === fc.value && !isDisabled && !isRainbow
                                  ? "ring-2 ring-offset-1 " + fc.ring
                                  : isDisabled && !isRainbow
                                  ? "border-gray-400 opacity-50 cursor-not-allowed"
                                  : "border-gray-300 hover:border-gray-400 cursor-pointer"
                              }`}
                              style={
                                isRainbow
                                  ? {
                                      background:
                                        "linear-gradient(to right, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)",
                                      width: "32px",
                                      height: "32px",
                                      minWidth: "32px",
                                      minHeight: "32px",
                                    }
                                  : {
                                      backgroundColor: fc.value,
                                      width: "32px",
                                      height: "32px",
                                      minWidth: "32px",
                                      minHeight: "32px",
                                    }
                              }
                              onClick={() => {
                                if (isRainbow && onOpenTextColorModal) {
                                  onOpenTextColorModal(idx);
                                } else {
                                  onLineChange(idx, { color: fc.value });
                                }
                              }}
                              disabled={(isDisabled && !isRainbow) || !editable}
                              title={
                                isRainbow
                                  ? "More Colors"
                                  : isDisabled
                                  ? "Cannot match background"
                                  : fc.name
                              }
                            />
                            {isDisabled && !isRainbow && (
                              <span className="pointer-events-none absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
                                <svg className="w-5 h-5" viewBox="0 0 20 20">
                                  <line
                                    x1="3"
                                    y1="3"
                                    x2="17"
                                    y2="17"
                                    stroke={isRed ? "#fbbf24" : "#b91c1c"}
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                  />
                                  <line
                                    x1="17"
                                    y1="3"
                                    x2="3"
                                    y2="17"
                                    stroke={isRed ? "#fbbf24" : "#b91c1c"}
                                    strokeWidth="2.5"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-gray-600 text-center leading-tight">
                            {fc.name === "Brushed Gold" ? (
                              <>
                                Brushed
                                <br />
                                Gold
                              </>
                            ) : fc.name === "Brushed Silver" ? (
                              <>
                                Brushed
                                <br />
                                Silver
                              </>
                            ) : fc.name === "More Colors" ? (
                              <>
                                More
                                <br />
                                Colors
                              </>
                            ) : (
                              fc.name
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {/* Current Color Display - Same size as other buttons, aligned right */}
                  {line.color && (
                    <div className="flex-shrink-0 flex flex-col items-center gap-1">
                      <div
                        className="rounded border-2 border-gray-300"
                        style={{
                          backgroundColor: line.color,
                          width: "32px",
                          height: "32px",
                          minWidth: "32px",
                          minHeight: "32px",
                        }}
                        title={`Current text color: ${line.color}`}
                      />
                      <span className="text-[10px] text-gray-600 text-center leading-tight">
                        Current
                        <br />
                        color
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <input
              type="text"
              className="border rounded px-3 py-2 text-base w-full min-w-[120px]"
              style={{ backgroundColor: "#fff" }}
              value={line.text}
              onChange={(e) => onLineChange(idx, { text: e.target.value })}
              placeholder={`Line ${idx + 1}`}
              disabled={!editable}
            />
            <div className="flex flex-col sm:flex-row gap-2 items-center mt-2 min-w-0">
              <div className="flex flex-wrap gap-2 items-center min-w-0 w-full">
                {/* Font */}
                <div className="flex gap-1 items-center min-w-0">
                  <span className="font-semibold text-sm mr-1">Font:</span>
                  <select
                    className="border rounded px-2 py-1 text-sm"
                    value={line.fontFamily}
                    onChange={(e) =>
                      onLineChange(idx, { fontFamily: e.target.value })
                    }
                    disabled={!editable}
                  >
                    {FONT_FAMILIES.map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Format */}
                <div className="flex gap-1 items-center min-w-0">
                  <span className="font-semibold text-sm mr-1">Format:</span>
                  <button
                    className={`control-button w-7 h-7 flex items-center justify-center transition-all ${
                      line.bold
                        ? "bg-blue-500 text-white border-blue-600 shadow-sm"
                        : "bg-white hover:bg-gray-50 border-gray-300"
                    }`}
                    onClick={() => onLineChange(idx, { bold: !line.bold })}
                    title="Bold"
                    disabled={!editable}
                  >
                    <span className="font-bold text-lg">B</span>
                  </button>
                  <button
                    className={`control-button w-7 h-7 flex items-center justify-center transition-all ${
                      line.italic
                        ? "bg-blue-500 text-white border-blue-600 shadow-sm"
                        : "bg-white hover:bg-gray-50 border-gray-300"
                    }`}
                    onClick={() => onLineChange(idx, { italic: !line.italic })}
                    title="Italic"
                    disabled={!editable}
                  >
                    <span className="italic text-lg">I</span>
                  </button>
                  <button
                    className={`control-button w-7 h-7 flex items-center justify-center transition-all ${
                      line.underline
                        ? "bg-blue-500 text-white border-blue-600 shadow-sm"
                        : "bg-white hover:bg-gray-50 border-gray-300"
                    }`}
                    onClick={() =>
                      onLineChange(idx, { underline: !line.underline })
                    }
                    title="Underline"
                    disabled={!editable}
                  >
                    <span className="underline text-lg">U</span>
                  </button>
                </div>
                {/* Alignment */}
                <div className="flex gap-1 items-center min-w-0">
                  <span className="font-semibold text-sm mr-1">Align:</span>
                  <button
                    className={`control-button w-7 h-7 flex items-center justify-center p-0 transition-all ${
                      (line.align || line.alignment) === "left"
                        ? "bg-blue-500 text-white border-blue-600 shadow-sm"
                        : "bg-white hover:bg-gray-50 border-gray-300"
                    }`}
                    onClick={() => onAlignmentChange(idx, "left")}
                    title="Align Left"
                    disabled={!editable}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        d="M4 6h16M4 12h10M4 18h12"
                      />
                    </svg>
                  </button>
                  <button
                    className={`control-button w-7 h-7 flex items-center justify-center p-0 transition-all ${
                      (line.align || line.alignment) === "center"
                        ? "bg-blue-500 text-white border-blue-600 shadow-sm"
                        : "bg-white hover:bg-gray-50 border-gray-300"
                    }`}
                    onClick={() => onAlignmentChange(idx, "center")}
                    title="Align Center"
                    disabled={!editable}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        d="M4 6h16M8 12h8M6 18h12"
                      />
                    </svg>
                  </button>
                  <button
                    className={`control-button w-7 h-7 flex items-center justify-center p-0 transition-all ${
                      (line.align || line.alignment) === "right"
                        ? "bg-blue-500 text-white border-blue-600 shadow-sm"
                        : "bg-white hover:bg-gray-50 border-gray-300"
                    }`}
                    onClick={() => onAlignmentChange(idx, "right")}
                    title="Align Right"
                    disabled={!editable}
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        d="M4 6h16M12 12h8M4 18h16"
                      />
                    </svg>
                  </button>
                </div>
                {/* Size Controls */}
                <div className="flex gap-1 items-center min-w-0">
                  <span className="font-semibold text-sm mr-1">Size</span>
                  <div className="flex items-center">
                    <FontSizeControl
                      line={line}
                      lineIndex={idx}
                      designBox={designBox}
                      editable={editable}
                      onLineChange={onLineChange}
                    />
                  </div>
                </div>
              </div>
            </div>
            {onApplyFormattingToAll && hasMultipleBadges && (
              <div className="mt-2 w-full">
                <button
                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
                  onClick={() => onApplyFormattingToAll(idx)}
                  disabled={!editable}
                  title={`Apply line ${idx + 1} format to all badges`}
                >
                  Apply line {idx + 1} format to all badges
                </button>
              </div>
            )}
            {showRemove && badge.lines.length > 1 && (
              <button
                className="absolute top-2 right-2 control-button w-5 h-5 flex items-center justify-center bg-red-100 text-red-700 border-red-300 hover:bg-red-200"
                onClick={() => onRemoveLine(idx)}
                disabled={!editable}
                title="Remove line"
              >
                <span style={{ fontSize: 14, color: "#b91c1c" }}>X</span>
              </button>
            )}
          </div>
        ))}
      </div>
      {/* Action buttons if provided */}
      <div className="flex flex-row gap-2 justify-end mt-2">
        {addLineButton}
        {multiBadgeButton}
        {resetButton}
      </div>
    </div>
  );
};
