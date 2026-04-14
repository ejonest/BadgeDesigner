// app/components/BadgeDesigner.tsx
import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
} from "react";
import { ArrowPathIcon } from "@heroicons/react/24/solid";
import {
  ArrowPathIcon as ArrowPathIconOutline,
  Bars3Icon,
  Bars3BottomLeftIcon,
  Bars3BottomRightIcon,
  DocumentTextIcon,
  DocumentDuplicateIcon,
  DocumentIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowsRightLeftIcon,
  XMarkIcon,
  PencilIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  Squares2X2Icon,
  Square2StackIcon,
  SquaresPlusIcon,
  ArrowPathRoundedSquareIcon,
  CheckCircleIcon,
  CheckIcon,
  QuestionMarkCircleIcon,
  ArrowUturnLeftIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";

import {
  generatePDFWithLayoutEngine as generatePDF,
  generatePDFAsBlob,
} from "../utils/pdfGenerator";
import { BadgeEditPanel } from "./BadgeEditPanel";
import { BadgeEditorPanel } from "./BadgeEditorPanel";

import { BadgeLine, Badge, UndoAction } from "../types/badge";
import {
  BACKGROUND_COLORS,
  FONT_COLORS,
  EXTENDED_BACKGROUND_COLORS,
  SMART_PALETTE_COLORS,
} from "../constants/colors";
import { BADGE_CONSTANTS } from "../constants/badge";
import {
  type DesignerVariant,
  getDesignerVariantConfig,
  SIGN_TEMPLATE_TYPES,
  ALL_SIGN_TEMPLATE_TYPES,
  signTemplateTypeShowsBorderStep,
  findSignTypeAndSizeForUniversalTemplate,
  getSignTemplateUiContentScale,
} from "../constants/designerVariants";
import {
  buildPaddedInitialLines,
  getAddMultipleDesignerCopy,
} from "../constants/signDesignerText";
import {
  generateFullBadgeImage,
  generateThumbnailFromFullImage,
} from "../utils/badgeThumbnail";
import { getCurrentShop, type ShopAuthData } from "../utils/shopAuth";
import { createApi } from "../utils/api";
import { getDesignerApiPaths, getDesignerConfig } from "../config/designers";
import type { ShopifyProductJs } from "~/utils/signShopifyCatalog";
import {
  isShopifyProductJsPayload,
  resolveSignVariantIdAndPrice,
} from "~/utils/signShopifyCatalog";
import {
  effectiveSignTemplateIdForBadge,
  getSignShopifyShapeSizeForTemplateId,
} from "~/utils/signTemplateShopifyOptions";

import {
  loadTemplates,
  loadTemplateById,
  getTemplateConfigsForVariant,
} from "../utils/templates";
import type { LoadedTemplate } from "../utils/templates";
import {
  renderBadgeToSvgString,
  getEffectiveDesignBox,
} from "../utils/renderSvg";
import {
  syncSignBadgeLinesSizeNorm,
  syncSignBadgeLinesSizeNormAfterLineReset,
} from "~/utils/signTextLayout";
import {
  getSignBorderStepChipOptions,
  SIGN_BORDER_OPTION_NONE,
  signTemplateBorderFamilyKey,
} from "../data/signBorderTrims";
import {
  validateBadgeTemplate,
  validateBadgeData,
} from "../utils/badgeValidator";
import {
  migrateLegacyDesignerUniversalTemplateId,
  migrateLegacyDesignerTemplateIdsOnBadges,
  migrateLegacyDesignerTemplateId,
} from "../utils/designerTemplateMigration";
import {
  DESIGNER_MOTIF_UI_OPTIONS,
  designerMotifPreviewSvgMarkup,
} from "../data/designerMotifs";
import {
  migrateBadgeToTemplate,
  checkTemplateCompatibility,
  migrateLegacyBadge,
  migrateBadgeArray,
} from "../utils/badgeMigration";
import BadgeSvgRenderer from "./BadgeSvgRenderer";
import {
  downloadSVG,
  downloadPNG,
  downloadCDR,
  downloadTIFF,
  downloadMultipleSVGs,
  downloadMultiplePNGs,
  downloadMultipleCDRs,
  downloadMultipleTIFFs,
  generateSVGAsBlob,
} from "../utils/export";

const INITIAL_BADGE = BADGE_CONSTANTS.INITIAL_BADGE;

/** Sign picker thumbnails: scale sparse plate art; `vector-effect` in data-URL SVG-as-img is unreliable for some templates. */
function signTemplatePickerImgStyle(
  templateId: string,
  forSignVariant: boolean,
): React.CSSProperties {
  const base: React.CSSProperties = {
    maxWidth: "100%",
    maxHeight: "100%",
    width: "auto",
    height: "auto",
    objectFit: "contain",
  };
  if (!forSignVariant) return base;
  const scale = getSignTemplateUiContentScale(templateId);
  if (scale === 1) return base;
  return {
    ...base,
    transform: `scale(${scale})`,
    transformOrigin: "center center",
  };
}

interface BadgeDesignerProps {
  variant?: DesignerVariant;
  productId?: string | null;
  shop?: string | null;
  customerId?: string | null;
  gadgetApiUrl?: string;
  gadgetApiKey?: string;
}

const fontColors = FONT_COLORS;
const badgeWidth = BADGE_CONSTANTS.BADGE_WIDTH;

/** Convert a data URL (e.g. from generateFullBadgeImage) to a Blob for upload. */
function dataURLToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const base64 = parts[1];
  if (!base64) return new Blob();
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** localStorage key prefix and version for badge designer draft cache (reload persistence). */
const BADGE_DESIGNER_CACHE_PREFIX = "badge-designer-draft";
const CACHE_VERSION = 1;

/** Set to true to show the Export Options section (SVG, PNG, TIFF, CDR, PDF, etc.). */
const SHOW_EXPORT_OPTIONS = false;

/** Mobile preview (top of screen): tweak these to adjust the box and badge size. */
const MOBILE_PREVIEW = {
  /** Vertical padding of the surrounding box (rem). Smaller = tighter top/bottom margins. */
  boxMarginYRem: 0.5,
  /** Horizontal padding around the badge (rem, each side). Smaller = larger badge (less space for arrows/margin). */
  badgeMarginXRem: 1.25,
  /** Height of the badge in vh (the "1" in 3:1). Bigger = larger badge. Width is 3× this to keep 3:1. */
  badgeHeightVh: 20,
} as const;

/**
 * Typography for badge + sign designers (template cards and multi-preview label).
 * - `templateNameFontPx`: title bar on each template card (main grid + “more templates” modal).
 * - `nowEditingFontRem`: “Now editing …” above the current preview (desktop, 2+ items).
 */
const DESIGNER_UI_TYPOGRAPHY = {
  templateNameFontPx: 14,
  nowEditingFontRem: 1,
} as const;

/** Payload stored when proof modal is open; used by onProofConfirm to complete add-to-cart. */
interface ProofPendingPayload {
  pdfBlob: Blob;
  designId: string;
  designIdForSupabase: string;
  allBadgesForSupabase: Badge[];
  shopData: ShopAuthData;
  gadgetPromise: Promise<{ id?: string } | undefined>;
  shopifyCustomerIdFromUrl: string | null;
}

// Helper functions for multi-badge exports
const getAllBadges = (multipleBadges: Badge[]): Badge[] => {
  // Ensure all badges have IDs and templateIds
  const ensureBadgeIds = (b: Badge, index: number): Badge => ({
    ...b,
    id: b.id || `badge-${index + 1}`,
    templateId: b.templateId || "rect-1x3",
  });

  return multipleBadges.map((b, i) => ensureBadgeIds(b, i));
};

const getAllTemplates = (
  multipleBadges: Badge[],
  templates: LoadedTemplate[],
): LoadedTemplate[] => {
  // UNIVERSAL TEMPLATE: All badges use the same template
  const universalTemplate = templates[0] || {
    id: "rect-1x3",
    name: "Rectangle 1×3",
    widthIn: 3.0,
    heightIn: 1.0,
    safeInsetPx: 6,
    innerPathSvg:
      '<path d="M25,0 L275,0 A25,25 0 0,1 300,25 L300,75 A25,25 0 0,1 275,100 L25,100 A25,25 0 0,1 0,75 L0,25 A25,25 0 0,1 25,0 Z" fill="#000"/>',
  };

  // Return the same template for all badges
  return Array(multipleBadges.length).fill(universalTemplate);
};
const badgeHeight = BADGE_CONSTANTS.BADGE_HEIGHT;
const MIN_FONT_SIZE = BADGE_CONSTANTS.MIN_FONT_SIZE;
const LINE_HEIGHT_MULTIPLIER = 1.3;

// Function to remap normalized coordinates when template changes
function remapLinesForNewDesignBox(
  lines: BadgeLine[],
  oldDesignBox: { x: number; y: number; width: number; height: number } | null,
  newDesignBox: { x: number; y: number; width: number; height: number },
): BadgeLine[] {
  // If no old design box, keep lines as-is (they should already be normalized)
  if (!oldDesignBox) {
    return lines.map((line) => ({
      ...line,
      // Ensure all lines have normalized coordinates
      xNorm: line.xNorm ?? 0.5,
      yNorm: line.yNorm ?? 0.5,
      sizeNorm: line.sizeNorm ?? 0.15,
    }));
  }

  // Calculate aspect ratio changes
  const oldAspect = oldDesignBox.width / oldDesignBox.height;
  const newAspect = newDesignBox.width / newDesignBox.height;

  return lines.map((line) => {
    // If line already has normalized coordinates, keep them
    if (
      line.xNorm !== undefined &&
      line.yNorm !== undefined &&
      line.sizeNorm !== undefined
    ) {
      return line;
    }

    // Convert legacy absolute coordinates to normalized
    let xNorm = 0.5,
      yNorm = 0.5,
      sizeNorm = 0.15;

    if (line.x !== undefined || line.y !== undefined) {
      // Convert from old absolute coordinates to normalized
      xNorm =
        line.x !== undefined
          ? (line.x - oldDesignBox.x) / oldDesignBox.width
          : 0.5;
      yNorm =
        line.y !== undefined
          ? (line.y - oldDesignBox.y) / oldDesignBox.height
          : 0.5;

      // Clamp to valid range
      xNorm = Math.max(0, Math.min(1, xNorm));
      yNorm = Math.max(0, Math.min(1, yNorm));
    }

    if ((line as any).size !== undefined) {
      // Convert from old absolute font size to normalized
      sizeNorm = (line as any).size / oldDesignBox.height;
      sizeNorm = Math.max(0.05, Math.min(0.5, sizeNorm)); // Clamp to reasonable range
    }

    // Remove legacy coordinates and add normalized ones
    const { x, y, size, ...rest } = line as any;
    return {
      ...rest,
      xNorm,
      yNorm,
      sizeNorm,
    };
  });
}

const PREVIEW_DIM_DPI = 96;

/** CAD-style dimension lines (stretched H): width below preview, height to the right. */
function DesktopPreviewDimensionFrame({
  widthPx,
  heightPx,
  compact = false,
  children,
}: {
  widthPx: number;
  heightPx: number;
  compact?: boolean;
  children: React.ReactNode;
}) {
  const fmtIn = (px: number) => {
    const inches = px / PREVIEW_DIM_DPI;
    const r = Math.round(inches * 100) / 100;
    const s = Number.isInteger(r)
      ? String(r)
      : r.toFixed(2).replace(/\.?0+$/, "");
    return `${s}"`;
  };
  const tick = "bg-gray-600";
  const tw = compact ? "text-xs" : "text-base md:text-base";
  const tickW = compact ? "w-1.5" : "w-2";
  const tickH = compact ? "h-1.5" : "h-2";
  const sideW = compact ? "w-5" : "w-7";

  return (
    <div className="w-full flex flex-col items-stretch min-w-0">
      <div className="flex flex-row items-stretch gap-1 min-w-0">
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          {children}
        </div>
        <div
          className={`flex flex-col items-center justify-between shrink-0 self-stretch ${sideW} ${
            compact ? "py-0.5" : "py-1"
          }`}
          aria-hidden
        >
          <div className={`${tickW} h-px ${tick}`} />
          <div
            className={`flex-1 w-px ${tick} min-h-[28px] relative flex items-center justify-center my-0.5`}
          >
            <span
              className={`absolute ${tw} font-semibold text-gray-700 bg-blue-50/95 px-1.5 py-0.5 rounded border border-gray-300 whitespace-nowrap`}
              style={{ transform: "rotate(-90deg)" }}
            >
              {fmtIn(heightPx)}
            </span>
          </div>
          <div className={`${tickW} h-px ${tick}`} />
        </div>
      </div>
      <div className="flex flex-row items-start gap-1 min-w-0 pt-1">
        <div className="flex-1 flex flex-row items-center min-w-0">
          <div
            className={`flex flex-col items-center ${tickW} shrink-0 justify-center`}
          >
            <div className={`w-px ${tickH} ${tick}`} />
          </div>
          <div
            className={`flex-1 h-px ${tick} relative flex items-center justify-center min-w-[1.5rem]`}
          >
            <span
              className={`absolute ${tw} font-semibold text-gray-700 bg-blue-50/95 px-1.5 py-0.5 rounded border border-gray-300 whitespace-nowrap`}
            >
              {fmtIn(widthPx)}
            </span>
          </div>
          <div
            className={`flex flex-col items-center ${tickW} shrink-0 justify-center`}
          >
            <div className={`w-px ${tickH} ${tick}`} />
          </div>
        </div>
        <div className={`shrink-0 ${sideW}`} aria-hidden />
      </div>
    </div>
  );
}

const BadgeDesigner: React.FC<BadgeDesignerProps> = ({
  variant: variantProp,
  productId: _productId,
  shop: _shop,
  customerId: _customerId,
  gadgetApiUrl,
  gadgetApiKey,
}) => {
  const variant = variantProp ?? "badge";
  const designerId = variant === "sign" ? "sign" : "badge";
  const designerConfig = useMemo(
    () => getDesignerConfig(designerId),
    [designerId],
  );
  const designerApiPaths = useMemo(
    () => getDesignerApiPaths(designerId),
    [designerId],
  );
  const config = getDesignerVariantConfig(variant);
  const maxLines = config.maxLines;
  const addMultipleCopy = getAddMultipleDesignerCopy(variant, maxLines);

  // Color similarity utility functions
  const hexToRgb = (hex: string): [number, number, number] => {
    const normalized = hex.trim().toLowerCase();
    let cleanHex = normalized.startsWith("#")
      ? normalized.slice(1)
      : normalized;

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
  };

  // Calculate Euclidean distance between two colors in RGB space
  const colorDistance = (color1: string, color2: string): number => {
    const [r1, g1, b1] = hexToRgb(color1);
    const [r2, g2, b2] = hexToRgb(color2);

    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;

    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  // Return black or white hex for readable text on the given background
  const getContrastingTextColor = (backgroundColor: string): string => {
    const [r, g, b] = hexToRgb(backgroundColor);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? "#000000" : "#FFFFFF";
  };

  // Check if two colors are similar (within threshold RGB units)
  const areColorsSimilar = (
    color1: string,
    color2: string,
    threshold: number = 150,
  ): boolean => {
    return colorDistance(color1, color2) <= threshold;
  };

  // Check if background color is similar to any existing text line colors
  const checkBackgroundColorSimilarity = (
    newBackgroundColor: string,
  ): boolean => {
    // Normalize the background color to uppercase hex format
    const normalizedBgColor = newBackgroundColor.trim().toUpperCase();
    const normalizedBgColorWithHash = normalizedBgColor.startsWith("#")
      ? normalizedBgColor
      : `#${normalizedBgColor}`;

    const hasSimilarColor = badge.lines.some((line) => {
      if (!line.color) return false;
      // Normalize the text color to uppercase hex format
      const normalizedTextColor = line.color.trim().toUpperCase();
      const normalizedTextColorWithHash = normalizedTextColor.startsWith("#")
        ? normalizedTextColor
        : `#${normalizedTextColor}`;

      return areColorsSimilar(
        normalizedBgColorWithHash,
        normalizedTextColorWithHash,
        70,
      );
    });

    return hasSimilarColor;
  };

  // Check if current badge has similar colors (for Supabase warning)
  const checkCurrentBadgeColorSimilarity = (): boolean => {
    // Check main badge
    if (badge.backgroundColor) {
      const normalizedBgColor = badge.backgroundColor.trim().toUpperCase();
      const normalizedBgColorWithHash = normalizedBgColor.startsWith("#")
        ? normalizedBgColor
        : `#${normalizedBgColor}`;

      const hasSimilarColor = badge.lines.some((line) => {
        if (!line.color) return false;
        const normalizedTextColor = line.color.trim().toUpperCase();
        const normalizedTextColorWithHash = normalizedTextColor.startsWith("#")
          ? normalizedTextColor
          : `#${normalizedTextColor}`;

        return areColorsSimilar(
          normalizedBgColorWithHash,
          normalizedTextColorWithHash,
          70,
        );
      });

      if (hasSimilarColor) return true;
    }

    // Check multiple badges if they exist
    if (multipleBadges.length > 1) {
      const allBadges = getAllBadges(multipleBadges);
      for (const b of allBadges) {
        if (b.backgroundColor) {
          const normalizedBgColor = b.backgroundColor.trim().toUpperCase();
          const normalizedBgColorWithHash = normalizedBgColor.startsWith("#")
            ? normalizedBgColor
            : `#${normalizedBgColor}`;

          const hasSimilarColor = b.lines.some((line) => {
            if (!line.color) return false;
            const normalizedTextColor = line.color.trim().toUpperCase();
            const normalizedTextColorWithHash = normalizedTextColor.startsWith(
              "#",
            )
              ? normalizedTextColor
              : `#${normalizedTextColor}`;

            return areColorsSimilar(
              normalizedBgColorWithHash,
              normalizedTextColorWithHash,
              70,
            );
          });

          if (hasSimilarColor) return true;
        }
      }
    }

    return false;
  };

  // Helper function to save state to undo history
  const saveToUndoHistory = (
    action: Omit<
      UndoAction,
      "previousBadge" | "previousMultipleBadges" | "previousUniversalTemplateId"
    > & {
      previousBadge?: Badge;
      previousMultipleBadges?: Badge[];
      previousUniversalTemplateId?: string;
    },
  ) => {
    // Skip tracking text content changes - only track formatting
    if (action.type === "line-property" && action.property === "text") {
      return;
    }

    const fullAction: UndoAction = {
      ...action,
      previousBadge: action.previousBadge || JSON.parse(JSON.stringify(badge)),
      previousMultipleBadges:
        action.previousMultipleBadges ||
        JSON.parse(JSON.stringify(multipleBadges)),
      previousUniversalTemplateId:
        action.previousUniversalTemplateId ||
        (action.type === "template" ? universalTemplateId : undefined),
    };

    setUndoHistory((prev) => {
      const newHistory = [...prev, fullAction];
      // Limit history size
      return newHistory.slice(-MAX_UNDO_HISTORY);
    });
  };

  // Helper function to clear undo history
  const clearUndoHistory = () => {
    setUndoHistory([]);
  };

  // Handle undo - restore previous state
  const handleUndo = () => {
    if (undoHistory.length === 0) return;

    // Get the most recent action
    const lastAction = undoHistory[undoHistory.length - 1];

    // If the change was made to a different badge, switch to that badge first
    // Don't undo yet - wait for the next undo press
    if (lastAction.badgeIndex !== selectedBadgeIndex) {
      // Save current badge state before switching
      const validatedBadge = {
        ...badge,
        templateId: universalTemplateId,
        backgroundColor: badge.backgroundColor || "#FFFFFF",
      };

      // Update the badge in multipleBadges array
      const updatedMultipleBadges = [...multipleBadges];
      if (updatedMultipleBadges[selectedBadgeIndex]) {
        updatedMultipleBadges[selectedBadgeIndex] = validatedBadge;
        setMultipleBadges(updatedMultipleBadges);
      }

      // Sync badge1Data for backward compatibility
      if (selectedBadgeIndex === 0) {
        setBadge1Data(validatedBadge);
      }

      // Switch to the badge that was changed (but don't remove from history yet)
      setSelectedBadgeIndex(lastAction.badgeIndex);

      // Load the selected badge from multipleBadges array
      const selectedBadge = updatedMultipleBadges[lastAction.badgeIndex];
      if (selectedBadge) {
        const centeredLines = calculateCenterPositions(selectedBadge.lines);
        setBadge({
          ...selectedBadge,
          lines: centeredLines,
          templateId: universalTemplateId,
        });
      }

      // Don't remove from history - user needs to press undo again to actually undo
      return;
    }

    // We're on the correct badge, so perform the undo
    // Remove it from history
    setUndoHistory((prev) => prev.slice(0, -1));

    // Start with current multipleBadges state
    let updatedMultipleBadges = [...multipleBadges];

    // Restore state based on action type
    switch (lastAction.type) {
      case "line-property": {
        // Restore specific line property
        if (lastAction.lineIndex !== undefined) {
          const previousLine =
            lastAction.previousBadge.lines[lastAction.lineIndex];
          if (previousLine) {
            // Restore only the changed property
            const property = lastAction.property;
            if (property) {
              const restoredValue = (previousLine as any)[property];

              // Directly restore without triggering undo history
              const updatedLines = badge.lines.map((l, i) => {
                if (i === lastAction.lineIndex) {
                  const restored = { ...l, [property]: restoredValue };
                  // If restoring alignment, also update xNorm for center alignment
                  if (property === "align" && restoredValue === "center") {
                    restored.xNorm = 0.5;
                  }
                  return restored;
                }
                return l;
              });

              // Recalculate center positions (like updateLine does)
              const centeredLines = calculateCenterPositions(updatedLines);

              setBadge((prev) => ({ ...prev, lines: centeredLines }));

              // Update the badge in multipleBadges array (use the updated reference)
              if (updatedMultipleBadges[lastAction.badgeIndex]) {
                updatedMultipleBadges[lastAction.badgeIndex] = {
                  ...updatedMultipleBadges[lastAction.badgeIndex],
                  lines: centeredLines,
                };
                setMultipleBadges(updatedMultipleBadges);
              }

              // Sync badge1Data if editing the first badge
              if (lastAction.badgeIndex === 0) {
                setBadge1Data(updatedMultipleBadges[0]);
              }
            }
          }
        }
        break;
      }
      case "background-color": {
        // Restore background color and line colors (e.g. when contrast update changed text colors)
        const previousBadge = lastAction.previousBadge;
        const centeredLines = calculateCenterPositions(previousBadge.lines);
        setBadge((prev) => ({
          ...prev,
          backgroundColor: previousBadge.backgroundColor,
          lines: centeredLines,
        }));

        if (updatedMultipleBadges[lastAction.badgeIndex]) {
          updatedMultipleBadges[lastAction.badgeIndex] = {
            ...updatedMultipleBadges[lastAction.badgeIndex],
            backgroundColor: previousBadge.backgroundColor,
            lines: previousBadge.lines,
          };
          setMultipleBadges(updatedMultipleBadges);
        }

        if (lastAction.badgeIndex === 0) {
          setBadge1Data(updatedMultipleBadges[0]);
        }
        break;
      }
      case "template": {
        // Restore template - use the saved previousUniversalTemplateId
        const previousBadge = lastAction.previousBadge;
        const previousTemplateId =
          lastAction.previousUniversalTemplateId ||
          previousBadge.templateId ||
          universalTemplateId;

        // Restore badge state
        setBadge((prev) => ({
          ...prev,
          templateId: previousTemplateId,
          lines: previousBadge.lines,
        }));

        // Update the badge in multipleBadges array (use the updated reference)
        if (updatedMultipleBadges[lastAction.badgeIndex]) {
          updatedMultipleBadges[lastAction.badgeIndex] = {
            ...updatedMultipleBadges[lastAction.badgeIndex],
            templateId: previousTemplateId,
            lines: previousBadge.lines,
          };
          setMultipleBadges(updatedMultipleBadges);
        }

        // Restore universal template ID (this is the key fix)
        if (lastAction.previousUniversalTemplateId) {
          setUniversalTemplateId(lastAction.previousUniversalTemplateId);
        }

        if (
          variant === "sign" &&
          config.hasSizeStep &&
          lastAction.previousUniversalTemplateId
        ) {
          const eff = migrateLegacyDesignerUniversalTemplateId(
            lastAction.previousUniversalTemplateId,
          );
          const m = findSignTypeAndSizeForUniversalTemplate(eff);
          if (m) {
            setSelectedSignTemplateType(m.typeId);
            setSelectedSignSizeTemplateId(m.sizeTemplateId);
          }
        }

        // Sync badge1Data if editing the first badge
        if (lastAction.badgeIndex === 0) {
          setBadge1Data(updatedMultipleBadges[0]);
        }
        break;
      }
      case "apply-all-formatting": {
        // Restore all badges to previous state
        if (lastAction.previousMultipleBadges) {
          setMultipleBadges(lastAction.previousMultipleBadges);

          // Restore current badge (use the badge index from the action, which may have been switched)
          const targetBadgeIndex = lastAction.badgeIndex;
          if (lastAction.previousMultipleBadges[targetBadgeIndex]) {
            const restoredBadge =
              lastAction.previousMultipleBadges[targetBadgeIndex];
            const centeredLines = calculateCenterPositions(restoredBadge.lines);
            setBadge({
              ...restoredBadge,
              lines: centeredLines,
              templateId: universalTemplateId,
            });
          }

          // Sync badge1Data
          if (lastAction.previousMultipleBadges[0]) {
            setBadge1Data(lastAction.previousMultipleBadges[0]);
          }
        }
        break;
      }
      case "apply-line-formatting": {
        // Restore all badges' specific line formatting (except the parent badge that was the source)
        if (
          lastAction.previousMultipleBadges &&
          lastAction.lineIndex !== undefined
        ) {
          const restoredBadges = lastAction.previousMultipleBadges.map(
            (prevBadge, badgeIdx) => {
              // Skip the parent badge (the one that was the source of the apply all operation)
              if (badgeIdx === lastAction.badgeIndex) {
                return (
                  updatedMultipleBadges[badgeIdx] || multipleBadges[badgeIdx]
                ); // Keep current state for parent badge
              }

              const currentBadge =
                updatedMultipleBadges[badgeIdx] || multipleBadges[badgeIdx];
              if (!currentBadge || !prevBadge.lines[lastAction.lineIndex!]) {
                return currentBadge;
              }

              // Restore the specific line's formatting for other badges
              const restoredLine = prevBadge.lines[lastAction.lineIndex!];
              const updatedLines = currentBadge.lines.map((line, lineIdx) => {
                if (lineIdx === lastAction.lineIndex) {
                  return {
                    ...line,
                    color: restoredLine.color,
                    fontFamily: restoredLine.fontFamily,
                    bold: restoredLine.bold,
                    italic: restoredLine.italic,
                    underline: restoredLine.underline,
                    align: restoredLine.align,
                    sizeNorm: restoredLine.sizeNorm,
                    fontSize: restoredLine.fontSize,
                  };
                }
                return line;
              });

              return { ...currentBadge, lines: updatedLines };
            },
          );

          setMultipleBadges(restoredBadges);

          // Don't change the current badge - it should remain as is (the parent)
          // The current badge's line was changed separately and should be undone individually

          // Sync badge1Data
          if (restoredBadges[0]) {
            setBadge1Data(restoredBadges[0]);
          }
        }
        break;
      }
      case "apply-background-color-to-all": {
        // Restore all badges' background colors (except the parent badge that was the source)
        if (lastAction.previousMultipleBadges) {
          const restoredBadges = lastAction.previousMultipleBadges.map(
            (prevBadge, badgeIdx) => {
              // Skip the parent badge (the one that was the source of the apply all operation)
              if (badgeIdx === lastAction.badgeIndex) {
                return (
                  updatedMultipleBadges[badgeIdx] || multipleBadges[badgeIdx]
                ); // Keep current state for parent badge
              }

              const currentBadge =
                updatedMultipleBadges[badgeIdx] || multipleBadges[badgeIdx];
              if (!currentBadge) {
                return currentBadge;
              }

              // Restore the background color for other badges
              return {
                ...currentBadge,
                backgroundColor: prevBadge.backgroundColor,
              };
            },
          );

          setMultipleBadges(restoredBadges);

          // Don't change the current badge - it should remain as is (the parent)
          // The current badge's background color was changed separately and should be undone individually

          // Sync badge1Data
          if (restoredBadges[0]) {
            setBadge1Data(restoredBadges[0]);
          }
        }
        break;
      }
      case "apply-backing-to-all": {
        // Restore all badges' backing types (except the parent badge that was the source)
        if (lastAction.previousMultipleBadges) {
          const restoredBadges = lastAction.previousMultipleBadges.map(
            (prevBadge, badgeIdx) => {
              if (badgeIdx === lastAction.badgeIndex) {
                return (
                  updatedMultipleBadges[badgeIdx] || multipleBadges[badgeIdx]
                );
              }
              const currentBadge =
                updatedMultipleBadges[badgeIdx] || multipleBadges[badgeIdx];
              if (!currentBadge) return currentBadge;
              return {
                ...currentBadge,
                backing: prevBadge.backing,
              };
            },
          );
          setMultipleBadges(restoredBadges);
          if (restoredBadges[0]) {
            setBadge1Data(restoredBadges[0]);
          }
        }
        break;
      }
      case "apply-border-to-all": {
        if (lastAction.previousMultipleBadges) {
          setMultipleBadges(lastAction.previousMultipleBadges);
          const restored =
            lastAction.previousMultipleBadges[lastAction.badgeIndex];
          if (restored) {
            const centeredLines = calculateCenterPositions(restored.lines);
            setBadge({
              ...restored,
              lines: centeredLines,
              templateId: universalTemplateId,
            });
          }
          if (lastAction.previousMultipleBadges[0]) {
            setBadge1Data(lastAction.previousMultipleBadges[0]);
          }
        }
        break;
      }
      case "reset-badge": {
        // Restore the badge to its previous state before reset
        const previousBadge = lastAction.previousBadge;
        const centeredLines = calculateCenterPositions(previousBadge.lines);

        const restoredBadge = {
          ...previousBadge,
          lines: centeredLines,
          templateId: previousBadge.templateId || universalTemplateId,
        };

        setBadge(restoredBadge);

        // Update the badge in multipleBadges array
        if (updatedMultipleBadges[lastAction.badgeIndex]) {
          updatedMultipleBadges[lastAction.badgeIndex] = restoredBadge;
          setMultipleBadges(updatedMultipleBadges);
        }

        // Sync badge1Data if editing the first badge
        if (lastAction.badgeIndex === 0) {
          setBadge1Data(restoredBadge);
        }
        break;
      }
      case "reset-line-formatting": {
        // Restore the badge to its previous state before the line reset
        const previousBadge = lastAction.previousBadge;
        const centeredLines = calculateCenterPositions(previousBadge.lines);

        const restoredBadge = {
          ...previousBadge,
          lines: centeredLines,
          templateId: previousBadge.templateId || universalTemplateId,
        };

        setBadge(restoredBadge);

        if (updatedMultipleBadges[lastAction.badgeIndex]) {
          updatedMultipleBadges[lastAction.badgeIndex] = restoredBadge;
          setMultipleBadges(updatedMultipleBadges);
        }

        if (lastAction.badgeIndex === 0) {
          setBadge1Data(restoredBadge);
        }
        break;
      }
      case "reset-all-badges": {
        // Restore all badges to their previous state before reset
        if (lastAction.previousMultipleBadges) {
          // Restore all badges
          const restoredBadges = lastAction.previousMultipleBadges.map(
            (prevBadge) => {
              const centeredLines = calculateCenterPositions(prevBadge.lines);
              return {
                ...prevBadge,
                lines: centeredLines,
                templateId: prevBadge.templateId || universalTemplateId,
              };
            },
          );

          setMultipleBadges(restoredBadges);

          // Restore current badge
          if (restoredBadges[lastAction.badgeIndex]) {
            setBadge(restoredBadges[lastAction.badgeIndex]);
          }

          // Sync badge1Data
          if (restoredBadges[0]) {
            setBadge1Data(restoredBadges[0]);
          }
        }
        break;
      }
    }
  };

  // Apply background color change (called after user confirms or if no warning needed)
  const applyBackgroundColor = (colorValue: string) => {
    // Save to undo history before making changes
    saveToUndoHistory({
      type: "background-color",
      badgeIndex: selectedBadgeIndex,
    });

    setHasChosenBackgroundColor(true);
    const updatedBadge = {
      ...badge,
      backgroundColor: colorValue,
    };
    console.log(`[COLOR TRACKING] Background color changed to: ${colorValue}`);
    setBadge(updatedBadge);

    // Update the badge in multipleBadges array
    const updatedMultipleBadges = [...multipleBadges];
    if (updatedMultipleBadges[selectedBadgeIndex]) {
      updatedMultipleBadges[selectedBadgeIndex] = updatedBadge;
      setMultipleBadges(updatedMultipleBadges);
    }

    // Sync badge1Data if editing the first badge
    if (selectedBadgeIndex === 0) {
      setBadge1Data(updatedBadge);
    }

    if (!guidedFlowCompletedRef.current) {
      const needBorderStep =
        variant === "sign" &&
        config.hasBorder &&
        signTemplateTypeShowsBorderStep(selectedSignTemplateType);
      if (needBorderStep) {
        setSectionsOpen({
          template: false,
          size: false,
          export: false,
          background: false,
          textLines: false,
          backing: false,
          border: true,
        });
        setSectionsOpened((prev) => ({
          ...prev,
          background: true,
        }));
      } else {
        setSectionsOpen({
          template: false,
          size: false,
          export: false,
          background: false,
          textLines: true,
          backing: false,
          border: false,
        });
        setSectionsOpened((prev) => ({
          ...prev,
          background: true,
          textLines: true,
        }));
      }
      guidedFlowCompletedRef.current = true;
    }
  };

  // Apply background and set any text line whose color is similar to the new background to a contrasting color
  const applyBackgroundColorWithContrastUpdate = (colorValue: string) => {
    saveToUndoHistory({
      type: "background-color",
      badgeIndex: selectedBadgeIndex,
    });

    setHasChosenBackgroundColor(true);
    const contrastingText = getContrastingTextColor(colorValue);
    const SIMILAR_THRESHOLD = 70;
    const normalizedBg = (
      colorValue.trim().startsWith("#")
        ? colorValue.trim()
        : `#${colorValue.trim()}`
    ).toUpperCase();

    const updatedLines = badge.lines.map((line) => {
      if (!line.color) return line;
      const normalizedLine = (
        line.color.trim().startsWith("#")
          ? line.color.trim()
          : `#${line.color.trim()}`
      ).toUpperCase();
      if (areColorsSimilar(normalizedBg, normalizedLine, SIMILAR_THRESHOLD)) {
        return { ...line, color: contrastingText };
      }
      return line;
    });

    const updatedBadge = {
      ...badge,
      backgroundColor: colorValue,
      lines: updatedLines,
    };
    setBadge(updatedBadge);

    const updatedMultipleBadges = [...multipleBadges];
    if (updatedMultipleBadges[selectedBadgeIndex]) {
      updatedMultipleBadges[selectedBadgeIndex] = updatedBadge;
      setMultipleBadges(updatedMultipleBadges);
    }

    if (selectedBadgeIndex === 0) {
      setBadge1Data(updatedBadge);
    }

    if (!guidedFlowCompletedRef.current) {
      const needBorderStep =
        variant === "sign" &&
        config.hasBorder &&
        signTemplateTypeShowsBorderStep(selectedSignTemplateType);
      if (needBorderStep) {
        setSectionsOpen({
          template: false,
          size: false,
          export: false,
          background: false,
          textLines: false,
          backing: false,
          border: true,
        });
        setSectionsOpened((prev) => ({
          ...prev,
          background: true,
        }));
      } else {
        setSectionsOpen({
          template: false,
          size: false,
          export: false,
          background: false,
          textLines: true,
          backing: false,
          border: false,
        });
        setSectionsOpened((prev) => ({
          ...prev,
          background: true,
          textLines: true,
        }));
      }
      guidedFlowCompletedRef.current = true;
    }
  };

  // Apply background color to all badges
  const applyBackgroundColorToAll = () => {
    // Save to undo history before making changes
    saveToUndoHistory({
      type: "apply-background-color-to-all",
      badgeIndex: selectedBadgeIndex,
    });

    const currentBackgroundColor = badge.backgroundColor;

    // Update current badge
    setBadge({ ...badge, backgroundColor: currentBackgroundColor });

    // Update all badges in multipleBadges
    const updatedMultipleBadges = multipleBadges.map((b: Badge) => ({
      ...b,
      backgroundColor: currentBackgroundColor,
    }));
    setMultipleBadges(updatedMultipleBadges);

    // Sync badge1Data with the first badge
    if (updatedMultipleBadges[0]) {
      setBadge1Data(updatedMultipleBadges[0]);
    }

    console.log(
      `[COLOR TRACKING] Background color ${currentBackgroundColor} applied to all badges`,
    );
    runDraftSaveForBadges(updatedMultipleBadges);
  };

  // Apply backing type to all badges
  const applyBackingToAll = () => {
    saveToUndoHistory({
      type: "apply-backing-to-all",
      badgeIndex: selectedBadgeIndex,
    });

    const currentBacking = badge.backing;

    setBadge({ ...badge, backing: currentBacking });

    const updatedMultipleBadges = multipleBadges.map((b: Badge) => ({
      ...b,
      backing: currentBacking,
    }));
    setMultipleBadges(updatedMultipleBadges);

    if (updatedMultipleBadges[0]) {
      setBadge1Data(updatedMultipleBadges[0]);
    }
    runDraftSaveForBadges(updatedMultipleBadges);
  };

  /** Sign designer: copy frame on/off, style, motif, and border color to every badge. */
  const applyBorderToAll = () => {
    if (
      variant !== "sign" ||
      !config.hasBorder ||
      !signTemplateTypeShowsBorderStep(selectedSignTemplateType)
    ) {
      return;
    }
    if (multipleBadges.length <= 1) return;
    saveToUndoHistory({
      type: "apply-border-to-all",
      badgeIndex: selectedBadgeIndex,
    });

    const usePlateOnly =
      badge.signBorderOptionId === undefined ||
      badge.signBorderOptionId === SIGN_BORDER_OPTION_NONE;
    const solidBorderColor = badge.borderColor ?? "#FFFFFF";

    const updatedMultipleBadges = multipleBadges.map((b: Badge) => {
      const nextBorder = usePlateOnly
        ? b.backgroundColor ?? "#FFFFFF"
        : solidBorderColor;
      return {
        ...b,
        borderColor: nextBorder,
        designerMotif: badge.designerMotif ?? b.designerMotif,
        signBorderEnabled: badge.signBorderEnabled,
        signBorderStyleId: badge.signBorderStyleId ?? b.signBorderStyleId,
        signBorderOptionId: badge.signBorderOptionId,
      };
    });
    setMultipleBadges(updatedMultipleBadges);

    const currentIdx = selectedBadgeIndex;
    const updatedCurrent = updatedMultipleBadges[currentIdx];
    if (updatedCurrent) {
      setBadge(updatedCurrent);
    }
    if (updatedMultipleBadges[0]) {
      setBadge1Data(updatedMultipleBadges[0]);
    }
    runDraftSaveForBadges(updatedMultipleBadges);
  };

  // Apply all formatting (background color + all text formatting) from current badge to all badges
  const applyAllFormattingToAll = () => {
    // Save to undo history before making changes
    saveToUndoHistory({
      type: "apply-all-formatting",
      badgeIndex: selectedBadgeIndex,
    });

    const currentBackgroundColor = badge.backgroundColor;
    const currentLines = badge.lines;

    // Update current badge (ensure it's saved)
    setBadge({
      ...badge,
      backgroundColor: currentBackgroundColor,
      lines: currentLines,
    });

    // Sync badge1Data with the first badge after updating

    // Update all badges in multipleBadges
    const updatedMultipleBadges = multipleBadges.map((b: Badge) => {
      // Apply background color
      const updatedBadge = { ...b, backgroundColor: currentBackgroundColor };

      // Apply formatting to all lines (preserve text content)
      const updatedLines = b.lines.map(
        (existingLine: BadgeLine, lineIndex: number) => {
          const sourceLine = currentLines[lineIndex];
          if (!sourceLine) return existingLine; // If source doesn't have this line, keep existing

          // Extract only formatting properties (not text)
          const formatting: Partial<BadgeLine> = {
            color: sourceLine.color,
            fontFamily: sourceLine.fontFamily,
            bold: sourceLine.bold,
            italic: sourceLine.italic,
            underline: sourceLine.underline,
            align: sourceLine.align,
            sizeNorm: sourceLine.sizeNorm,
            fontSize: sourceLine.fontSize,
          };

          return { ...existingLine, ...formatting };
        },
      );

      return { ...updatedBadge, lines: updatedLines };
    });
    setMultipleBadges(updatedMultipleBadges);

    // Sync badge1Data with the first badge
    if (updatedMultipleBadges[0]) {
      setBadge1Data(updatedMultipleBadges[0]);
    }

    console.log(
      `[FORMATTING] All formatting (background color + text formatting) applied to all badges`,
    );
    runDraftSaveForBadges(updatedMultipleBadges);
  };

  const isRedColor = (color: string): boolean => {
    const [r, g, b] = hexToRgb(color);
    return r > 200 && g < 100 && b < 100;
  };

  // API
  const api = createApi(gadgetApiUrl, gadgetApiKey, { designerId });

  // State: start with no badge; user must pick a template first
  const defaultTemplateId =
    config.templatesKey === "sign"
      ? SIGN_TEMPLATE_TYPES[0].sizes[0].templateId
      : "rect-1x3";
  const defaultLineShape = INITIAL_BADGE.lines[0];
  const paddedLines = buildPaddedInitialLines(
    variant,
    config.maxLines,
    INITIAL_BADGE.lines,
    defaultLineShape,
  );
  const initialDefaultBadge: Badge = {
    ...INITIAL_BADGE,
    templateId: defaultTemplateId,
    backing: (INITIAL_BADGE.backing ?? "magnetic") as
      | "pin"
      | "magnetic"
      | "adhesive",
    lines: paddedLines.map((line) => ({ ...line })),
    ...(config.templatesKey === "sign"
      ? {
          signBorderStyleId: "default",
        }
      : {}),
  };
  const [multipleBadges, setMultipleBadges] = useState<Badge[]>([]);
  const [badge, setBadge] = useState<Badge>({
    ...initialDefaultBadge,
    lines: initialDefaultBadge.lines.map((line) => ({ ...line })),
  });
  const [hasChosenBackgroundColor, setHasChosenBackgroundColor] =
    useState(false);
  const [templates, setTemplates] = useState<LoadedTemplate[]>([]);
  /** Data URLs for template picker thumbnails: white background, black trim (consistent across badge/sign). */
  const [templatePreviewDataUrls, setTemplatePreviewDataUrls] = useState<
    Record<string, string>
  >({});
  const [templateLoadError, setTemplateLoadError] = useState<string | null>(
    null,
  );
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0); // Force template refresh
  const [signSize, setSignSize] = useState<string>("medium");
  const [signBorderId, setSignBorderId] = useState<string>("");
  /** Sign only: which template type (Classic framed, Standard, etc.) is selected; null until user picks one. */
  const [selectedSignTemplateType, setSelectedSignTemplateType] = useState<
    string | null
  >(null);
  /** Sign only: which size template id is selected; null until user picks a size in step 2. */
  const [selectedSignSizeTemplateId, setSelectedSignSizeTemplateId] = useState<
    string | null
  >(null);
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [showCsvWarningModal, setShowCsvWarningModal] = useState(false);
  const [pendingCsvAction, setPendingCsvAction] = useState<
    "override" | "add" | null
  >(null);
  const [showBadgeGridModal, setShowBadgeGridModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [templateSortBy, setTemplateSortBy] = useState<
    "popularity" | "size" | "alphabetical"
  >("popularity");
  const [showColorModal, setShowColorModal] = useState(false);
  const [showBorderColorModal, setShowBorderColorModal] = useState(false);
  const [customBorderColorInput, setCustomBorderColorInput] = useState("");
  const [showTextColorModal, setShowTextColorModal] = useState(false);
  const [textColorModalLineIndex, setTextColorModalLineIndex] = useState<
    number | null
  >(null);
  const [customColorInput, setCustomColorInput] = useState("");
  const [customTextColorInput, setCustomTextColorInput] = useState("");
  const [showBackgroundColorWarning, setShowBackgroundColorWarning] =
    useState(false);
  const [pendingBackgroundColor, setPendingBackgroundColor] = useState<
    string | null
  >(null);
  const [showSupabaseColorWarning, setShowSupabaseColorWarning] =
    useState(false);
  // Proof modal: show after generating PDF; user must acknowledge before add-to-cart completes
  const [showProofModal, setShowProofModal] = useState(false);
  const [proofAcknowledged, setProofAcknowledged] = useState(false);
  const [proofAddDuplicates, setProofAddDuplicates] = useState(false);
  const [proofPdfObjectUrl, setProofPdfObjectUrl] = useState<string | null>(
    null,
  );
  // Load previous design (Supabase): when user has a saved set, offer to load it
  const [showLoadPreviousModal, setShowLoadPreviousModal] = useState(false);
  const [savedDesignForLoad, setSavedDesignForLoad] = useState<{
    design_id: string;
    design_data: any;
    updated_at?: string;
    backing_type?: string;
  } | null>(null);
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [csvError, setCsvError] = useState("");
  const [selectedBadgeIndex, setSelectedBadgeIndex] = useState<number>(0); // 0 = first badge (multipleBadges[0]), 1+ = additional badges
  const [badge1Data, setBadge1Data] = useState<Badge | null>(null); // Keep for backward compatibility, synced with multipleBadges[0]
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isGeneratingDesigns, setIsGeneratingDesigns] = useState(false);
  /** Sign: product JSON from Shopify (variant IDs + prices), via `/api/shopify-product`. */
  const [signShopifyProduct, setSignShopifyProduct] =
    useState<ShopifyProductJs | null>(null);
  const [signShopifyCatalogStatus, setSignShopifyCatalogStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const signShopifyProductRef = useRef<ShopifyProductJs | null>(null);
  // Undo history state
  const [undoHistory, setUndoHistory] = useState<UndoAction[]>([]);
  const MAX_UNDO_HISTORY = 50; // Limit undo history to prevent memory issues
  // UNIVERSAL TEMPLATE: Single template for all badges
  const [universalTemplateId, setUniversalTemplateId] =
    useState<string>(defaultTemplateId);
  // Collapsible sections state - only first section (template) open by default
  const [sectionsOpen, setSectionsOpen] = useState({
    template: true,
    size: false,
    export: false,
    background: false,
    textLines: false,
    backing: false,
    border: false,
  });
  // Track which sections have been opened at least once
  const [sectionsOpened, setSectionsOpened] = useState({
    template: false,
    size: false,
    export: false,
    background: false,
    textLines: false,
    backing: false,
    border: false,
  });
  /** True when the selected sign template family has a border trim (Circle/Basic omit the border step). */
  const signBorderStepRequired =
    variant === "sign" &&
    config.hasBorder &&
    signTemplateTypeShowsBorderStep(selectedSignTemplateType);
  /** Sign: framed trim + motif (not "No border" and user has chosen an option). */
  const signBorderFramed =
    badge.signBorderOptionId !== undefined &&
    badge.signBorderOptionId !== SIGN_BORDER_OPTION_NONE;
  /** Sign: border step complete once user picks any option (including No border). */
  const signBorderConfigured =
    !signBorderStepRequired || badge.signBorderOptionId !== undefined;
  /** Step 3 text: line 1 must be customized (non-empty and not placeholder). Extra lines may stay template defaults ("Title", "Line Text") or empty — typical for single-line badges, CSV, and duplicates. */
  const getStep3DefaultText = (lineIndex: number) =>
    lineIndex === 0 ? "Your Name" : lineIndex === 1 ? "Title" : "Line Text";
  const hasStep3TextEntered =
    badge.lines.length > 0 &&
    (() => {
      const t0 = (badge.lines[0]?.text || "").trim();
      return t0 !== "" && t0 !== getStep3DefaultText(0);
    })();
  const stepsComplete =
    multipleBadges.length > 0 &&
    hasChosenBackgroundColor &&
    hasStep3TextEntered &&
    (config.hasBacking ? sectionsOpened.backing : true) &&
    (config.hasSizeStep ? selectedSignSizeTemplateId != null : true) &&
    (signBorderStepRequired ? signBorderConfigured : true);

  /** Returns message like "Please complete steps (1)" or "Please complete steps (1-4)" for step-guard alerts. When opening step N, pass forStep = N so only steps 1..N-1 are required. */
  const getIncompleteStepsMessage = (
    forStep: 2 | 3 | 4 | 5 | 6,
  ): string | null => {
    const incomplete: number[] = [];

    if (config.hasSizeStep) {
      // Sign: 1=template type, 2=size, 3=backgrounds, 4=border (when hasBorder), 5=text
      const st1 = selectedSignTemplateType != null;
      const st2 = selectedSignSizeTemplateId != null;
      const st3 = hasChosenBackgroundColor;
      const st4 = !signBorderStepRequired || signBorderConfigured;
      const st5 = hasStep3TextEntered;
      if (forStep >= 2 && !st1) incomplete.push(1);
      if (forStep >= 3 && !st2) incomplete.push(2);
      if (forStep >= 4 && !st3) incomplete.push(3);
      if (forStep >= 5 && signBorderStepRequired && !signBorderConfigured)
        incomplete.push(4);
      if (forStep >= 6 && !st5) incomplete.push(5);
    } else {
      const s1 = multipleBadges.length > 0;
      const s2 = hasChosenBackgroundColor;
      const s3 = hasStep3TextEntered;
      const s4 = config.hasBacking ? sectionsOpened.backing : true;
      const step1Incomplete = !s1;
      if (forStep >= 2 && step1Incomplete) incomplete.push(1);
      if (forStep >= 3 && !s2) incomplete.push(2);
      if (forStep >= 3 && !s3) incomplete.push(3);
      if (forStep >= 4 && config.hasBacking && !s4) incomplete.push(4);
    }

    if (incomplete.length === 0) return null;
    if (incomplete.length === 1)
      return `Please complete steps (${incomplete[0]})`;
    return `Please complete steps (${incomplete[0]}-${
      incomplete[incomplete.length - 1]
    })`;
  };

  const incompleteStepsForCart = (): 2 | 3 | 4 | 5 | 6 =>
    config.hasSizeStep
      ? signBorderStepRequired
        ? 6
        : 5
      : config.hasBacking
      ? 4
      : 3;

  // Refs for section headers to enable scroll-into-view
  const templateSectionRef = useRef<HTMLButtonElement | null>(null);
  const exportSectionRef = useRef<HTMLButtonElement | null>(null);
  const backgroundSectionRef = useRef<HTMLButtonElement | null>(null);
  const textLinesSectionRef = useRef<HTMLButtonElement | null>(null);
  const backingSectionRef = useRef<HTMLButtonElement | null>(null);
  const borderSectionRef = useRef<HTMLButtonElement | null>(null);

  /** Stable design id for this session; used for incremental draft saves and add-to-cart. */
  const sessionDesignIdRef = useRef<string | null>(null);

  /** Bump to trigger a draft save after section close / apply-to-all / selectBadge (only when stepsComplete). */
  const [draftSaveTrigger, setDraftSaveTrigger] = useState(0);
  /** When set, addToCart waits for this promise so draft rows exist before finalize-draft. */
  const draftSaveInProgressRef = useRef<Promise<void> | null>(null);
  /** Set when proof modal is open; holds data needed to complete add-to-cart on confirm. */
  const proofPendingAddToCartRef = useRef<ProofPendingPayload | null>(null);
  /** Once true, we no longer auto-close/open sections on selection (user has completed first-time guided flow). */
  const guidedFlowCompletedRef = useRef(false);
  /** First template pick auto-opens the next step (sign: size, badge: background); later picks do not move sections. */
  const templateGuidedAutoAdvanceDoneRef = useRef(false);
  /** First sign size pick auto-opens backgrounds; later picks do not move sections. */
  const signSizeGuidedAutoAdvanceDoneRef = useRef(false);
  /** True after we have restored from localStorage cache once (prevents re-restore on later effect runs). */
  const restoredFromCacheRef = useRef(false);
  /** True after we have asked to load previous design this session (don't show modal again until next visit). */
  const loadPreviousAskedRef = useRef(false);
  /** When true, debounced cache save will skip one write (set after add-to-cart success so we don't write old state back). */
  const skipCacheSaveRef = useRef(false);
  const multipleBadgesRef = useRef<Badge[]>(multipleBadges);
  const badgeRef = useRef<Badge>(badge);
  const selectedBadgeIndexRef = useRef<number>(selectedBadgeIndex);
  const universalTemplateIdRef = useRef<string>(universalTemplateId);
  multipleBadgesRef.current = multipleBadges;
  badgeRef.current = badge;
  selectedBadgeIndexRef.current = selectedBadgeIndex;
  universalTemplateIdRef.current = universalTemplateId;
  signShopifyProductRef.current = signShopifyProduct;

  /** Keep `multipleBadges[selectedBadgeIndex]` in sync with live `badge` so duplicate/export/grid never see stale line text. */
  const persistCurrentBadgeToSlot = (next: Badge) => {
    const tid = universalTemplateIdRef.current;
    const idx = selectedBadgeIndexRef.current;
    setMultipleBadges((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      if (copy[idx]) {
        copy[idx] = {
          ...next,
          templateId: tid,
          backgroundColor: next.backgroundColor || "#FFFFFF",
        };
      }
      return copy;
    });
    if (idx === 0) {
      setBadge1Data({
        ...next,
        templateId: tid,
        backgroundColor: next.backgroundColor || "#FFFFFF",
      });
    }
  };

  // Helper function to scroll a section into view within its scrollable container
  const scrollSectionIntoView = (
    element: HTMLElement | null,
    delay: number = 350,
  ) => {
    if (!element) return;

    setTimeout(() => {
      if (!element) return;

      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (!element) return;

        // Find the scrollable parent container
        let scrollableParent = element.parentElement;
        while (scrollableParent) {
          const style = window.getComputedStyle(scrollableParent);
          if (
            style.overflowY === "auto" ||
            style.overflowY === "scroll" ||
            style.overflow === "auto" ||
            style.overflow === "scroll"
          ) {
            break;
          }
          scrollableParent = scrollableParent.parentElement;
        }

        if (scrollableParent) {
          const containerRect = scrollableParent.getBoundingClientRect();
          const elementRect = element.getBoundingClientRect();
          const scrollTop = scrollableParent.scrollTop;
          const elementTop = elementRect.top - containerRect.top + scrollTop;

          scrollableParent.scrollTo({
            top: Math.max(0, elementTop - 20), // 20px offset from top, ensure non-negative
            behavior: "smooth",
          });
        } else {
          // Fallback to standard scrollIntoView
          element.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
        }
      });
    }, delay);
  };

  // Track previous open section to determine scroll direction
  // Initialize with 'template' since that's the default open section
  const prevOpenSectionRef = useRef<string>("template");

  // Scroll to section when it opens
  useEffect(() => {
    if (sectionsOpen.template && templateSectionRef.current) {
      // If we're opening template and a section below was open, wait longer for collapse
      const wasBelowOpen =
        prevOpenSectionRef.current === "export" ||
        prevOpenSectionRef.current === "background" ||
        prevOpenSectionRef.current === "textLines" ||
        prevOpenSectionRef.current === "backing";
      scrollSectionIntoView(
        templateSectionRef.current,
        wasBelowOpen ? 150 : 350,
      );
      prevOpenSectionRef.current = "template";
    }
  }, [sectionsOpen.template]);

  useEffect(() => {
    if (sectionsOpen.export && exportSectionRef.current) {
      // If template was open above, wait longer for collapse
      const wasAboveOpen = prevOpenSectionRef.current === "template";
      scrollSectionIntoView(exportSectionRef.current, wasAboveOpen ? 350 : 150);
      prevOpenSectionRef.current = "export";
    }
  }, [sectionsOpen.export]);

  useEffect(() => {
    if (sectionsOpen.background && backgroundSectionRef.current) {
      // If template or export was open above, wait longer for collapse
      const wasAboveOpen =
        prevOpenSectionRef.current === "template" ||
        prevOpenSectionRef.current === "export";
      scrollSectionIntoView(
        backgroundSectionRef.current,
        wasAboveOpen ? 350 : 150,
      );
      prevOpenSectionRef.current = "background";
    }
  }, [sectionsOpen.background]);

  useEffect(() => {
    if (sectionsOpen.textLines && textLinesSectionRef.current) {
      // If any section above was open, wait longer for collapse (especially template)
      const wasAboveOpen =
        prevOpenSectionRef.current === "template" ||
        prevOpenSectionRef.current === "export" ||
        prevOpenSectionRef.current === "background";
      // Template is the largest, so give it extra time
      const delay =
        prevOpenSectionRef.current === "template"
          ? 400
          : wasAboveOpen
          ? 350
          : 150;
      scrollSectionIntoView(textLinesSectionRef.current, delay);
      prevOpenSectionRef.current = "textLines";
    }
  }, [sectionsOpen.textLines]);

  useEffect(() => {
    if (sectionsOpen.backing && backingSectionRef.current) {
      const wasAboveOpen =
        prevOpenSectionRef.current === "template" ||
        prevOpenSectionRef.current === "export" ||
        prevOpenSectionRef.current === "background" ||
        prevOpenSectionRef.current === "textLines";
      const delay = wasAboveOpen ? 350 : 150;
      scrollSectionIntoView(backingSectionRef.current, delay);
      prevOpenSectionRef.current = "backing";
    }
  }, [sectionsOpen.backing]);

  useEffect(() => {
    if (sectionsOpen.border && borderSectionRef.current) {
      const delay = 150;
      scrollSectionIntoView(borderSectionRef.current, delay);
      prevOpenSectionRef.current = "border";
    }
  }, [sectionsOpen.border]);

  // Load templates - refresh when templateRefreshKey changes
  useEffect(() => {
    setTemplateLoadError(null);
    (async () => {
      try {
        console.log(
          "[BadgeDesigner] Loading templates (variant:",
          config.templatesKey,
          ", refresh key:",
          templateRefreshKey,
          ")",
        );
        const list = await loadTemplates(config.templatesKey);
        setTemplates(list);
        setTemplateLoadError(null);
        console.log(
          "[BadgeDesigner] templates loaded:",
          list.map((t) => t.id),
        );

        // Initialize with first template
        if (list.length > 0) {
          setUniversalTemplateId(list[0].id);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Failed to load templates:", error);
        setTemplateLoadError(message);
      }
    })();
  }, [templateRefreshKey, config.templatesKey]);

  // Build template picker thumbnails: plate + outline only (no trim/motifs). Users add frame, color, and
  // Designer motifs in the border step. Sign viewBoxes are large in px — thicker stroke for small grid cells.
  useEffect(() => {
    if (templates.length === 0) return;
    const previewBadge: Badge = {
      templateId: "",
      backgroundColor: "#FFFFFF",
      borderColor: "#000000",
      signBorderOptionId: SIGN_BORDER_OPTION_NONE,
      signBorderEnabled: false,
      signBorderStyleId: "default",
      lines: [],
      backing: "pin",
    };
    // Sign plate paths use large Corel viewBoxes; stroke width in user units scales to ~1px in the picker.
    // Non-scaling stroke keeps ~constant device pixels so Classic framed / Portrait outlines stay visible.
    const signTemplateThumbRenderOpts = {
      showOutline: true as const,
      outlineStrokeWidth: "1.5",
      outlineNonScalingStroke: true as const,
    };
    const badgeTemplateThumbRenderOpts = {
      showOutline: true as const,
      outlineStrokeWidth: "8",
    };
    const templateThumbRenderOpts =
      config.templatesKey === "sign"
        ? signTemplateThumbRenderOpts
        : badgeTemplateThumbRenderOpts;
    setTemplatePreviewDataUrls((prev) => {
      const next = { ...prev };
      for (const t of templates) {
        try {
          const svg = renderBadgeToSvgString(
            { ...previewBadge, templateId: t.id },
            t,
            templateThumbRenderOpts,
          );
          let dataUrl: string;
          try {
            dataUrl =
              "data:image/svg+xml;base64," +
              btoa(unescape(encodeURIComponent(svg)));
          } catch {
            dataUrl =
              "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
          }
          next[t.id] = dataUrl;
        } catch (e) {
          console.error(
            `[BadgeDesigner] Template thumbnail failed for ${t.id}:`,
            e,
          );
          delete next[t.id];
        }
      }
      return next;
    });
  }, [templates, config.templatesKey]);

  // Restore badge designer state from localStorage cache (once, after templates are loaded)
  useEffect(() => {
    if (templates.length === 0 || restoredFromCacheRef.current) return;
    const cacheKey = `${BADGE_DESIGNER_CACHE_PREFIX}-${_shop ?? "default"}-${
      _productId ?? "default"
    }`;
    const raw = localStorage.getItem(cacheKey);
    if (!raw) return;
    let payload: {
      version?: number;
      multipleBadges?: Badge[];
      universalTemplateId?: string;
      selectedBadgeIndex?: number;
      hasChosenBackgroundColor?: boolean;
      designId?: string | null;
      selectedSignTemplateType?: string | null;
      selectedSignSizeTemplateId?: string | null;
    };
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }
    if (payload.version !== CACHE_VERSION) return;
    if (
      !Array.isArray(payload.multipleBadges) ||
      payload.multipleBadges.length === 0
    )
      return;
    const migratedUniversal = migrateLegacyDesignerUniversalTemplateId(
      payload.universalTemplateId!,
    );
    const migratedBadges = migrateLegacyDesignerTemplateIdsOnBadges(
      payload.multipleBadges,
    );
    if (
      !migratedUniversal ||
      !templates.some((t) => t.id === migratedUniversal)
    )
      return;
    restoredFromCacheRef.current = true;
    const safeIndex = Math.min(
      payload.selectedBadgeIndex ?? 0,
      migratedBadges.length - 1,
    );
    setMultipleBadges(migratedBadges);
    setUniversalTemplateId(migratedUniversal);
    setSelectedBadgeIndex(safeIndex);
    setHasChosenBackgroundColor(payload.hasChosenBackgroundColor ?? false);
    setBadge(migratedBadges[safeIndex] ?? migratedBadges[0]);
    if (payload.designId != null) {
      sessionDesignIdRef.current = payload.designId;
    }
    setBadge1Data(migratedBadges[0] ?? null);
    templateGuidedAutoAdvanceDoneRef.current = true;
    signSizeGuidedAutoAdvanceDoneRef.current = true;
    if (config.templatesKey === "sign") {
      if (
        payload.selectedSignTemplateType !== undefined ||
        payload.selectedSignSizeTemplateId !== undefined
      ) {
        setSelectedSignTemplateType(payload.selectedSignTemplateType ?? null);
        setSelectedSignSizeTemplateId(
          payload.selectedSignSizeTemplateId ?? null,
        );
      } else {
        const m = findSignTypeAndSizeForUniversalTemplate(migratedUniversal);
        if (m) {
          setSelectedSignTemplateType(m.typeId);
          setSelectedSignSizeTemplateId(m.sizeTemplateId);
        }
      }
    }
    // Do not mark steps 3 or 4 as opened; user must open step 4 (and step 3 counts complete only when they have non-default text) in this session
  }, [templates, _shop, _productId, config.templatesKey]);

  // Sign: migrate legacy themed Designer template ids off storage/API.
  useEffect(() => {
    if (variant !== "sign" || templates.length === 0) return;
    const eff = migrateLegacyDesignerUniversalTemplateId(universalTemplateId);
    if (eff === universalTemplateId) return;
    if (!templates.some((t) => t.id === eff)) return;
    setUniversalTemplateId(eff);
    setMultipleBadges((p) => migrateLegacyDesignerTemplateIdsOnBadges(p));
    setBadge((b) => migrateLegacyDesignerTemplateId(b));
  }, [variant, templates, universalTemplateId]);

  // Sign: keep template type aligned with universalTemplateId (preview uses first size as placeholder).
  // Size selection is explicit in Step 2 — do not infer selectedSignSizeTemplateId from universal here.
  useEffect(() => {
    if (variant !== "sign" || multipleBadges.length === 0) return;
    const eff = migrateLegacyDesignerUniversalTemplateId(universalTemplateId);
    const m = findSignTypeAndSizeForUniversalTemplate(eff);
    if (!m) return;
    setSelectedSignTemplateType(m.typeId);
  }, [variant, universalTemplateId, multipleBadges.length]);

  // Fetch saved design for "Load previous?" when user is logged in (customerId + shop)
  useEffect(() => {
    if (!_customerId?.trim() || !_shop?.trim() || loadPreviousAskedRef.current)
      return;
    loadPreviousAskedRef.current = true;
    (async () => {
      try {
        const result = await api.getSavedDesign(_shop, _customerId);
        if (result.saved && result.design?.design_data) {
          setSavedDesignForLoad({
            design_id: result.design.design_id,
            design_data: result.design.design_data,
            updated_at: result.design.updated_at,
            backing_type: result.design.backing_type,
          });
          setShowLoadPreviousModal(true);
        }
      } catch (err) {
        console.warn("[BadgeDesigner] Failed to fetch saved design:", err);
      }
    })();
  }, [_customerId, _shop]);

  // Debounced save of badge designer state to localStorage cache (always run effect so hook count is stable)
  useEffect(() => {
    const cacheKey = `${BADGE_DESIGNER_CACHE_PREFIX}-${_shop ?? "default"}-${
      _productId ?? "default"
    }`;
    const timeoutId = window.setTimeout(() => {
      if (multipleBadges.length === 0) return;
      if (skipCacheSaveRef.current) {
        skipCacheSaveRef.current = false;
        return;
      }
      const payload = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        multipleBadges,
        universalTemplateId,
        selectedBadgeIndex,
        hasChosenBackgroundColor,
        designId: sessionDesignIdRef.current,
        ...(variant === "sign"
          ? {
              selectedSignTemplateType,
              selectedSignSizeTemplateId,
            }
          : {}),
      };
      try {
        localStorage.setItem(cacheKey, JSON.stringify(payload));
      } catch {
        // ignore quota or other storage errors
      }
    }, 600);
    return () => window.clearTimeout(timeoutId);
  }, [
    multipleBadges,
    universalTemplateId,
    selectedBadgeIndex,
    hasChosenBackgroundColor,
    selectedSignTemplateType,
    selectedSignSizeTemplateId,
    variant,
    _shop,
    _productId,
  ]);

  // beforeunload: save current state to cache so last edit before reload is not lost
  useEffect(() => {
    const cacheKey = `${BADGE_DESIGNER_CACHE_PREFIX}-${_shop ?? "default"}-${
      _productId ?? "default"
    }`;
    const handler = () => {
      if (multipleBadges.length === 0) return;
      if (skipCacheSaveRef.current) return;
      const payload = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        multipleBadges,
        universalTemplateId,
        selectedBadgeIndex,
        hasChosenBackgroundColor,
        designId: sessionDesignIdRef.current,
        ...(variant === "sign"
          ? {
              selectedSignTemplateType,
              selectedSignSizeTemplateId,
            }
          : {}),
      };
      try {
        localStorage.setItem(cacheKey, JSON.stringify(payload));
      } catch {
        // ignore quota or other storage errors
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [
    multipleBadges,
    universalTemplateId,
    selectedBadgeIndex,
    hasChosenBackgroundColor,
    selectedSignTemplateType,
    selectedSignSizeTemplateId,
    variant,
    _shop,
    _productId,
  ]);

  // Add keyboard shortcut to refresh templates (Ctrl+R or Cmd+R, but prevent page reload)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+R or Cmd+R to refresh templates
      if ((e.ctrlKey || e.metaKey) && e.key === "r") {
        e.preventDefault();
        console.log("[BadgeDesigner] Refreshing templates...");
        setTemplateRefreshKey((prev) => prev + 1);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-save removed - now handled in selectBadge function to prevent data overwriting

  // Keyboard shortcut for undo: Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+Z (Windows/Linux) or Cmd+Z (Mac)
      const isUndoShortcut =
        (e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey;

      if (isUndoShortcut) {
        // Don't intercept if user is typing in an input field, textarea, or contenteditable element
        const target = e.target as HTMLElement;
        const isInputField =
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable;

        if (!isInputField && undoHistory.length > 0) {
          e.preventDefault();
          handleUndo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [undoHistory.length, handleUndo]); // Re-bind when undo history or handleUndo changes

  // Recalculate initial badge positions when templates load: apply 25/17 default sizes and shrink-to-fit
  useEffect(() => {
    if (templates.length === 0) return;
    setBadge((prevBadge) => {
      if (prevBadge.lines.length === 0) return prevBadge;
      const hasDefaultPositions = prevBadge.lines.every(
        (line) => line.yNorm === 0.5,
      );
      if (!hasDefaultPositions) return prevBadge;

      // Never fall back to templates[0]: JSON order can be a different size (e.g. 10×10) than the selected id (e.g. 4×4),
      // which produced sizeNorm for ~960px height while rendering ~384px → ~9–10px text instead of 25px.
      const matched =
        templates.find((t) => t.id === prevBadge.templateId) ??
        templates.find((t) => t.id === universalTemplateId);
      const designBox = matched
        ? getEffectiveDesignBox(matched, prevBadge)
        : null;
      if (!designBox) {
        return prevBadge;
      }

      const updatedLines = prevBadge.lines.map((line, i) => ({
        ...line,
        sizeNorm: getDefaultSizeNorm(i, designBox.height),
      }));
      const scaledLines = scaleLinesToFit(
        updatedLines,
        designBox,
        matched?.signTextLayout,
      );
      const centeredLines = calculateCenterPositions(scaledLines, designBox);
      return { ...prevBadge, lines: centeredLines };
    });
    // universalTemplateId: resolve the correct LoadedTemplate when prevBadge.templateId is briefly out of sync
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getDefaultSizeNorm/scaleLinesToFit/calculateCenterPositions are stable enough; listing them would retrigger every render
  }, [
    templates.length,
    universalTemplateId,
    badge.signBorderOptionId,
    badge.signBorderStyleId,
  ]);

  // Initialize badge1Data to sync with multipleBadges[0] on mount
  useEffect(() => {
    if (multipleBadges.length > 0 && !badge1Data) {
      const firstBadge = multipleBadges[0];
      const badgeWithColor = {
        ...firstBadge,
        backgroundColor: firstBadge.backgroundColor || "#FFFFFF",
      };
      console.log(
        `[COLOR TRACKING] Initializing badge1Data from multipleBadges[0] with backgroundColor: ${badgeWithColor.backgroundColor}`,
      );
      setBadge1Data(badgeWithColor);
    }
  }, [multipleBadges, badge1Data]);

  // Sync badge1Data with multipleBadges[0] when it changes
  useEffect(() => {
    if (multipleBadges.length > 0) {
      const firstBadge = multipleBadges[0];
      if (!badge1Data || badge1Data.id !== firstBadge.id) {
        setBadge1Data(firstBadge);
      }
    }
  }, [multipleBadges[0]?.id]);

  // Sign: live variant prices + IDs from Shopify product JSON.
  // - Embedded in Shopify: theme fetches /products/{handle}.js in the storefront (works with
  //   storefront password — browser has the session) and postMessages SIGN_DESIGNER_SHOPIFY_PRODUCT.
  // - Standalone / no parent message: /api/shopify-product proxies .js (fails if store is
  //   password-only for anonymous server requests).
  useEffect(() => {
    if (variant !== "sign") {
      setSignShopifyCatalogStatus("idle");
      setSignShopifyProduct(null);
      return;
    }
    let cancelled = false;
    let embeddedErrorTimer: ReturnType<typeof setTimeout> | null = null;
    const clearEmbeddedErrorTimer = () => {
      if (embeddedErrorTimer !== null) {
        clearTimeout(embeddedErrorTimer);
        embeddedErrorTimer = null;
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (cancelled || event.source !== window.parent) return;
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if ((data as { type?: string }).type !== "SIGN_DESIGNER_SHOPIFY_PRODUCT")
        return;
      const payload = (data as { payload?: unknown }).payload;
      if (!isShopifyProductJsPayload(payload)) return;
      clearEmbeddedErrorTimer();
      setSignShopifyProduct(payload);
      setSignShopifyCatalogStatus("ok");
    };
    window.addEventListener("message", onMessage);

    const run = async () => {
      setSignShopifyCatalogStatus("loading");
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const shopRaw =
          (typeof window !== "undefined" &&
            (window as unknown as { SHOPIFY_STORE_URL?: string })
              .SHOPIFY_STORE_URL) ||
          urlParams.get("storeUrl") ||
          urlParams.get("shop") ||
          "";
        const shop = shopRaw
          .trim()
          .toLowerCase()
          .replace(/^https?:\/\//, "")
          .split("/")[0];
        if (!shop) {
          throw new Error(
            "Missing shop (add ?shop= or ?storeUrl= to the embed URL)",
          );
        }
        const handle =
          urlParams.get("signProductHandle")?.trim() ||
          urlParams.get("signHandle")?.trim() ||
          "custom-sign";
        const qs = new URLSearchParams({ shop, handle });
        const res = await fetch(`/api/shopify-product?${qs}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data?.error === "string" ? data.error : `HTTP ${res.status}`,
          );
        }
        if (cancelled) return;
        if (!isShopifyProductJsPayload(data)) {
          throw new Error("Shopify product JSON missing variants (password page or wrong handle?)");
        }
        clearEmbeddedErrorTimer();
        setSignShopifyProduct(data);
        setSignShopifyCatalogStatus("ok");
      } catch (e) {
        if (cancelled) return;
        console.warn(
          "[BadgeDesigner] Shopify product fetch failed:",
          e instanceof Error ? e.message : e,
        );
        const embedded =
          typeof window !== "undefined" && window.parent !== window;
        if (embedded) {
          embeddedErrorTimer = setTimeout(() => {
            if (cancelled || signShopifyProductRef.current) return;
            setSignShopifyCatalogStatus("error");
            setSignShopifyProduct(null);
          }, 12000);
        } else {
          setSignShopifyCatalogStatus("error");
          setSignShopifyProduct(null);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
      clearEmbeddedErrorTimer();
      window.removeEventListener("message", onMessage);
    };
  }, [variant]);

  // Stage 2: Removed problematic auto-sync - saving is now explicit via "Save Changes" button

  // UNIVERSAL TEMPLATE: Get the active template
  const activeTemplate: LoadedTemplate | null = useMemo(() => {
    // Wait for templates to load before trying to find one
    if (templates.length === 0) {
      return null; // Templates not loaded yet
    }

    const template = templates.find((t) => t.id === universalTemplateId);
    if (!template) {
      console.warn(
        "[BadgeDesigner] Universal template not found:",
        universalTemplateId,
        "Available:",
        templates.map((t) => t.id),
      );
      // Fallback to first available template instead of broken fallback object
      return templates[0] || null;
    }
    return template;
  }, [templates, universalTemplateId]);

  const totalPriceAllBadges = useMemo(() => {
    if (multipleBadges.length === 0) return "0.00";
    if (variant !== "sign") {
      const base = 9.99;
      const sum = multipleBadges.reduce((acc, b) => {
        const p =
          b.backing === "magnetic" ? 2 : b.backing === "adhesive" ? 1 : 0;
        return acc + base + p;
      }, 0);
      return sum.toFixed(2);
    }
    if (!signShopifyProduct) return "—";
    let sum = 0;
    let any = false;
    for (const b of multipleBadges) {
      const tid = effectiveSignTemplateIdForBadge(
        b.templateId,
        universalTemplateId,
      );
      const opts = getSignShopifyShapeSizeForTemplateId(tid);
      if (!opts) continue;
      const hit = resolveSignVariantIdAndPrice(
        signShopifyProduct,
        opts.shape,
        opts.size,
      );
      if (hit) {
        sum += hit.price;
        any = true;
      }
    }
    return any ? sum.toFixed(2) : "—";
  }, [multipleBadges, variant, signShopifyProduct, universalTemplateId]);

  const effectiveDesignBox = useMemo(() => {
    if (!activeTemplate) {
      return { x: 0, y: 0, width: 288, height: 96 };
    }
    return getEffectiveDesignBox(activeTemplate, badge);
  }, [
    activeTemplate,
    badge.signBorderOptionId,
    badge.signBorderStyleId,
    badge.templateId,
  ]);

  // Main preview (top): template aspect ratio, always shrink to fit container width so no horizontal scroll.
  const previewBoxStyle = useMemo(() => {
    if (
      variant === "sign" &&
      activeTemplate &&
      activeTemplate.widthPx > 0 &&
      activeTemplate.heightPx > 0
    ) {
      const aspect = activeTemplate.widthPx / activeTemplate.heightPx;
      const maxVh = 50;
      return {
        width: aspect >= 1 ? "50vh" : `${maxVh * aspect}vh`,
        maxWidth: "100%",
        aspectRatio: aspect,
        height: "auto",
      } as React.CSSProperties;
    }
    return {
      width: `${3 * MOBILE_PREVIEW.badgeHeightVh}vh`,
      maxWidth: "100%",
      aspectRatio: 3,
      height: "auto",
    } as React.CSSProperties;
  }, [variant, activeTemplate]);

  // Right-column preview slots: size by template aspect, shrink to fit so no horizontal scroll; never overlap.
  const desktopPreviewSlotStyle = useMemo(() => {
    const aspect =
      activeTemplate &&
      activeTemplate.widthPx > 0 &&
      activeTemplate.heightPx > 0
        ? activeTemplate.widthPx / activeTemplate.heightPx
        : 3;
    return {
      width: "100%",
      maxWidth: "100%",
      maxHeight: "35vh",
      aspectRatio: aspect,
    } as React.CSSProperties;
  }, [activeTemplate]);

  /** Physical size in px for dimension labels (from loaded template). */
  const previewDimensionsForTemplate = useCallback(
    (templateId: string | undefined) => {
      const t =
        (templateId && templates.find((x) => x.id === templateId)) ||
        activeTemplate;
      return {
        widthPx: t?.widthPx ?? 288,
        heightPx: t?.heightPx ?? 96,
      };
    },
    [templates, activeTemplate],
  );

  // Set session design id once when we have badges and template (for incremental draft saves)
  useEffect(() => {
    if (
      activeTemplate &&
      multipleBadges.length > 0 &&
      !sessionDesignIdRef.current
    ) {
      sessionDesignIdRef.current = `design_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 11)}`;
    }
  }, [activeTemplate, multipleBadges.length]);

  const prevSectionsOpenRef = useRef(sectionsOpen);
  useEffect(() => {
    const prev = prevSectionsOpenRef.current;
    const didClose =
      (prev.template && !sectionsOpen.template) ||
      (prev.background && !sectionsOpen.background) ||
      (prev.textLines && !sectionsOpen.textLines) ||
      (prev.backing && !sectionsOpen.backing) ||
      (prev.border && !sectionsOpen.border) ||
      (prev.export && !sectionsOpen.export);
    const didCloseText = prev.textLines && !sectionsOpen.textLines;
    const didOpenExport = !prev.export && sectionsOpen.export;
    prevSectionsOpenRef.current = sectionsOpen;
    if (didClose) setDraftSaveTrigger((t) => t + 1);
    if (didOpenExport && stepsComplete) setDraftSaveTrigger((t) => t + 1);
    // Open Step 4 (backing) when user closes Step 3 (text) and has completed step 3 (entered text) – only for variants with backing
    if (
      config.hasBacking &&
      didCloseText &&
      !sectionsOpened.backing &&
      hasStep3TextEntered
    ) {
      setSectionsOpened((p) => ({ ...p, backing: true }));
      setSectionsOpen({
        template: false,
        size: false,
        export: false,
        background: false,
        textLines: false,
        backing: true,
        border: false,
      });
    }
  }, [
    sectionsOpen,
    sectionsOpened.backing,
    stepsComplete,
    hasStep3TextEntered,
    config.hasBacking,
  ]);

  // Debounced draft save: only when stepsComplete, triggered by draftSaveTrigger (section close / apply-to-all / selectBadge)
  const DRAFT_SAVE_DEBOUNCE_MS = 800;
  const activeTemplateRef = useRef(activeTemplate);
  activeTemplateRef.current = activeTemplate;
  useEffect(() => {
    if (!stepsComplete || !activeTemplateRef.current) return;
    if (!sessionDesignIdRef.current) {
      sessionDesignIdRef.current = `design_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 11)}`;
    }
    const designId = sessionDesignIdRef.current;

    const timer = setTimeout(async () => {
      const multipleBadgesSnap = multipleBadgesRef.current;
      const badgeSnap = badgeRef.current;
      const selectedIdx = selectedBadgeIndexRef.current;
      const universalId = universalTemplateIdRef.current;
      const activeT = activeTemplateRef.current;
      if (!activeT || multipleBadgesSnap.length === 0) return;

      const finalized = [...multipleBadgesSnap];
      if (finalized[selectedIdx]) {
        finalized[selectedIdx] = {
          ...badgeSnap,
          templateId: badgeSnap.templateId || universalId,
          backgroundColor: badgeSnap.backgroundColor || "#FFFFFF",
        };
      }
      const allBadgesForDraft = getAllBadges(finalized);
      if (allBadgesForDraft.length === 0) return;

      try {
        const templateId =
          activeT?.id || allBadgesForDraft[0]?.templateId || "rect-1x3";
        const template = await loadTemplateById(templateId, variant);
        if (!template) {
          console.warn(
            "[BadgeDesigner] Draft save: template not loaded for",
            templateId,
          );
          return;
        }

        const badgePromises = allBadgesForDraft.map((b, i) =>
          Promise.all([
            generateFullBadgeImage(b, variant).then(dataURLToBlob),
            generateSVGAsBlob(b, template),
          ])
            .then(([pngBlob, svgBlob]) => ({
              pngBlob: pngBlob && pngBlob.size > 0 ? pngBlob : new Blob(),
              svgBlob: svgBlob && svgBlob.size > 0 ? svgBlob : new Blob(),
              i,
            }))
            .catch((err) => {
              console.warn(
                "[BadgeDesigner] Draft save: badge",
                i,
                "PNG/SVG failed",
                err,
              );
              return { pngBlob: new Blob(), svgBlob: new Blob(), i };
            }),
        );
        const badgeResults = await Promise.all(badgePromises);
        badgeResults.sort((a, b) => a.i - b.i);
        const thumbnailPngBlobs = badgeResults.map((r) => r.pngBlob);
        const svgBlobs = badgeResults.map((r) => r.svgBlob);

        const designDataForDraft = {
          badge: allBadgesForDraft[0],
          multipleBadges:
            allBadgesForDraft.length > 1 ? allBadgesForDraft.slice(1) : [],
          allBadges: allBadgesForDraft,
          timestamp: new Date().toISOString(),
          shopId: "test-shop",
          productId: _productId || "test-product",
          backgroundColor: allBadgesForDraft[0].backgroundColor,
          backingType: allBadgesForDraft[0].backing,
          textLines: allBadgesForDraft[0].lines,
        };
        const formData = new FormData();
        formData.append("designId", designId);
        formData.append("designData", JSON.stringify(designDataForDraft));
        const shopifyCustomerIdFromUrl =
          typeof window !== "undefined"
            ? new URLSearchParams(window.location.search).get("customerId")
            : null;
        if (shopifyCustomerIdFromUrl)
          formData.append("shopifyCustomerId", shopifyCustomerIdFromUrl);
        thumbnailPngBlobs.forEach((pngBlob, index) => {
          if (pngBlob?.size > 0)
            formData.append(
              `thumbnail_png_${index}`,
              pngBlob,
              `badge-${index}-thumbnail.png`,
            );
        });
        svgBlobs.forEach((svgBlob, index) => {
          if (svgBlob?.size > 0)
            formData.append(
              `svg_${index}`,
              svgBlob,
              `badge-${index}-design.svg`,
            );
        });

        const res = await fetch(designerApiPaths.saveDraft, {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.savedCount)
            console.log(
              "[BadgeDesigner] Draft save OK:",
              designId,
              "badges:",
              data.savedCount,
            );
        } else {
          console.warn(
            "[BadgeDesigner] Draft save failed:",
            res.status,
            await res.text(),
          );
        }
      } catch (err) {
        console.warn("[BadgeDesigner] Draft save error:", err);
      }
    }, DRAFT_SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [
    draftSaveTrigger,
    stepsComplete,
    _productId,
    designerApiPaths.saveDraft,
    variant,
  ]);

  /** Run draft save immediately for the given badges (e.g. after CSV override/add). Shows generating spinner over badges. */
  const runDraftSaveForBadges = useCallback(
    async (allBadges: Badge[]) => {
      if (!allBadges?.length || !activeTemplateRef.current) return;
      if (!sessionDesignIdRef.current) {
        sessionDesignIdRef.current = `design_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 11)}`;
      }
      const designId = sessionDesignIdRef.current;
      const promise = (async () => {
        const activeT = activeTemplateRef.current;
        const normalized = getAllBadges(allBadges);
        if (normalized.length === 0) return;

        setIsGeneratingDesigns(true);
        try {
          const templateId =
            activeT?.id || normalized[0]?.templateId || "rect-1x3";
          const template = await loadTemplateById(templateId, variant);
          if (!template) {
            console.warn(
              "[BadgeDesigner] runDraftSaveForBadges: template not loaded for",
              templateId,
            );
            return;
          }
          const badgePromises = normalized.map((b, i) =>
            Promise.all([
              generateFullBadgeImage(b, variant).then(dataURLToBlob),
              generateSVGAsBlob(b, template),
            ])
              .then(([pngBlob, svgBlob]) => ({
                pngBlob: pngBlob && pngBlob.size > 0 ? pngBlob : new Blob(),
                svgBlob: svgBlob && svgBlob.size > 0 ? svgBlob : new Blob(),
                i,
              }))
              .catch((err) => {
                console.warn(
                  "[BadgeDesigner] runDraftSaveForBadges: badge",
                  i,
                  "PNG/SVG failed",
                  err,
                );
                return { pngBlob: new Blob(), svgBlob: new Blob(), i };
              }),
          );
          const badgeResults = await Promise.all(badgePromises);
          badgeResults.sort((a, b) => a.i - b.i);
          const thumbnailPngBlobs = badgeResults.map((r) => r.pngBlob);
          const svgBlobs = badgeResults.map((r) => r.svgBlob);
          const designDataForDraft = {
            badge: normalized[0],
            multipleBadges: normalized.length > 1 ? normalized.slice(1) : [],
            allBadges: normalized,
            timestamp: new Date().toISOString(),
            shopId: "test-shop",
            productId: _productId || "test-product",
            backgroundColor: normalized[0].backgroundColor,
            backingType: normalized[0].backing,
            textLines: normalized[0].lines,
          };
          const formData = new FormData();
          formData.append("designId", designId);
          formData.append("designData", JSON.stringify(designDataForDraft));
          const shopifyCustomerIdFromUrl =
            typeof window !== "undefined"
              ? new URLSearchParams(window.location.search).get("customerId")
              : null;
          if (shopifyCustomerIdFromUrl)
            formData.append("shopifyCustomerId", shopifyCustomerIdFromUrl);
          thumbnailPngBlobs.forEach((pngBlob, index) => {
            if (pngBlob?.size > 0)
              formData.append(
                `thumbnail_png_${index}`,
                pngBlob,
                `badge-${index}-thumbnail.png`,
              );
          });
          svgBlobs.forEach((svgBlob, index) => {
            if (svgBlob?.size > 0)
              formData.append(
                `svg_${index}`,
                svgBlob,
                `badge-${index}-design.svg`,
              );
          });
          const res = await fetch(designerApiPaths.saveDraft, {
            method: "POST",
            body: formData,
          });
          if (res.ok) {
            const data = await res.json().catch(() => ({}));
            if (data.savedCount)
              console.log(
                "[BadgeDesigner] runDraftSaveForBadges OK:",
                designId,
                "badges:",
                data.savedCount,
              );
          } else {
            console.warn(
              "[BadgeDesigner] runDraftSaveForBadges failed:",
              res.status,
              await res.text(),
            );
          }
        } catch (err) {
          console.warn("[BadgeDesigner] runDraftSaveForBadges error:", err);
        } finally {
          setIsGeneratingDesigns(false);
          draftSaveInProgressRef.current = null;
        }
      })();
      draftSaveInProgressRef.current = promise;
    },
    [_productId, designerApiPaths.saveDraft, variant],
  );

  const touchStartX = React.useRef<number>(0);

  // UNIVERSAL TEMPLATE: No need to recalculate on template change since all badges use same template

  // Measure text width for auto-shrink
  const measureTextWidth = (
    text: string,
    fontSize: number,
    fontFamily: string,
    bold: boolean,
    italic: boolean,
  ) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return 0;
    ctx.font = `${bold ? "bold " : ""}${italic ? "italic " : ""}${fontSize}px ${
      fontFamily || "Arial"
    }`;
    return ctx.measureText(text).width;
  };

  // PRESERVE TEXT SIZES: Only recalculate positions, not sizes
  // Fixed line spacing that doesn't change with font size
  // Optional `designBoxOverride`: use when sizing lines for a template that may not match `activeTemplate` yet (e.g. templates-load effect).
  const calculateCenterPositions = (
    lines: BadgeLine[],
    designBoxOverride?: { height: number; width: number } | null,
  ): BadgeLine[] => {
    const box = designBoxOverride ?? effectiveDesignBox;
    if (!box) return lines;

    const designBoxHeight = box.height;
    const designBoxWidth = box.width;
    const designBoxCenterY = designBoxHeight / 2;

    // Fixed line spacing (in pixels) - doesn't change with font size
    const FIXED_LINE_SPACING = designBoxHeight * 0.07; // 7% of badge height

    // Calculate total height needed: sum of font sizes + fixed spacing between lines
    const totalTextHeight = lines.reduce((sum, line, index) => {
      const fontSize = (line.sizeNorm || 0.15) * designBoxHeight;
      // Add font size for this line
      sum += fontSize;
      // Add spacing after this line (except for last line)
      if (index < lines.length - 1) {
        sum += FIXED_LINE_SPACING;
      }
      return sum;
    }, 0);

    // Calculate starting Y position (center minus half total height)
    const startY = designBoxCenterY - totalTextHeight / 2;

    // Position each line while preserving sizeNorm
    let currentY = startY;
    return lines.map((line, index) => {
      const fontSize = (line.sizeNorm || 0.15) * designBoxHeight;
      // Position text so its baseline is at currentY, then adjust for vertical centering
      // SVG text y position is the baseline, so we add half the font size to center it
      const yPosition = currentY + fontSize / 2;

      // Convert to normalized coordinates
      const yNorm = yPosition / designBoxHeight;

      // Move to next line: current position + font size + fixed spacing
      currentY += fontSize + FIXED_LINE_SPACING;

      return {
        ...line,
        yNorm: Math.max(0.1, Math.min(0.9, yNorm)), // Only update position, preserve sizeNorm
        xNorm: line.xNorm ?? 0.5, // Ensure xNorm exists, default to center
      };
    });
  };

  // Apply formatting from current line to all badges' corresponding lines
  const applyFormattingToAllLines = (lineIndex: number) => {
    // Save to undo history before making changes
    saveToUndoHistory({
      type: "apply-line-formatting",
      badgeIndex: selectedBadgeIndex,
      lineIndex: lineIndex,
    });

    const sourceLine = badge.lines[lineIndex];
    if (!sourceLine) return;

    // Extract only formatting properties (not text): size, alignment, bold, underline, italics, font, and font color
    const formatting: Partial<BadgeLine> = {
      color: sourceLine.color,
      fontFamily: sourceLine.fontFamily,
      bold: sourceLine.bold,
      italic: sourceLine.italic,
      underline: sourceLine.underline,
      align: sourceLine.align,
      sizeNorm: sourceLine.sizeNorm,
      fontSize: sourceLine.fontSize,
    };

    // Update current badge's line
    const currentBadgeLines = badge.lines.map((l, i) =>
      i === lineIndex ? { ...l, ...formatting } : l,
    );
    setBadge({ ...badge, lines: currentBadgeLines });

    // Update all badges in multipleBadges
    const updatedMultipleBadges = multipleBadges.map((b: Badge) => {
      const updatedLines = b.lines.map((l: BadgeLine, i: number) =>
        i === lineIndex ? { ...l, ...formatting } : l,
      );
      return { ...b, lines: updatedLines };
    });
    setMultipleBadges(updatedMultipleBadges);

    // Sync badge1Data with the first badge
    if (updatedMultipleBadges[0]) {
      setBadge1Data(updatedMultipleBadges[0]);
    }
  };

  // Text updates with auto-scaling to fit badge boundaries
  const updateLine = (index: number, changes: Partial<BadgeLine>) => {
    // Save to undo history before making changes (skip text content changes)
    const changedProperty = Object.keys(changes)[0];
    if (changedProperty && changedProperty !== "text") {
      saveToUndoHistory({
        type: "line-property",
        badgeIndex: selectedBadgeIndex,
        lineIndex: index,
        property: changedProperty,
      });
    }

    const designBox = effectiveDesignBox;
    const lineTemplate =
      templates.find((t) => t.id === badge.templateId) ??
      templates.find((t) => t.id === universalTemplateId);
    const signLayout = lineTemplate?.signTextLayout;
    // Account for 0.1" (9.6px) inset on each side for text clipping
    const INSET_INCHES = 0.1;
    const INSET_PX = INSET_INCHES * 96; // 9.6px at 96 DPI
    const maxTextWidthDefault = designBox.width - INSET_PX * 2 - 4;

    const newLines = badge.lines.map((l: BadgeLine, i: number) => {
      if (i !== index) {
        return {
          ...l,
          align:
            l.align === "left" || l.align === "center" || l.align === "right"
              ? l.align
              : "center",
        };
      }

      let updated = { ...l, ...changes };

      // Signs: sizeNorm must match signTextLayout.designBoxHeight (see syncSignBadgeLinesSizeNorm).
      // Per-line shrink here used effectiveDesignBox.height and skipped height/sibling constraints — run full sync below instead.
      const useSignSync =
        variant === "sign" && signLayout && typeof document !== "undefined";
      if (
        !useSignSync &&
        (typeof changes.sizeNorm !== "undefined" ||
          typeof changes.text !== "undefined" ||
          typeof changes.fontFamily !== "undefined" ||
          typeof changes.bold !== "undefined" ||
          typeof changes.italic !== "undefined")
      ) {
        const currentSizeNorm = updated.sizeNorm ?? 0.15;
        const designBoxHeight = designBox.height;
        let fontSize = currentSizeNorm * designBoxHeight;
        const text = updated.text || "";
        const fontFamily = updated.fontFamily || "Arial";
        const bold = updated.bold || false;
        const italic = updated.italic || false;

        const maxTextWidth = maxTextWidthDefault;

        // Measure text width and auto-scale down if it exceeds badge width
        if (text) {
          let textWidth = measureTextWidth(
            text,
            fontSize,
            fontFamily,
            bold,
            italic,
          );
          const minSizeNorm = 0.05; // Minimum 5% of badge height

          // Auto-scale down if text is too wide - constrain to badge boundaries
          while (textWidth > maxTextWidth) {
            fontSize = fontSize * 0.95; // Reduce by 5% each iteration
            const newSizeNorm = fontSize / designBoxHeight;
            if (newSizeNorm <= minSizeNorm) {
              updated.sizeNorm = minSizeNorm;
              break;
            }
            textWidth = measureTextWidth(
              text,
              fontSize,
              fontFamily,
              bold,
              italic,
            );
            updated.sizeNorm = newSizeNorm;
          }
        }
      }

      if (typeof changes.text !== "undefined") {
        // Legacy auto-scaling for text changes (keeping for backward compatibility)
        let fontSize = updated.fontSize || 18;
        let textWidth = measureTextWidth(
          updated.text,
          fontSize,
          updated.fontFamily || "Arial",
          updated.bold || false,
          updated.italic || false,
        );
        while (textWidth > badgeWidth - 24 && fontSize > MIN_FONT_SIZE) {
          fontSize--;
          textWidth = measureTextWidth(
            updated.text,
            fontSize,
            updated.fontFamily || "Arial",
            updated.bold || false,
            updated.italic || false,
          );
        }
        updated.fontSize = fontSize;
      }

      if (typeof updated.align !== "undefined") {
        updated.align =
          updated.align === "left" ||
          updated.align === "center" ||
          updated.align === "right"
            ? updated.align
            : "center";
      } else {
        updated.align = "center";
      }
      return updated;
    });

    const fittedLines =
      variant === "sign" &&
      signLayout &&
      typeof document !== "undefined" &&
      (typeof changes.sizeNorm !== "undefined" ||
        typeof changes.text !== "undefined" ||
        typeof changes.fontFamily !== "undefined" ||
        typeof changes.bold !== "undefined" ||
        typeof changes.italic !== "undefined")
        ? syncSignBadgeLinesSizeNorm(newLines, signLayout)
        : newLines;

    // Apply center-based positioning
    const centeredLines = calculateCenterPositions(fittedLines);

    const nextBadge = { ...badge, lines: centeredLines };
    setBadge(nextBadge);
    persistCurrentBadgeToSlot(nextBadge);
  };

  const addLine = () => {
    if (badge.lines.length < maxLines) {
      // Get the current template's designBox for positioning new lines
      const currentTemplate = templates.find((t) => t.id === badge.templateId);
      const designBox = currentTemplate
        ? getEffectiveDesignBox(currentTemplate, badge)
        : effectiveDesignBox;

      const newLineIndex = badge.lines.length;
      const newSizeNorm = getDefaultSizeNorm(newLineIndex, designBox.height);

      // Add the new line with default size (badge: 17px in box; sign: proportional to plate)
      const newLines = [
        ...badge.lines,
        {
          id: `line-${Date.now()}`,
          text: "Line Text",
          xNorm: 0.5,
          yNorm: 0.5, // Will be repositioned by calculateCenterPositions
          sizeNorm: newSizeNorm,
          color: "#000000",
          bold: false,
          italic: false,
          fontFamily: "Arial",
          align: "center",
        } as BadgeLine,
      ];

      // Scale all lines equally if they don't fit
      const scaledLines = scaleLinesToFit(
        newLines,
        designBox,
        currentTemplate?.signTextLayout,
      );

      // Apply center-based positioning to all lines
      const centeredLines = calculateCenterPositions(scaledLines);

      const nextBadge = {
        ...badge,
        lines: centeredLines,
      };
      setBadge(nextBadge);
      persistCurrentBadgeToSlot(nextBadge);
    }
  };

  const removeLine = (index: number) => {
    if (badge.lines.length > 1) {
      const newLines = [...badge.lines];
      newLines.splice(index, 1);

      const rmTpl = templates.find((t) => t.id === badge.templateId);
      const resized =
        variant === "sign" &&
        rmTpl?.signTextLayout &&
        typeof document !== "undefined"
          ? syncSignBadgeLinesSizeNorm(newLines, rmTpl.signTextLayout)
          : newLines;

      // Apply center-based positioning to remaining lines
      const centeredLines = calculateCenterPositions(resized);

      const nextBadge = {
        ...badge,
        lines: centeredLines.map((l) => ({
          ...l,
          align:
            l.align === "left" || l.align === "center" || l.align === "right"
              ? l.align
              : "center",
        })),
      };
      setBadge(nextBadge);
      persistCurrentBadgeToSlot(nextBadge);
    }
  };

  // Reset a single line to default font (Roboto, no bold/italic/underline, center, contrast color) and
  // nominal size (25px / 17px in template space — signs use 25/96 · 17/96 vs design height like initial template load).
  // Signs then run syncSignBadgeLinesSizeNorm so the result is as large as fits up to that target (same idea as load).
  const resetLineToDefault = (index: number) => {
    const designBox = effectiveDesignBox;
    const bgColor = badge.backgroundColor || "#FFFFFF";
    const defaultColor = getContrastingTextColor(bgColor);
    const defaultSizeNorm = getDefaultSizeNorm(index, designBox.height);

    saveToUndoHistory({
      type: "reset-line-formatting",
      badgeIndex: selectedBadgeIndex,
      lineIndex: index,
    });

    const updatedLines = badge.lines.map((line, i) => {
      if (i !== index) return line;
      return {
        ...line,
        fontFamily: "Roboto",
        bold: false,
        italic: false,
        underline: false,
        align: "center" as const,
        xNorm: 0.5,
        color: defaultColor,
        sizeNorm: defaultSizeNorm,
      };
    });

    const lineTpl =
      templates.find((t) => t.id === badge.templateId) ??
      templates.find((t) => t.id === universalTemplateId);
    const boxForCenter = lineTpl
      ? getEffectiveDesignBox(lineTpl, badge)
      : designBox;
    const scaledLines =
      variant === "sign" &&
      lineTpl?.signTextLayout &&
      typeof document !== "undefined"
        ? syncSignBadgeLinesSizeNormAfterLineReset(
            updatedLines,
            lineTpl.signTextLayout,
            index,
          )
        : scaleLinesToFit(updatedLines, boxForCenter, lineTpl?.signTextLayout);
    const centeredLines = calculateCenterPositions(scaledLines, boxForCenter);

    const updatedBadge = {
      ...badge,
      lines: centeredLines,
    };
    setBadge(updatedBadge);
    persistCurrentBadgeToSlot(updatedBadge);
  };

  /**
   * Default sizeNorm for a line. Badges: fixed 25px / 17px in *this* template's design box.
   * Signs: same *visual proportion* as on a nominal ~1" (96px) badge text area — font grows with plate size
   * (e.g. 8×8" → ~200px / ~136px in design coords) so printed signs stay readable; still shrinks via scaleLinesToFit.
   */
  const NOMINAL_BADGE_TEXT_AREA_HEIGHT_PX = 96;
  const getDefaultSizeNorm = (
    lineIndex: number,
    designBoxHeight: number = 96,
  ): number => {
    const basePx = lineIndex === 0 ? 25 : 17;
    if (variant === "sign") {
      // sizeNorm = (basePx * (h/96)) / h = basePx/96 → scales with design box height in px
      return basePx / NOMINAL_BADGE_TEXT_AREA_HEIGHT_PX;
    }
    return basePx / designBoxHeight;
  };

  // Helper function to scale all lines equally to fit within badge boundaries
  const scaleLinesToFit = (
    lines: BadgeLine[],
    designBox: { height: number },
    signTextLayout?: LoadedTemplate["signTextLayout"],
  ): BadgeLine[] => {
    // Use only the passed design box (do not require activeTemplate — it can lag or mismatch during sign template load).
    if (!designBox?.height || designBox.height <= 0) return lines;

    if (
      variant === "sign" &&
      signTextLayout &&
      typeof document !== "undefined"
    ) {
      return syncSignBadgeLinesSizeNorm(lines, signTextLayout);
    }

    const designBoxHeight = designBox.height;
    const FIXED_LINE_SPACING = designBoxHeight * 0.07; // 7% of badge height
    const INSET_PX = 0.1 * 96; // 0.1" inset at 96 DPI
    const availableHeight = designBoxHeight - INSET_PX * 2; // Available height with insets

    // Calculate total height needed with current sizes
    const totalTextHeight = lines.reduce((sum, line, index) => {
      const fontSize = (line.sizeNorm || 0.15) * designBoxHeight;
      sum += fontSize;
      if (index < lines.length - 1) {
        sum += FIXED_LINE_SPACING;
      }
      return sum;
    }, 0);

    // If it fits, return lines as-is
    if (totalTextHeight <= availableHeight) {
      return lines;
    }

    // Calculate scale factor to fit all lines
    const scaleFactor = availableHeight / totalTextHeight;

    // Apply scale factor to all lines equally
    return lines.map((line) => ({
      ...line,
      sizeNorm: (line.sizeNorm || 0.15) * scaleFactor,
    }));
  };

  // Helper function to reset lines for a badge (preserves text and number of lines)
  const resetBadgeLines = (badgeToReset: Badge): BadgeLine[] => {
    // Get designBox height from template
    const currentTemplate = templates.find(
      (t) => t.id === badgeToReset.templateId,
    );
    const designBoxHeight = currentTemplate
      ? getEffectiveDesignBox(currentTemplate, badgeToReset).height
      : 96;

    return badgeToReset.lines.map(
      (line, index) =>
        ({
          id: line.id || `line-${index + 1}`,
          text: line.text, // Preserve user input text
          xNorm: 0.5,
          yNorm: 0.5, // Will be repositioned by calculateCenterPositions
          sizeNorm: getDefaultSizeNorm(index, designBoxHeight),
          color: "#000000",
          bold: false,
          italic: false,
          underline: false,
          fontFamily: "Arial",
          align: "center",
        } as BadgeLine),
    );
  };

  const resetBadge = () => {
    // Save to undo history before resetting
    saveToUndoHistory({
      type: "reset-badge",
      badgeIndex: selectedBadgeIndex,
    });

    const fallbackId = templates[0]?.id || "rect-1x3";

    // Preserve current number of lines and text, reset all other properties
    const resetLines = resetBadgeLines(badge);

    // Apply center-based positioning
    const centeredLines = calculateCenterPositions(resetLines);

    const resetBadgeData = {
      ...badge,
      templateId: badge.templateId || fallbackId,
      lines: centeredLines,
      backgroundColor: "#FFFFFF",
      backing: badge.backing || "magnetic", // Preserve backing if it exists
      ...(variant === "sign"
        ? {
            signBorderStyleId: "default",
            signBorderOptionId: undefined,
            signBorderEnabled: undefined,
          }
        : {}),
    };

    setBadge(resetBadgeData);

    // Update the badge in multipleBadges array
    const updatedMultipleBadges = [...multipleBadges];
    if (updatedMultipleBadges[selectedBadgeIndex]) {
      updatedMultipleBadges[selectedBadgeIndex] = resetBadgeData;
      setMultipleBadges(updatedMultipleBadges);
    }

    // Sync badge1Data if editing the first badge
    if (selectedBadgeIndex === 0) {
      setBadge1Data(resetBadgeData);
    }
  };

  const resetAllBadges = () => {
    // Save to undo history before resetting
    saveToUndoHistory({
      type: "reset-all-badges",
      badgeIndex: selectedBadgeIndex,
    });

    const fallbackId = templates[0]?.id || "rect-1x3";

    // Reset all badges in multipleBadges
    const resetMultipleBadges = multipleBadges.map((badgeToReset) => {
      const resetLines = resetBadgeLines(badgeToReset);
      const centeredLines = calculateCenterPositions(resetLines);

      return {
        ...badgeToReset,
        templateId: badgeToReset.templateId || fallbackId,
        lines: centeredLines,
        backgroundColor: "#FFFFFF",
        backing: badgeToReset.backing || "magnetic",
        ...(variant === "sign"
          ? {
              signBorderStyleId: "default",
              signBorderOptionId: undefined,
              signBorderEnabled: undefined,
            }
          : {}),
      };
    });

    setMultipleBadges(resetMultipleBadges);

    // Sync badge1Data with the first badge
    if (resetMultipleBadges[0]) {
      setBadge1Data(resetMultipleBadges[0]);
    }

    // Also reset the currently editing badge
    const resetLines = resetBadgeLines(badge);
    const centeredLines = calculateCenterPositions(resetLines);
    const resetBadgeData = {
      ...badge,
      templateId: badge.templateId || fallbackId,
      lines: centeredLines,
      backgroundColor: "#FFFFFF",
      backing: badge.backing || "magnetic",
      ...(variant === "sign"
        ? {
            signBorderStyleId: "default",
            signBorderOptionId: undefined,
            signBorderEnabled: undefined,
          }
        : {}),
    };
    setBadge(resetBadgeData);
  };

  // CLEAN ARCHITECTURE: Auto-save on switch (no manual save button)

  // UNIVERSAL PREVIEW: All badges use the same template
  const getBadgeForPreview = (badgeIndex: number, savedBadge: Badge | null) => {
    const isCurrentlyEditing = selectedBadgeIndex === badgeIndex;

    if (isCurrentlyEditing) {
      // LIVE PREVIEW: Mirror left-hand preview when editing
      console.log(
        `[UNIVERSAL] Badge ${badgeIndex} LIVE PREVIEW - using current badge with backgroundColor: ${badge.backgroundColor}`,
      );
      return {
        badge: badge,
        templateId: universalTemplateId, // Always use universal template
      };
    } else {
      // STATIC: Show saved state when not editing
      if (savedBadge) {
        console.log(
          `[UNIVERSAL] Badge ${badgeIndex} STATIC PREVIEW - using saved badge with backgroundColor: ${savedBadge.backgroundColor}`,
        );
        const previewBadge = {
          ...savedBadge,
          lines: calculateCenterPositions(savedBadge.lines),
          backgroundColor: savedBadge.backgroundColor, // Explicitly preserve saved backgroundColor
        };
        return {
          badge: previewBadge,
          templateId: universalTemplateId, // Always use universal template
        };
      } else {
        // Fallback to current badge if no saved state
        console.log(
          `[UNIVERSAL] Badge ${badgeIndex} FALLBACK PREVIEW - no saved state, using current badge`,
        );
        return {
          badge: badge,
          templateId: universalTemplateId, // Always use universal template
        };
      }
    }
  };

  // UNIVERSAL TEMPLATE: Auto-save on switch, all badges use same template
  const selectBadge = (index: number) => {
    if (multipleBadges.length === 0) return;
    console.log(
      `[UNIVERSAL] selectBadge called: index=${index}, current selectedBadgeIndex=${selectedBadgeIndex}`,
    );

    // AUTO-SAVE: Save current badge state when switching
    // CRITICAL: Ensure backgroundColor is preserved as single source of truth
    const validatedBadge = {
      ...badge,
      templateId: universalTemplateId,
      backgroundColor: badge.backgroundColor || "#FFFFFF", // Ensure color is tracked
    };
    console.log(
      `[COLOR TRACKING] Auto-saving badge ${
        selectedBadgeIndex + 1
      } with backgroundColor: ${validatedBadge.backgroundColor}`,
    );

    // Update the badge in multipleBadges array
    const newMultipleBadges = [...multipleBadges];
    if (newMultipleBadges[selectedBadgeIndex]) {
      newMultipleBadges[selectedBadgeIndex] = validatedBadge;
      setMultipleBadges(newMultipleBadges);
    }

    // Sync badge1Data for backward compatibility
    if (selectedBadgeIndex === 0) {
      setBadge1Data(validatedBadge);
    }

    // SWITCH: Load the selected badge for editing
    setSelectedBadgeIndex(index);
    if (index !== selectedBadgeIndex) setDraftSaveTrigger((t) => t + 1);

    // Load from the array we just wrote (stale closure on `multipleBadges` would skip the save we just applied)
    const selectedBadge = newMultipleBadges[index];
    if (selectedBadge) {
      console.log(
        `[UNIVERSAL] Loading badge ${index + 1} for editing:`,
        selectedBadge.lines.map((l: BadgeLine) => l.text),
      );
      const centeredLines = calculateCenterPositions(selectedBadge.lines);
      setBadge({
        ...selectedBadge,
        lines: centeredLines,
        templateId: universalTemplateId,
      });
    }
  };

  /** Reset to empty designer: no badges, template picker open, roadmap/checkmarks cleared. */
  const resetDesignerToBlank = () => {
    const blankBadge: Badge = {
      ...initialDefaultBadge,
      lines: initialDefaultBadge.lines.map((line) => ({ ...line })),
    };
    setMultipleBadges([]);
    setBadge(blankBadge);
    setSelectedBadgeIndex(0);
    setHasChosenBackgroundColor(false);
    setSectionsOpened({
      template: false,
      size: false,
      export: false,
      background: false,
      textLines: false,
      backing: false,
      border: false,
    });
    setSectionsOpen({
      template: true,
      size: false,
      export: false,
      background: false,
      textLines: false,
      backing: false,
      border: false,
    });
    setUniversalTemplateId(
      variant === "sign"
        ? SIGN_TEMPLATE_TYPES[0].sizes[0].templateId
        : "rect-1x3",
    );
    if (variant === "sign") {
      setSelectedSignTemplateType(null);
      setSelectedSignSizeTemplateId(null);
      setSignSize("medium");
      setSignBorderId("");
    }
    setBadge1Data(null);
    sessionDesignIdRef.current = null;
    guidedFlowCompletedRef.current = false;
    templateGuidedAutoAdvanceDoneRef.current = false;
    signSizeGuidedAutoAdvanceDoneRef.current = false;
    setUndoHistory([]);
  };

  /** Remove one badge by index; selects the following badge when possible, else the previous. */
  const removeBadgeAtIndex = (indexToRemove: number) => {
    if (multipleBadges.length <= 1) return;
    const newMultipleBadges = multipleBadges.filter(
      (_, idx) => idx !== indexToRemove,
    );
    let newSelectedIndex = selectedBadgeIndex;
    if (selectedBadgeIndex === indexToRemove) {
      if (indexToRemove < multipleBadges.length - 1) {
        newSelectedIndex = indexToRemove;
      } else {
        newSelectedIndex = Math.max(0, indexToRemove - 1);
      }
    } else if (selectedBadgeIndex > indexToRemove) {
      newSelectedIndex = selectedBadgeIndex - 1;
    }

    setMultipleBadges(newMultipleBadges);
    setSelectedBadgeIndex(newSelectedIndex);

    const badgeToLoad = newMultipleBadges[newSelectedIndex];
    if (badgeToLoad) {
      const centeredLines = calculateCenterPositions(badgeToLoad.lines);
      setBadge({
        ...badgeToLoad,
        lines: centeredLines,
        templateId: universalTemplateId,
      });
    }
    if (newMultipleBadges[0]) {
      setBadge1Data(newMultipleBadges[0]);
    }
    setDraftSaveTrigger((t) => t + 1);
  };

  /** Insert a full copy of the badge at `index` immediately after it; select the new copy. */
  const duplicateBadgeAtIndex = (index: number) => {
    if (index < 0 || index >= multipleBadges.length) return;
    const source = index === selectedBadgeIndex ? badge : multipleBadges[index];
    const dup = JSON.parse(JSON.stringify(source)) as Badge;
    dup.id = `badge-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    dup.lines = (dup.lines || []).map((line, lineIdx) => ({
      ...line,
      id: `line-${Date.now()}-${lineIdx}-${Math.random()
        .toString(36)
        .slice(2, 9)}`,
    }));
    dup.templateId = universalTemplateId;
    const centeredLines = calculateCenterPositions(dup.lines);
    const dupBadge: Badge = { ...dup, lines: centeredLines };

    const newMultiple = [
      ...multipleBadges.slice(0, index + 1),
      dupBadge,
      ...multipleBadges.slice(index + 1),
    ];
    setMultipleBadges(newMultiple);
    const newIndex = index + 1;
    setSelectedBadgeIndex(newIndex);
    setBadge(dupBadge);
    if (newMultiple[0]) setBadge1Data(newMultiple[0]);
    setDraftSaveTrigger((t) => t + 1);
    runDraftSaveForBadges(newMultiple);
  };

  const duplicateCurrentBadge = () => {
    duplicateBadgeAtIndex(selectedBadgeIndex);
  };

  const deleteCurrentBadgeFromPreview = () => {
    if (multipleBadges.length === 0) return;
    if (multipleBadges.length === 1) {
      if (
        !window.confirm(
          `Remove this ${config.labelProduct.toLowerCase()} and start over? All progress will be cleared.`,
        )
      ) {
        return;
      }
      resetDesignerToBlank();
      setShowBadgeGridModal(false);
      return;
    }
    removeBadgeAtIndex(selectedBadgeIndex);
  };

  // UNIVERSAL TEMPLATE: When template changes, update all badges and auto-scale text to fit
  const handleUniversalTemplateChange = async (newTemplateId: string) => {
    console.log(`[UNIVERSAL] Template changed to: ${newTemplateId}`);

    if (multipleBadges.length === 0) {
      const newTemplate = await loadTemplateById(newTemplateId, variant);
      if (!newTemplate) {
        console.error("Template not found:", newTemplateId);
        return;
      }
      const protoForBox: Badge = {
        ...INITIAL_BADGE,
        templateId: newTemplateId,
        backgroundColor: INITIAL_BADGE.backgroundColor ?? "#FFFFFF",
        backing: INITIAL_BADGE.backing ?? "magnetic",
        lines:
          variant === "sign"
            ? buildPaddedInitialLines(
                variant,
                config.maxLines,
                INITIAL_BADGE.lines,
                defaultLineShape,
              )
            : [...INITIAL_BADGE.lines],
        ...(variant === "sign"
          ? {
              signBorderStyleId: "default",
              signBorderOptionId: undefined,
              signBorderEnabled: undefined,
            }
          : {}),
      };
      const designBox = getEffectiveDesignBox(newTemplate, protoForBox);
      const initialLinesWithSizes = INITIAL_BADGE.lines.map((line, index) => ({
        ...line,
        sizeNorm: getDefaultSizeNorm(index, designBox.height),
      }));
      let scaledLines = scaleLinesToFit(
        initialLinesWithSizes,
        designBox,
        newTemplate.signTextLayout,
      );
      if (variant === "sign" && !newTemplate.signTextLayout) {
        const insetPx = 0.1 * 96;
        const maxW = Math.max(1, designBox.width - insetPx * 2 - 4);
        const dh = designBox.height;
        scaledLines = scaledLines.map((line) => {
          let fontSize = (line.sizeNorm ?? 0.15) * dh;
          let newSizeNorm = line.sizeNorm ?? 0.15;
          const text = line.text || "";
          const fontFamily = line.fontFamily || "Arial";
          const bold = line.bold || false;
          const italic = line.italic || false;
          if (text) {
            let tw = measureTextWidth(text, fontSize, fontFamily, bold, italic);
            const minN = 0.05;
            while (tw > maxW) {
              fontSize *= 0.95;
              newSizeNorm = fontSize / dh;
              if (newSizeNorm <= minN) {
                return { ...line, sizeNorm: minN };
              }
              tw = measureTextWidth(text, fontSize, fontFamily, bold, italic);
            }
          }
          return { ...line, sizeNorm: newSizeNorm };
        });
      }
      const centeredLines = calculateCenterPositions(scaledLines);
      const newBadge: Badge = {
        ...INITIAL_BADGE,
        templateId: newTemplateId,
        backgroundColor: INITIAL_BADGE.backgroundColor ?? "#FFFFFF",
        backing: INITIAL_BADGE.backing ?? "magnetic",
        lines: centeredLines,
        ...(variant === "sign"
          ? {
              signBorderStyleId: "default",
              signBorderOptionId: undefined,
              signBorderEnabled: undefined,
            }
          : {}),
      };
      setUniversalTemplateId(newTemplateId);
      setMultipleBadges([newBadge]);
      setBadge(newBadge);
      setSectionsOpened((prev) => ({ ...prev, template: true }));
      if (!templateGuidedAutoAdvanceDoneRef.current) {
        if (config.hasSizeStep) {
          setSectionsOpen({
            template: false,
            size: true,
            export: false,
            background: false,
            textLines: false,
            backing: false,
            border: false,
          });
          setSectionsOpened((prev) => ({
            ...prev,
            template: true,
            size: true,
          }));
        } else {
          setSectionsOpen({
            template: false,
            size: false,
            export: false,
            background: true,
            textLines: false,
            backing: false,
            border: false,
          });
          setSectionsOpened((prev) => ({
            ...prev,
            template: true,
            background: true,
          }));
        }
        templateGuidedAutoAdvanceDoneRef.current = true;
      }
      return;
    }

    // Save to undo history before making changes (include current universalTemplateId)
    saveToUndoHistory({
      type: "template",
      badgeIndex: selectedBadgeIndex,
      previousUniversalTemplateId: universalTemplateId,
    });

    // Get the old template's designBox from the current badge's templateId BEFORE updating state
    // This ensures we get the correct old template dimensions
    const oldTemplateId = badge.templateId || universalTemplateId;
    const oldTemplate = await loadTemplateById(oldTemplateId, variant);
    const oldDesignBox = oldTemplate
      ? getEffectiveDesignBox(oldTemplate, badge)
      : {
          height: 96,
          width: 288,
        };

    setUniversalTemplateId(newTemplateId);

    // Load the new template to get its designBox
    const newTemplate = await loadTemplateById(newTemplateId, variant);
    if (!newTemplate) {
      console.error("Template not found:", newTemplateId);
      return;
    }

    // Account for 0.1" (9.6px) inset on each side for text clipping
    const INSET_INCHES = 0.1;
    const INSET_PX = INSET_INCHES * 96; // 9.6px at 96 DPI

    /** Shrink each line's sizeNorm only if its text is wider than the template text area. */
    const shrinkLinesToFitMaxWidth = (
      lines: BadgeLine[],
      box: { width: number; height: number },
    ): BadgeLine[] => {
      const maxTextWidth = box.width - INSET_PX * 2 - 4;
      const newDesignBoxHeight = box.height;
      return lines.map((line) => {
        let fontSize = (line.sizeNorm ?? 0.15) * newDesignBoxHeight;
        let newSizeNorm = line.sizeNorm ?? 0.15;
        const text = line.text || "";
        const fontFamily = line.fontFamily || "Arial";
        const bold = line.bold || false;
        const italic = line.italic || false;

        if (text) {
          let textWidth = measureTextWidth(
            text,
            fontSize,
            fontFamily,
            bold,
            italic,
          );
          const minSizeNorm = 0.05;

          while (textWidth > maxTextWidth) {
            fontSize = fontSize * 0.95;
            newSizeNorm = fontSize / newDesignBoxHeight;
            if (newSizeNorm <= minSizeNorm) {
              return { ...line, sizeNorm: minSizeNorm };
            }
            textWidth = measureTextWidth(
              text,
              fontSize,
              fontFamily,
              bold,
              italic,
            );
          }
        }

        return { ...line, sizeNorm: newSizeNorm };
      });
    };

    /** Signs: always use 25px / 17px targets for lines (in design-box space), then shrink to fit height and width. */
    const applySignTemplateLineSizes = (
      lines: BadgeLine[],
      box: { width: number; height: number },
    ): BadgeLine[] => {
      let next = lines.map((line, lineIndex) => ({
        ...line,
        sizeNorm: getDefaultSizeNorm(lineIndex, box.height),
      }));
      next = scaleLinesToFit(next, box, newTemplate.signTextLayout);
      if (newTemplate.signTextLayout && typeof document !== "undefined") {
        return next;
      }
      return shrinkLinesToFitMaxWidth(next, box);
    };

    // Auto-scale function to ensure text fits within new template boundaries
    // Preserves font sizes in pixels (points) when switching templates, only shrinking if needed to fit
    const autoScaleLinesForNewTemplate = (
      lines: BadgeLine[],
      newBox: { width: number; height: number },
      badgeOldTemplateId?: string,
    ): BadgeLine[] => {
      // Get the old designBox for this specific badge if provided, otherwise use the default oldDesignBox
      let badgeOldDesignBox = oldDesignBox;
      if (badgeOldTemplateId && badgeOldTemplateId !== oldTemplateId) {
        // If this badge has a different template, we'd need to load it, but for now use the default
        // In practice, with universal templates, all badges should have the same templateId
        badgeOldDesignBox = oldDesignBox;
      }

      const maxTextWidth = newBox.width - INSET_PX * 2 - 4;

      return lines.map((line, lineIndex) => {
        const newDesignBoxHeight = newBox.height;

        // Calculate current pixel size from old template
        // This preserves the actual font size in pixels/points across template changes
        const oldFontSizePx =
          (line.sizeNorm ?? 0.15) * badgeOldDesignBox.height;

        // Always preserve the pixel size (equivalent to preserving point size)
        // Only shrink if text doesn't fit within the new template's width
        let targetFontSizePx = oldFontSizePx;

        // Convert to new sizeNorm
        let fontSize = targetFontSizePx;
        let newSizeNorm = fontSize / newDesignBoxHeight;

        const text = line.text || "";
        const fontFamily = line.fontFamily || "Arial";
        const bold = line.bold || false;
        const italic = line.italic || false;

        // Measure text width and auto-scale down if it exceeds badge width
        if (text) {
          let textWidth = measureTextWidth(
            text,
            fontSize,
            fontFamily,
            bold,
            italic,
          );
          const minSizeNorm = 0.05; // Minimum 5% of badge height

          // Auto-scale down if text is too wide - constrain to badge boundaries
          while (textWidth > maxTextWidth) {
            fontSize = fontSize * 0.95; // Reduce by 5% each iteration
            newSizeNorm = fontSize / newDesignBoxHeight;
            if (newSizeNorm <= minSizeNorm) {
              return { ...line, sizeNorm: minSizeNorm };
            }
            textWidth = measureTextWidth(
              text,
              fontSize,
              fontFamily,
              bold,
              italic,
            );
          }
        }

        return { ...line, sizeNorm: newSizeNorm };
      });
    };

    const clearSignBorderOnTemplateChange =
      variant === "sign" &&
      signTemplateBorderFamilyKey(badge.templateId || oldTemplateId) !==
        signTemplateBorderFamilyKey(newTemplateId);

    // Update current badge with auto-scaled text (signs: reset to 25/17 defaults then fit; badges: preserve px)
    setBadge((prev) => {
      const proto = { ...prev, templateId: newTemplateId };
      const box = getEffectiveDesignBox(newTemplate, proto);
      const scaledLines =
        variant === "sign"
          ? applySignTemplateLineSizes(prev.lines, box)
          : autoScaleLinesForNewTemplate(prev.lines, box, prev.templateId);
      const centeredLines = calculateCenterPositions(scaledLines);
      return {
        ...proto,
        lines: centeredLines,
        ...(clearSignBorderOnTemplateChange
          ? {
              signBorderOptionId: undefined,
              signBorderEnabled: undefined,
            }
          : {}),
      };
    });

    // Update all badges in multipleBadges with auto-scaled text
    setMultipleBadges((prev) => {
      const updated = prev.map((b) => {
        const proto = { ...b, templateId: newTemplateId };
        const box = getEffectiveDesignBox(newTemplate, proto);
        const scaledLines =
          variant === "sign"
            ? applySignTemplateLineSizes(b.lines, box)
            : autoScaleLinesForNewTemplate(b.lines, box, b.templateId);
        const centeredLines = calculateCenterPositions(scaledLines);
        return {
          ...proto,
          lines: centeredLines,
          ...(clearSignBorderOnTemplateChange
            ? {
                signBorderOptionId: undefined,
                signBorderEnabled: undefined,
              }
            : {}),
        };
      });

      // Sync badge1Data with the first badge
      if (updated[0]) {
        setBadge1Data(updated[0]);
      }

      return updated;
    });
  };

  // Supabase upload (logic also runs inside addToCart; this standalone flow kept for optional "Upload proof only" use)
  const executeSendToSupabase = async () => {
    try {
      // Bypass shop check for testing - will add shop connection later
      const shopData = getCurrentShop(_shop);

      // Finalize all badge states before generating files
      // Save current badge to multipleBadges array
      const finalizedBadge = {
        ...badge,
        templateId: universalTemplateId,
        backgroundColor: badge.backgroundColor || "#FFFFFF",
      };

      const finalizedMultipleBadges = [...multipleBadges];
      if (finalizedMultipleBadges[selectedBadgeIndex]) {
        finalizedMultipleBadges[selectedBadgeIndex] = finalizedBadge;
        setMultipleBadges(finalizedMultipleBadges);
      }

      // Sync badge1Data if editing the first badge
      if (selectedBadgeIndex === 0) {
        setBadge1Data(finalizedBadge);
      }

      // Get all badges for export
      const allBadges = getAllBadges(finalizedMultipleBadges);
      const templateToUse = activeTemplate;

      if (!templateToUse) {
        alert("Template not loaded. Please wait and try again.");
        return;
      }

      // Generate design ID
      const designId = `design_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 11)}`;

      // Generate files as blobs (template once, then PDF + all badge PNGs/SVGs in parallel)
      console.log("Generating PDF and PNGs...");

      const templateId =
        templateToUse?.id || allBadges[0]?.templateId || "rect-1x3";
      const template = await loadTemplateById(templateId, variant);
      if (!template) {
        throw new Error("Template not found for image generation");
      }

      const pdfPromise = generatePDFAsBlob(
        allBadges[0],
        allBadges.length > 1 ? allBadges.slice(1) : undefined,
        undefined,
        config.labelProduct,
        variant,
      );
      const proofPdfFilename = `${
        variant === "sign" ? "sign" : "badge"
      }-design_proof.pdf`;
      const badgePromises = allBadges.map((badge, i) =>
        Promise.all([
          generateFullBadgeImage(badge, variant).then(dataURLToBlob),
          generateSVGAsBlob(badge, template),
        ])
          .then(([pngBlob, svgBlob]) => ({
            pngBlob: pngBlob && pngBlob.size > 0 ? pngBlob : new Blob(),
            svgBlob: svgBlob && svgBlob.size > 0 ? svgBlob : new Blob(),
            i,
          }))
          .catch((error) => {
            console.error(`Error generating images for badge ${i}:`, error);
            return { pngBlob: new Blob(), svgBlob: new Blob(), i };
          }),
      );

      const [pdfBlob, ...badgeResults] = await Promise.all([
        pdfPromise,
        ...badgePromises,
      ]);
      badgeResults.sort((a, b) => a.i - b.i);
      const thumbnailPngBlobs = badgeResults.map((r) => r.pngBlob);
      const svgBlobs = badgeResults.map((r) => r.svgBlob);

      // Prepare design data (use shop data if available, otherwise use defaults for testing)
      const designData = {
        badge: allBadges[0],
        multipleBadges: allBadges.length > 1 ? allBadges.slice(1) : [],
        allBadges: allBadges,
        timestamp: new Date().toISOString(),
        shopId: shopData?.shopId || "test-shop",
        productId: _productId || "test-product",
        backgroundColor: allBadges[0].backgroundColor,
        backingType: allBadges[0].backing,
        textLines: allBadges[0].lines,
      };

      // Get Shopify customer ID (if available)
      // You may need to adjust this based on how you get the customer ID
      const shopifyCustomerId = null; // TODO: Get from shop data or session

      // Upload to Supabase
      console.log("Uploading to Supabase...");
      const formData = new FormData();
      formData.append("designId", designId);
      formData.append("designData", JSON.stringify(designData));
      if (shopifyCustomerId) {
        formData.append("shopifyCustomerId", shopifyCustomerId);
      }
      formData.append("pdf", pdfBlob, proofPdfFilename);
      // Append each high-quality PNG (same as proof) with index
      const thumbBase = designerConfig.lineIdPrefix;
      thumbnailPngBlobs.forEach((pngBlob, index) => {
        if (pngBlob && pngBlob.size > 0) {
          formData.append(
            `thumbnail_png_${index}`,
            pngBlob,
            `${thumbBase}-${index}-thumbnail.png`,
          );
        }
      });
      // Append each SVG blob with index (high quality for full images)
      svgBlobs.forEach((svgBlob, index) => {
        if (svgBlob && svgBlob.size > 0) {
          formData.append(
            `svg_${index}`,
            svgBlob,
            `${thumbBase}-${index}-design.svg`,
          );
        }
      });

      const response = await fetch(designerApiPaths.sendToSupabase, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to upload to Supabase");
      }

      const result = await response.json();
      console.log("Upload response:", result);

      if (result.success) {
        const uploadStatus = result.uploads
          ? `PDF: ${result.uploads.pdf ? "✓" : "✗"}, PNG: ${
              result.uploads.png ? "✓" : "✗"
            }`
          : "";
        alert(
          `${result.message}\nDesign ID: ${designId}${
            uploadStatus ? `\n${uploadStatus}` : ""
          }`,
        );
      } else {
        // Show more helpful error message
        const errorMsg = result.error || result.message || "Unknown error";
        if (result.warning) {
          alert(
            `Warning: ${errorMsg}\n\nFiles were generated but could not be uploaded to Supabase.`,
          );
        } else {
          alert(`Failed to upload badge design to Supabase:\n${errorMsg}`);
        }
      }
    } catch (error) {
      console.error("Failed to send to Supabase:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Check if it's a network error
      if (
        errorMessage.includes("ENOTFOUND") ||
        errorMessage.includes("fetch failed") ||
        errorMessage.includes("Failed to fetch")
      ) {
        alert(
          `Cannot connect to Supabase.\n\nPlease check:\n- Your network connection\n- Supabase configuration\n- That Supabase is accessible\n\nError: ${errorMessage}`,
        );
      } else {
        alert(`Failed to upload badge design to Supabase:\n${errorMessage}`);
      }
    }
  };

  // Load Design: if not logged in, prompt login; if logged in, check for saved design and show modal or message
  const onLoadDesignClick = async () => {
    if (!_customerId?.trim()) {
      const goToLogin = confirm(
        "Log in to load a previous design. This page will open the login screen; after you log in you'll return here and can load your design.\n\nGo to login now?",
      );
      if (goToLogin) {
        api.sendToParent({
          action: "redirect-to-login",
          payload: { reason: "load-design" },
        });
      }
      return;
    }
    const shopData = getCurrentShop(_shop);
    if (!shopData) {
      alert("Shop information not found. Please reload the page.");
      return;
    }
    try {
      const result = await api.getSavedDesign(
        shopData.shopId,
        _customerId.trim(),
      );
      if (result.saved && result.design?.design_data) {
        setSavedDesignForLoad({
          design_id: result.design.design_id,
          design_data: result.design.design_data,
          updated_at: result.design.updated_at,
          backing_type: result.design.backing_type,
        });
        setShowLoadPreviousModal(true);
      } else {
        alert(
          "No saved design found. Save your design first, then you can load it here.",
        );
      }
    } catch (err) {
      console.warn("Load design check failed:", err);
      alert("Could not check for saved design. Please try again.");
    }
  };

  // Save design - FINALIZES and locks all badge states (Supabase only, one set per user)
  const saveBadge = async () => {
    try {
      if (!_customerId?.trim()) {
        const goToLogin = confirm(
          "Sign in to save your design. This page will open the login screen; after you log in you'll return here and can save.\n\nGo to login now?",
        );
        if (goToLogin) {
          api.sendToParent({
            action: "redirect-to-login",
            payload: { reason: "save-design" },
          });
        }
        return;
      }
      const shopData = getCurrentShop(_shop);
      if (!shopData) {
        alert("Shop information not found. Please reload the page.");
        return;
      }

      // CRITICAL: Finalize all badge states before saving.
      // multipleBadges is the full list (index 0 = first badge). Build one list with current badge at selectedBadgeIndex.
      const currentFinalized = {
        ...badge,
        templateId: universalTemplateId,
        backgroundColor: badge.backgroundColor || "#FFFFFF",
      };
      if (selectedBadgeIndex === 0) {
        setBadge1Data(currentFinalized);
      } else {
        const updatedMultiple = [...multipleBadges];
        updatedMultiple[selectedBadgeIndex] = currentFinalized;
        setMultipleBadges(updatedMultiple);
      }
      const allFinalizedBadges = multipleBadges.map((b, i) =>
        i === selectedBadgeIndex
          ? currentFinalized
          : {
              ...b,
              templateId: b.templateId || universalTemplateId,
              backgroundColor: b.backgroundColor || "#FFFFFF",
            },
      );

      console.log(
        `[FINALIZE] Saving ${allFinalizedBadges.length} badges with finalized states`,
      );
      allFinalizedBadges.forEach((b, i) => {
        console.log(
          `[FINALIZE] Badge ${i + 1}: backgroundColor=${
            b.backgroundColor
          }, templateId=${b.templateId}`,
        );
      });

      let basePrice = 9.99;
      let backingPrice =
        variant === "sign"
          ? 0
          : badge.backing === "magnetic"
          ? 2.0
          : badge.backing === "adhesive"
          ? 1.0
          : 0;
      let totalPrice = basePrice + backingPrice;

      if (variant === "sign") {
        backingPrice = 0;
        const product = signShopifyProduct;
        const linePrices = allFinalizedBadges.map((b) => {
          const tid = effectiveSignTemplateIdForBadge(
            b.templateId,
            universalTemplateId,
          );
          const opts = getSignShopifyShapeSizeForTemplateId(tid);
          if (!opts || !product) return 9.99;
          return (
            resolveSignVariantIdAndPrice(product, opts.shape, opts.size)
              ?.price ?? 9.99
          );
        });
        totalPrice = linePrices.reduce((s, p) => s + p, 0);
        basePrice = linePrices[0] ?? 9.99;
      }

      const badgeDesignData = {
        userId: _customerId.trim(),
        shopId: shopData.shopId,
        productId: _productId,
        designId: `design_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 11)}`,
        status: "saved",
        designData: {
          badge: allFinalizedBadges[0],
          multipleBadges:
            allFinalizedBadges.length > 1 ? allFinalizedBadges.slice(1) : [],
          allBadges: allFinalizedBadges,
          timestamp: new Date().toISOString(),
        },
        backgroundColor: allFinalizedBadges[0].backgroundColor,
        ...(variant !== "sign"
          ? { backingType: allFinalizedBadges[0].backing }
          : {}),
        basePrice,
        backingPrice,
        totalPrice,
        textLines: allFinalizedBadges[0].lines,
      };

      const shopDataWithCustomer = {
        ...shopData,
        customerId: _customerId.trim(),
      };
      const savedDesign = await api.saveDesignToSupabase(
        badgeDesignData,
        shopDataWithCustomer,
      );
      // eslint-disable-next-line no-alert
      alert(
        savedDesign.message ??
          `Badge design saved! Design ID: ${
            savedDesign.designId ?? savedDesign.id ?? "Unknown"
          }`,
      );

      api.sendToParent({
        action: "design-saved",
        payload: {
          id: savedDesign.id,
          designData: badgeDesignData,
          designId: savedDesign.designId,
        },
      });
    } catch (error) {
      console.error("Failed to save badge:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save badge design. Please try again.";
      alert(message);
    }
  };

  const addToCart = async () => {
    if (isAddingToCart) return;
    if (multipleBadges.length === 0) {
      alert("Add at least one badge first.");
      return;
    }
    setIsAddingToCart(true);

    try {
      if (draftSaveInProgressRef.current) {
        await draftSaveInProgressRef.current;
      }
      const shopData = getCurrentShop(_shop);
      if (!shopData) {
        alert("Shop information not found. Please reload the page.");
        setIsAddingToCart(false);
        return;
      }

      if (!sessionDesignIdRef.current) {
        sessionDesignIdRef.current = `design_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 11)}`;
      }
      const designId = sessionDesignIdRef.current;
      const shopifyCustomerIdFromUrl =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("customerId")
          : null;

      const finalizedBadge = {
        ...badge,
        templateId: universalTemplateId,
        backgroundColor: badge.backgroundColor || "#FFFFFF",
      };
      const finalizedMultipleBadges = [...multipleBadges];
      if (finalizedMultipleBadges[selectedBadgeIndex]) {
        finalizedMultipleBadges[selectedBadgeIndex] = finalizedBadge;
      }
      const allBadgesForSupabase = getAllBadges(finalizedMultipleBadges);

      // Design metadata and files go only to Supabase (no Gadget at add-to-cart). designData is cached in Supabase for link-order when order is paid.
      const designIdForSupabase = designId;

      // Start Gadget save in parallel with generation + upload so it doesn't block the critical path
      const firstBadge = allBadgesForSupabase[0];
      const minimalDesignData = {
        designId: designIdForSupabase,
        productId: _productId || "test-product",
        shopId: shopData.shopId || "test-shop",
        textLines: firstBadge?.lines ?? [],
        badge: firstBadge
          ? {
              lines: firstBadge.lines,
              backgroundColor: firstBadge.backgroundColor,
              backing: firstBadge.backing,
            }
          : undefined,
        allBadges: allBadgesForSupabase.map((b) => ({
          lines: b.lines,
          backgroundColor: b.backgroundColor,
          backing: b.backing,
        })),
      };
      const gadgetPromise = api.saveBadgeDesign(minimalDesignData, shopData);

      // Phase 1: Generate PDF only and show proof modal; add-to-cart completes in onProofConfirm
      const pdfBlob = await generatePDFAsBlob(
        allBadgesForSupabase[0],
        allBadgesForSupabase.length > 1
          ? allBadgesForSupabase.slice(1)
          : undefined,
        undefined,
        config.labelProduct,
        variant,
      );
      proofPendingAddToCartRef.current = {
        pdfBlob,
        designId,
        designIdForSupabase,
        allBadgesForSupabase,
        shopData,
        gadgetPromise,
        shopifyCustomerIdFromUrl,
      };
      const objectUrl = URL.createObjectURL(pdfBlob);
      setProofPdfObjectUrl(objectUrl);
      setProofAcknowledged(false);
      setProofAddDuplicates(false);
      setShowProofModal(true);
    } catch (error) {
      console.error("Failed to add to cart:", error);
      alert("Failed to add badge to cart. Please try again.");
    } finally {
      setIsAddingToCart(false);
    }
  };

  const closeProofModal = useCallback(() => {
    if (proofPdfObjectUrl) {
      URL.revokeObjectURL(proofPdfObjectUrl);
      setProofPdfObjectUrl(null);
    }
    proofPendingAddToCartRef.current = null;
    setProofAcknowledged(false);
    setProofAddDuplicates(false);
    setShowProofModal(false);
  }, [proofPdfObjectUrl]);

  const onLoadPreviousDesign = useCallback(() => {
    const design = savedDesignForLoad?.design_data;
    if (!design) {
      setShowLoadPreviousModal(false);
      setSavedDesignForLoad(null);
      return;
    }
    const rawBadges =
      design.allBadges ??
      (design.badge ? [design.badge, ...(design.multipleBadges ?? [])] : []);
    if (!Array.isArray(rawBadges) || rawBadges.length === 0) {
      setShowLoadPreviousModal(false);
      setSavedDesignForLoad(null);
      return;
    }
    let restoredBadges = migrateBadgeArray(rawBadges);
    const backingFallback = savedDesignForLoad?.backing_type;
    if (backingFallback) {
      restoredBadges = restoredBadges.map((b) => ({
        ...b,
        backing: (b.backing || backingFallback) as
          | "pin"
          | "magnetic"
          | "adhesive",
      }));
    }
    setMultipleBadges(restoredBadges);
    setBadge(restoredBadges[0]);
    setBadge1Data(restoredBadges[0] ?? null);
    setSelectedBadgeIndex(0);
    const restoredTid = restoredBadges[0]?.templateId ?? "rect-1x3";
    setUniversalTemplateId(restoredTid);
    setHasChosenBackgroundColor(true);
    templateGuidedAutoAdvanceDoneRef.current = true;
    signSizeGuidedAutoAdvanceDoneRef.current = true;
    guidedFlowCompletedRef.current = true;
    if (variant === "sign" && config.hasSizeStep) {
      const eff = migrateLegacyDesignerUniversalTemplateId(restoredTid);
      const m = findSignTypeAndSizeForUniversalTemplate(eff);
      if (m) {
        setSelectedSignTemplateType(m.typeId);
        setSelectedSignSizeTemplateId(m.sizeTemplateId);
      }
    }
    setSectionsOpened((prev) => ({ ...prev, textLines: true, backing: true }));
    if (savedDesignForLoad?.design_id) {
      sessionDesignIdRef.current = savedDesignForLoad.design_id;
    }
    setShowLoadPreviousModal(false);
    setSavedDesignForLoad(null);
  }, [savedDesignForLoad, variant, config.hasSizeStep]);

  const onStartFreshDesign = useCallback(() => {
    setShowLoadPreviousModal(false);
    setSavedDesignForLoad(null);
  }, []);

  const onProofConfirm = async () => {
    if (!proofAcknowledged) return;
    const pending = proofPendingAddToCartRef.current;
    if (!pending) return;
    const {
      pdfBlob,
      designIdForSupabase,
      allBadgesForSupabase,
      shopData,
      gadgetPromise,
      shopifyCustomerIdFromUrl,
    } = pending;
    const urlParams =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search)
        : null;
    const variantIdFromUrl = (key: string) =>
      urlParams?.get(key)?.trim() || null;
    const getDuplicateVariantIdEarly = (backingType: string): string | null => {
      const fromUrl =
        backingType === "pin"
          ? variantIdFromUrl("variantIdPinDuplicate")
          : backingType === "magnetic"
          ? variantIdFromUrl("variantIdMagneticDuplicate")
          : backingType === "adhesive"
          ? variantIdFromUrl("variantIdAdhesiveDuplicate")
          : variantIdFromUrl("variantIdPinDuplicate");
      return fromUrl || null;
    };
    // Duplicate set / discount flow disabled for now; re-enable when per-line discount or two-product approach is in place
    const addDuplicates = false; // was: !!proofAddDuplicates && allBadgesForSupabase.length >= 1
    const badgesForSupabase = addDuplicates
      ? [...allBadgesForSupabase, ...allBadgesForSupabase]
      : allBadgesForSupabase;

    let pdfBlobToUse = pdfBlob;
    // if (addDuplicates) {
    //   pdfBlobToUse = await generatePDFAsBlob(
    //     allBadgesForSupabase[0],
    //     allBadgesForSupabase.length > 1 ? allBadgesForSupabase.slice(1) : undefined,
    //     allBadgesForSupabase.map(() => 2),
    //   );
    // }

    setIsAddingToCart(true);
    try {
      let thumbnailUrls: string[] = [];
      let pdfUrlForCart: string | undefined;
      let usedFinalize = false;
      try {
        // Badge-only: uploads to badge PDFs bucket and reads badge_order_items. Signs always use designer send-to-supabase below.
        if (!addDuplicates && variant !== "sign") {
          const formDataFinalize = new FormData();
          formDataFinalize.append("designId", designIdForSupabase);
          formDataFinalize.append("pdf", pdfBlob, "badge-design_proof.pdf");
          const currentBacking = badgesForSupabase[0]?.backing;
          if (currentBacking) {
            formDataFinalize.append("backingType", currentBacking);
          }
          const finalizeRes = await fetch("/api/finalize-draft", {
            method: "POST",
            body: formDataFinalize,
          });
          const finalizeJson = await finalizeRes.json().catch(() => ({}));
          usedFinalize =
            finalizeRes.ok &&
            !finalizeJson.draftNotFound &&
            Array.isArray(finalizeJson.thumbnailUrls) &&
            finalizeJson.thumbnailUrls.length >= allBadgesForSupabase.length;

          if (usedFinalize) {
            thumbnailUrls = finalizeJson.thumbnailUrls;
            pdfUrlForCart = finalizeJson.pdfUrl;
          }
        }
        if (!usedFinalize) {
          try {
            if (badgesForSupabase.length > 0) {
              const badgePromises = badgesForSupabase.map((b, i) =>
                (async () => {
                  const templateIdForBadge =
                    b.templateId ||
                    activeTemplate?.id ||
                    (variant === "sign" ? "circle-4x4" : "rect-1x3");
                  const tmpl = await loadTemplateById(
                    templateIdForBadge,
                    variant,
                  );
                  if (!tmpl) {
                    console.warn(
                      "[BadgeDesigner] proof upload: template missing",
                      templateIdForBadge,
                    );
                    return { pngBlob: new Blob(), svgBlob: new Blob(), i };
                  }
                  try {
                    const [pngBlob, svgBlob] = await Promise.all([
                      generateFullBadgeImage(b, variant).then(dataURLToBlob),
                      generateSVGAsBlob(b, tmpl),
                    ]);
                    return {
                      pngBlob:
                        pngBlob && pngBlob.size > 0 ? pngBlob : new Blob(),
                      svgBlob:
                        svgBlob && svgBlob.size > 0 ? svgBlob : new Blob(),
                      i,
                    };
                  } catch {
                    return { pngBlob: new Blob(), svgBlob: new Blob(), i };
                  }
                })(),
              );
              const badgeResults = await Promise.all(badgePromises);
              badgeResults.sort((a, b) => a.i - b.i);
              const thumbnailPngBlobs = badgeResults.map((r) => r.pngBlob);
              const svgBlobs = badgeResults.map((r) => r.svgBlob);
              const designDataForSupabase = {
                badge: badgesForSupabase[0],
                multipleBadges:
                  badgesForSupabase.length > 1
                    ? badgesForSupabase.slice(1)
                    : [],
                allBadges: badgesForSupabase,
                timestamp: new Date().toISOString(),
                shopId: shopData.shopId || "test-shop",
                productId: _productId || "test-product",
                backgroundColor: badgesForSupabase[0].backgroundColor,
                ...(variant !== "sign"
                  ? { backingType: badgesForSupabase[0].backing }
                  : {}),
                textLines: badgesForSupabase[0].lines,
              };
              const formDataForSupabase = new FormData();
              formDataForSupabase.append("designId", designIdForSupabase);
              formDataForSupabase.append(
                "designData",
                JSON.stringify(designDataForSupabase),
              );
              formDataForSupabase.append("storageOnly", "true");
              if (shopifyCustomerIdFromUrl) {
                formDataForSupabase.append(
                  "shopifyCustomerId",
                  shopifyCustomerIdFromUrl,
                );
              }
              const designProofFilename = `${designerConfig.lineIdPrefix}-design_proof.pdf`;
              formDataForSupabase.append(
                "pdf",
                pdfBlobToUse,
                designProofFilename,
              );
              thumbnailPngBlobs.forEach((pngBlob, index) => {
                if (pngBlob && pngBlob.size > 0) {
                  formDataForSupabase.append(
                    `thumbnail_png_${index}`,
                    pngBlob,
                    `${designerConfig.lineIdPrefix}-${index}-thumbnail.png`,
                  );
                }
              });
              svgBlobs.forEach((svgBlob, index) => {
                if (svgBlob && svgBlob.size > 0) {
                  formDataForSupabase.append(
                    `svg_${index}`,
                    svgBlob,
                    `${designerConfig.lineIdPrefix}-${index}-design.svg`,
                  );
                }
              });
              const supabaseResponse = await fetch(
                designerApiPaths.sendToSupabase,
                {
                  method: "POST",
                  body: formDataForSupabase,
                },
              );
              if (supabaseResponse.ok) {
                const supabaseJson = await supabaseResponse
                  .json()
                  .catch(() => ({}));
                thumbnailUrls = Array.isArray(supabaseJson.thumbnailUrls)
                  ? supabaseJson.thumbnailUrls
                  : [];
                pdfUrlForCart = supabaseJson.pdfUrl;
              } else {
                const errData = await supabaseResponse.json().catch(() => ({}));
                console.warn(
                  "Supabase proof upload failed (cart will still add):",
                  errData.message || supabaseResponse.statusText,
                );
                alert(
                  "Proof upload failed; your design will still be added to cart. Support may follow up for the proof.",
                );
              }
            }
          } catch (fallbackErr) {
            console.warn(
              "Supabase fallback upload error (cart will still add):",
              fallbackErr,
            );
            alert(
              "Proof upload failed; your design will still be added to cart. Support may follow up for the proof.",
            );
          }
        }
      } catch (supabaseErr) {
        console.warn(
          "Supabase upload error (cart will still add):",
          supabaseErr,
        );
        alert(
          "Proof upload failed; your design will still be added to cart. Support may follow up for the proof.",
        );
      }

      if (variant === "sign") {
        const cb = Date.now();
        thumbnailUrls = thumbnailUrls.map((u) => {
          if (!u || u.startsWith("blob:")) return u;
          return `${u}${u.includes("?") ? "&" : "?"}cb=${cb}`;
        });
      }

      const urlParams =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : null;
      const variantIdFromUrl = (key: string) =>
        urlParams?.get(key)?.trim() || null;
      const signCatalog = signShopifyProductRef.current;
      const fallbackSignVariantId =
        variantIdFromUrl("variantIdSign") ||
        variantIdFromUrl("variantIdPin") ||
        "47037830299903";

      const resolveSignLineVariant = (
        b: Badge,
      ): { variantId: string; linePrice: string } => {
        const tid = effectiveSignTemplateIdForBadge(
          b.templateId,
          universalTemplateId,
        );
        const opts = getSignShopifyShapeSizeForTemplateId(tid);
        if (opts && signCatalog) {
          const hit = resolveSignVariantIdAndPrice(
            signCatalog,
            opts.shape,
            opts.size,
          );
          if (hit) {
            return {
              variantId: hit.variantId,
              linePrice: hit.price.toFixed(2),
            };
          }
        }
        console.warn(
          "[BadgeDesigner] Sign variant not found for template; using URL fallback",
          tid,
          opts,
        );
        return {
          variantId: fallbackSignVariantId,
          linePrice: "0.00",
        };
      };

      const isSignDesigner = variant === "sign";
      const getVariantId = (backingType: string) => {
        const fromUrl =
          backingType === "pin"
            ? variantIdFromUrl("variantIdPin")
            : backingType === "magnetic"
            ? variantIdFromUrl("variantIdMagnetic")
            : backingType === "adhesive"
            ? variantIdFromUrl("variantIdAdhesive")
            : variantIdFromUrl("variantIdPin");
        if (fromUrl) return fromUrl;
        switch (backingType) {
          case "pin":
            return "47037830299903";
          case "magnetic":
            return "47037830332671";
          case "adhesive":
            return "47037830365439";
          default:
            return "47037830299903";
        }
      };
      const getDuplicateVariantId = (backingType: string): string | null => {
        const fromUrl =
          backingType === "pin"
            ? variantIdFromUrl("variantIdPinDuplicate")
            : backingType === "magnetic"
            ? variantIdFromUrl("variantIdMagneticDuplicate")
            : backingType === "adhesive"
            ? variantIdFromUrl("variantIdAdhesiveDuplicate")
            : variantIdFromUrl("variantIdPinDuplicate");
        return fromUrl || null;
      };

      let gadgetDesignId: string | undefined;
      try {
        const savedDesign = await gadgetPromise;
        gadgetDesignId = savedDesign?.id;
      } catch (gadgetErr) {
        console.warn(
          "Gadget save at add-to-cart failed (cart will still add):",
          gadgetErr,
        );
      }

      const cartItems = addDuplicates
        ? allBadgesForSupabase.map((b, i) => {
            const backingP = isSignDesigner
              ? 0
              : b.backing === "magnetic"
              ? 2
              : b.backing === "adhesive"
              ? 1
              : 0;
            const { variantId, linePrice: itemTotalPrice } = isSignDesigner
              ? resolveSignLineVariant(b)
              : {
                  variantId: getVariantId(b.backing),
                  linePrice: (9.99 + backingP).toFixed(2),
                };
            const n = allBadgesForSupabase.length;
            const lineIndexStr = String(i);
            const indexProps: Record<string, string> = {
              [designerConfig.cartIndexPropertyPrimary]: lineIndexStr,
            };
            for (const k of designerConfig.cartIndexPropertyFallbacks) {
              indexProps[k] = lineIndexStr;
            }
            const properties: Record<string, string> = {
              "Custom Badge Design": "Yes",
              Designer: isSignDesigner ? "sign" : "badge",
              "Badge Text Line 1": b.lines[0]?.text || "",
              "Badge Text Line 2": b.lines[1]?.text || "",
              "Badge Text Line 3": b.lines[2]?.text || "",
              "Badge Text Line 4": b.lines[3]?.text || "",
              "Background Color": b.backgroundColor,
              "Font Family": b.lines[0]?.fontFamily || "Arial",
              ...(isSignDesigner ? {} : { "Backing Type": b.backing }),
              "Design ID": designIdForSupabase,
              Price: `$${itemTotalPrice}`,
              ...indexProps,
              "Custom Thumbnail": thumbnailUrls[i] ?? "",
              "Badge count": String(n),
            };
            if (gadgetDesignId) properties["Gadget Design ID"] = gadgetDesignId;
            if (pdfUrlForCart) properties["Proof PDF URL"] = pdfUrlForCart;
            return {
              variantId,
              quantity: 2,
              properties,
            };
          })
        : badgesForSupabase.map((b, i) => {
            const backingP = isSignDesigner
              ? 0
              : b.backing === "magnetic"
              ? 2
              : b.backing === "adhesive"
              ? 1
              : 0;
            const { variantId, linePrice: itemTotalPrice } = isSignDesigner
              ? resolveSignLineVariant(b)
              : {
                  variantId: getVariantId(b.backing),
                  linePrice: (9.99 + backingP).toFixed(2),
                };
            const lineIndexStrSingle = String(i);
            const indexPropsSingle: Record<string, string> = {
              [designerConfig.cartIndexPropertyPrimary]: lineIndexStrSingle,
            };
            for (const k of designerConfig.cartIndexPropertyFallbacks) {
              indexPropsSingle[k] = lineIndexStrSingle;
            }
            const properties: Record<string, string> = {
              "Custom Badge Design": "Yes",
              Designer: isSignDesigner ? "sign" : "badge",
              "Badge Text Line 1": b.lines[0]?.text || "",
              "Badge Text Line 2": b.lines[1]?.text || "",
              "Badge Text Line 3": b.lines[2]?.text || "",
              "Badge Text Line 4": b.lines[3]?.text || "",
              "Background Color": b.backgroundColor,
              "Font Family": b.lines[0]?.fontFamily || "Arial",
              ...(isSignDesigner ? {} : { "Backing Type": b.backing }),
              "Design ID": designIdForSupabase,
              Price: `$${itemTotalPrice}`,
              ...indexPropsSingle,
              "Custom Thumbnail": thumbnailUrls[i] ?? "",
            };
            if (gadgetDesignId) properties["Gadget Design ID"] = gadgetDesignId;
            if (pdfUrlForCart) properties["Proof PDF URL"] = pdfUrlForCart;
            return {
              variantId,
              quantity: 1,
              properties,
            };
          });

      const result = await api.addToCartMultiple(cartItems);
      if (result.success) {
        try {
          const cacheKey = `${BADGE_DESIGNER_CACHE_PREFIX}-${
            _shop ?? "default"
          }-${_productId ?? "default"}`;
          localStorage.removeItem(cacheKey);
        } catch {
          // ignore
        }
        // Prevent any pending debounced save from writing old state back to cache
        skipCacheSaveRef.current = true;
      }
      if (!result.success) {
        alert("Failed to add badge(s) to cart. Please try again.");
      }
      closeProofModal();
    } catch (error) {
      console.error("Failed to complete add to cart:", error);
      alert("Failed to add badge to cart. Please try again.");
    } finally {
      setIsAddingToCart(false);
    }
  };

  // CSV helpers
  // Preview CSV without creating badges
  function previewCsv(text: string) {
    try {
      setCsvError("");
      const rows = text
        .trim()
        .split(/\r?\n/)
        .filter((row: string) => row.trim().length > 0) // Filter out empty rows
        .map((row: string) => row.split(","));

      // Validate that each row has at most maxLines comma-separated values
      const invalidRows: number[] = [];
      rows.forEach((row, index) => {
        if (row.length > maxLines) {
          invalidRows.push(index + 1); // 1-indexed for user display
        }
      });

      if (invalidRows.length > 0) {
        setCsvError(
          `Each ${config.labelProduct.toLowerCase()} can have a maximum of ${maxLines} lines of text. ` +
            `Row${invalidRows.length > 1 ? "s" : ""} ${invalidRows.join(
              ", ",
            )} ` +
            `exceed${invalidRows.length > 1 ? "" : "s"} this limit.`,
        );
      }

      setCsvPreview(rows);
    } catch {
      setCsvError("Invalid CSV format.");
      setCsvPreview([]);
    }
  }

  // Actually create badges from CSV. Optional onBadgesUpdated(newBadges) is called after state is updated (e.g. to run draft save).
  function parseCsv(
    text: string,
    overrideExisting: boolean = false,
    onBadgesUpdated?: (newBadges: Badge[]) => void,
  ) {
    console.log(
      `[DEBUG] parseCsv called with current badge:`,
      badge.lines.map((l) => l.text),
      `overrideExisting: ${overrideExisting}`,
    );
    try {
      setCsvError("");
      const rows = text
        .trim()
        .split(/\r?\n/)
        .filter((row: string) => row.trim().length > 0) // Filter out empty rows
        .map((row: string) => row.split(","));

      // Validate that each row has at most maxLines comma-separated values
      const invalidRows: number[] = [];
      rows.forEach((row, index) => {
        if (row.length > maxLines) {
          invalidRows.push(index + 1); // 1-indexed for user display
        }
      });

      if (invalidRows.length > 0) {
        setCsvError(
          `Each ${config.labelProduct.toLowerCase()} can have a maximum of ${maxLines} lines of text. ` +
            `Row${invalidRows.length > 1 ? "s" : ""} ${invalidRows.join(
              ", ",
            )} ` +
            `exceed${invalidRows.length > 1 ? "" : "s"} this limit.`,
        );
        return; // Don't proceed with badge creation
      }

      if (rows.length > 0 && rows[0].length > 0) {
        // Create badges based on current badge template but with CSV text
        // CRITICAL: Each badge maintains its own backgroundColor as single source of truth
        const badges = rows.map((row: any, index: number) => {
          // Start with current badge's backgroundColor to maintain consistency
          const badgeWithCsvText = {
            ...badge,
            id: `badge-csv-${Date.now()}-${index}`,
            // UNIVERSAL TEMPLATE: All CSV badges use the same universal template
            templateId: universalTemplateId,
            // CRITICAL: Preserve backgroundColor from current badge (single source of truth)
            backgroundColor: badge.backgroundColor || "#FFFFFF",
            lines: row.map((cell: any, i: number) => {
              // Get designBox height for size calculation
              const designBoxHeight = effectiveDesignBox.height || 96;

              // If this line index exists in the first badge, use its formatting
              // Otherwise, use default formatting (black, 17pt for line 3+)
              if (i < badge.lines.length) {
                const baseLine = badge.lines[i];
                const lineSizeNorm = getDefaultSizeNorm(i, designBoxHeight);
                return {
                  ...baseLine,
                  text: cell || "",
                  color: baseLine.color || "#000000",
                  sizeNorm: baseLine.sizeNorm || lineSizeNorm,
                  align:
                    baseLine.align === "left" ||
                    baseLine.align === "center" ||
                    baseLine.align === "right"
                      ? baseLine.align
                      : "center",
                } as BadgeLine;
              } else {
                // For lines beyond the first badge's line count, use default formatting
                // Line 3 should be 17px (index 2)
                const newLineSizePx = 17;
                const newSizeNorm = newLineSizePx / designBoxHeight;
                return {
                  id: `line-${i}-${Date.now()}`,
                  text: cell || "",
                  xNorm: 0.5,
                  yNorm: 0.5, // Will be repositioned by calculateCenterPositions
                  sizeNorm: newSizeNorm,
                  color: "#000000", // Default black
                  bold: false,
                  italic: false,
                  underline: false,
                  fontFamily: "Arial",
                  align: "center",
                } as BadgeLine;
              }
            }),
          };

          // Apply center-based positioning to CSV badges
          const centeredLines = calculateCenterPositions(
            badgeWithCsvText.lines,
          );
          const finalBadge = {
            ...badgeWithCsvText,
            lines: centeredLines,
          };

          // Ensure backgroundColor is explicitly set (single source of truth)
          console.log(
            `[COLOR TRACKING] CSV Badge ${
              index + 1
            } created with backgroundColor: ${finalBadge.backgroundColor}`,
          );
          return finalBadge;
        });

        console.log(
          `[DEBUG] Created ${badges.length} CSV badges:`,
          badges.map((b) => b.lines.map((l: BadgeLine) => l.text)),
        );

        // CRITICAL: Migrate badges to ensure they have proper backgroundColor
        const migratedBadges = migrateBadgeArray(badges);
        console.log(
          `[MIGRATION] Migrated ${migratedBadges.length} CSV badges with individual background colors:`,
          migratedBadges.map((b) => b.backgroundColor),
        );

        // Save the current badge at index 0 first
        const currentFirstBadge = {
          ...badge,
          templateId: universalTemplateId,
          backgroundColor: badge.backgroundColor || "#FFFFFF",
        };
        const migratedFirstBadge = migrateLegacyBadge(currentFirstBadge);

        // Update multipleBadges based on overrideExisting flag
        if (overrideExisting) {
          // Override: Replace ALL badges (including the default first badge) with CSV badges
          // The first CSV badge becomes the new default badge at index 0
          setMultipleBadges(migratedBadges);
          console.log(
            `[DEBUG] Override mode: Replaced all badges with ${migratedBadges.length} CSV badges`,
          );
          // Sync badge1Data with the new first badge
          if (migratedBadges[0]) {
            setBadge1Data(migratedBadges[0]);
            // Also update the current badge being edited to the first CSV badge
            setBadge(migratedBadges[0]);
            setSelectedBadgeIndex(0);
          }
          onBadgesUpdated?.(migratedBadges);
        } else {
          // Add: Keep all existing badges, append CSV badges
          // First, save current badge to its position in multipleBadges
          const updatedMultipleBadges = [...multipleBadges];
          if (updatedMultipleBadges[selectedBadgeIndex]) {
            updatedMultipleBadges[selectedBadgeIndex] = migratedFirstBadge;
          }
          // Then append the new CSV badges
          setMultipleBadges([...updatedMultipleBadges, ...migratedBadges]);
          console.log(
            `[DEBUG] Add mode: Updated multipleBadges to ${
              updatedMultipleBadges.length + migratedBadges.length
            } total badges (${updatedMultipleBadges.length} existing + ${
              migratedBadges.length
            } CSV)`,
          );
          // Sync badge1Data with the first badge
          if (updatedMultipleBadges[0]) {
            setBadge1Data(updatedMultipleBadges[0]);
          }
          const newBadges = [...updatedMultipleBadges, ...migratedBadges];
          onBadgesUpdated?.(newBadges);
        }
      }
    } catch {
      setCsvError("Invalid CSV format.");
      setCsvPreview([]);
    }
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      previewCsv(text);
    };
    reader.readAsText(file);
  }

  // Pricing display (total for all badges). Sign prices come from Shopify product JSON.
  const addToCartPriceLabel =
    variant === "sign" && signShopifyCatalogStatus === "loading"
      ? "…"
      : totalPriceAllBadges === "—"
      ? "—"
      : `$${totalPriceAllBadges}`;

  // Early guard - don't render until we have a concrete template
  if (!activeTemplate) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center max-w-md px-4">
          {templateLoadError ? (
            <>
              <p className="text-red-600 font-medium mb-2">
                Failed to load templates
              </p>
              <p className="text-sm text-gray-600 break-words">
                {templateLoadError}
              </p>
            </>
          ) : (
            <>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading templates...</p>
            </>
          )}
        </div>
      </div>
    );
  }

  const totalBadges = multipleBadges.length;
  const canGoPrev = selectedBadgeIndex > 0;
  const canGoNext = selectedBadgeIndex < totalBadges - 1;

  const getSavedBadgeFor = (i: number) => multipleBadges[i] ?? null;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx < -50 && canGoNext) selectBadge(selectedBadgeIndex + 1);
    else if (dx > 50 && canGoPrev) selectBadge(selectedBadgeIndex - 1);
  };

  return (
    <div className="flex flex-col md:flex-row bg-gray-100 p-4 md:p-6 rounded-lg shadow-lg mx-auto max-w-5xl h-screen overflow-hidden md:h-auto md:min-h-[600px] md:overflow-visible">
      {/* MOBILE: Header + preview fixed at top; editor scrolls below */}
      <div className="flex-shrink-0 md:hidden flex flex-col mb-2">
        {/* Header: title left, grid picker right */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex flex-col gap-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-800">
              {multipleBadges.length === 0
                ? `Design Your ${config.labelProduct}`
                : `Customize Your ${config.labelProduct} ${
                    selectedBadgeIndex + 1
                  } of ${totalBadges}`}
            </h2>
            {multipleBadges.length > 0 && (
              <span className="text-xl font-bold text-red-600">
                {activeTemplate.name}
              </span>
            )}
          </div>
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              className="flex-shrink-0 w-14 h-14 flex items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
              onClick={() => setShowBadgeGridModal(true)}
              aria-label={`View all ${config.labelProductPlural.toLowerCase()}`}
              title={`View all ${config.labelProductPlural.toLowerCase()}`}
            >
              <Squares2X2Icon className="w-6 h-6" />
            </button>
            <div className="text-[8px] text-gray-600 text-center leading-tight">
              Grid
              <br />
              View
            </div>
          </div>
        </div>

        <h2 className="text-xl font-bold text-gray-800 mb-2 w-full text-center">
          {config.labelProduct} Preview
        </h2>

        {/* Large preview: one badge, prev/next arrows, swipe to change. Sizing fits container (no horizontal scroll). */}
        <div
          className="w-full flex items-center justify-center relative select-none bg-white/60 rounded-lg border border-gray-200 overflow-hidden"
          style={{
            padding: `${MOBILE_PREVIEW.boxMarginYRem}rem ${MOBILE_PREVIEW.badgeMarginXRem}rem`,
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {isGeneratingDesigns && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/85 rounded-lg">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-300 border-t-blue-600 mb-2" />
              <span className="text-gray-700 font-medium">
                Generating {config.labelProduct.toLowerCase()} designs
              </span>
              <span className="text-gray-500 text-sm mt-1">
                Saving to database…
              </span>
            </div>
          )}
          {multipleBadges.length > 0 && (
            <div className="absolute z-20 left-2 top-2 flex items-center gap-1.5">
              <button
                type="button"
                className="flex h-9 w-9 md:h-10 md:w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  duplicateCurrentBadge();
                }}
                aria-label={`Duplicate ${config.labelProduct.toLowerCase()}`}
                title={`Duplicate this ${config.labelProduct.toLowerCase()}`}
              >
                <DocumentDuplicateIcon className="w-4 h-4 md:w-5 md:h-5" />
              </button>
              <button
                type="button"
                className="flex h-9 w-9 md:h-10 md:w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  deleteCurrentBadgeFromPreview();
                }}
                aria-label={`Delete ${config.labelProduct.toLowerCase()}`}
                title={`Delete this ${config.labelProduct.toLowerCase()}`}
              >
                <TrashIcon className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          )}
          {totalBadges > 1 && canGoPrev && (
            <button
              type="button"
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 shadow border border-gray-200 text-gray-700 hover:bg-gray-100"
              onClick={() => selectBadge(selectedBadgeIndex - 1)}
              aria-label="Previous badge"
            >
              <ChevronLeftIcon className="w-6 h-6" />
            </button>
          )}
          {totalBadges > 1 && canGoNext && (
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/90 shadow border border-gray-200 text-gray-700 hover:bg-gray-100"
              onClick={() => selectBadge(selectedBadgeIndex + 1)}
              aria-label="Next badge"
            >
              <ChevronRightIcon className="w-6 h-6" />
            </button>
          )}
          <div
            className="flex flex-shrink-0 items-center justify-center"
            style={previewBoxStyle}
          >
            {multipleBadges.length === 0 ? (
              <div className="text-center text-gray-500 text-sm px-4">
                Select a shape below to get started
              </div>
            ) : (
              <BadgeSvgRenderer
                variant={variant}
                badge={
                  getBadgeForPreview(
                    selectedBadgeIndex,
                    getSavedBadgeFor(selectedBadgeIndex),
                  ).badge
                }
                templateId={
                  getBadgeForPreview(
                    selectedBadgeIndex,
                    getSavedBadgeFor(selectedBadgeIndex),
                  ).templateId
                }
                height="100%"
              />
            )}
          </div>
        </div>
      </div>

      {/* LEFT COLUMN - Controls */}
      <div className="w-full md:w-1/2 mb-4 md:mb-0 md:pr-3 overflow-y-auto flex-1 min-h-0 md:flex-initial md:min-h-0 md:max-h-[90vh]">
        <div className="section-container mb-4">
          <div className="hidden md:flex md:items-center md:gap-3 md:min-w-0 mb-3">
            {/* Left: title line 1 + line 2 (when badges exist) */}
            <div className="flex flex-col gap-0.5 min-w-0 flex-shrink-0">
              <h2 className="text-xl font-bold text-gray-800 leading-tight whitespace-nowrap">
                {multipleBadges.length === 0
                  ? `Design Your ${config.labelProduct}`
                  : `Customize Your ${config.labelProduct}`}
              </h2>
              {multipleBadges.length > 0 && (
                <>
                  <span className="text-xl font-bold text-gray-800 leading-tight">
                    {selectedBadgeIndex + 1} of {totalBadges}
                  </span>
                  <span className="text-xl font-bold text-red-600 leading-tight">
                    {activeTemplate.name}
                  </span>
                </>
              )}
            </div>
            {/* Right: steps roadmap, vertically centered between line 1 and line 2 */}
            <div className="flex-1 min-w-0 flex items-center justify-end">
              {(() => {
                const backgroundLabel =
                  config.templatesKey === "sign" ? "Backgrounds" : "Background";
                const signBgDone =
                  multipleBadges.length > 0 &&
                  hasChosenBackgroundColor &&
                  (config.hasSizeStep
                    ? selectedSignSizeTemplateId != null
                    : true);
                const steps: {
                  label: string;
                  done: boolean;
                  current: boolean;
                }[] = [
                  {
                    label: "Template",
                    done: multipleBadges.length > 0,
                    current: multipleBadges.length === 0,
                  },
                  ...(config.hasSizeStep
                    ? [
                        {
                          label: "Size",
                          done: selectedSignSizeTemplateId != null,
                          current:
                            selectedSignTemplateType != null &&
                            selectedSignSizeTemplateId == null,
                        },
                      ]
                    : []),
                  {
                    label: backgroundLabel,
                    done: hasChosenBackgroundColor,
                    current:
                      multipleBadges.length > 0 &&
                      !hasChosenBackgroundColor &&
                      (config.hasSizeStep
                        ? selectedSignSizeTemplateId != null
                        : true),
                  },
                  ...(signBorderStepRequired
                    ? [
                        {
                          label: "Border",
                          done: signBorderConfigured,
                          current: signBgDone && !signBorderConfigured,
                        },
                      ]
                    : []),
                  {
                    label: "Text",
                    done: hasStep3TextEntered,
                    current: signBorderStepRequired
                      ? signBorderConfigured && !hasStep3TextEntered
                      : hasChosenBackgroundColor && !hasStep3TextEntered,
                  },
                  ...(config.hasBacking
                    ? [
                        {
                          label: "Backing",
                          done: sectionsOpened.backing,
                          current:
                            hasStep3TextEntered && !sectionsOpened.backing,
                        },
                      ]
                    : []),
                  ...(config.hasBorder && variant !== "sign"
                    ? [
                        {
                          label: "Border",
                          done: sectionsOpened.border,
                          current: stepsComplete && !sectionsOpened.border,
                        },
                      ]
                    : []),
                ];
                const doneStates = steps.map((s) => s.done);
                return steps.map((step, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && (
                      <div
                        className={`flex-1 min-w-2 h-0.5 rounded ${
                          doneStates[i - 1] ? "bg-green-600" : "bg-gray-200"
                        }`}
                      />
                    )}
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${
                          step.done
                            ? "bg-green-600 text-white"
                            : step.current
                            ? "bg-green-600 text-white ring-2 ring-green-300"
                            : "bg-gray-200"
                        }`}
                      >
                        {step.done ? (
                          <CheckIcon className="w-3 h-3 stroke-[2.5]" />
                        ) : (
                          <span
                            className={`text-[9px] font-semibold ${
                              step.current ? "text-white" : "text-gray-500"
                            }`}
                          >
                            {i + 1}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-gray-600 mt-0.5 whitespace-nowrap leading-tight">
                        {step.label}
                      </span>
                    </div>
                  </React.Fragment>
                ));
              })()}
            </div>
          </div>
          {/* <button
              className="px-2 py-1 text-xs border rounded bg-gray-100 hover:bg-gray-200"
              onClick={() => {
                console.log("[BadgeDesigner] Refreshing templates...");
                setTemplateRefreshKey((prev) => prev + 1);
              }}
              title="Refresh Templates (Ctrl+R)"
            >
              Refresh
            </button> */}

          {/* Template Selector - Image Swatches */}
          <div className="mb-4">
            <button
              ref={templateSectionRef}
              type="button"
              onClick={() => {
                const willBeOpen = !sectionsOpen.template;
                setSectionsOpen({
                  template: willBeOpen,
                  size: false,
                  export: false,
                  background: false,
                  textLines: false,
                  backing: false,
                  border: false,
                });
                // Mark as opened when user interacts with the section
                setSectionsOpened((prev) => ({ ...prev, template: true }));
              }}
              className="flex items-center justify-between w-full mb-2 text-left"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-800">
                  Step 1: Pick a template
                </h3>
                {multipleBadges.length > 0 && (
                  <CheckCircleIcon className="w-5 h-5 text-green-600" />
                )}
              </div>
              {sectionsOpen.template ? (
                <ChevronUpIcon className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronDownIcon className="w-5 h-5 text-gray-600" />
              )}
            </button>
            <div
              className={`transition-all duration-300 overflow-hidden ${
                sectionsOpen.template
                  ? "max-h-[2000px] opacity-100"
                  : "max-h-0 opacity-0"
              }`}
            >
              {templates.length === 0 ? (
                <div className="text-sm text-gray-500">
                  Loading templates...
                </div>
              ) : (
                <>
                  {/* Helper function to get thumbnail filename */}
                  {(() => {
                    const getThumbnailFilename = (
                      templateId: string,
                    ): string => {
                      const thumbnailMap: Record<string, string> = {
                        "rect-1x3": "3x1-Round-Corners-Badge",
                        "rect-1_5x3": "3x1.5-Round-Corners-Badge",
                        "oval-1_5x3": "3x1.5-Oval-Badge",
                        "house-1_5x3": "3x1.5-House-Badge",
                        "square-1x3": "3x1-Badge",
                        "square-1_5x3": "3x1.5-Badge",
                        "designer-1x3": "3x1-Designer-Badge",
                        "fancy-1_5x3": "3x1.5-Fancy-Badge",
                      };
                      return thumbnailMap[templateId] || templateId;
                    };

                    const renderTemplateButton = (t: LoadedTemplate) => {
                      const thumbnailFilename = getThumbnailFilename(t.id);
                      const thumbnailPath = `/templates/${thumbnailFilename}.jpg`;
                      const svgPath = t.svgFile
                        ? t.svgFile.includes(" ")
                          ? encodeURI(t.svgFile)
                          : t.svgFile
                        : `/templates/${
                            variant === "sign" ? "sign/" : "badge/"
                          }${t.id}.svg`;
                      const previewSrc =
                        templatePreviewDataUrls[t.id] ||
                        (t.svgFile
                          ? t.svgFile.includes(" ")
                            ? encodeURI(t.svgFile)
                            : t.svgFile
                          : thumbnailPath);
                      const isSelected =
                        multipleBadges.length > 0 &&
                        universalTemplateId === t.id;

                      const signThumbScale =
                        variant === "sign" &&
                        getSignTemplateUiContentScale(t.id) !== 1;
                      return (
                        <div key={t.id} className="relative">
                          <button
                            type="button"
                            className={`relative rounded-lg ${
                              signThumbScale
                                ? "overflow-visible"
                                : "overflow-hidden"
                            } transition-all w-full border bg-white ${
                              isSelected
                                ? "border-blue-600 ring-2 ring-blue-300 shadow-md"
                                : "border-gray-300 hover:border-gray-400"
                            }`}
                            style={{
                              height: "140px",
                              display: "flex",
                              flexDirection: "column",
                            }}
                            onClick={() => {
                              console.log(
                                "[UNIVERSAL] Template changed to:",
                                t.id,
                              );
                              handleUniversalTemplateChange(t.id);
                            }}
                            title={t.name}
                          >
                            <div
                              className={`text-center py-1 flex-shrink-0 leading-tight ${
                                isSelected
                                  ? "bg-blue-600 text-white"
                                  : "bg-gray-200 text-gray-700"
                              }`}
                              style={{
                                fontSize: `${DESIGNER_UI_TYPOGRAPHY.templateNameFontPx}px`,
                              }}
                            >
                              {t.name}
                            </div>
                            <div
                              className={`flex-1 ${
                                signThumbScale
                                  ? "overflow-visible"
                                  : "overflow-hidden"
                              } flex items-center justify-center`}
                              style={{
                                minHeight: 0,
                                width: "100%",
                                height: "100%",
                                padding: "6px",
                                boxSizing: "border-box",
                              }}
                            >
                              <img
                                src={previewSrc}
                                alt={t.name}
                                className="object-contain"
                                style={signTemplatePickerImgStyle(
                                  t.id,
                                  variant === "sign",
                                )}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  if (previewSrc === thumbnailPath) {
                                    target.style.display = "none";
                                    const svgImg =
                                      document.createElement("img");
                                    svgImg.src = svgPath;
                                    svgImg.className = "object-contain";
                                    const st = signTemplatePickerImgStyle(
                                      t.id,
                                      variant === "sign",
                                    );
                                    svgImg.style.maxWidth = String(
                                      st.maxWidth ?? "100%",
                                    );
                                    svgImg.style.maxHeight = String(
                                      st.maxHeight ?? "100%",
                                    );
                                    svgImg.style.width = String(
                                      st.width ?? "auto",
                                    );
                                    svgImg.style.height = String(
                                      st.height ?? "auto",
                                    );
                                    svgImg.style.objectFit = String(
                                      st.objectFit ?? "contain",
                                    );
                                    if (st.transform)
                                      svgImg.style.transform = st.transform;
                                    if (st.transformOrigin != null)
                                      svgImg.style.transformOrigin = String(
                                        st.transformOrigin,
                                      );
                                    svgImg.alt = t.name;
                                    target.parentElement?.appendChild(svgImg);
                                  }
                                }}
                              />
                            </div>
                          </button>
                        </div>
                      );
                    };

                    // Sign: primary shape grid (Classic framed, Standard, Fancy, Designer); more in "more templates"
                    if (variant === "sign") {
                      const handleSignTypeSelect = (
                        type: (typeof SIGN_TEMPLATE_TYPES)[0],
                      ) => {
                        const firstSizeId = type.sizes[0].templateId;
                        setSelectedSignTemplateType(type.id);
                        setUniversalTemplateId(firstSizeId);
                        setSelectedSignSizeTemplateId(null);
                        if (!templateGuidedAutoAdvanceDoneRef.current) {
                          setSectionsOpen({
                            template: false,
                            size: true,
                            export: false,
                            background: false,
                            textLines: false,
                            backing: false,
                            border: false,
                          });
                          setSectionsOpened((prev) => ({
                            ...prev,
                            size: true,
                          }));
                          templateGuidedAutoAdvanceDoneRef.current = true;
                        }
                        handleUniversalTemplateChange(firstSizeId);
                      };
                      return (
                        <>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            {SIGN_TEMPLATE_TYPES.map((type) => {
                              const firstSizeId = type.sizes[0].templateId;
                              const firstTemplate = templates.find(
                                (t) => t.id === firstSizeId,
                              );
                              const previewSrc =
                                templatePreviewDataUrls[firstSizeId] ||
                                (firstTemplate?.svgFile != null
                                  ? firstTemplate.svgFile.includes(" ")
                                    ? encodeURI(firstTemplate.svgFile)
                                    : firstTemplate.svgFile
                                  : "");
                              const isSelected =
                                selectedSignTemplateType === type.id;
                              return (
                                <div key={type.id} className="relative">
                                  <button
                                    type="button"
                                    className={`relative rounded-lg overflow-hidden transition-all w-full border bg-white ${
                                      isSelected
                                        ? "border-blue-600 ring-2 ring-blue-300 shadow-md"
                                        : "border-gray-300 hover:border-gray-400"
                                    }`}
                                    style={{
                                      height: "140px",
                                      display: "flex",
                                      flexDirection: "column",
                                    }}
                                    onClick={() => handleSignTypeSelect(type)}
                                    title={type.name}
                                  >
                                    <div
                                      className={`text-center py-1 flex-shrink-0 leading-tight ${
                                        isSelected
                                          ? "bg-blue-600 text-white"
                                          : "bg-gray-200 text-gray-700"
                                      }`}
                                      style={{
                                        fontSize: `${DESIGNER_UI_TYPOGRAPHY.templateNameFontPx}px`,
                                      }}
                                    >
                                      {type.name}
                                    </div>
                                    <div
                                      className="flex-1 overflow-hidden flex items-center justify-center"
                                      style={{
                                        minHeight: 0,
                                        width: "100%",
                                        height: "100%",
                                        padding: "6px",
                                        boxSizing: "border-box",
                                      }}
                                    >
                                      {previewSrc ? (
                                        <img
                                          src={previewSrc}
                                          alt={type.name}
                                          className="object-contain"
                                          style={{
                                            maxWidth: "100%",
                                            maxHeight: "100%",
                                            width: "auto",
                                            height: "auto",
                                            objectFit: "contain",
                                          }}
                                        />
                                      ) : (
                                        <span
                                          className="text-gray-400 text-center px-1"
                                          style={{
                                            fontSize: `${DESIGNER_UI_TYPOGRAPHY.templateNameFontPx}px`,
                                          }}
                                        >
                                          {type.name}
                                        </span>
                                      )}
                                    </div>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowTemplateModal(true)}
                            className="text-sm text-blue-600 hover:text-blue-800 underline text-right py-1"
                          >
                            more templates
                          </button>
                        </>
                      );
                    }

                    // Badge: featured templates + more templates link
                    const featuredBadgeTemplateIds = [
                      "rect-1x3",
                      "rect-1_5x3",
                      "oval-1_5x3",
                      "house-1_5x3",
                    ];
                    const featuredTemplates = featuredBadgeTemplateIds
                      .map((id) => templates.find((t) => t.id === id))
                      .filter((t): t is LoadedTemplate => t !== undefined);

                    return (
                      <>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          {featuredTemplates.map(renderTemplateButton)}
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowTemplateModal(true)}
                          className="text-sm text-blue-600 hover:text-blue-800 underline text-right py-1"
                        >
                          more templates
                        </button>
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          </div>

          {config.hasSizeStep && (
            /* Step 2: Size (sign only) – always visible; openable only after Step 1 (template type) complete; opens when template selected */
            <div className="mb-4">
              <button
                type="button"
                onClick={() => {
                  if (selectedSignTemplateType == null) {
                    const msg = getIncompleteStepsMessage(2);
                    if (msg) alert(msg);
                    return;
                  }
                  const willBeOpen = !sectionsOpen.size;
                  setSectionsOpen({
                    template: false,
                    size: willBeOpen,
                    export: false,
                    background: false,
                    textLines: false,
                    backing: false,
                    border: false,
                  });
                  if (willBeOpen)
                    setSectionsOpened((prev) => ({ ...prev, size: true }));
                }}
                className="flex items-center justify-between w-full mb-2 text-left"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Step 2: Size
                  </h3>
                  {selectedSignSizeTemplateId != null && (
                    <CheckCircleIcon className="w-5 h-5 text-green-600" />
                  )}
                </div>
                {sectionsOpen.size ? (
                  <ChevronUpIcon className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronDownIcon className="w-5 h-5 text-gray-600" />
                )}
              </button>
              <div
                className={`transition-all duration-300 overflow-hidden ${
                  sectionsOpen.size
                    ? "max-h-[300px] opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                <div className="flex flex-wrap gap-2">
                  {(
                    ALL_SIGN_TEMPLATE_TYPES.find(
                      (t) => t.id === selectedSignTemplateType,
                    )?.sizes ?? []
                  ).map((sizeOpt) => (
                    <button
                      key={sizeOpt.templateId}
                      type="button"
                      onClick={() => {
                        setSelectedSignSizeTemplateId(sizeOpt.templateId);
                        setSignSize(
                          sizeOpt.label.toLowerCase().replace(/\s+/g, "-"),
                        );
                        handleUniversalTemplateChange(sizeOpt.templateId);
                        if (!signSizeGuidedAutoAdvanceDoneRef.current) {
                          setSectionsOpen({
                            template: false,
                            size: false,
                            export: false,
                            background: true,
                            textLines: false,
                            backing: false,
                            border: false,
                          });
                          setSectionsOpened((prev) => ({
                            ...prev,
                            background: true,
                          }));
                          signSizeGuidedAutoAdvanceDoneRef.current = true;
                        }
                      }}
                      className={`px-3 py-2 rounded border text-sm font-medium transition-colors ${
                        selectedSignSizeTemplateId === sizeOpt.templateId
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {sizeOpt.label} ({sizeOpt.sizeText})
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Background Color / Backgrounds */}
          <div className="flex flex-col w-full mb-6">
            {/* Background Color - Smart palette grid (columns = color families, rows = gradients) */}
            <div className="flex flex-col w-full">
              <button
                ref={backgroundSectionRef}
                type="button"
                onClick={() => {
                  const msg = getIncompleteStepsMessage(2);
                  if (msg) {
                    alert(msg);
                    return;
                  }
                  const willBeOpen = !sectionsOpen.background;
                  setSectionsOpen({
                    template: false,
                    size: false,
                    export: false,
                    background: willBeOpen,
                    textLines: false,
                    backing: false,
                    border: false,
                  });
                  setSectionsOpened((prev) => ({ ...prev, background: true }));
                }}
                className="flex items-center justify-between w-full mb-2 text-left"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-800">
                    {config.templatesKey === "sign"
                      ? "Step 3: Pick backgrounds"
                      : "Step 2: Pick a background Color"}
                  </h3>
                  {hasChosenBackgroundColor && (
                    <CheckCircleIcon className="w-5 h-5 text-green-600" />
                  )}
                </div>
                {sectionsOpen.background ? (
                  <ChevronUpIcon className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronDownIcon className="w-5 h-5 text-gray-600" />
                )}
              </button>
              <div
                className={`transition-all duration-300 overflow-hidden ${
                  sectionsOpen.background
                    ? "max-h-[500px] opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                {/* Featured Colors: Black, White, Gold, Silver, Blue, Red */}
                {(() => {
                  const featuredColors = [
                    { value: "#000000", name: "Black", ring: "ring-gray-900" },
                    { value: "#FFFFFF", name: "White", ring: "ring-white" },
                    {
                      value: "#eac10c",
                      name: "Brushed Gold",
                      ring: "ring-yellow-400",
                    },
                    {
                      value: "#C0C0C0",
                      name: "Brushed Silver",
                      ring: "ring-gray-300",
                    },
                    { value: "#0000FF", name: "Blue", ring: "ring-blue-500" },
                    { value: "#FF0000", name: "Red", ring: "ring-red-500" },
                    {
                      value: "rainbow",
                      name: "More Colors",
                      ring: "ring-gray-400",
                      isRainbow: true,
                    },
                  ];

                  const handleColorClick = (colorValue: string) => {
                    // Check if the new background color is similar to any text line colors
                    if (checkBackgroundColorSimilarity(colorValue)) {
                      setPendingBackgroundColor(colorValue);
                      setShowBackgroundColorWarning(true);
                    } else {
                      applyBackgroundColor(colorValue);
                    }
                  };

                  // Parse hex or RGB input and convert to hex
                  const parseColorInput = (input: string): string | null => {
                    const trimmed = input.trim();

                    // Check if it's already a valid hex
                    if (/^#?[0-9A-Fa-f]{6}$/.test(trimmed)) {
                      return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
                    }

                    // Check if it's a 3-digit hex
                    if (/^#?[0-9A-Fa-f]{3}$/.test(trimmed)) {
                      const hex = trimmed.startsWith("#")
                        ? trimmed.slice(1)
                        : trimmed;
                      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
                    }

                    // Check if it's RGB format: rgb(r, g, b) or r, g, b
                    const rgbMatch = trimmed.match(
                      /^rgb\(?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)?$/i,
                    );
                    if (rgbMatch) {
                      const r = parseInt(rgbMatch[1], 10);
                      const g = parseInt(rgbMatch[2], 10);
                      const b = parseInt(rgbMatch[3], 10);
                      if (
                        r >= 0 &&
                        r <= 255 &&
                        g >= 0 &&
                        g <= 255 &&
                        b >= 0 &&
                        b <= 255
                      ) {
                        return `#${r.toString(16).padStart(2, "0")}${g
                          .toString(16)
                          .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
                      }
                    }

                    return null;
                  };

                  return (
                    <>
                      <div className="flex items-start gap-3 ml-1.5 mt-1.5">
                        <div className="flex flex-col gap-2">
                          <div className="grid grid-cols-4 gap-2 w-fit">
                            {featuredColors.map((c) => (
                              <div
                                key={c.value}
                                className="flex flex-col items-center gap-1"
                              >
                                <button
                                  className={`w-12 h-12 border rounded ${
                                    badge.backgroundColor === c.value
                                      ? "ring-2 ring-offset-1 " + c.ring
                                      : ""
                                  }`}
                                  style={
                                    c.isRainbow
                                      ? {
                                          background:
                                            "linear-gradient(to right, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)",
                                        }
                                      : { backgroundColor: c.value }
                                  }
                                  title={c.name}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    if (c.isRainbow) {
                                      setShowColorModal(true);
                                    } else {
                                      handleColorClick(c.value);
                                    }
                                  }}
                                />
                                <span className="text-[8px] text-gray-600 text-center leading-tight">
                                  {c.name === "Brushed Gold" ? (
                                    <>
                                      Brushed
                                      <br />
                                      Gold
                                    </>
                                  ) : c.name === "Brushed Silver" ? (
                                    <>
                                      Brushed
                                      <br />
                                      Silver
                                    </>
                                  ) : c.name === "More Colors" ? (
                                    <>
                                      More
                                      <br />
                                      Colors
                                    </>
                                  ) : (
                                    c.name
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                          {/* Apply to All Button */}
                          {multipleBadges.length > 1 && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={applyBackgroundColorToAll}
                                className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
                                title={`Apply background color to all ${config.labelProductPlural.toLowerCase()}`}
                              >
                                Apply background color to all{" "}
                                {config.labelProductPlural.toLowerCase()}
                              </button>
                            </div>
                          )}
                        </div>
                        {/* Current Color Display - Large square aligned right */}
                        <div className="flex-shrink-0 ml-auto flex flex-col items-center gap-1">
                          <div
                            className="w-24 h-24 md:w-32 md:h-32 border-2 border-gray-300 rounded shadow-sm"
                            style={{
                              backgroundColor:
                                badge.backgroundColor || "#FFFFFF",
                            }}
                            title={`Current background color: ${
                              badge.backgroundColor || "#FFFFFF"
                            }`}
                          />
                          <span className="text-[8px] text-gray-600 text-center">
                            Current color
                          </span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {signBorderStepRequired && (
            <div className="mb-4">
              <button
                ref={borderSectionRef}
                type="button"
                onClick={() => {
                  const msg = getIncompleteStepsMessage(4);
                  if (msg) {
                    alert(msg);
                    return;
                  }
                  const willBeOpen = !sectionsOpen.border;
                  setSectionsOpen({
                    template: false,
                    size: false,
                    export: false,
                    background: false,
                    textLines: false,
                    backing: false,
                    border: willBeOpen,
                  });
                  setSectionsOpened((prev) => ({ ...prev, border: true }));
                }}
                className="flex items-center justify-between w-full mb-2 text-left"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Step 4: Border
                  </h3>
                  {signBorderConfigured && (
                    <CheckCircleIcon className="w-5 h-5 text-green-600" />
                  )}
                </div>
                {sectionsOpen.border ? (
                  <ChevronUpIcon className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronDownIcon className="w-5 h-5 text-gray-600" />
                )}
              </button>
              <div
                className={`transition-all duration-300 overflow-hidden ${
                  sectionsOpen.border
                    ? "max-h-[520px] opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                <div className="mb-3">
                  <p className="text-xs text-gray-600 mb-3">
                    Template previews show the plate shape only. Choose a border
                    type below (including &quot;No border&quot;). With a frame,
                    pick trim color and — on Designer — a center motif.
                  </p>
                  <p className="text-sm text-gray-700 mb-2">Border type</p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {getSignBorderStepChipOptions(universalTemplateId).map(
                      (opt) => {
                        const active = badge.signBorderOptionId === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              const isNone = opt.id === SIGN_BORDER_OPTION_NONE;
                              const next: Badge = {
                                ...badge,
                                signBorderOptionId: opt.id,
                                signBorderEnabled: !isNone,
                                signBorderStyleId: isNone
                                  ? badge.signBorderStyleId ?? "default"
                                  : opt.id,
                                ...(!isNone
                                  ? {
                                      borderColor:
                                        badge.borderColor ?? "#FFFFFF",
                                    }
                                  : {}),
                              };
                              setBadge(next);
                              const ub = [...multipleBadges];
                              if (ub[selectedBadgeIndex]) {
                                ub[selectedBadgeIndex] = next;
                              }
                              setMultipleBadges(ub);
                              if (selectedBadgeIndex === 0) {
                                setBadge1Data(next);
                              }
                            }}
                            className={`px-2.5 py-1.5 rounded border text-xs font-medium transition-colors ${
                              active
                                ? "border-blue-600 bg-blue-50 text-blue-800"
                                : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      },
                    )}
                  </div>
                  {badge.signBorderOptionId === undefined && (
                    <p className="text-xs text-amber-700 mb-3">
                      Select a border type to finish this step.
                    </p>
                  )}
                  {signBorderFramed && (
                    <>
                      <p className="text-sm text-gray-700 mb-2">
                        Color for frame and trim (and Designer center motif when
                        shown)
                      </p>
                      <div className="flex items-start gap-3 ml-1.5 mt-1.5">
                        <div className="flex flex-col gap-2">
                          <div className="grid grid-cols-4 gap-2 w-fit">
                            {[
                              {
                                value: "#000000",
                                name: "Black",
                                ring: "ring-gray-900",
                              },
                              {
                                value: "#FFFFFF",
                                name: "White",
                                ring: "ring-white",
                              },
                              {
                                value: "#eac10c",
                                name: "Brushed Gold",
                                ring: "ring-yellow-400",
                              },
                              {
                                value: "#C0C0C0",
                                name: "Brushed Silver",
                                ring: "ring-gray-300",
                              },
                              {
                                value: "#0000FF",
                                name: "Blue",
                                ring: "ring-blue-500",
                              },
                              {
                                value: "#FF0000",
                                name: "Red",
                                ring: "ring-red-500",
                              },
                              {
                                value: "rainbow",
                                name: "More Colors",
                                ring: "ring-gray-400",
                                isRainbow: true,
                              },
                            ].map((c) => (
                              <div
                                key={c.value}
                                className="flex flex-col items-center gap-1"
                              >
                                <button
                                  type="button"
                                  className={`w-12 h-12 border rounded ${
                                    (badge.borderColor ?? "#FFFFFF") === c.value
                                      ? "ring-2 ring-offset-1 " + c.ring
                                      : ""
                                  }`}
                                  style={
                                    c.isRainbow
                                      ? {
                                          background:
                                            "linear-gradient(to right, #ff0000, #ff7f00, #ffff00, #00ff00, #0000ff, #4b0082, #9400d3)",
                                        }
                                      : { backgroundColor: c.value }
                                  }
                                  title={c.name}
                                  onClick={() => {
                                    if (c.isRainbow) {
                                      setShowBorderColorModal(true);
                                    } else {
                                      setBadge({
                                        ...badge,
                                        borderColor: c.value,
                                      });
                                    }
                                  }}
                                />
                                <span className="text-[8px] text-gray-600 text-center leading-tight">
                                  {c.name === "Brushed Gold" ? (
                                    <>
                                      Brushed
                                      <br />
                                      Gold
                                    </>
                                  ) : c.name === "Brushed Silver" ? (
                                    <>
                                      Brushed
                                      <br />
                                      Silver
                                    </>
                                  ) : c.name === "More Colors" ? (
                                    <>
                                      More
                                      <br />
                                      Colors
                                    </>
                                  ) : (
                                    c.name
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex-shrink-0 ml-auto flex flex-col items-center gap-1">
                          <div
                            className="w-24 h-24 md:w-32 md:h-32 border-2 border-gray-300 rounded shadow-sm"
                            style={{
                              backgroundColor: badge.borderColor ?? "#FFFFFF",
                            }}
                            title={`Current border color: ${
                              badge.borderColor ?? "#FFFFFF"
                            }`}
                          />
                          <span className="text-[8px] text-gray-600 text-center">
                            Current color
                          </span>
                        </div>
                      </div>
                      {selectedSignTemplateType === "designer-heart" &&
                        universalTemplateId.startsWith("designer-") && (
                          <div className="mt-4 w-full">
                            <p className="text-sm text-gray-700 mb-2">
                              Center motif
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {DESIGNER_MOTIF_UI_OPTIONS.map((opt) => {
                                const active =
                                  (badge.designerMotif ?? "heart") === opt.id;
                                const motifSvg = designerMotifPreviewSvgMarkup(
                                  opt.id,
                                );
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    title={opt.label}
                                    onClick={() => {
                                      const next = {
                                        ...badge,
                                        designerMotif: opt.id,
                                      };
                                      setBadge(next);
                                      const ub = [...multipleBadges];
                                      if (ub[selectedBadgeIndex]) {
                                        ub[selectedBadgeIndex] = next;
                                      }
                                      setMultipleBadges(ub);
                                      if (selectedBadgeIndex === 0) {
                                        setBadge1Data(next);
                                      }
                                    }}
                                    className="flex flex-col items-center gap-1"
                                  >
                                    <div
                                      className={`control-button w-11 h-11 md:w-14 md:h-14 flex items-center justify-center rounded border transition-colors ${
                                        active
                                          ? "border-blue-600 bg-blue-50 text-blue-800"
                                          : "border-gray-400 bg-gray-200 text-gray-700 hover:bg-gray-300"
                                      }`}
                                    >
                                      {motifSvg ? (
                                        <span
                                          className="block w-8 h-8 md:w-10 md:h-10 shrink-0 [&>svg]:h-full [&>svg]:w-full [&>svg]:block"
                                          dangerouslySetInnerHTML={{
                                            __html: motifSvg,
                                          }}
                                        />
                                      ) : (
                                        <span className="text-[10px] font-medium px-0.5 text-center leading-tight">
                                          {opt.label}
                                        </span>
                                      )}
                                    </div>
                                    <div
                                      className={`text-[8px] text-center leading-tight max-w-[4.5rem] ${
                                        active
                                          ? "text-blue-800"
                                          : "text-gray-600"
                                      }`}
                                    >
                                      {opt.label}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                    </>
                  )}
                  {badge.signBorderOptionId === SIGN_BORDER_OPTION_NONE && (
                    <p className="text-xs text-gray-500">
                      No frame or decorations; text uses the full plate area.
                    </p>
                  )}
                  {multipleBadges.length > 1 && (
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={applyBorderToAll}
                        className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors whitespace-nowrap"
                        title={
                          !signBorderFramed
                            ? `No frame on all; border color follows each ${config.labelProduct.toLowerCase()}'s background`
                            : `Apply frame style, motif (Designer), and border color to all ${config.labelProductPlural.toLowerCase()}`
                        }
                      >
                        Apply border to all{" "}
                        {config.labelProductPlural.toLowerCase()}
                      </button>
                    </div>
                  )}
                </div>
                {config.borderOptions.length === 0 ? null : (
                  <div className="flex flex-wrap gap-2">
                    {config.borderOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => {
                          setSignBorderId(opt.value);
                        }}
                        className={`px-3 py-2 rounded border text-sm ${
                          signBorderId === opt.value
                            ? "border-blue-600 bg-blue-50"
                            : "border-gray-300 bg-white hover:bg-gray-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Text Lines */}
          <div className="mb-4">
            <button
              ref={textLinesSectionRef}
              type="button"
              onClick={() => {
                const msg = getIncompleteStepsMessage(
                  config.hasSizeStep ? (signBorderStepRequired ? 5 : 4) : 2,
                );
                if (msg) {
                  alert(msg);
                  return;
                }
                const willBeOpen = !sectionsOpen.textLines;
                setSectionsOpen({
                  template: false,
                  size: false,
                  export: false,
                  background: false,
                  textLines: willBeOpen,
                  backing: false,
                  border: false,
                });
                setSectionsOpened((prev) => ({ ...prev, textLines: true }));
              }}
              className="flex items-center justify-between w-full mb-2 text-left"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-800">
                  {config.templatesKey === "sign"
                    ? signBorderStepRequired
                      ? "Step 5: Enter your text"
                      : "Step 4: Enter your text"
                    : "Step 3: Enter your text"}
                </h3>
                {hasStep3TextEntered && (
                  <CheckCircleIcon className="w-5 h-5 text-green-600" />
                )}
                {badge.lines.some(
                  (l) =>
                    l.color &&
                    areColorsSimilar(l.color, badge.backgroundColor, 70),
                ) && (
                  <span className="text-xs text-red-600 font-medium">
                    Please check font colors
                  </span>
                )}
              </div>
              {sectionsOpen.textLines ? (
                <ChevronUpIcon className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronDownIcon className="w-5 h-5 text-gray-600" />
              )}
            </button>
            <div
              className={`transition-all duration-300 overflow-hidden ${
                sectionsOpen.textLines
                  ? "max-h-[5000px] opacity-100"
                  : "max-h-0 opacity-0"
              }`}
            >
              <div className="w-full">
                <div className="flex items-center justify-end mb-4">
                  <button
                    type="button"
                    onClick={addLine}
                    disabled={badge.lines.length >= maxLines}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Add Line ({badge.lines.length}/{maxLines})
                  </button>
                </div>
                <BadgeEditorPanel
                  badge={badge}
                  onLineChange={updateLine}
                  onAlignmentChange={(index, alignment) => {
                    // Save to undo history before making changes
                    saveToUndoHistory({
                      type: "line-property",
                      badgeIndex: selectedBadgeIndex,
                      lineIndex: index,
                      property: "align",
                    });

                    const newLines = badge.lines.map((l, i) => {
                      if (i === index) {
                        // Set both align and alignment for compatibility
                        // For center alignment, ensure xNorm is 0.5 for proper centering
                        const updatedLine = {
                          ...l,
                          align: alignment as "left" | "center" | "right",
                          alignment: alignment as "left" | "center" | "right",
                        };
                        if (alignment === "center") {
                          updatedLine.xNorm = 0.5;
                        }
                        return updatedLine;
                      }
                      return l;
                    }) as BadgeLine[];

                    // Recalculate center positions
                    const centeredLines = calculateCenterPositions(newLines);
                    setBadge({ ...badge, lines: centeredLines });

                    // Update the badge in multipleBadges array
                    const updatedMultipleBadges = [...multipleBadges];
                    if (updatedMultipleBadges[selectedBadgeIndex]) {
                      updatedMultipleBadges[selectedBadgeIndex] = {
                        ...updatedMultipleBadges[selectedBadgeIndex],
                        lines: centeredLines,
                      };
                      setMultipleBadges(updatedMultipleBadges);
                    }

                    // Sync badge1Data if editing the first badge
                    if (selectedBadgeIndex === 0) {
                      setBadge1Data(updatedMultipleBadges[0]);
                    }
                  }}
                  onBackgroundColorChange={(backgroundColor) => {
                    setBadge({ ...badge, backgroundColor });
                    setHasChosenBackgroundColor(true);
                  }}
                  onRemoveLine={removeLine}
                  showRemove={true}
                  maxLines={maxLines}
                  addLineButton={null}
                  resetButton={null}
                  multiBadgeButton={null}
                  editable={true}
                  onOpenTextColorModal={(lineIndex) => {
                    setTextColorModalLineIndex(lineIndex);
                    setShowTextColorModal(true);
                  }}
                  onApplyFormattingToAll={applyFormattingToAllLines}
                  hasMultipleBadges={multipleBadges.length > 1}
                  onResetLineToDefault={resetLineToDefault}
                  variant={variant}
                />
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    onClick={addLine}
                    disabled={badge.lines.length >= maxLines}
                    className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    Add Line ({badge.lines.length}/{maxLines})
                  </button>
                </div>
              </div>
            </div>
          </div>

          {config.hasBacking && (
            /* Step 4: Backing Type */
            <div className="mb-4">
              <button
                ref={backingSectionRef}
                type="button"
                onClick={() => {
                  const msg = getIncompleteStepsMessage(3);
                  if (msg) {
                    alert(msg);
                    return;
                  }
                  const willBeOpen = !sectionsOpen.backing;
                  setSectionsOpen({
                    template: false,
                    size: false,
                    export: false,
                    background: false,
                    textLines: false,
                    backing: willBeOpen,
                    border: false,
                  });
                  setSectionsOpened((prev) => ({ ...prev, backing: true }));
                }}
                className="flex items-center justify-between w-full mb-2 text-left"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Step 4: Choose backing type
                  </h3>
                  {sectionsOpened.backing && (
                    <CheckCircleIcon className="w-5 h-5 text-green-600" />
                  )}
                </div>
                {sectionsOpen.backing ? (
                  <ChevronUpIcon className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronDownIcon className="w-5 h-5 text-gray-600" />
                )}
              </button>
              <div
                className={`transition-all duration-300 overflow-hidden ${
                  sectionsOpen.backing
                    ? "max-h-[200px] opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                <div className="mb-2">
                  <label htmlFor="backing-select" className="sr-only">
                    Backing type
                  </label>
                  <select
                    id="backing-select"
                    value={badge.backing}
                    onChange={(e) => {
                      const value = e.target.value as
                        | "pin"
                        | "magnetic"
                        | "adhesive";
                      setBadge({ ...badge, backing: value });
                      const updatedMultipleBadges = [...multipleBadges];
                      if (updatedMultipleBadges[selectedBadgeIndex]) {
                        updatedMultipleBadges[selectedBadgeIndex] = {
                          ...updatedMultipleBadges[selectedBadgeIndex],
                          backing: value,
                        };
                        setMultipleBadges(updatedMultipleBadges);
                      }
                      if (selectedBadgeIndex === 0) {
                        setBadge1Data(updatedMultipleBadges[0] ?? null);
                      }
                    }}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm text-gray-800 bg-white"
                  >
                    {BADGE_CONSTANTS.BACKING_OPTIONS.map((option) => {
                      const prices = BADGE_CONSTANTS.BACKING_PRICES;
                      const currentPrice = prices[badge.backing] ?? 0;
                      const optionPrice =
                        prices[option.value as keyof typeof prices] ?? 0;
                      const delta = optionPrice - currentPrice;
                      const names: Record<string, string> = {
                        magnetic: "Magnetic",
                        pin: "Pin",
                        adhesive: "Adhesive",
                      };
                      const name = names[option.value] ?? option.value;
                      const label =
                        delta === 0
                          ? name
                          : delta > 0
                          ? `${name} (+$${delta.toFixed(2)})`
                          : `${name} (-$${Math.abs(delta).toFixed(2)})`;
                      return (
                        <option key={option.value} value={option.value}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
                {multipleBadges.length > 1 && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={applyBackingToAll}
                      className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
                      title={`Apply backing type to all ${config.labelProductPlural.toLowerCase()}`}
                    >
                      Apply backing type to all{" "}
                      {config.labelProductPlural.toLowerCase()}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {config.hasBorder && variant !== "sign" && (
            <div className="mb-4">
              <button
                ref={borderSectionRef}
                type="button"
                onClick={() => {
                  const msg = getIncompleteStepsMessage(5);
                  if (msg) {
                    alert(msg);
                    return;
                  }
                  const willBeOpen = !sectionsOpen.border;
                  setSectionsOpen({
                    template: false,
                    size: false,
                    export: false,
                    background: false,
                    textLines: false,
                    backing: false,
                    border: willBeOpen,
                  });
                  setSectionsOpened((prev) => ({ ...prev, border: true }));
                }}
                className="flex items-center justify-between w-full mb-2 text-left"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Border
                  </h3>
                  {sectionsOpened.border && (
                    <CheckCircleIcon className="w-5 h-5 text-green-600" />
                  )}
                </div>
                {sectionsOpen.border ? (
                  <ChevronUpIcon className="w-5 h-5 text-gray-600" />
                ) : (
                  <ChevronDownIcon className="w-5 h-5 text-gray-600" />
                )}
              </button>
              <div
                className={`transition-all duration-300 overflow-hidden ${
                  sectionsOpen.border
                    ? "max-h-[400px] opacity-100"
                    : "max-h-0 opacity-0"
                }`}
              >
                {config.borderOptions.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No border options yet.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {config.borderOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSignBorderId(opt.value)}
                        className={`px-3 py-2 rounded border text-sm ${
                          signBorderId === opt.value
                            ? "border-blue-600 bg-blue-50"
                            : "border-gray-300 bg-white hover:bg-gray-50"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Actions - below all steps */}
          <div className="flex justify-end items-start gap-1.5 md:gap-3 mb-4 flex-wrap">
            <div className="flex flex-col items-center gap-1">
              <button
                className="control-button w-11 h-11 md:w-14 md:h-14 flex items-center justify-center bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-400 rounded transition-colors disabled:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={(e) => {
                  e.preventDefault();
                  handleUndo();
                }}
                disabled={undoHistory.length === 0}
                title="Undo last change"
              >
                <ArrowUturnLeftIcon className="w-5 h-5 md:w-6 md:h-6" />
              </button>
              <div className="text-[8px] text-gray-600 text-center leading-tight">
                Undo
              </div>
            </div>

            <div className="flex flex-col items-center gap-1">
              <button
                className="control-button w-11 h-11 md:w-14 md:h-14 flex items-center justify-center bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-400 rounded transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  resetBadge();
                }}
                title={`Reset current ${config.labelProduct.toLowerCase()} to default settings`}
              >
                <ArrowPathRoundedSquareIcon className="w-5 h-5 md:w-6 md:h-6" />
              </button>
              <div className="text-[8px] text-gray-600 text-center leading-tight">
                Reset
                <br />
                this {config.labelProduct}
              </div>
            </div>

            {multipleBadges.length > 1 && (
              <div className="flex flex-col items-center gap-1">
                <button
                  className="control-button w-11 h-11 md:w-14 md:h-14 flex items-center justify-center bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-400 rounded transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    resetAllBadges();
                  }}
                  title={`Reset all ${config.labelProductPlural.toLowerCase()} to default settings`}
                >
                  <ArrowPathIconOutline className="w-5 h-5 md:w-6 md:h-6" />
                </button>
                <div className="text-[8px] text-gray-600 text-center leading-tight">
                  Reset
                  <br />
                  All {config.labelProductPlural}
                </div>
              </div>
            )}

            {multipleBadges.length > 1 && (
              <div className="flex flex-col items-center gap-1">
                <button
                  className="control-button w-11 h-11 md:w-14 md:h-14 flex items-center justify-center bg-green-500 text-white hover:bg-green-600 border border-green-600 rounded transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    applyAllFormattingToAll();
                  }}
                  title={`Apply background color and all text formatting from current ${config.labelProduct.toLowerCase()} to all ${config.labelProductPlural.toLowerCase()}`}
                >
                  <Square2StackIcon className="w-5 h-5 md:w-6 md:h-6" />
                </button>
                <div className="text-[8px] text-gray-600 text-center leading-tight">
                  Apply Format
                  <br />
                  to All {config.labelProductPlural}
                </div>
              </div>
            )}

            <div className="flex flex-col items-center gap-1">
              <button
                className="control-button w-11 h-11 md:w-14 md:h-14 flex items-center justify-center bg-blue-500 text-white hover:bg-blue-600 border border-blue-600 rounded transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  setCsvText("");
                  setCsvPreview([]);
                  setCsvError("");
                  setShowCsvModal(true);
                }}
                title={`Add multiple ${config.labelProductPlural.toLowerCase()} from CSV file or data`}
              >
                <SquaresPlusIcon className="w-5 h-5 md:w-6 md:h-6" />
              </button>
              <div className="text-[8px] text-gray-600 text-center leading-tight">
                Add Multiple
                <br />
                {config.labelProductPlural}
              </div>
            </div>

            <div className="flex flex-col items-center gap-1">
              <button
                className="control-button w-11 h-11 md:w-14 md:h-14 flex items-center justify-center bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-400 rounded transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  setShowHelpModal(true);
                }}
                title="Help - Learn about all the buttons"
              >
                <QuestionMarkCircleIcon className="w-5 h-5 md:w-6 md:h-6" />
              </button>
              <div className="text-[8px] text-gray-600 text-center leading-tight">
                Help <br></br> Center
              </div>
            </div>
          </div>

          {/* Save / Add to cart */}
          <div className="flex justify-end mt-2 mb-4 gap-2">
            <button
              className="bg-white text-[#283238] px-4 py-2 rounded shadow"
              onClick={(e) => {
                e.preventDefault();
                saveBadge();
              }}
            >
              Save Design
            </button>
            <button
              type="button"
              title="Log in to load a previous design"
              className="bg-white text-[#283238] px-4 py-2 rounded shadow"
              onClick={(e) => {
                e.preventDefault();
                onLoadDesignClick();
              }}
            >
              Load Design
            </button>
            <button
              className={`px-4 py-2 rounded shadow ${
                isAddingToCart || isGeneratingDesigns || !stepsComplete
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              } text-white`}
              onClick={(e) => {
                e.preventDefault();
                if (isAddingToCart || isGeneratingDesigns) return;
                if (!stepsComplete) {
                  const msg = getIncompleteStepsMessage(
                    incompleteStepsForCart(),
                  );
                  alert(
                    msg
                      ? `${msg} and finalize your design before adding to the cart.`
                      : "Please complete your design before adding to the cart.",
                  );
                  return;
                }
                addToCart();
              }}
              disabled={isAddingToCart || isGeneratingDesigns}
            >
              {isAddingToCart
                ? "Adding to Cart..."
                : isGeneratingDesigns
                ? "Generating..."
                : stepsComplete
                ? `Add to Cart - ${addToCartPriceLabel}`
                : "Add to Cart"}
            </button>
          </div>

          {/* Export Options (visible for sign designer for testing; badge when SHOW_EXPORT_OPTIONS) */}
          {(SHOW_EXPORT_OPTIONS || variant === "sign") && (
            <div className="mb-4">
              {(() => {
                const exportBaseName = variant === "sign" ? "sign" : "badge";
                return (
                  <>
                    <button
                      ref={exportSectionRef}
                      type="button"
                      onClick={() => {
                        const willBeOpen = !sectionsOpen.export;
                        setSectionsOpen({
                          template: false,
                          size: false,
                          export: willBeOpen,
                          background: false,
                          textLines: false,
                          backing: false,
                          border: false,
                        });
                      }}
                      className="flex items-center justify-between w-full mb-2 text-left"
                    >
                      <h3 className="text-lg font-semibold text-gray-800">
                        Export Options
                      </h3>
                      {sectionsOpen.export ? (
                        <ChevronUpIcon className="w-5 h-5 text-gray-600" />
                      ) : (
                        <ChevronDownIcon className="w-5 h-5 text-gray-600" />
                      )}
                    </button>
                    <div
                      className={`mt-4 flex flex-wrap gap-1 transition-all duration-300 overflow-hidden ${
                        sectionsOpen.export
                          ? "max-h-[500px] opacity-100"
                          : "max-h-0 opacity-0"
                      }`}
                    >
                      <button
                        className="px-2 py-1 text-xs border rounded"
                        onClick={async () => {
                          if (multipleBadges.length > 1) {
                            const allBadges = getAllBadges(multipleBadges);
                            const allTemplates = getAllTemplates(
                              multipleBadges,
                              templates,
                            );
                            downloadMultipleSVGs(
                              allBadges,
                              allTemplates,
                              exportBaseName,
                            );
                          } else {
                            const badgeToExport = badge1Data || badge;
                            await downloadSVG(
                              {
                                ...badgeToExport,
                                id: badgeToExport.id || exportBaseName,
                                templateId:
                                  badgeToExport.templateId ||
                                  universalTemplateId,
                              },
                              activeTemplate,
                              `${exportBaseName}.svg`,
                            );
                          }
                        }}
                      >
                        SVG
                      </button>
                      <button
                        className="px-2 py-1 text-xs border rounded"
                        onClick={async () => {
                          if (multipleBadges.length > 1) {
                            const allBadges = getAllBadges(multipleBadges);
                            const allTemplates = getAllTemplates(
                              multipleBadges,
                              templates,
                            );
                            downloadMultiplePNGs(
                              allBadges,
                              allTemplates,
                              exportBaseName,
                            );
                          } else {
                            const badgeToExport = badge1Data || badge;
                            await downloadPNG(
                              {
                                ...badgeToExport,
                                id: badgeToExport.id || exportBaseName,
                                templateId:
                                  badgeToExport.templateId ||
                                  universalTemplateId,
                              },
                              activeTemplate,
                              `${exportBaseName}.png`,
                              2,
                            );
                          }
                        }}
                      >
                        PNG
                      </button>
                      <button
                        className="px-2 py-1 text-xs border rounded"
                        onClick={async () => {
                          if (multipleBadges.length > 1) {
                            const allBadges = getAllBadges(multipleBadges);
                            const allTemplates = getAllTemplates(
                              multipleBadges,
                              templates,
                            );
                            downloadMultipleTIFFs(
                              allBadges,
                              allTemplates,
                              exportBaseName,
                            );
                          } else {
                            const badgeToExport = badge1Data || badge;
                            await downloadTIFF(
                              {
                                ...badgeToExport,
                                id: badgeToExport.id || exportBaseName,
                                templateId:
                                  badgeToExport.templateId ||
                                  universalTemplateId,
                              },
                              activeTemplate,
                              `${exportBaseName}.tiff`,
                              4,
                            );
                          }
                        }}
                      >
                        TIFF
                      </button>
                      <button
                        className="px-2 py-1 text-xs border rounded"
                        onClick={async () => {
                          if (multipleBadges.length > 1) {
                            const allBadges = getAllBadges(multipleBadges);
                            const allTemplates = getAllTemplates(
                              multipleBadges,
                              templates,
                            );
                            downloadMultipleCDRs(
                              allBadges,
                              allTemplates,
                              exportBaseName,
                            );
                          } else {
                            const badgeToExport = badge1Data || badge;
                            await downloadCDR(
                              {
                                ...badgeToExport,
                                id: badgeToExport.id || exportBaseName,
                                templateId:
                                  badgeToExport.templateId ||
                                  universalTemplateId,
                              },
                              activeTemplate,
                              `${exportBaseName}.cdr`,
                            );
                          }
                        }}
                      >
                        CDR (Artwork)
                      </button>
                      <button
                        className="px-2 py-1 text-xs border rounded"
                        onClick={async () => {
                          try {
                            if (multipleBadges.length > 1) {
                              const allBadges = getAllBadges(multipleBadges);
                              await generatePDF(
                                allBadges[0],
                                allBadges.slice(1),
                                config.labelProduct,
                                variant,
                              );
                            } else {
                              const badgeToExport = badge1Data || badge;
                              await generatePDF(
                                {
                                  ...badgeToExport,
                                  id: badgeToExport.id || exportBaseName,
                                  templateId:
                                    badgeToExport.templateId ||
                                    universalTemplateId,
                                },
                                undefined,
                                config.labelProduct,
                                variant,
                              );
                            }
                          } catch (error) {
                            console.error("Error generating PDF:", error);
                            alert("Error generating PDF. Please try again.");
                          }
                        }}
                      >
                        PDF
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 text-xs border border-amber-400 rounded bg-amber-50 text-amber-800 hover:bg-amber-100"
                        onClick={() => {
                          const cacheKey = `${BADGE_DESIGNER_CACHE_PREFIX}-${
                            _shop ?? "default"
                          }-${_productId ?? "default"}`;
                          const message =
                            "This will clear all saved design data and reset to a single default badge. You will need to start over. Continue?";
                          if (!window.confirm(message)) return;
                          try {
                            localStorage.removeItem(cacheKey);
                          } catch {
                            // ignore
                          }
                          const defaultBadge: Badge = {
                            ...INITIAL_BADGE,
                            lines: INITIAL_BADGE.lines.map((line) => ({
                              ...line,
                            })),
                          };
                          setMultipleBadges([]);
                          setBadge(defaultBadge);
                          setSelectedBadgeIndex(0);
                          setHasChosenBackgroundColor(false);
                          setSectionsOpened({
                            template: false,
                            size: false,
                            export: false,
                            background: false,
                            textLines: false,
                            backing: false,
                            border: false,
                          });
                          setSectionsOpen({
                            template: true,
                            size: false,
                            export: false,
                            background: false,
                            textLines: false,
                            backing: false,
                            border: false,
                          });
                          setUniversalTemplateId(
                            variant === "sign"
                              ? SIGN_TEMPLATE_TYPES[0].sizes[0].templateId
                              : "rect-1x3",
                          );
                          if (variant === "sign") {
                            setSelectedSignTemplateType(null);
                            setSelectedSignSizeTemplateId(null);
                          }
                          setBadge1Data(null);
                          sessionDesignIdRef.current = null;
                          guidedFlowCompletedRef.current = false;
                          templateGuidedAutoAdvanceDoneRef.current = false;
                          signSizeGuidedAutoAdvanceDoneRef.current = false;
                          restoredFromCacheRef.current = true;
                          setUndoHistory([]);
                        }}
                        title="Clear localStorage cache and reset to initial state (no steps completed)"
                      >
                        Clear cache & reset (dev)
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN - Badge preview (Desktop only). Current badge at top; rest in scrollable area. */}
      <div
        className={`hidden md:flex md:w-1/2 md:pl-3 flex-col items-center min-h-0 pt-3 ${
          multipleBadges.length > 1 ? "md:h-[90vh]" : ""
        }`}
      >
        <div className="relative flex items-center justify-center w-full mb-4 flex-shrink-0 min-h-[5.5rem]">
          <h2 className="text-xl font-bold text-center">
            {config.labelProduct} Preview
          </h2>
          <div className="absolute right-0 top-0 flex flex-col items-center gap-1">
            <button
              type="button"
              className="w-14 h-14 flex items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
              onClick={() => setShowBadgeGridModal(true)}
              aria-label={`View all ${config.labelProductPlural.toLowerCase()}`}
              title={`View all ${config.labelProductPlural.toLowerCase()}`}
            >
              <Squares2X2Icon className="w-6 h-6" />
            </button>
            <div className="text-[8px] text-gray-600 text-center leading-tight">
              Grid
              <br />
              View
            </div>
          </div>
        </div>
        <div
          className={`relative w-full ${
            multipleBadges.length > 1
              ? "flex-1 min-h-0 flex flex-col overflow-hidden"
              : ""
          }`}
        >
          {isGeneratingDesigns && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/85 rounded-lg border-2 border-blue-200">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-gray-300 border-t-blue-600 mb-2" />
              <span className="text-gray-700 font-medium">
                Generating {config.labelProduct.toLowerCase()} designs
              </span>
              <span className="text-gray-500 text-sm mt-1">
                Saving to database…
              </span>
            </div>
          )}
          {multipleBadges.length === 0 ? (
            <div className="flex flex-col items-center justify-center w-full h-[200px] flex-shrink-0 text-center text-gray-500 text-sm px-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50/50">
              Select a shape below to get started
            </div>
          ) : multipleBadges.length === 1 ? (
            <div className="flex flex-col items-center justify-center w-full flex-shrink-0 min-w-0 relative">
              <div className="absolute z-20 left-2 top-2 flex items-center gap-1.5">
                <button
                  type="button"
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                  onClick={(e) => {
                    e.preventDefault();
                    duplicateCurrentBadge();
                  }}
                  aria-label={`Duplicate ${config.labelProduct.toLowerCase()}`}
                  title={`Duplicate this ${config.labelProduct.toLowerCase()}`}
                >
                  <DocumentDuplicateIcon className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                  onClick={(e) => {
                    e.preventDefault();
                    deleteCurrentBadgeFromPreview();
                  }}
                  aria-label={`Delete ${config.labelProduct.toLowerCase()}`}
                  title={`Delete this ${config.labelProduct.toLowerCase()}`}
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
              {(() => {
                const tid = getBadgeForPreview(
                  0,
                  getSavedBadgeFor(0),
                ).templateId;
                const { widthPx: dimW, heightPx: dimH } =
                  previewDimensionsForTemplate(tid);
                return (
                  <DesktopPreviewDimensionFrame widthPx={dimW} heightPx={dimH}>
                    <div
                      className="w-full flex items-center justify-center"
                      style={{
                        overflow: "hidden",
                        ...desktopPreviewSlotStyle,
                      }}
                    >
                      <BadgeSvgRenderer
                        variant={variant}
                        badge={getBadgeForPreview(0, getSavedBadgeFor(0)).badge}
                        templateId={tid}
                        height="100%"
                      />
                    </div>
                  </DesktopPreviewDimensionFrame>
                );
              })()}
            </div>
          ) : (
            <div className="flex flex-col w-full items-center gap-4 flex-1 min-h-0">
              {/* Current badge being edited - fixed at top */}
              <div className="flex flex-col items-center w-full flex-shrink-0">
                <div
                  className="font-semibold text-blue-600 mb-1"
                  style={{
                    fontSize: `${DESIGNER_UI_TYPOGRAPHY.nowEditingFontRem}rem`,
                  }}
                >
                  Now editing {config.labelProduct.toLowerCase()}{" "}
                  {selectedBadgeIndex + 1}
                </div>
                {(() => {
                  const tid = getBadgeForPreview(
                    selectedBadgeIndex,
                    getSavedBadgeFor(selectedBadgeIndex),
                  ).templateId;
                  const { widthPx: dimW, heightPx: dimH } =
                    previewDimensionsForTemplate(tid);
                  return (
                    <div className="relative w-full border-2 border-blue-400 rounded-lg bg-blue-50/50 py-2 px-1 flex-shrink-0">
                      <div className="absolute z-20 left-2 top-2 flex items-center gap-1.5">
                        <button
                          type="button"
                          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                          onClick={(e) => {
                            e.preventDefault();
                            duplicateCurrentBadge();
                          }}
                          aria-label={`Duplicate ${config.labelProduct.toLowerCase()}`}
                          title={`Duplicate this ${config.labelProduct.toLowerCase()}`}
                        >
                          <DocumentDuplicateIcon className="w-5 h-5" />
                        </button>
                        <button
                          type="button"
                          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                          onClick={(e) => {
                            e.preventDefault();
                            deleteCurrentBadgeFromPreview();
                          }}
                          aria-label={`Delete ${config.labelProduct.toLowerCase()}`}
                          title={`Delete this ${config.labelProduct.toLowerCase()}`}
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                      <DesktopPreviewDimensionFrame
                        widthPx={dimW}
                        heightPx={dimH}
                      >
                        <div
                          className="w-full flex items-center justify-center"
                          style={{
                            overflow: "hidden",
                            ...desktopPreviewSlotStyle,
                          }}
                        >
                          <BadgeSvgRenderer
                            variant={variant}
                            badge={
                              getBadgeForPreview(
                                selectedBadgeIndex,
                                getSavedBadgeFor(selectedBadgeIndex),
                              ).badge
                            }
                            templateId={tid}
                            height="100%"
                          />
                        </div>
                      </DesktopPreviewDimensionFrame>
                    </div>
                  );
                })()}
              </div>

              {/* Rest: scrollable list - click Edit to bring that badge to the top */}
              <div className="flex flex-col gap-4 w-full flex-1 min-h-0 overflow-y-auto">
                {Array.from({ length: totalBadges }, (_, i) => i)
                  .filter((i) => i !== selectedBadgeIndex)
                  .map((i) => {
                    const saved = getSavedBadgeFor(i);
                    const { badge: b, templateId: tid } = getBadgeForPreview(
                      i,
                      saved,
                    );

                    // Check if this badge has color similarity issues
                    const hasColorIssues = b.lines.some(
                      (l: BadgeLine) =>
                        l.color &&
                        areColorsSimilar(l.color, b.backgroundColor, 70),
                    );

                    return (
                      <div
                        key={i}
                        className="flex flex-row items-center gap-2 w-full flex-shrink-0"
                      >
                        <div className="flex flex-col items-center justify-center mr-2">
                          <div
                            className="flex items-center gap-1 mb-2"
                            style={{ width: 32, justifyContent: "center" }}
                          >
                            <span className="text-lg font-bold">{i + 1}.</span>
                            {hasColorIssues && (
                              <div
                                className="relative w-4 h-4 flex items-center justify-center"
                                title="Some text may not show well. Please check font colors"
                              >
                                <svg
                                  className="w-4 h-4 h-full text-red-600"
                                  viewBox="0 0 20 20"
                                  fill="currentColor"
                                >
                                  <circle
                                    cx="10"
                                    cy="10"
                                    r="9"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    fill="none"
                                  />
                                  <line
                                    x1="5"
                                    y1="5"
                                    x2="15"
                                    y2="15"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                  />
                                </svg>
                              </div>
                            )}
                          </div>
                          <button
                            className="control-button flex items-center justify-center text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200"
                            onClick={(e) => {
                              e.preventDefault();
                              selectBadge(i);
                            }}
                          >
                            Edit
                          </button>
                          <div className="h-2" />
                          <div className="flex gap-1">
                            <button
                              type="button"
                              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                              onClick={(e) => {
                                e.preventDefault();
                                duplicateBadgeAtIndex(i);
                              }}
                              title={`Duplicate ${config.labelProduct.toLowerCase()} ${
                                i + 1
                              }`}
                              aria-label={`Duplicate ${config.labelProduct.toLowerCase()} ${
                                i + 1
                              }`}
                            >
                              <DocumentDuplicateIcon className="w-4 h-4" />
                            </button>
                            {multipleBadges.length > 1 && (
                              <button
                                type="button"
                                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                                onClick={(e) => {
                                  e.preventDefault();
                                  const closeGridAfter =
                                    multipleBadges.length === 2;
                                  removeBadgeAtIndex(i);
                                  if (closeGridAfter) {
                                    setShowBadgeGridModal(false);
                                  }
                                }}
                                title={`Delete ${config.labelProduct.toLowerCase()} ${
                                  i + 1
                                }`}
                                aria-label={`Delete ${config.labelProduct.toLowerCase()} ${
                                  i + 1
                                }`}
                              >
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div
                          className="min-w-0 flex-1 flex-shrink-0 cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={(e) => {
                            e.preventDefault();
                            selectBadge(i);
                          }}
                          title={`Click to edit this ${config.labelProduct.toLowerCase()}`}
                        >
                          {(() => {
                            const { widthPx: dimW, heightPx: dimH } =
                              previewDimensionsForTemplate(tid);
                            return (
                              <DesktopPreviewDimensionFrame
                                widthPx={dimW}
                                heightPx={dimH}
                                compact
                              >
                                <div
                                  className="w-full flex items-center justify-center"
                                  style={{
                                    overflow: "hidden",
                                    ...desktopPreviewSlotStyle,
                                  }}
                                >
                                  <BadgeSvgRenderer
                                    variant={variant}
                                    badge={b}
                                    templateId={tid}
                                    height="100%"
                                  />
                                </div>
                              </DesktopPreviewDimensionFrame>
                            );
                          })()}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MOBILE: Step progress bar as fixed footer at bottom, full width */}
      <div className="flex-shrink-0 md:hidden w-full border-t border-gray-200 bg-gray-100 px-4 py-3">
        <div className="flex items-center justify-center gap-4 w-full">
          {(() => {
            const signBgReady =
              selectedSignSizeTemplateId != null && hasChosenBackgroundColor;
            const mobileSteps =
              variant === "sign" && config.hasSizeStep
                ? [
                    {
                      label: "Template",
                      done: selectedSignTemplateType != null,
                      current: selectedSignTemplateType == null,
                    },
                    {
                      label: "Size",
                      done: selectedSignSizeTemplateId != null,
                      current:
                        selectedSignTemplateType != null &&
                        selectedSignSizeTemplateId == null,
                    },
                    {
                      label: "Backgrounds",
                      done: hasChosenBackgroundColor,
                      current:
                        selectedSignSizeTemplateId != null &&
                        !hasChosenBackgroundColor,
                    },
                    ...(signBorderStepRequired
                      ? [
                          {
                            label: "Border",
                            done: signBorderConfigured,
                            current: signBgReady && !signBorderConfigured,
                          },
                        ]
                      : []),
                    {
                      label: "Text",
                      done: hasStep3TextEntered,
                      current:
                        (signBorderStepRequired
                          ? signBorderConfigured
                          : signBgReady) && !hasStep3TextEntered,
                    },
                  ]
                : [
                    {
                      label: "Template",
                      done: multipleBadges.length > 0,
                      current: multipleBadges.length === 0,
                    },
                    {
                      label: "Background",
                      done: hasChosenBackgroundColor,
                      current:
                        multipleBadges.length > 0 && !hasChosenBackgroundColor,
                    },
                    {
                      label: "Text",
                      done: hasStep3TextEntered,
                      current: hasChosenBackgroundColor && !hasStep3TextEntered,
                    },
                    {
                      label: "Backing",
                      done: sectionsOpened.backing,
                      current: hasStep3TextEntered && !sectionsOpened.backing,
                    },
                  ];
            return mobileSteps.map((step, i) => (
              <React.Fragment key={i}>
                {i > 0 && (
                  <div
                    className={`flex-1 min-w-4 h-0.5 rounded ${
                      mobileSteps[i - 1].done ? "bg-green-600" : "bg-gray-200"
                    }`}
                  />
                )}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center ${
                      step.done
                        ? "bg-green-600 text-white"
                        : step.current
                        ? "bg-green-600 text-white ring-2 ring-green-300"
                        : "bg-gray-200"
                    }`}
                  >
                    {step.done ? (
                      <CheckIcon className="w-4 h-4 stroke-[2.5]" />
                    ) : (
                      <span
                        className={`text-xs font-semibold ${
                          step.current ? "text-white" : "text-gray-500"
                        }`}
                      >
                        {i + 1}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-600 mt-1 whitespace-nowrap">
                    {step.label}
                  </span>
                </div>
              </React.Fragment>
            ));
          })()}
        </div>
      </div>

      {/* Badge grid picker modal (mobile + desktop) */}
      {showBadgeGridModal && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50 p-4"
          onClick={() => setShowBadgeGridModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Select ${config.labelProduct.toLowerCase()} to edit`}
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-bold text-gray-800">
                Select {config.labelProduct.toLowerCase()} to edit
              </h3>
              <button
                type="button"
                className="p-2 text-gray-500 hover:text-gray-700"
                onClick={() => setShowBadgeGridModal(false)}
                aria-label="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 overflow-y-auto flex-1 min-h-0">
              {Array.from({ length: totalBadges }, (_, i) => {
                const { badge: b, templateId: tid } = getBadgeForPreview(
                  i,
                  getSavedBadgeFor(i),
                );
                const isSelected = selectedBadgeIndex === i;

                // Check if this badge has color similarity issues
                const hasColorIssues = b.lines.some(
                  (l: BadgeLine) =>
                    l.color && areColorsSimilar(l.color, b.backgroundColor, 70),
                );

                return (
                  <div
                    key={i}
                    className={`relative flex flex-col items-center p-2 rounded-lg border-2 transition-colors ${
                      isSelected
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    {/* Duplicate + delete (delete only when multiple) */}
                    <div className="absolute top-1 right-1 z-10 flex gap-0.5">
                      <button
                        type="button"
                        className="flex h-6 w-6 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateBadgeAtIndex(i);
                          setShowBadgeGridModal(false);
                        }}
                        title={`Duplicate ${config.labelProduct.toLowerCase()}`}
                        aria-label={`Duplicate ${config.labelProduct.toLowerCase()} ${
                          i + 1
                        }`}
                      >
                        <DocumentDuplicateIcon className="w-3.5 h-3.5" />
                      </button>
                      {multipleBadges.length > 1 && (
                        <button
                          type="button"
                          className="flex h-6 w-6 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            const closeGridAfter = multipleBadges.length === 2;
                            removeBadgeAtIndex(i);
                            if (closeGridAfter) {
                              setShowBadgeGridModal(false);
                            }
                          }}
                          title={`Delete ${config.labelProduct.toLowerCase()}`}
                          aria-label={`Delete ${config.labelProduct.toLowerCase()} ${
                            i + 1
                          }`}
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Clickable preview */}
                    <button
                      type="button"
                      className="w-full flex flex-col items-center"
                      onClick={() => {
                        selectBadge(i);
                        setShowBadgeGridModal(false);
                      }}
                    >
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-sm font-bold text-gray-700">
                          {i + 1}.
                        </span>
                        {hasColorIssues && (
                          <div
                            className="relative w-4 h-4 flex items-center justify-center"
                            title="Some text may not show well. Please check font colors"
                          >
                            <svg
                              className="w-4 h-4 h-full text-red-600"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                            >
                              <circle
                                cx="10"
                                cy="10"
                                r="9"
                                stroke="currentColor"
                                strokeWidth="1.5"
                                fill="none"
                              />
                              <line
                                x1="5"
                                y1="5"
                                x2="15"
                                y2="15"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                              />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div
                        className="w-full flex items-center justify-center"
                        style={{ height: 80 }}
                      >
                        <BadgeSvgRenderer
                          variant={variant}
                          badge={b}
                          templateId={tid}
                          height={80}
                        />
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Template Modal - All Templates */}
      {showTemplateModal && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50 p-4"
          onClick={() => setShowTemplateModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Select template"
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-bold text-gray-800">
                Select Template
              </h3>
              <div className="flex items-center gap-2">
                {variant !== "sign" && (
                  <>
                    <label className="text-sm text-gray-600">Sort by:</label>
                    <select
                      value={templateSortBy}
                      onChange={(e) =>
                        setTemplateSortBy(
                          e.target.value as
                            | "popularity"
                            | "size"
                            | "alphabetical",
                        )
                      }
                      className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                    >
                      <option value="popularity">Popularity</option>
                      <option value="size">Size(Height)</option>
                      <option value="alphabetical">Alphabetical</option>
                    </select>
                  </>
                )}
                <button
                  type="button"
                  className="p-2 text-gray-500 hover:text-gray-700"
                  onClick={() => setShowTemplateModal(false)}
                  aria-label="Close"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-4 overflow-y-auto flex-1 min-h-0">
              {templates.length === 0 ? (
                <div className="text-sm text-gray-500 col-span-full text-center py-4">
                  Loading templates...
                </div>
              ) : variant === "sign" ? (
                /* Sign: same shape cards as main view; on select close modal and open size step */
                (() => {
                  const signConfigs = getTemplateConfigsForVariant("sign");
                  const handleSignTypeSelectInModal = (
                    type: (typeof ALL_SIGN_TEMPLATE_TYPES)[number],
                  ) => {
                    const firstSizeId = type.sizes[0].templateId;
                    setShowTemplateModal(false);
                    setSelectedSignTemplateType(type.id);
                    setUniversalTemplateId(firstSizeId);
                    setSelectedSignSizeTemplateId(null);
                    if (!templateGuidedAutoAdvanceDoneRef.current) {
                      setSectionsOpen({
                        template: false,
                        size: true,
                        export: false,
                        background: false,
                        textLines: false,
                        backing: false,
                        border: false,
                      });
                      setSectionsOpened((prev) => ({ ...prev, size: true }));
                      templateGuidedAutoAdvanceDoneRef.current = true;
                    }
                    handleUniversalTemplateChange(firstSizeId);
                  };
                  return (
                    <>
                      {ALL_SIGN_TEMPLATE_TYPES.map((type) => {
                        const firstSizeId = type.sizes[0].templateId;
                        const firstTemplate = templates.find(
                          (t) => t.id === firstSizeId,
                        );
                        const configSvgFile = signConfigs.find(
                          (c) => c.id === firstSizeId,
                        )?.svgFile;
                        const previewSrc =
                          templatePreviewDataUrls[firstSizeId] ||
                          (firstTemplate?.svgFile != null
                            ? firstTemplate.svgFile.includes(" ")
                              ? encodeURI(firstTemplate.svgFile)
                              : firstTemplate.svgFile
                            : configSvgFile != null
                            ? configSvgFile.includes(" ")
                              ? encodeURI(configSvgFile)
                              : configSvgFile
                            : "");
                        const isSelected = selectedSignTemplateType === type.id;
                        const modalSignThumbBoost =
                          getSignTemplateUiContentScale(firstSizeId) !== 1;
                        return (
                          <div key={type.id} className="relative">
                            <button
                              type="button"
                              className={`relative rounded-lg ${
                                modalSignThumbBoost
                                  ? "overflow-visible"
                                  : "overflow-hidden"
                              } transition-all w-full border bg-white ${
                                isSelected
                                  ? "border-blue-600 ring-2 ring-blue-300 shadow-md"
                                  : "border-gray-300 hover:border-gray-400"
                              }`}
                              style={{
                                height: "140px",
                                display: "flex",
                                flexDirection: "column",
                              }}
                              onClick={() => handleSignTypeSelectInModal(type)}
                              title={type.name}
                            >
                              <div
                                className={`text-center py-1 flex-shrink-0 leading-tight ${
                                  isSelected
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-200 text-gray-700"
                                }`}
                                style={{
                                  fontSize: `${DESIGNER_UI_TYPOGRAPHY.templateNameFontPx}px`,
                                }}
                              >
                                {type.name}
                              </div>
                              <div
                                className={`flex-1 ${
                                  modalSignThumbBoost
                                    ? "overflow-visible"
                                    : "overflow-hidden"
                                } flex items-center justify-center`}
                                style={{
                                  minHeight: 0,
                                  width: "100%",
                                  height: "100%",
                                  padding: "6px",
                                  boxSizing: "border-box",
                                }}
                              >
                                {previewSrc ? (
                                  <img
                                    src={previewSrc}
                                    alt={type.name}
                                    className="object-contain"
                                    style={signTemplatePickerImgStyle(
                                      firstSizeId,
                                      true,
                                    )}
                                  />
                                ) : (
                                  <span
                                    className="text-gray-400 text-center px-1"
                                    style={{
                                      fontSize: `${DESIGNER_UI_TYPOGRAPHY.templateNameFontPx}px`,
                                    }}
                                  >
                                    {type.name}
                                  </span>
                                )}
                              </div>
                            </button>
                          </div>
                        );
                      })}
                    </>
                  );
                })()
              ) : (
                (() => {
                  // Badge: sort templates based on selected option
                  const sortedTemplates = [...templates].sort((a, b) => {
                    if (templateSortBy === "popularity") {
                      // Popularity order: rect-1x3, rect-1_5x3, oval-1_5x3, house-1_5x3, square-1x3, square-1_5x3, fancy-1_5x3, designer-1x3
                      const popularityOrder: Record<string, number> = {
                        "rect-1x3": 1,
                        "rect-1_5x3": 2,
                        "oval-1_5x3": 3,
                        "house-1_5x3": 4,
                        "square-1x3": 5,
                        "square-1_5x3": 6,
                        "fancy-1_5x3": 7,
                        "designer-1x3": 8,
                      };
                      const aOrder = popularityOrder[a.id] ?? 999;
                      const bOrder = popularityOrder[b.id] ?? 999;
                      return aOrder - bOrder;
                    } else if (templateSortBy === "size") {
                      // Sort by height (heightPx)
                      return a.heightPx - b.heightPx;
                    } else {
                      // Alphabetical by name
                      return a.name.localeCompare(b.name);
                    }
                  });

                  return sortedTemplates.map((t): JSX.Element => {
                    const getThumbnailFilename = (
                      templateId: string,
                    ): string => {
                      const thumbnailMap: Record<string, string> = {
                        "rect-1x3": "3x1-Round-Corners-Badge",
                        "rect-1_5x3": "3x1.5-Round-Corners-Badge",
                        "oval-1_5x3": "3x1.5-Oval-Badge",
                        "house-1_5x3": "3x1.5-House-Badge",
                        "square-1x3": "3x1-Badge",
                        "square-1_5x3": "3x1.5-Badge",
                        "designer-1x3": "3x1-Designer-Badge",
                        "fancy-1_5x3": "3x1.5-Fancy-Badge",
                      };
                      return thumbnailMap[templateId] || templateId;
                    };

                    const thumbnailFilename = getThumbnailFilename(t.id);
                    const thumbnailPath = `/templates/${thumbnailFilename}.jpg`;
                    const svgPath = t.svgFile
                      ? t.svgFile.includes(" ")
                        ? encodeURI(t.svgFile)
                        : t.svgFile
                      : `/templates/badge/${t.id}.svg`;
                    const previewSrc =
                      templatePreviewDataUrls[t.id] ||
                      (t.svgFile
                        ? t.svgFile.includes(" ")
                          ? encodeURI(t.svgFile)
                          : t.svgFile
                        : thumbnailPath);
                    const isSelected =
                      multipleBadges.length > 0 && universalTemplateId === t.id;

                    return (
                      <div key={t.id} className="relative">
                        <button
                          type="button"
                          className={`relative rounded-lg overflow-hidden transition-all w-full border bg-white ${
                            isSelected
                              ? "border-blue-600 ring-2 ring-blue-300 shadow-md"
                              : "border-gray-300 hover:border-gray-400"
                          }`}
                          style={{
                            height: "140px",
                            display: "flex",
                            flexDirection: "column",
                          }}
                          onClick={() => {
                            console.log(
                              "[UNIVERSAL] Template changed to:",
                              t.id,
                            );
                            handleUniversalTemplateChange(t.id);
                            setShowTemplateModal(false);
                          }}
                          title={t.name}
                        >
                          <div
                            className={`text-center py-1 flex-shrink-0 leading-tight ${
                              isSelected
                                ? "bg-blue-600 text-white"
                                : "bg-gray-200 text-gray-700"
                            }`}
                            style={{
                              fontSize: `${DESIGNER_UI_TYPOGRAPHY.templateNameFontPx}px`,
                            }}
                          >
                            {t.name}
                          </div>
                          <div
                            className="flex-1 overflow-hidden flex items-center justify-center"
                            style={{
                              minHeight: 0,
                              width: "100%",
                              height: "100%",
                              padding: "6px",
                              boxSizing: "border-box",
                            }}
                          >
                            <img
                              src={previewSrc}
                              alt={t.name}
                              className="object-contain"
                              style={{
                                maxWidth: "100%",
                                maxHeight: "100%",
                                width: "auto",
                                height: "auto",
                                objectFit: "contain",
                              }}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                if (previewSrc === thumbnailPath) {
                                  target.style.display = "none";
                                  const svgImg = document.createElement("img");
                                  svgImg.src = svgPath;
                                  svgImg.className = "object-contain";
                                  svgImg.style.maxWidth = "100%";
                                  svgImg.style.maxHeight = "100%";
                                  svgImg.style.width = "auto";
                                  svgImg.style.height = "auto";
                                  svgImg.style.objectFit = "contain";
                                  svgImg.alt = t.name;
                                  target.parentElement?.appendChild(svgImg);
                                }
                              }}
                            />
                          </div>
                        </button>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        </div>
      )}

      {/* Color Modal - All Colors */}
      {showColorModal && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50 p-4"
          onClick={() => setShowColorModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Select background color"
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-800">
                Select Background Color
              </h3>
              <button
                type="button"
                className="p-2 text-gray-500 hover:text-gray-700"
                onClick={() => setShowColorModal(false)}
                aria-label="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            {(() => {
              // Extra row with 200-level colors (9 colors)
              const extraRow200 = [
                { value: "#FFFFFF", name: "White", ring: "ring-white" },
                { value: "#fecaca", name: "Red 200", ring: "ring-red-200" },
                {
                  value: "#fed7aa",
                  name: "Orange 200",
                  ring: "ring-orange-200",
                },
                {
                  value: "#fef08a",
                  name: "Yellow 200",
                  ring: "ring-yellow-200",
                },
                { value: "#bbf7d0", name: "Green 200", ring: "ring-green-200" },
                { value: "#a5f3fc", name: "Cyan 200", ring: "ring-cyan-200" },
                { value: "#bfdbfe", name: "Blue 200", ring: "ring-blue-200" },
                {
                  value: "#e9d5ff",
                  name: "Purple 200",
                  ring: "ring-purple-200",
                },
                { value: "#fde68a", name: "Amber 200", ring: "ring-amber-200" },
              ];

              // Desktop order: extra row + all SMART_PALETTE_COLORS (columns = color families)
              const desktopOrder = [...extraRow200, ...SMART_PALETTE_COLORS];

              // Mobile order: TRANSPOSE so rows = color families, columns = lightness levels
              // SMART_PALETTE_COLORS is organized as: 5 rows × 9 columns
              // Each row is a lightness level, each column is a color family
              // We want: 9 rows × 6 columns (each row is a color family, each column is a lightness level)

              const reorganizedForMobile: Array<{
                value: string;
                name: string;
                ring: string;
              }> = [];

              // Color families in order: Gray, Red, Orange, Yellow, Green, Cyan, Blue, Purple, Brown
              // For each color family (column index 0-8)
              for (let familyIndex = 0; familyIndex < 9; familyIndex++) {
                // Get the 200-level color for this family (from extraRow200)
                reorganizedForMobile.push(extraRow200[familyIndex]);

                // Get all lightness levels for this family from SMART_PALETTE_COLORS
                // Each row in SMART_PALETTE_COLORS represents a lightness level
                // We need to extract the color at position [row][familyIndex] for each row
                for (let lightnessRow = 0; lightnessRow < 5; lightnessRow++) {
                  const rowStart = lightnessRow * 9;
                  const colorAtFamily =
                    SMART_PALETTE_COLORS[rowStart + familyIndex];
                  reorganizedForMobile.push(colorAtFamily);
                }
              }

              const renderColorButton = (c: {
                value: string;
                name: string;
                ring: string;
              }) => (
                <div
                  key={c.value}
                  className="relative flex items-center justify-center"
                >
                  <button
                    className={`w-8 h-8 md:w-12 md:h-12 border-2 rounded transition-all ${
                      badge.backgroundColor === c.value
                        ? "ring-2 ring-offset-1 " + c.ring + " scale-110"
                        : "border-gray-300 hover:scale-105"
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                    onClick={(e) => {
                      e.preventDefault();
                      // Check if the new background color is similar to any text line colors
                      if (checkBackgroundColorSimilarity(c.value)) {
                        setPendingBackgroundColor(c.value);
                        setShowBackgroundColorWarning(true);
                        setShowColorModal(false);
                      } else {
                        applyBackgroundColor(c.value);
                        setShowColorModal(false);
                      }
                    }}
                  />
                </div>
              );

              return (
                <>
                  {/* Mobile: 6 columns, transposed order (rows = color families, columns = lightness levels) */}
                  <div className="grid grid-cols-6 gap-1.5 p-3 overflow-y-auto flex-1 min-h-0 overflow-x-hidden md:hidden">
                    {reorganizedForMobile.map(renderColorButton)}
                  </div>
                  {/* Desktop: 9 columns, original order (columns = color families, rows = lightness levels) */}
                  <div className="hidden md:grid grid-cols-9 gap-3 p-4 overflow-y-auto flex-1 min-h-0 overflow-x-hidden">
                    {desktopOrder.map(renderColorButton)}
                  </div>
                </>
              );
            })()}
            {/* Custom Color Input */}
            <div className="border-t p-3 md:p-4 flex-shrink-0">
              {(() => {
                // Parse hex or RGB input and convert to hex
                const parseColorInput = (input: string): string | null => {
                  const trimmed = input.trim();

                  // Check if it's already a valid hex
                  if (/^#?[0-9A-Fa-f]{6}$/.test(trimmed)) {
                    return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
                  }

                  // Check if it's a 3-digit hex
                  if (/^#?[0-9A-Fa-f]{3}$/.test(trimmed)) {
                    const hex = trimmed.startsWith("#")
                      ? trimmed.slice(1)
                      : trimmed;
                    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
                  }

                  // Check if it's RGB format: rgb(r, g, b) or r, g, b
                  const rgbMatch = trimmed.match(
                    /^rgb\(?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)?$/i,
                  );
                  if (rgbMatch) {
                    const r = parseInt(rgbMatch[1], 10);
                    const g = parseInt(rgbMatch[2], 10);
                    const b = parseInt(rgbMatch[3], 10);
                    if (
                      r >= 0 &&
                      r <= 255 &&
                      g >= 0 &&
                      g <= 255 &&
                      b >= 0 &&
                      b <= 255
                    ) {
                      return `#${r.toString(16).padStart(2, "0")}${g
                        .toString(16)
                        .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
                    }
                  }

                  return null;
                };

                const previewColor = parseColorInput(customColorInput);
                const isValidColor = previewColor !== null;

                const handleApplyCustomColor = () => {
                  if (previewColor) {
                    // Check if the new background color is similar to any text line colors
                    if (checkBackgroundColorSimilarity(previewColor)) {
                      setPendingBackgroundColor(previewColor);
                      setShowBackgroundColorWarning(true);
                      setShowColorModal(false);
                      setCustomColorInput("");
                    } else {
                      applyBackgroundColor(previewColor);
                      setShowColorModal(false);
                      setCustomColorInput("");
                    }
                  }
                };

                return (
                  <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3">
                    <label className="text-sm font-medium text-gray-700 md:flex-shrink-0">
                      Custom Color:
                    </label>
                    <div className="flex items-center gap-2 border border-gray-300 rounded px-2 py-1 bg-white flex-1 min-w-0">
                      <div
                        className="w-6 h-6 md:w-8 md:h-8 border border-gray-300 rounded flex-shrink-0"
                        style={{
                          backgroundColor: isValidColor
                            ? previewColor
                            : "#f3f4f6",
                        }}
                        title={isValidColor ? previewColor : "Invalid color"}
                      />
                      <input
                        type="text"
                        value={customColorInput}
                        onChange={(e) => setCustomColorInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && isValidColor) {
                            handleApplyCustomColor();
                          }
                        }}
                        placeholder="Hex #xxxxxx or RGB (r, g, b)"
                        className="text-sm flex-1 min-w-0 border-0 outline-0 focus:outline-0"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyCustomColor}
                      disabled={!isValidColor}
                      className={`px-4 py-2 text-sm rounded transition-colors flex-shrink-0 ${
                        isValidColor
                          ? "bg-blue-500 text-white hover:bg-blue-600"
                          : "bg-gray-300 text-gray-500 cursor-not-allowed"
                      }`}
                    >
                      Apply
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Border Color Modal - All Colors (sign designer) */}
      {showBorderColorModal && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50 p-4"
          onClick={() => {
            setShowBorderColorModal(false);
            setCustomBorderColorInput("");
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Select border color"
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-800">
                Select Border Color
              </h3>
              <button
                type="button"
                className="p-2 text-gray-500 hover:text-gray-700"
                onClick={() => {
                  setShowBorderColorModal(false);
                  setCustomBorderColorInput("");
                }}
                aria-label="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            {(() => {
              const extraRow200 = [
                { value: "#FFFFFF", name: "White", ring: "ring-white" },
                { value: "#fecaca", name: "Red 200", ring: "ring-red-200" },
                {
                  value: "#fed7aa",
                  name: "Orange 200",
                  ring: "ring-orange-200",
                },
                {
                  value: "#fef08a",
                  name: "Yellow 200",
                  ring: "ring-yellow-200",
                },
                { value: "#bbf7d0", name: "Green 200", ring: "ring-green-200" },
                { value: "#a5f3fc", name: "Cyan 200", ring: "ring-cyan-200" },
                { value: "#bfdbfe", name: "Blue 200", ring: "ring-blue-200" },
                {
                  value: "#e9d5ff",
                  name: "Purple 200",
                  ring: "ring-purple-200",
                },
                { value: "#fde68a", name: "Amber 200", ring: "ring-amber-200" },
              ];
              const desktopOrder = [...extraRow200, ...SMART_PALETTE_COLORS];
              const reorganizedForMobile: Array<{
                value: string;
                name: string;
                ring: string;
              }> = [];
              for (let familyIndex = 0; familyIndex < 9; familyIndex++) {
                reorganizedForMobile.push(extraRow200[familyIndex]);
                for (let lightnessRow = 0; lightnessRow < 5; lightnessRow++) {
                  const rowStart = lightnessRow * 9;
                  const colorAtFamily =
                    SMART_PALETTE_COLORS[rowStart + familyIndex];
                  reorganizedForMobile.push(colorAtFamily);
                }
              }
              const currentBorder = badge.borderColor ?? "#FFFFFF";
              const renderBorderColorButton = (c: {
                value: string;
                name: string;
                ring: string;
              }) => (
                <div
                  key={c.value}
                  className="relative flex items-center justify-center"
                >
                  <button
                    className={`w-8 h-8 md:w-12 md:h-12 border-2 rounded transition-all ${
                      currentBorder === c.value
                        ? "ring-2 ring-offset-1 " + c.ring + " scale-110"
                        : "border-gray-300 hover:scale-105"
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                    onClick={() => {
                      setBadge({ ...badge, borderColor: c.value });
                      setShowBorderColorModal(false);
                      setCustomBorderColorInput("");
                    }}
                  />
                </div>
              );
              return (
                <>
                  <div className="grid grid-cols-6 gap-1.5 p-3 overflow-y-auto flex-1 min-h-0 overflow-x-hidden md:hidden">
                    {reorganizedForMobile.map(renderBorderColorButton)}
                  </div>
                  <div className="hidden md:grid grid-cols-9 gap-3 p-4 overflow-y-auto flex-1 min-h-0 overflow-x-hidden">
                    {desktopOrder.map(renderBorderColorButton)}
                  </div>
                </>
              );
            })()}
            <div className="border-t p-3 md:p-4 flex-shrink-0">
              {(() => {
                const parseColorInput = (input: string): string | null => {
                  const trimmed = input.trim();
                  if (/^#?[0-9A-Fa-f]{6}$/.test(trimmed))
                    return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
                  if (/^#?[0-9A-Fa-f]{3}$/.test(trimmed)) {
                    const hex = trimmed.startsWith("#")
                      ? trimmed.slice(1)
                      : trimmed;
                    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
                  }
                  const rgbMatch = trimmed.match(
                    /^rgb\(?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)?$/i,
                  );
                  if (rgbMatch) {
                    const r = parseInt(rgbMatch[1], 10);
                    const g = parseInt(rgbMatch[2], 10);
                    const b = parseInt(rgbMatch[3], 10);
                    if (
                      r >= 0 &&
                      r <= 255 &&
                      g >= 0 &&
                      g <= 255 &&
                      b >= 0 &&
                      b <= 255
                    ) {
                      return `#${r.toString(16).padStart(2, "0")}${g
                        .toString(16)
                        .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
                    }
                  }
                  return null;
                };
                const previewColor = parseColorInput(customBorderColorInput);
                const isValidColor = previewColor !== null;
                const handleApplyBorderCustomColor = () => {
                  if (previewColor) {
                    setBadge({ ...badge, borderColor: previewColor });
                    setShowBorderColorModal(false);
                    setCustomBorderColorInput("");
                  }
                };
                return (
                  <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3">
                    <label className="text-sm font-medium text-gray-700 md:flex-shrink-0">
                      Custom Color:
                    </label>
                    <div className="flex items-center gap-2 border border-gray-300 rounded px-2 py-1 bg-white flex-1 min-w-0">
                      <div
                        className="w-6 h-6 md:w-8 md:h-8 border border-gray-300 rounded flex-shrink-0"
                        style={{
                          backgroundColor: isValidColor
                            ? previewColor!
                            : "#f3f4f6",
                        }}
                        title={isValidColor ? previewColor! : "Invalid color"}
                      />
                      <input
                        type="text"
                        value={customBorderColorInput}
                        onChange={(e) =>
                          setCustomBorderColorInput(e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && isValidColor)
                            handleApplyBorderCustomColor();
                        }}
                        placeholder="Hex #xxxxxx or RGB (r, g, b)"
                        className="text-sm flex-1 min-w-0 border-0 outline-0 focus:outline-0"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyBorderCustomColor}
                      disabled={!isValidColor}
                      className={`px-4 py-2 text-sm rounded transition-colors flex-shrink-0 ${
                        isValidColor
                          ? "bg-blue-500 text-white hover:bg-blue-600"
                          : "bg-gray-300 text-gray-500 cursor-not-allowed"
                      }`}
                    >
                      Apply
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Text Color Modal - All Colors */}
      {showTextColorModal && textColorModalLineIndex !== null && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50 p-4"
          onClick={() => {
            setShowTextColorModal(false);
            setTextColorModalLineIndex(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Select text color"
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-800">
                Select Text Color for Line {textColorModalLineIndex + 1}
              </h3>
              <button
                type="button"
                className="p-2 text-gray-500 hover:text-gray-700"
                onClick={() => {
                  setShowTextColorModal(false);
                  setTextColorModalLineIndex(null);
                }}
                aria-label="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            {(() => {
              // Extra row with 200-level colors (9 colors)
              const extraRow200 = [
                { value: "#FFFFFF", name: "White", ring: "ring-white" },
                { value: "#fecaca", name: "Red 200", ring: "ring-red-200" },
                {
                  value: "#fed7aa",
                  name: "Orange 200",
                  ring: "ring-orange-200",
                },
                {
                  value: "#fef08a",
                  name: "Yellow 200",
                  ring: "ring-yellow-200",
                },
                { value: "#bbf7d0", name: "Green 200", ring: "ring-green-200" },
                { value: "#a5f3fc", name: "Cyan 200", ring: "ring-cyan-200" },
                { value: "#bfdbfe", name: "Blue 200", ring: "ring-blue-200" },
                {
                  value: "#e9d5ff",
                  name: "Purple 200",
                  ring: "ring-purple-200",
                },
                { value: "#fde68a", name: "Amber 200", ring: "ring-amber-200" },
              ];

              // Desktop order: extra row + all SMART_PALETTE_COLORS (columns = color families)
              const desktopOrder = [...extraRow200, ...SMART_PALETTE_COLORS];

              // Mobile order: TRANSPOSE so rows = color families, columns = lightness levels
              const reorganizedForMobile: Array<{
                value: string;
                name: string;
                ring: string;
              }> = [];

              // For each color family (column index 0-8)
              for (let familyIndex = 0; familyIndex < 9; familyIndex++) {
                // Get the 200-level color for this family (from extraRow200)
                reorganizedForMobile.push(extraRow200[familyIndex]);

                // Get all lightness levels for this family from SMART_PALETTE_COLORS
                for (let lightnessRow = 0; lightnessRow < 5; lightnessRow++) {
                  const rowStart = lightnessRow * 9;
                  const colorAtFamily =
                    SMART_PALETTE_COLORS[rowStart + familyIndex];
                  reorganizedForMobile.push(colorAtFamily);
                }
              }

              const currentLine = badge.lines[textColorModalLineIndex];
              const currentColor = currentLine?.color || "#000000";

              // Normalize background color for comparison
              const normalizedBackgroundColor = badge.backgroundColor
                ? (badge.backgroundColor.trim().startsWith("#")
                    ? badge.backgroundColor.trim()
                    : `#${badge.backgroundColor.trim()}`
                  ).toUpperCase()
                : "#FFFFFF";

              const renderColorButton = (c: {
                value: string;
                name: string;
                ring: string;
              }) => {
                // Normalize color value for comparison
                const normalizedColorValue = c.value.trim().startsWith("#")
                  ? c.value.trim()
                  : `#${c.value.trim()}`;

                const isDisabled = areColorsSimilar(
                  normalizedColorValue,
                  normalizedBackgroundColor,
                  70,
                );
                const isRed = isRedColor(normalizedColorValue);

                return (
                  <div
                    key={c.value}
                    className="relative flex items-center justify-center"
                  >
                    <button
                      className={`w-8 h-8 md:w-12 md:h-12 border-2 rounded transition-all ${
                        currentColor === c.value && !isDisabled
                          ? "ring-2 ring-offset-1 " + c.ring + " scale-110"
                          : isDisabled
                          ? "border-gray-400 opacity-50 cursor-not-allowed"
                          : "border-gray-300 hover:scale-105"
                      }`}
                      style={{
                        backgroundColor: c.value,
                      }}
                      title={
                        isDisabled ? "Too similar to background color" : c.name
                      }
                      onClick={(e) => {
                        e.preventDefault();
                        if (!isDisabled) {
                          updateLine(textColorModalLineIndex, {
                            color: c.value,
                          });
                          setShowTextColorModal(false);
                          setTextColorModalLineIndex(null);
                        }
                      }}
                      disabled={isDisabled}
                    />
                    {isDisabled && (
                      <span className="pointer-events-none absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
                        <svg
                          className="w-5 h-5 md:w-7 md:h-7"
                          viewBox="0 0 20 20"
                        >
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
                  </div>
                );
              };

              return (
                <>
                  {/* Mobile: 6 columns, transposed order (rows = color families, columns = lightness levels) */}
                  <div className="grid grid-cols-6 gap-1.5 p-3 overflow-y-auto flex-1 min-h-0 overflow-x-hidden md:hidden">
                    {reorganizedForMobile.map(renderColorButton)}
                  </div>
                  {/* Desktop: 9 columns, original order (columns = color families, rows = lightness levels) */}
                  <div className="hidden md:grid grid-cols-9 gap-3 p-4 overflow-y-auto flex-1 min-h-0 overflow-x-hidden">
                    {desktopOrder.map(renderColorButton)}
                  </div>
                </>
              );
            })()}
            {/* Custom Text Color Input */}
            <div className="border-t p-3 md:p-4 flex-shrink-0">
              {(() => {
                // Parse hex or RGB input and convert to hex
                const parseColorInput = (input: string): string | null => {
                  const trimmed = input.trim();

                  // Check if it's already a valid hex
                  if (/^#?[0-9A-Fa-f]{6}$/.test(trimmed)) {
                    return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
                  }

                  // Check if it's a 3-digit hex
                  if (/^#?[0-9A-Fa-f]{3}$/.test(trimmed)) {
                    const hex = trimmed.startsWith("#")
                      ? trimmed.slice(1)
                      : trimmed;
                    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`;
                  }

                  // Check if it's RGB format: rgb(r, g, b) or r, g, b
                  const rgbMatch = trimmed.match(
                    /^rgb\(?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)?$/i,
                  );
                  if (rgbMatch) {
                    const r = parseInt(rgbMatch[1], 10);
                    const g = parseInt(rgbMatch[2], 10);
                    const b = parseInt(rgbMatch[3], 10);
                    if (
                      r >= 0 &&
                      r <= 255 &&
                      g >= 0 &&
                      g <= 255 &&
                      b >= 0 &&
                      b <= 255
                    ) {
                      return `#${r.toString(16).padStart(2, "0")}${g
                        .toString(16)
                        .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
                    }
                  }

                  return null;
                };

                const previewColor = parseColorInput(customTextColorInput);
                const isValidColor = previewColor !== null;

                const handleApplyCustomTextColor = () => {
                  if (previewColor && textColorModalLineIndex !== null) {
                    updateLine(textColorModalLineIndex, {
                      color: previewColor,
                    });
                    setShowTextColorModal(false);
                    setTextColorModalLineIndex(null);
                    setCustomTextColorInput("");
                  }
                };

                return (
                  <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3">
                    <label className="text-sm font-medium text-gray-700 md:flex-shrink-0">
                      Custom Color:
                    </label>
                    <div className="flex items-center gap-2 border border-gray-300 rounded px-2 py-1 bg-white flex-1 min-w-0">
                      <div
                        className="w-6 h-6 md:w-8 md:h-8 border border-gray-300 rounded flex-shrink-0"
                        style={{
                          backgroundColor: isValidColor
                            ? previewColor
                            : "#f3f4f6",
                        }}
                        title={isValidColor ? previewColor : "Invalid color"}
                      />
                      <input
                        type="text"
                        value={customTextColorInput}
                        onChange={(e) =>
                          setCustomTextColorInput(e.target.value)
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && isValidColor) {
                            handleApplyCustomTextColor();
                          }
                        }}
                        placeholder="Hex #xxxxxx or RGB (r, g, b)"
                        className="text-sm flex-1 min-w-0 border-0 outline-0 focus:outline-0"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyCustomTextColor}
                      disabled={!isValidColor}
                      className={`px-4 py-2 text-sm rounded transition-colors flex-shrink-0 ${
                        isValidColor
                          ? "bg-blue-500 text-white hover:bg-blue-600"
                          : "bg-gray-300 text-gray-500 cursor-not-allowed"
                      }`}
                    >
                      Apply
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Background Color Warning Modal - text will be updated to contrast */}
      {showBackgroundColorWarning && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50 p-4"
          onClick={() => {
            setShowBackgroundColorWarning(false);
            setPendingBackgroundColor(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Background color warning"
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                Text color will be updated
              </h3>
              <button
                type="button"
                className="p-2 text-gray-500 hover:text-gray-700"
                onClick={() => {
                  setShowBackgroundColorWarning(false);
                  setPendingBackgroundColor(null);
                }}
                aria-label="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-700 mb-2">
              This background is similar to some of your text colors. The
              following will be updated so text stays readable:
            </p>
            {pendingBackgroundColor &&
              (() => {
                const SIMILAR_THRESHOLD = 70;
                const normalizedBg = (
                  pendingBackgroundColor.trim().startsWith("#")
                    ? pendingBackgroundColor.trim()
                    : `#${pendingBackgroundColor.trim()}`
                ).toUpperCase();
                const contrastingHex = getContrastingTextColor(
                  pendingBackgroundColor,
                );
                const contrastingName =
                  contrastingHex === "#FFFFFF" ? "white" : "black";
                const indices: number[] = [];
                badge.lines.forEach((line, i) => {
                  if (!line.color) return;
                  const normalizedLine = (
                    line.color.trim().startsWith("#")
                      ? line.color.trim()
                      : `#${line.color.trim()}`
                  ).toUpperCase();
                  if (
                    areColorsSimilar(
                      normalizedBg,
                      normalizedLine,
                      SIMILAR_THRESHOLD,
                    )
                  )
                    indices.push(i + 1);
                });
                const lineLabel =
                  indices.length === 1
                    ? `Line ${indices[0]}`
                    : indices.map((n) => `Line ${n}`).join(", ");
                return (
                  <p className="text-gray-700 mb-6 font-medium">
                    {lineLabel} →{" "}
                    <span
                      style={{
                        color:
                          contrastingHex === "#FFFFFF" ? "#6b7280" : "#111827",
                      }}
                    >
                      {contrastingName}
                    </span>{" "}
                    text
                  </p>
                );
              })()}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                onClick={() => {
                  setShowBackgroundColorWarning(false);
                  setPendingBackgroundColor(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded hover:bg-blue-600 transition-colors"
                onClick={() => {
                  if (pendingBackgroundColor) {
                    applyBackgroundColorWithContrastUpdate(
                      pendingBackgroundColor,
                    );
                  }
                  setShowBackgroundColorWarning(false);
                  setPendingBackgroundColor(null);
                }}
              >
                Update background & text color
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Supabase Color Warning Modal */}
      {showSupabaseColorWarning && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50 p-4"
          onClick={() => {
            setShowSupabaseColorWarning(false);
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Color similarity warning"
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                Color Similarity Warning
              </h3>
              <button
                type="button"
                className="p-2 text-gray-500 hover:text-gray-700"
                onClick={() => {
                  setShowSupabaseColorWarning(false);
                }}
                aria-label="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <p className="text-gray-700 mb-6">
              Some text colors may not show well with the selected background
              color. Please review your badge design before uploading to
              Supabase.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
                onClick={() => {
                  setShowSupabaseColorWarning(false);
                }}
              >
                Review
              </button>
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded hover:bg-purple-700 transition-colors"
                onClick={() => {
                  setShowSupabaseColorWarning(false);
                  executeSendToSupabase();
                }}
              >
                I have verified my designs continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl"
              onClick={(e) => {
                e.preventDefault();
                setCsvText("");
                setCsvPreview([]);
                setCsvError("");
                setShowCsvModal(false);
              }}
              aria-label="Close"
            >
              &times;
            </button>
            <h3 className="text-lg font-bold mb-2">
              Add or Create Multiple {config.labelProductPlural}
            </h3>
            <p className="mb-2 text-sm text-gray-700">
              {addMultipleCopy.csvModalSteps.map((step, idx) => (
                <span key={idx}>
                  {idx > 0 ? <br /> : null}
                  {step}
                </span>
              ))}
            </p>
            <div className="mb-2 text-sm">
              <b>Example:</b>
              <br />
              {addMultipleCopy.csvExampleRows.map((row, idx) => (
                <React.Fragment key={idx}>
                  <span className="font-mono bg-gray-100 p-1 rounded inline-block mb-1">
                    {row}
                  </span>
                  {idx < addMultipleCopy.csvExampleRows.length - 1 ? (
                    <br />
                  ) : null}
                </React.Fragment>
              ))}
            </div>
            <div className="mb-2">
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvFile}
                className="mb-2"
              />
            </div>
            <textarea
              className="w-full border rounded p-2 mb-2 text-sm text-gray-900 bg-white"
              rows={4}
              placeholder={addMultipleCopy.csvTextareaPlaceholder}
              value={csvText}
              onChange={(e) => {
                setCsvText(e.target.value);
                previewCsv(e.target.value);
              }}
            />
            {csvError && (
              <div className="text-red-600 text-sm mb-2">{csvError}</div>
            )}
            {csvPreview.length > 0 && (
              <div className="mb-2">
                <div className="font-semibold mb-1">
                  Preview ({csvPreview.length} row
                  {csvPreview.length === 1 ? "" : "s"})
                </div>
                {/* Scrollable container: show ~10 rows worth of height, max 40vh so it shrinks on short screens */}
                <div
                  className="border rounded overflow-y-auto bg-white"
                  style={{
                    maxHeight: "min(280px, 40vh)",
                    minHeight: "80px",
                  }}
                >
                  <table className="w-full text-xs border-collapse">
                    <tbody>
                      {csvPreview.map((row, i) => (
                        <tr key={i} className="border-t border-gray-200">
                          {row.map((cell, j) => (
                            <td
                              key={j}
                              className="border border-gray-200 px-2 py-1"
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <button
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-1 rounded mr-2"
                onClick={(e) => {
                  e.preventDefault();
                  setCsvText("");
                  setCsvPreview([]);
                  setCsvError("");
                  setShowCsvModal(false);
                }}
              >
                Cancel
              </button>
              <button
                className={`px-3 py-1 rounded ${
                  csvError || !csvText.trim()
                    ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700 text-white"
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  if (csvText.trim() && !csvError) {
                    if (multipleBadges.length === 0) {
                      parseCsv(csvText, true, (newBadges) =>
                        runDraftSaveForBadges(newBadges),
                      );
                      if (!csvError) {
                        setCsvText("");
                        setCsvPreview([]);
                        setCsvError("");
                        setShowCsvModal(false);
                      }
                    } else {
                      setShowCsvWarningModal(true);
                    }
                  }
                }}
                disabled={!!csvError || !csvText.trim()}
              >
                Add {config.labelProductPlural}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Warning Modal - asks user to override or add */}
      {showCsvWarningModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl"
              onClick={(e) => {
                e.preventDefault();
                setShowCsvWarningModal(false);
                setPendingCsvAction(null);
              }}
              aria-label="Close"
            >
              &times;
            </button>
            <h3 className="text-lg font-bold mb-2">
              Existing {config.labelProductPlural} Found
            </h3>
            <p className="mb-4 text-sm text-gray-700">
              You currently have {multipleBadges.length} existing{" "}
              {multipleBadges.length !== 1
                ? config.labelProductPlural.toLowerCase()
                : config.labelProduct.toLowerCase()}
              . Choose how to add your new{" "}
              {config.labelProductPlural.toLowerCase()}:
            </p>
            <p className="mb-3 text-xs text-gray-600">
              <strong>Override Current</strong> replaces all existing{" "}
              {config.labelProductPlural.toLowerCase()} with the new ones from
              your CSV.
              <br />
              <strong>Add to Current</strong> keeps your existing{" "}
              {config.labelProductPlural.toLowerCase()} and appends the new
              ones.
            </p>
            <div className="flex gap-3 mb-4">
              <button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded font-medium"
                onClick={(e) => {
                  e.preventDefault();
                  setPendingCsvAction("override");
                  setShowCsvWarningModal(false);
                  parseCsv(csvText, true, (newBadges) =>
                    runDraftSaveForBadges(newBadges),
                  );
                  if (!csvError) {
                    setCsvText("");
                    setCsvPreview([]);
                    setCsvError("");
                    setShowCsvModal(false);
                  }
                  setPendingCsvAction(null);
                }}
              >
                Override Current
              </button>
              <button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded font-medium"
                onClick={(e) => {
                  e.preventDefault();
                  setPendingCsvAction("add");
                  setShowCsvWarningModal(false);
                  parseCsv(csvText, false, (newBadges) =>
                    runDraftSaveForBadges(newBadges),
                  );
                  if (!csvError) {
                    setCsvText("");
                    setCsvPreview([]);
                    setCsvError("");
                    setShowCsvModal(false);
                  }
                  setPendingCsvAction(null);
                }}
              >
                Add to Current
              </button>
            </div>
            <button
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded text-sm"
              onClick={(e) => {
                e.preventDefault();
                setShowCsvWarningModal(false);
                setPendingCsvAction(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Load previous design modal - offer to restore saved design from Supabase */}
      {showLoadPreviousModal && savedDesignForLoad && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50 p-4"
          onClick={onStartFreshDesign}
          role="dialog"
          aria-modal="true"
          aria-label="Load previous design"
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-800 mb-2">
              Load previous design?
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              You have a previously saved design. Would you like to load it and
              continue editing?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-4 py-2 rounded shadow border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                onClick={onStartFreshDesign}
              >
                No thanks
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded shadow bg-blue-600 hover:bg-blue-700 text-white"
                onClick={onLoadPreviousDesign}
              >
                Load
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Proof Modal - review PDF and acknowledge before adding to cart */}
      {showProofModal && proofPdfObjectUrl && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50 p-4"
          onClick={closeProofModal}
          role="dialog"
          aria-modal="true"
          aria-label="Review your proof"
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-bold text-gray-800">
                Review your proof
              </h3>
              <button
                type="button"
                className="p-2 text-gray-500 hover:text-gray-700"
                onClick={closeProofModal}
                aria-label="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden p-4 gap-4">
              <div className="flex-1 min-h-[300px] rounded border border-gray-200 bg-gray-50 overflow-hidden">
                <iframe
                  title={`${config.labelProduct} design proof (PDF)`}
                  src={proofPdfObjectUrl}
                  className="w-full h-full min-h-[300px]"
                />
              </div>
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h4 className="font-semibold text-gray-800 mb-2">
                  Almost there — just double-check your proof
                </h4>
                <p className="text-sm text-gray-600 mb-2">
                  Please take a moment to review the proof above and confirm
                  that all text, spelling, and design details look correct. We
                  print exactly what we receive, so please check for any typos
                  or spelling mistakes before you add to cart.
                </p>
                <p className="text-sm text-gray-600 mb-3">
                  By adding to cart you acknowledge that custom-printed items
                  cannot be returned or refunded due to customer error (e.g.
                  typos or design choices). We only accept returns or
                  replacements for manufacturing defects.
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={proofAcknowledged}
                    onChange={(e) => setProofAcknowledged(e.target.checked)}
                    className="mt-1 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">
                    Yes, all checked and good to go
                  </span>
                </label>
                {/* DUPLICATE SET UPSELL - commented out for now; re-enable when discount/per-line is ready (e.g. Plus + Functions or two-product approach)
                {(() => {
                  const pending = proofPendingAddToCartRef.current;
                  const badgeCount = pending?.allBadgesForSupabase?.length ?? 0;
                  const showUpsell = badgeCount >= 1;
                  if (!showUpsell) return null;
                  const upsellDiscount = badgeCount * 2;
                  return (
                    <label className="flex items-start gap-2 cursor-pointer mt-3 pt-3 border-t border-gray-200">
                      <input
                        type="checkbox"
                        checked={proofAddDuplicates}
                        onChange={(e) =>
                          setProofAddDuplicates(e.target.checked)
                        }
                        className="mt-1 rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">
                        Add a duplicate set for ${upsellDiscount} off? ($2 off
                        each duplicate badge)
                      </span>
                    </label>
                  );
                })()}
                */}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="px-4 py-2 rounded shadow border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                  onClick={closeProofModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 rounded shadow text-white ${
                    proofAcknowledged && !isAddingToCart
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-gray-400 cursor-not-allowed"
                  }`}
                  disabled={!proofAcknowledged || isAddingToCart}
                  onClick={onProofConfirm}
                >
                  {isAddingToCart
                    ? "Adding to Cart..."
                    : "Confirm and Add to Cart"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50 p-4"
          onClick={() => setShowHelpModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Help - Button Guide"
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-bold text-gray-800">
                Help - Button Guide
              </h3>
              <button
                type="button"
                className="p-2 text-gray-500 hover:text-gray-700"
                onClick={() => setShowHelpModal(false)}
                aria-label="Close"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              <div className="space-y-4">
                {/* Save Design */}
                <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                  <div className="flex-shrink-0 flex items-center justify-center bg-white text-[#283238] border border-gray-200 rounded shadow px-2 py-1.5 text-xs font-medium whitespace-nowrap">
                    Save Design
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-800 mb-1">
                      Save Design
                    </h4>
                    <p className="text-sm text-gray-600">
                      Saves your current {config.labelProduct.toLowerCase()}{" "}
                      design so you can come back to it later. You must be
                      logged in to save. We keep one saved design per account;
                      saving again replaces your previous one. After saving, you
                      can load it on this or another device when logged in.
                    </p>
                  </div>
                </div>

                {/* Load Design */}
                <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                  <div className="flex-shrink-0 flex items-center justify-center bg-white text-[#283238] border border-gray-200 rounded shadow px-2 py-1.5 text-xs font-medium whitespace-nowrap">
                    Load Design
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-800 mb-1">
                      Load Design
                    </h4>
                    <p className="text-sm text-gray-600">
                      Opens a previously saved design so you can continue
                      editing. You must be logged in. If you have a saved
                      design, you’ll be asked whether to load it or start fresh.
                      Handy for switching devices or returning to a design
                      later.
                    </p>
                  </div>
                </div>

                {/* Undo */}
                <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                  <div className="flex-shrink-0 w-14 h-14 flex items-center justify-center bg-white text-gray-700 border border-gray-300 rounded">
                    <ArrowUturnLeftIcon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-800 mb-1">Undo</h4>
                    <p className="text-sm text-gray-600">
                      Reverses your last change. Works for any changes to the
                      font, alignment, background color, template/shape, and
                      reset operations. If the change was made to a different
                      {config.labelProduct.toLowerCase()}, the first undo will
                      switch to that {config.labelProduct.toLowerCase()}, and
                      the second undo will reverse the change. The button is
                      disabled when there are no changes to undo.
                    </p>
                  </div>
                </div>

                {/* Reset This Badge */}
                <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                  <div className="flex-shrink-0 w-14 h-14 flex items-center justify-center bg-white text-gray-700 border border-gray-300 rounded">
                    <ArrowPathRoundedSquareIcon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-800 mb-1">
                      Reset this {config.labelProduct}
                    </h4>
                    <p className="text-sm text-gray-600">
                      Resets the current {config.labelProduct.toLowerCase()}{" "}
                      you're editing to default settings, clearing all text and
                      formatting while keeping the template.
                    </p>
                  </div>
                </div>

                {/* Reset All Badges */}
                {multipleBadges.length > 1 && (
                  <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                    <div className="flex-shrink-0 w-14 h-14 flex items-center justify-center bg-white text-gray-700 border border-gray-300 rounded">
                      <ArrowPathIconOutline className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800 mb-1">
                        Reset All {config.labelProductPlural}
                      </h4>
                      <p className="text-sm text-gray-600">
                        Resets all {config.labelProductPlural.toLowerCase()} in
                        your design to default settings. This only appears when
                        you have multiple{" "}
                        {config.labelProductPlural.toLowerCase()}.
                      </p>
                    </div>
                  </div>
                )}

                {/* Apply Format to All Badges */}
                {multipleBadges.length > 1 && (
                  <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                    <div className="flex-shrink-0 w-14 h-14 flex items-center justify-center bg-white text-gray-700 border border-gray-300 rounded">
                      <Square2StackIcon className="w-6 h-6" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800 mb-1">
                        Apply Format to All {config.labelProductPlural}
                      </h4>
                      <p className="text-sm text-gray-600">
                        Copies the background color and all text formatting
                        (colors, fonts, sizes, styles) from the current{" "}
                        {config.labelProduct.toLowerCase()} to all other{" "}
                        {config.labelProductPlural.toLowerCase()} in your
                        design.
                      </p>
                    </div>
                  </div>
                )}

                {/* Create Multiple Badges */}
                <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                  <div className="flex-shrink-0 w-14 h-14 flex items-center justify-center bg-white text-gray-700 border border-gray-300 rounded">
                    <SquaresPlusIcon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-800 mb-1">
                      Add Multiple {config.labelProductPlural}
                    </h4>
                    <p className="text-sm text-gray-600">
                      {addMultipleCopy.addMultipleHelpParagraph}
                    </p>
                  </div>
                </div>

                {/* Grid View */}
                <div className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                  <div className="flex-shrink-0 w-14 h-14 flex items-center justify-center bg-white text-gray-700 border border-gray-300 rounded">
                    <Squares2X2Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-800 mb-1">
                      Grid View
                    </h4>
                    <p className="text-sm text-gray-600">
                      Opens a grid view of all your{" "}
                      {config.labelProductPlural.toLowerCase()}, making it easy
                      to see and select which{" "}
                      {config.labelProduct.toLowerCase()} you want to edit. You
                      can also delete {config.labelProductPlural.toLowerCase()}{" "}
                      from this view.
                    </p>
                  </div>
                </div>
              </div>

              {/* Workflow Section */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="font-semibold text-gray-800 mb-3">
                  {config.helpContent === "sign"
                    ? "How to Design Your Sign"
                    : "How to Design Your Badge"}
                </h4>
                {config.helpContent === "sign" ? (
                  <>
                    <ol className="list-decimal list-outside pl-6 space-y-2 text-sm text-gray-700">
                      <li className="mb-2">
                        <strong>Pick a sign design</strong> – Choose from the
                        template section. More designs coming soon.
                      </li>
                      <li className="mb-2">
                        <strong>Choose size</strong> – Select small, medium, or
                        large for your sign.
                      </li>
                      <li className="mb-2">
                        <strong>Select background</strong> – Pick a color or
                        texture that represents your brand or event.
                      </li>
                      <li className="mb-2">
                        <strong>Add your text</strong> – Enter up to 6 lines of
                        text. Adjust font sizes, colors, alignment, and styles
                        to fit.
                      </li>
                      <li className="mb-2">
                        <strong>Optional: choose a border</strong> – Add a
                        border style when border options are available.
                      </li>
                    </ol>
                    <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-sm text-amber-900">
                        All signs come with double-sided foam adhesive to secure
                        them.
                      </p>
                    </div>
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-900">
                        <strong>Pro Tip:</strong> Use colors with good contrast
                        so your sign is readable and looks professional.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <ol className="list-decimal list-outside pl-6 space-y-2 text-sm text-gray-700">
                      <li className="mb-2">
                        <strong>Pick a badge design</strong> that fits your
                        business - Choose from various shapes and sizes in the
                        template section. Don't see what you're looking for?
                        Check out more templates - we are always adding more
                        designs.
                      </li>
                      <li className="mb-2">
                        <strong>Select a background color</strong> - Pick a
                        color that represents your brand or event.
                      </li>
                      <li className="mb-2">
                        <strong>Add your text and modify to fit</strong> - Enter
                        names, titles, or any information you want on the badge.
                        You can add up to 4 lines of text. Adjust font sizes,
                        colors, alignment, and styles to make your badge look
                        perfect.
                      </li>
                      <li className="mb-2">
                        <strong>Select a backing type</strong> - Choose how your
                        badge will be worn: magnetic, adhesive, or pin backing.
                      </li>
                    </ol>
                    <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-900">
                        <strong>Pro Tip:</strong> Try to pick colors with a good
                        amount of contrast so they can be seen well in a
                        professional setting. High contrast between text and
                        background ensures your badges are readable, look
                        professional and are ready to print in any setting.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="flex justify-end p-4 border-t">
              <button
                type="button"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                onClick={() => setShowHelpModal(false)}
              >
                Got it!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BadgeDesigner;
