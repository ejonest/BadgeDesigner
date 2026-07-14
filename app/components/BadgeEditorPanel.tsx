import React from "react";
import { Badge, BadgeLine } from "../types/badge";
import { BADGE_CONSTANTS } from "../constants/badge";
import { BadgeLineEditor } from "./BadgeLineEditor";
import BadgeSvgRenderer from "./BadgeSvgRenderer";
import { autoScaleFontSize } from "../utils/textMeasurement";
import { BADGE_AQB_TEXT_COLORS, FONT_COLORS } from "../constants/colors";
import { FONT_FAMILIES, DEFAULT_FONT } from "../constants/fonts";
import { loadTemplateById } from "../utils/templates";
import { badgeTextColorConflictsWithBackground } from "~/utils/badgeColorContrast";
import {
  getBadgePreviewDesignBox,
  getEffectiveDesignBox,
  getEffectiveSignTextLayoutForBadge,
} from "../utils/renderSvg";
import {
  AQB_LINE_CHAR_LIMIT_MESSAGE,
  aqbBadgeMaxTextWidth,
  aqbLineTextFitsAtPresetPx,
  aqbLineTypography,
  aqbPresetToSizeNorm,
  aqbSizeNormToPx,
  getAqbPresetAvailabilityForLine,
  nearestAqbSizePreset,
  aqbLineTextInputWasTruncated,
  truncateAqbLineTextToFit,
} from "~/utils/aqbBadgeTextSize";
import {
  DESK_SIGN_LINE_CHAR_LIMIT_MESSAGE,
  clampDeskSignLineTextInput,
  deskSignLineFitsAtCurrentSize,
  deskSignMaxTextWidth,
} from "~/utils/deskSignTextSize";
import { SIGN_TEXT_MIN_FONT_PX } from "~/utils/signTextLayout";
import {
  type DesignerVariant,
  getDesignerVariantConfig,
  isSignLikeVariant,
} from "../constants/designerVariants";
import {
  isPlaqueAttachedTemplateId,
  isPlaqueDetachedTemplateId,
} from "~/utils/plaqueRender";
import { plaqueUserLineTextMatchesPlaceholder } from "~/constants/plaqueFormats";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { AqbBadgeSizeSelect } from "./AqbBadgeSizeSelect";

// Helper functions for normalized font size conversion
function sizeNormToPx(sizeNorm: number, designBoxHeight: number): number {
  return Math.round(sizeNorm * designBoxHeight);
}

// Font Size Control Component - extracted to fix hooks violation
interface FontSizeControlProps {
  line: BadgeLine;
  lineIndex: number;
  designBox: { height: number };
  editable: boolean;
  onLineChange: (index: number, changes: Partial<BadgeLine>) => void;
  /** Absolute px bounds for the numeric control (sign: min 14 nominal; badge: 8–72). */
  minFontPx: number;
  maxFontPx: number;
}

const FontSizeControl: React.FC<FontSizeControlProps> = ({
  line,
  lineIndex,
  designBox,
  editable,
  onLineChange,
  minFontPx,
  maxFontPx,
}) => {
  const minSizeNorm = minFontPx / designBox.height;
  const maxSizeNorm = maxFontPx / designBox.height;
  // Get current size in pixels for display, prefer sizeNorm if available
  const currentSizePx = line.sizeNorm
    ? sizeNormToPx(line.sizeNorm, designBox.height)
    : line.fontSize || 13;
  const minSizePx = minFontPx;
  const maxSizePx = maxFontPx;

  // State for editable input
  const [isEditing, setIsEditing] = React.useState(false);
  const [inputValue, setInputValue] = React.useState(currentSizePx.toString());

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
      const newSizeNorm = Math.max(
        minSizeNorm,
        Math.min(maxSizeNorm, numValue / designBox.height),
      );
      onLineChange(lineIndex, { sizeNorm: newSizeNorm });
    } else {
      // Reset to current value if invalid
      setInputValue(currentSizePx.toString());
    }
    setIsEditing(false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
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
          const nextPx = Math.max(minFontPx, currentSizePx - 1);
          onLineChange(lineIndex, {
            sizeNorm: nextPx / designBox.height,
          });
        }}
        disabled={currentSizePx <= minFontPx || !editable}
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
          const nextPx = Math.min(maxFontPx, currentSizePx + 1);
          onLineChange(lineIndex, {
            sizeNorm: nextPx / designBox.height,
          });
        }}
        disabled={currentSizePx >= maxFontPx || !editable}
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

const AQB_BADGE_FONT_OPTIONS = FONT_FAMILIES.map((font) => ({
  value: font.value,
  label: font.label,
}));

function normalizeTextColorHex(hex: string): string {
  const t = hex.trim().toUpperCase();
  return t.startsWith("#") ? t : `#${t}`;
}

function getAqbBadgeLineLabel(idx: number): string {
  if (idx === 0) return "Line 1 — Name / Main text";
  if (idx === 1) return "Line 2 — Role / Title";
  return `Line ${idx + 1}`;
}

function getLineSizePx(
  line: BadgeLine,
  metricsHeight: number,
  minPx: number,
): number {
  if (line.sizeNorm) {
    return aqbSizeNormToPx(line.sizeNorm, metricsHeight);
  }
  return Math.round(line.fontSize ?? minPx);
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
  onResetLineToDefault?: (lineIndex: number) => void;
  /** Pass "sign" in Sign Designer so designBox / font-size math uses sign templates (ids like circle-6x6). */
  variant?: DesignerVariant;
  /** Plaque award format: label per line index (falls back to “Line n”). */
  lineLabels?: (string | undefined)[];
  /** Plaque: slot placeholder per line (HTML placeholder + treat as unset when it matches stored text). */
  linePlaceholders?: (string | undefined)[];
  /** Badge redesign: reference-style text line cards. Desk sign: same shell, auto sizes (no size picker). */
  panelLayout?: "default" | "aqb-badge" | "aqb-desk-sign";
  /** Lines flagged after layout refit (e.g. icon added) truncated text to fit. */
  layoutCharLimitByLine?: Record<number, boolean>;
  /** Acrylic desk signs: laser-engraved text color is fixed — hide color controls. */
  textColorLocked?: boolean;
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
  onResetLineToDefault,
  variant = "badge",
  lineLabels,
  linePlaceholders,
  panelLayout = "default",
  layoutCharLimitByLine,
  textColorLocked = false,
}) => {
  const { labelProductPlural } = getDesignerVariantConfig(variant);
  const allItemsLabel = labelProductPlural.toLowerCase();

  // Get the current template's designBox for font size calculations
  const [designBox, setDesignBox] = React.useState({
    x: 0,
    y: 0,
    width: 288,
    height: 96,
  });
  /** Matches {@link resolveSignTextLayout} designBoxHeight (e.g. attached plaque text band below logo when image on). */
  const [fontMetricsHeight, setFontMetricsHeight] = React.useState(
    designBox.height,
  );
  /** Set when the user tries to type/paste more text than fits at the current size. */
  const [charLimitRejectedByLine, setCharLimitRejectedByLine] = React.useState<
    Record<number, boolean>
  >({});

  const clearCharLimitRejected = (lineIndex: number) => {
    setCharLimitRejectedByLine((prev) => {
      if (!prev[lineIndex]) return prev;
      const next = { ...prev };
      delete next[lineIndex];
      return next;
    });
  };

  const markCharLimitRejected = (lineIndex: number, rejected: boolean) => {
    setCharLimitRejectedByLine((prev) => {
      if (typeof lineIndex !== "number") return prev;
      if (rejected) {
        if (prev[lineIndex]) return prev;
        return { ...prev, [lineIndex]: true };
      }
      if (!prev[lineIndex]) return prev;
      const next = { ...prev };
      delete next[lineIndex];
      return next;
    });
  };

  React.useEffect(() => {
    if (badge.templateId) {
      loadTemplateById(badge.templateId, variant).then((template) => {
        const db =
          variant === "badge"
            ? getBadgePreviewDesignBox(template, badge)
            : getEffectiveDesignBox(template, badge);
        setDesignBox(db);
        const signLay =
          template.signTextLayout &&
          getEffectiveSignTextLayoutForBadge(template, badge);
        setFontMetricsHeight(signLay?.designBoxHeight ?? db.height);
      });
    }
  }, [
    badge.templateId,
    badge.signBorderOptionId,
    badge.signBorderEnabled,
    badge.signBorderStyleId,
    badge.logo?.src,
    badge.lines,
    badge.signLogoLayoutSnapshot,
    badge.backgroundColor,
    badge.badgeIconId,
    variant,
  ]);

  const fontSizeMinPx = isSignLikeVariant(variant)
    ? SIGN_TEXT_MIN_FONT_PX
    : BADGE_CONSTANTS.MIN_FONT_SIZE;
  const fontSizeMaxPx = isSignLikeVariant(variant)
    ? Math.max(fontSizeMinPx, Math.ceil(fontMetricsHeight * 4))
    : BADGE_CONSTANTS.MAX_FONT_SIZE;

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
  const hideAttachedPlaqueFontSize =
    variant === "plaque" &&
    Boolean(badge.templateId && isPlaqueAttachedTemplateId(badge.templateId));

  if (panelLayout === "aqb-badge" || panelLayout === "aqb-desk-sign") {
    const isDeskSignPanel = panelLayout === "aqb-desk-sign";
    const lineInputValue = (line: BadgeLine, idx: number) => {
      const defaultText =
        idx === 0
          ? "Your Name"
          : idx === 1
            ? isDeskSignPanel
              ? "Your Title"
              : "Title"
            : "Line Text";
      const slotPh = linePlaceholders?.[idx];
      const rawTrim = (line.text ?? "").trim();
      const matchesSlotPlaceholder =
        variant === "plaque" &&
        Boolean(slotPh?.trim()) &&
        plaqueUserLineTextMatchesPlaceholder(line.text, slotPh);
      const isEmptyOrDefault =
        !rawTrim || line.text === defaultText || matchesSlotPlaceholder;
      return isEmptyOrDefault ? "" : line.text ?? "";
    };

    const linePlaceholder = (idx: number) => {
      if (idx === 0) return "Enter name or organization...";
      if (idx === 1) return "Enter role or title...";
      const ph = linePlaceholders?.[idx]?.trim();
      return ph || `Insert line ${idx + 1} text here`;
    };

    const fontOptionsForLine = (line: BadgeLine) => {
      const cur = line.fontFamily ?? "";
      const inList = AQB_BADGE_FONT_OPTIONS.some((f) => f.value === cur);
      if (!cur || inList) return [...AQB_BADGE_FONT_OPTIONS];
      return [{ value: cur, label: cur }, ...AQB_BADGE_FONT_OPTIONS];
    };

    return (
      <div className="aqb-badge-text-section w-full">
        {badge.lines.map((line: BadgeLine, idx: number) => {
          const linePx = getLineSizePx(line, fontMetricsHeight, fontSizeMinPx);
          const sizePreset = nearestAqbSizePreset(linePx);
          const lineColor = normalizeTextColorHex(line.color ?? "#000000");
          const presetAvailability = getAqbPresetAvailabilityForLine(
            badge.lines,
            idx,
            designBox,
            badge,
            badge.templateId,
          );
          const displayText = lineInputValue(line, idx);
          const presetPx = sizePreset.px;
          const typography = aqbLineTypography(line);
          const maxTextWidth = isDeskSignPanel
            ? deskSignMaxTextWidth(designBox.width)
            : aqbBadgeMaxTextWidth(designBox, badge, badge.templateId);
          const showCharLimitError = isDeskSignPanel
            ? Boolean(charLimitRejectedByLine[idx]) ||
              Boolean(layoutCharLimitByLine?.[idx]) ||
              (displayText.trim().length > 0 &&
                !deskSignLineFitsAtCurrentSize(
                  line,
                  designBox.height,
                  maxTextWidth,
                ))
            : Boolean(charLimitRejectedByLine[idx]) ||
              Boolean(layoutCharLimitByLine?.[idx]) ||
              (displayText.trim().length > 0 &&
                !aqbLineTextFitsAtPresetPx(
                  displayText,
                  presetPx,
                  typography.fontFamily,
                  typography.bold,
                  typography.italic,
                  maxTextWidth,
                ));

          return (
            <div key={line.id ?? idx} className="aqb-badge-text-line">
              <div className="aqb-badge-tl-header">
                <div className="aqb-badge-tl-label">
                  {lineLabels?.[idx]?.trim() || getAqbBadgeLineLabel(idx)}
                </div>
                <div className="aqb-badge-tl-actions">
                  {onResetLineToDefault && editable ? (
                    <button
                      type="button"
                      className="aqb-badge-tl-action"
                      onClick={() => {
                        clearCharLimitRejected(idx);
                        onResetLineToDefault(idx);
                      }}
                    >
                      <ArrowPathIcon
                        className="h-3.5 w-3.5 shrink-0"
                        aria-hidden
                      />
                      Reset font
                    </button>
                  ) : null}
                  {showRemove && badge.lines.length > 1 ? (
                    <button
                      type="button"
                      className="aqb-badge-tl-action text-red-700"
                      onClick={() => onRemoveLine(idx)}
                      disabled={!editable}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="aqb-badge-text-input-wrap">
                <input
                  type="text"
                  className={`aqb-badge-text-input${
                    showCharLimitError ? " aqb-badge-text-input--at-limit" : ""
                  }`}
                  value={displayText}
                  onChange={(e) => {
                    const attempted = e.target.value;
                    if (isDeskSignPanel) {
                      const { text: fitted, wasTruncated } =
                        clampDeskSignLineTextInput({
                          lines: badge.lines,
                          lineIndex: idx,
                          attemptedText: attempted,
                          designBox,
                        });
                      markCharLimitRejected(idx, wasTruncated);
                      onLineChange(idx, { text: fitted });
                      return;
                    }
                    const fitted = truncateAqbLineTextToFit(
                      attempted,
                      presetPx,
                      typography.fontFamily,
                      typography.bold,
                      typography.italic,
                      maxTextWidth,
                    );
                    markCharLimitRejected(
                      idx,
                      aqbLineTextInputWasTruncated(attempted, fitted),
                    );
                    onLineChange(idx, { text: fitted });
                  }}
                  placeholder={linePlaceholder(idx)}
                  disabled={!editable}
                  aria-invalid={showCharLimitError}
                />
                {showCharLimitError ? (
                  <p
                    className="aqb-badge-text-input-limit-error"
                    role="alert"
                  >
                    {isDeskSignPanel
                      ? DESK_SIGN_LINE_CHAR_LIMIT_MESSAGE
                      : AQB_LINE_CHAR_LIMIT_MESSAGE}
                  </p>
                ) : null}
              </div>

              <div className="aqb-badge-text-row-controls">
                <div className="aqb-badge-trc-group">
                  <div className="aqb-badge-trc-label">Font</div>
                  <select
                    className="aqb-badge-trc-select"
                    value={line.fontFamily ?? DEFAULT_FONT}
                    onChange={(e) => {
                      clearCharLimitRejected(idx);
                      onLineChange(idx, { fontFamily: e.target.value });
                    }}
                    disabled={!editable}
                  >
                    {fontOptionsForLine(line).map((font) => (
                      <option key={font.value} value={font.value}>
                        {font.label}
                      </option>
                    ))}
                  </select>
                </div>
                {!isDeskSignPanel ? (
                  <div className="aqb-badge-trc-group">
                    <div className="aqb-badge-trc-label">Size</div>
                    <AqbBadgeSizeSelect
                      value={sizePreset.label}
                      options={presetAvailability.map(
                        ({ preset, available }) => ({
                          label: preset.label,
                          available,
                        }),
                      )}
                      onChange={(label) => {
                        const entry = presetAvailability.find(
                          (item) => item.preset.label === label,
                        );
                        if (!entry?.available) return;
                        clearCharLimitRejected(idx);
                        onLineChange(idx, {
                          sizeNorm: aqbPresetToSizeNorm(
                            entry.preset.px,
                            fontMetricsHeight,
                          ),
                        });
                      }}
                      disabled={!editable}
                      ariaLabel={`Text size for line ${idx + 1}`}
                    />
                  </div>
                ) : null}
              </div>

              {!textColorLocked ? (
                <>
              <div className="aqb-badge-text-colour-row">
                <span className="aqb-badge-tc-lbl">Color:</span>
                {BADGE_AQB_TEXT_COLORS.map((tc, tcIdx) => {
                  const disabled =
                    badgeTextColorConflictsWithBackground(
                      tc.value,
                      badge.backgroundColor,
                    ) || areColorsSimilar(tc.value, badge.backgroundColor, 70);
                  const selected =
                    lineColor === normalizeTextColorHex(tc.value);
                  return (
                    <button
                      key={`${tc.value}-${tcIdx}`}
                      type="button"
                      className={`aqb-badge-tc-sw ${tc.light ? "light" : ""} ${
                        selected ? "selected" : ""
                      }`}
                      style={{
                        backgroundColor: tc.value,
                        ...(tc.bordered && tc.light
                          ? { borderColor: "#ddd" }
                          : {}),
                      }}
                      title={
                        disabled
                          ? badgeTextColorConflictsWithBackground(
                              tc.value,
                              badge.backgroundColor,
                            )
                            ? "Same as background color"
                            : "May not show on this background"
                          : tc.value
                      }
                      disabled={disabled || !editable}
                      onClick={() => onLineChange(idx, { color: tc.value })}
                    />
                  );
                })}
                {onOpenTextColorModal ? (
                  <button
                    type="button"
                    className="aqb-badge-tl-action ml-1"
                    onClick={() => onOpenTextColorModal(idx)}
                    disabled={!editable}
                  >
                    More
                  </button>
                ) : null}
              </div>

              {line.color &&
              (badgeTextColorConflictsWithBackground(
                line.color,
                badge.backgroundColor,
              ) ||
                areColorsSimilar(line.color, badge.backgroundColor, 70)) ? (
                <p className="mt-1.5 text-[10px] font-medium text-red-600">
                  {badgeTextColorConflictsWithBackground(
                    line.color,
                    badge.backgroundColor,
                  )
                    ? "Text color matches the background and will not be visible."
                    : "Similar colors may not show well on this background."}
                </p>
              ) : null}
                </>
              ) : isDeskSignPanel ? (
                <p className="mt-1 text-xs text-[#6b7f92]">
                  Text color is fixed — acrylic is laser-engraved.
                </p>
              ) : null}

              {onApplyFormattingToAll && hasMultipleBadges ? (
                <button
                  type="button"
                  className="aqb-badge-tl-action mt-2"
                  onClick={() => onApplyFormattingToAll(idx)}
                  disabled={!editable}
                >
                  Apply line {idx + 1} format to all {allItemsLabel}
                </button>
              ) : null}
            </div>
          );
        })}
        {addLineButton}
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto flex flex-col gap-4">
      {/* Line formatting boxes */}
      <div className="flex flex-col gap-4">
        {badge.lines.map((line: BadgeLine, idx: number) => {
          const signLogoCeilPx =
            isSignLikeVariant(variant) &&
            badge.logo?.src?.trim() &&
            (variant !== "plaque" ||
              Boolean(
                badge.templateId &&
                  isPlaqueDetachedTemplateId(badge.templateId),
              ))
              ? badge.signLogoLayoutSnapshot?.textPxCeilingByLine?.[idx] ??
                badge.signLogoLayoutSnapshot?.textPxByLine?.[idx]
              : undefined;
          const maxFontPxForLine =
            signLogoCeilPx !== undefined
              ? Math.min(fontSizeMaxPx, signLogoCeilPx)
              : fontSizeMaxPx;
          const linePxRounded = line.sizeNorm
            ? sizeNormToPx(line.sizeNorm, fontMetricsHeight)
            : Math.round(line.fontSize ?? fontSizeMinPx);
          const showSignLogoCeilingHint =
            signLogoCeilPx !== undefined && linePxRounded >= signLogoCeilPx;

          return (
            <div
              key={idx}
              className="rounded-lg p-4 flex flex-col gap-2 relative w-full min-w-0"
              style={{ backgroundColor: "#d5e0f1" }}
            >
              <div className="flex flex-col w-full gap-2 mb-1">
                <label className="font-semibold text-sm">
                  {(lineLabels?.[idx] ?? `Line ${idx + 1}`).trim()} Text
                </label>
                <div className="flex flex-col gap-1 min-w-0 w-full">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">Text Color:</span>
                    {line.color &&
                      areColorsSimilar(
                        line.color,
                        badge.backgroundColor,
                        70,
                      ) && (
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
                        {
                          value: "rainbow",
                          name: "More Colors",
                          ring: "ring-gray-400",
                          isRainbow: true,
                        },
                      ].map((fc) => {
                        const isRainbow = (fc as any).isRainbow === true;
                        const isDisabled =
                          !isRainbow &&
                          (badgeTextColorConflictsWithBackground(
                            fc.value,
                            badge.backgroundColor,
                          ) ||
                            areColorsSimilar(
                              fc.value,
                              badge.backgroundColor,
                              70,
                            ));
                        const isRed = !isRainbow && isRedColor(fc.value);
                        return (
                          <div
                            key={fc.value}
                            className="flex flex-col items-center gap-1"
                          >
                            <span className="relative inline-block">
                              <button
                                className={`rounded border-2 transition-colors ${
                                  line.color === fc.value &&
                                  !isDisabled &&
                                  !isRainbow
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
                                disabled={
                                  (isDisabled && !isRainbow) || !editable
                                }
                                title={
                                  isRainbow
                                    ? "More Colors"
                                    : isDisabled
                                    ? badgeTextColorConflictsWithBackground(
                                        fc.value,
                                        badge.backgroundColor,
                                      )
                                      ? "Same as background color"
                                      : "Cannot match background"
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
                            <span className="text-[8px] text-gray-600 text-center leading-tight">
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
                        <span className="text-[8px] text-gray-600 text-center leading-tight">
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
                value={(() => {
                  const defaultText =
                    idx === 0 ? "Your Name" : idx === 1 ? "Title" : "Line Text";
                  const slotPh = linePlaceholders?.[idx];
                  const rawTrim = (line.text ?? "").trim();
                  const matchesSlotPlaceholder =
                    variant === "plaque" &&
                    Boolean(slotPh?.trim()) &&
                    plaqueUserLineTextMatchesPlaceholder(line.text, slotPh);
                  const isEmptyOrDefault =
                    !rawTrim ||
                    line.text === defaultText ||
                    matchesSlotPlaceholder;
                  return isEmptyOrDefault ? "" : line.text ?? "";
                })()}
                onChange={(e) => onLineChange(idx, { text: e.target.value })}
                placeholder={(() => {
                  if (variant === "plaque") {
                    if (idx === 0) return "Your Name";
                    if (idx === 1) return "Title";
                  }
                  const ph = linePlaceholders?.[idx];
                  const t = ph?.trim();
                  return t ? t : `Insert line ${idx + 1} text here`;
                })()}
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
                      onClick={() =>
                        onLineChange(idx, { italic: !line.italic })
                      }
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
                  {/* Align + Size on one row; ceiling hint below (reserved height so hint toggle doesn't jump) */}
                  <div className="flex flex-col gap-0 min-w-0 w-full">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-w-0">
                      <div className="flex gap-1 items-center min-w-0 shrink-0">
                        <span className="font-semibold text-sm mr-1">
                          Align:
                        </span>
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
                      {!hideAttachedPlaqueFontSize ? (
                        <div className="flex gap-1 items-center min-w-0">
                          <span className="font-semibold text-sm mr-1">
                            Size
                          </span>
                          <div className="flex items-center">
                            <FontSizeControl
                              line={line}
                              lineIndex={idx}
                              designBox={{
                                ...designBox,
                                height: fontMetricsHeight,
                              }}
                              editable={editable}
                              onLineChange={onLineChange}
                              minFontPx={fontSizeMinPx}
                              maxFontPx={maxFontPxForLine}
                            />
                          </div>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-600 leading-snug max-w-[14rem]">
                          Type size is fixed for attached plaques.
                        </p>
                      )}
                    </div>
                    {signLogoCeilPx !== undefined ? (
                      <p
                        className={`text-xs text-gray-600 leading-snug max-w-full mt-1 min-h-[2.75rem] ${
                          showSignLogoCeilingHint ? "" : "invisible"
                        }`}
                        aria-hidden={!showSignLogoCeilingHint}
                      >
                        Max text size while this image is placed. Remove the
                        image to use larger type.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
              {onApplyFormattingToAll && hasMultipleBadges && (
                <div className="mt-2 w-full">
                  <button
                    className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
                    onClick={() => onApplyFormattingToAll(idx)}
                    disabled={!editable}
                    title={`Apply line ${
                      idx + 1
                    } format to all ${allItemsLabel}`}
                  >
                    Apply line {idx + 1} format to all {allItemsLabel}
                  </button>
                </div>
              )}
              <div className="absolute top-2 right-2 flex items-center gap-1">
                {onResetLineToDefault && editable && (
                  <button
                    type="button"
                    className="control-button flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200 rounded"
                    onClick={() => onResetLineToDefault(idx)}
                    title="Reset line to default font"
                  >
                    <ArrowPathIcon className="w-4 h-4 shrink-0" />
                    <span>Reset default font</span>
                  </button>
                )}
                {showRemove && badge.lines.length > 1 && (
                  <button
                    className="control-button w-5 h-5 flex items-center justify-center bg-red-100 text-red-700 border-red-300 hover:bg-red-200 rounded"
                    onClick={() => onRemoveLine(idx)}
                    disabled={!editable}
                    title="Remove line"
                  >
                    <span style={{ fontSize: 14, color: "#b91c1c" }}>X</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Action buttons if provided */}
      <div className="flex flex-row gap-2 justify-end">
        {addLineButton}
        {multiBadgeButton}
        {resetButton}
      </div>
    </div>
  );
};
