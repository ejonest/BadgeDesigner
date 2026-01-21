// app/components/BadgeDesigner.tsx
import React, { useState, useEffect, useMemo } from "react";
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
  Squares2X2Icon,
} from "@heroicons/react/24/outline";

import {
  generatePDFWithLayoutEngine as generatePDF,
  generatePDFAsBlob,
} from "../utils/pdfGenerator";
import { BadgeEditPanel } from "./BadgeEditPanel";

import { BadgeLine, Badge } from "../types/badge";
import {
  BACKGROUND_COLORS,
  FONT_COLORS,
  EXTENDED_BACKGROUND_COLORS,
  SMART_PALETTE_COLORS,
} from "../constants/colors";
import { BADGE_CONSTANTS } from "../constants/badge";
import {
  generateFullBadgeImage,
  generateThumbnailFromFullImage,
} from "../utils/badgeThumbnail";
import { getCurrentShop } from "../utils/shopAuth";
import { createApi } from "../utils/api";

import { loadTemplates, loadTemplateById } from "../utils/templates";
import type { LoadedTemplate } from "../utils/templates";
import {
  validateBadgeTemplate,
  validateBadgeData,
} from "../utils/badgeValidator";
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
  generatePNGAsBlob,
} from "../utils/export";

const INITIAL_BADGE = BADGE_CONSTANTS.INITIAL_BADGE;

interface BadgeDesignerProps {
  productId?: string | null;
  shop?: string | null;
  gadgetApiUrl?: string;
  gadgetApiKey?: string;
}

const backgroundColors = BACKGROUND_COLORS;
const fontColors = FONT_COLORS;
const maxLines = BADGE_CONSTANTS.MAX_LINES;
const badgeWidth = BADGE_CONSTANTS.BADGE_WIDTH;

/** Mobile preview (top of screen): tweak these to adjust the box and badge size. */
const MOBILE_PREVIEW = {
  /** Vertical padding of the surrounding box (rem). Smaller = tighter top/bottom margins. */
  boxMarginYRem: 0.5,
  /** Horizontal padding around the badge (rem, each side). Smaller = larger badge (less space for arrows/margin). */
  badgeMarginXRem: 1.25,
  /** Height of the badge in vh (the "1" in 3:1). Bigger = larger badge. Width is 3× this to keep 3:1. */
  badgeHeightVh: 20,
} as const;

// Helper functions for multi-badge exports
const getAllBadges = (
  badge1Data: Badge | null,
  multipleBadges: Badge[]
): Badge[] => {
  // Ensure all badges have IDs and templateIds
  const ensureBadgeIds = (b: Badge, index: number): Badge => ({
    ...b,
    id: b.id || `badge-${index + 1}`,
    templateId: b.templateId || "rect-1x3",
  });

  // Use saved badge1Data instead of current main preview
  const savedBadge1 = badge1Data || {
    id: "badge-1",
    templateId: "rect-1x3",
    lines: [],
    backgroundColor: "#FFFFFF",
    backing: "pin" as const,
  };
  return [
    ensureBadgeIds(savedBadge1, 0),
    ...multipleBadges.map((b, i) => ensureBadgeIds(b, i + 1)),
  ];
};

const getAllTemplates = (
  badge1Data: Badge | null,
  multipleBadges: Badge[],
  templates: LoadedTemplate[]
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
  return Array(getAllBadges(badge1Data, multipleBadges).length).fill(
    universalTemplate
  );
};
const badgeHeight = BADGE_CONSTANTS.BADGE_HEIGHT;
const MIN_FONT_SIZE = BADGE_CONSTANTS.MIN_FONT_SIZE;
const LINE_HEIGHT_MULTIPLIER = 1.3;

// Function to remap normalized coordinates when template changes
function remapLinesForNewDesignBox(
  lines: BadgeLine[],
  oldDesignBox: { x: number; y: number; width: number; height: number } | null,
  newDesignBox: { x: number; y: number; width: number; height: number }
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

const BadgeDesigner: React.FC<BadgeDesignerProps> = ({
  productId: _productId,
  shop: _shop,
  gadgetApiUrl,
  gadgetApiKey,
}) => {
  // API
  const api = createApi(gadgetApiUrl, gadgetApiKey);

  // State
  const [badge, setBadge] = useState<Badge>({
    ...INITIAL_BADGE,
    lines: INITIAL_BADGE.lines.map((line) => ({ ...line })),
  });
  const [templates, setTemplates] = useState<LoadedTemplate[]>([]);
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0); // Force template refresh

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [showBadgeGridModal, setShowBadgeGridModal] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [csvError, setCsvError] = useState("");
  const [multipleBadges, setMultipleBadges] = useState<any[]>([]);
  const [selectedBadgeIndex, setSelectedBadgeIndex] = useState<number>(0); // 0 = main badge, 1+ = CSV badges
  const [badge1Data, setBadge1Data] = useState<Badge | null>(null); // Store badge 1's data separately
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isSendingToSupabase, setIsSendingToSupabase] = useState(false);
  // UNIVERSAL TEMPLATE: Single template for all badges
  const [universalTemplateId, setUniversalTemplateId] =
    useState<string>("rect-1x3");

  // Load templates - refresh when templateRefreshKey changes
  useEffect(() => {
    (async () => {
      try {
        console.log(
          "[BadgeDesigner] Loading templates (refresh key:",
          templateRefreshKey,
          ")"
        );
        const list = await loadTemplates();
        setTemplates(list);
        console.log(
          "[BadgeDesigner] templates loaded:",
          list.map((t) => t.id)
        );

        // Initialize with first template
        if (list.length > 0) {
          setUniversalTemplateId(list[0].id);
        }
      } catch (error) {
        console.error("Failed to load templates:", error);
      }
    })();
  }, [templateRefreshKey]);

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

  // Recalculate initial badge positions when templates load
  useEffect(() => {
    if (templates.length > 0 && badge.lines.length > 0) {
      // Check if this is the initial badge with default positions
      const hasDefaultPositions = badge.lines.every(
        (line) => line.yNorm === 0.5
      );

      if (hasDefaultPositions) {
        console.log("[DEBUG] Recalculating initial badge positions");
        const centeredLines = calculateCenterPositions(badge.lines);
        setBadge((prevBadge) => ({
          ...prevBadge,
          lines: centeredLines,
        }));
      }
    }
  }, [templates.length]); // Only when templates first load

  // Initialize badge1Data when badge is first loaded, prevent overwriting from other badges
  useEffect(() => {
    // Only update badge1Data if we're currently on badge 1 and it's not already set
    if (selectedBadgeIndex === 0 && !badge1Data && badge.lines.length > 0) {
      // CRITICAL: Ensure backgroundColor is tracked as single source of truth
      const badgeWithColor = {
        ...badge,
        backgroundColor: badge.backgroundColor || "#FFFFFF",
      };
      console.log(
        `[COLOR TRACKING] Initializing badge1Data with backgroundColor: ${badgeWithColor.backgroundColor}`
      );
      setBadge1Data(badgeWithColor);
    }
  }, [badge, selectedBadgeIndex, badge1Data]);

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
        templates.map((t) => t.id)
      );
      // Fallback to first available template instead of broken fallback object
      return templates[0] || null;
    }
    return template;
  }, [templates, universalTemplateId]);

  const touchStartX = React.useRef<number>(0);

  // Show loading state if template isn't ready yet
  if (!activeTemplate) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading templates...</p>
        </div>
      </div>
    );
  }

  // UNIVERSAL TEMPLATE: No need to recalculate on template change since all badges use same template

  // Measure text width for auto-shrink
  const measureTextWidth = (
    text: string,
    fontSize: number,
    fontFamily: string,
    bold: boolean,
    italic: boolean
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
  const calculateCenterPositions = (lines: BadgeLine[]): BadgeLine[] => {
    if (!activeTemplate?.designBox) return lines;

    const designBoxHeight = activeTemplate.designBox.height;
    const designBoxWidth = activeTemplate.designBox.width;
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

  // Text updates with auto-scaling to fit badge boundaries
  const updateLine = (index: number, changes: Partial<BadgeLine>) => {
    const designBox = activeTemplate?.designBox || {
      x: 0,
      y: 0,
      width: 288,
      height: 96,
    };
    // Account for 0.1" (9.6px) inset on each side for text clipping
    const INSET_INCHES = 0.1;
    const INSET_PX = INSET_INCHES * 96; // 9.6px at 96 DPI
    const maxTextWidth = designBox.width - INSET_PX * 2 - 4; // Subtract inset and margin

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

      // Auto-scale text if sizeNorm changes or text changes to ensure it fits within badge boundaries
      if (
        typeof changes.sizeNorm !== "undefined" ||
        typeof changes.text !== "undefined" ||
        typeof changes.fontFamily !== "undefined" ||
        typeof changes.bold !== "undefined" ||
        typeof changes.italic !== "undefined"
      ) {
        const currentSizeNorm = updated.sizeNorm ?? 0.15;
        const designBoxHeight = designBox.height;
        let fontSize = currentSizeNorm * designBoxHeight;
        const text = updated.text || "";
        const fontFamily = updated.fontFamily || "Arial";
        const bold = updated.bold || false;
        const italic = updated.italic || false;

        // Measure text width and auto-scale down if it exceeds badge width
        if (text) {
          let textWidth = measureTextWidth(
            text,
            fontSize,
            fontFamily,
            bold,
            italic
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
              italic
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
          updated.italic || false
        );
        while (textWidth > badgeWidth - 24 && fontSize > MIN_FONT_SIZE) {
          fontSize--;
          textWidth = measureTextWidth(
            updated.text,
            fontSize,
            updated.fontFamily || "Arial",
            updated.bold || false,
            updated.italic || false
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

    // Apply center-based positioning
    const centeredLines = calculateCenterPositions(newLines);

    setBadge({ ...badge, lines: centeredLines });
  };

  const addLine = () => {
    if (badge.lines.length < maxLines) {
      // Get the current template's designBox for positioning new lines
      const currentTemplate = templates.find((t) => t.id === badge.templateId);
      const designBox = currentTemplate?.designBox || {
        x: 0,
        y: 0,
        width: 288,
        height: 96,
      };

      const newLines = [
        ...badge.lines,
        {
          id: `line-${Date.now()}`,
          text: "Line Text",
          xNorm: 0.5,
          yNorm: 0.5, // Will be repositioned by calculateCenterPositions
          sizeNorm: badge.lines.length === 0 ? 0.2 : 0.143, // 14pt for line 1, 10pt for lines 2,3,4
          color: "#000000",
          bold: false,
          italic: false,
          fontFamily: "Arial",
          align: "center",
        } as BadgeLine,
      ];

      // Apply center-based positioning to all lines
      const centeredLines = calculateCenterPositions(newLines);

      setBadge({
        ...badge,
        lines: centeredLines,
      });
    }
  };

  const removeLine = (index: number) => {
    if (badge.lines.length > 1) {
      const newLines = [...badge.lines];
      newLines.splice(index, 1);

      // Apply center-based positioning to remaining lines
      const centeredLines = calculateCenterPositions(newLines);

      setBadge({
        ...badge,
        lines: centeredLines.map((l) => ({
          ...l,
          align:
            l.align === "left" || l.align === "center" || l.align === "right"
              ? l.align
              : "center",
        })),
      });
    }
  };

  // Helper function to reset lines for a badge (preserves text and number of lines)
  const resetBadgeLines = (badgeToReset: Badge): BadgeLine[] => {
    return badgeToReset.lines.map(
      (line, index) =>
        ({
          id: line.id || `line-${index + 1}`,
          text: line.text, // Preserve user input text
          xNorm: 0.5,
          yNorm: 0.5, // Will be repositioned by calculateCenterPositions
          sizeNorm: index === 0 ? 0.12 : 0.08, // First line 0.12, others 0.08
          color: "#000000",
          bold: false,
          italic: false,
          underline: false,
          fontFamily: "Arial",
          align: "center",
        } as BadgeLine)
    );
  };

  const resetBadge = () => {
    const fallbackId = templates[0]?.id || "rect-1x3";

    // Preserve current number of lines and text, reset all other properties
    const resetLines = resetBadgeLines(badge);

    // Apply center-based positioning
    const centeredLines = calculateCenterPositions(resetLines);

    setBadge({
      templateId: badge.templateId || fallbackId,
      lines: centeredLines,
      backgroundColor: "#FFFFFF",
      backing: badge.backing || "pin", // Preserve backing if it exists
    });
  };

  const resetAllBadges = () => {
    const fallbackId = templates[0]?.id || "rect-1x3";

    // Reset badge1Data if it exists
    if (badge1Data) {
      const resetLines = resetBadgeLines(badge1Data);
      const centeredLines = calculateCenterPositions(resetLines);
      setBadge1Data({
        ...badge1Data,
        templateId: badge1Data.templateId || fallbackId,
        lines: centeredLines,
        backgroundColor: "#FFFFFF",
        backing: badge1Data.backing || "pin",
      });
    }

    // Reset all badges in multipleBadges
    if (multipleBadges.length > 0) {
      const resetMultipleBadges = multipleBadges.map((badgeToReset) => {
        const resetLines = resetBadgeLines(badgeToReset);
        const centeredLines = calculateCenterPositions(resetLines);

        return {
          ...badgeToReset,
          templateId: badgeToReset.templateId || fallbackId,
          lines: centeredLines,
          backgroundColor: "#FFFFFF",
          backing: badgeToReset.backing || "pin",
        };
      });

      setMultipleBadges(resetMultipleBadges);
    }

    // Also reset the currently editing badge
    const resetLines = resetBadgeLines(badge);
    const centeredLines = calculateCenterPositions(resetLines);
    setBadge({
      templateId: badge.templateId || fallbackId,
      lines: centeredLines,
      backgroundColor: "#FFFFFF",
      backing: badge.backing || "pin",
    });
  };

  // CLEAN ARCHITECTURE: Auto-save on switch (no manual save button)

  // UNIVERSAL PREVIEW: All badges use the same template
  const getBadgeForPreview = (badgeIndex: number, savedBadge: Badge | null) => {
    const isCurrentlyEditing = selectedBadgeIndex === badgeIndex;

    if (isCurrentlyEditing) {
      // LIVE PREVIEW: Mirror left-hand preview when editing
      console.log(
        `[UNIVERSAL] Badge ${badgeIndex} LIVE PREVIEW - using current badge with backgroundColor: ${badge.backgroundColor}`
      );
      return {
        badge: badge,
        templateId: universalTemplateId, // Always use universal template
      };
    } else {
      // STATIC: Show saved state when not editing
      if (savedBadge) {
        console.log(
          `[UNIVERSAL] Badge ${badgeIndex} STATIC PREVIEW - using saved badge with backgroundColor: ${savedBadge.backgroundColor}`
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
          `[UNIVERSAL] Badge ${badgeIndex} FALLBACK PREVIEW - no saved state, using current badge`
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
    console.log(
      `[UNIVERSAL] selectBadge called: index=${index}, current selectedBadgeIndex=${selectedBadgeIndex}`
    );

    // AUTO-SAVE: Save current badge state when switching
    // CRITICAL: Ensure backgroundColor is preserved as single source of truth
    if (selectedBadgeIndex === 0) {
      // Auto-save Badge 1
      const validatedBadge = {
        ...badge,
        templateId: universalTemplateId,
        backgroundColor: badge.backgroundColor || "#FFFFFF", // Ensure color is tracked
      };
      console.log(
        `[COLOR TRACKING] Auto-saving Badge 1 with backgroundColor: ${validatedBadge.backgroundColor}`
      );
      setBadge1Data(validatedBadge);
    } else {
      // Auto-save CSV badge
      const validatedBadge = {
        ...badge,
        templateId: universalTemplateId,
        backgroundColor: badge.backgroundColor || "#FFFFFF", // Ensure color is tracked
      };
      console.log(
        `[COLOR TRACKING] Auto-saving CSV badge ${selectedBadgeIndex} with backgroundColor: ${validatedBadge.backgroundColor}`
      );
      const newMultipleBadges = [...multipleBadges];
      newMultipleBadges[selectedBadgeIndex - 1] = validatedBadge;
      setMultipleBadges(newMultipleBadges);
    }

    // SWITCH: Load the selected badge for editing
    setSelectedBadgeIndex(index);

    if (index === 0) {
      // Load Badge 1 for editing
      if (badge1Data) {
        console.log(
          `[UNIVERSAL] Loading Badge 1 for editing:`,
          badge1Data.lines.map((l: BadgeLine) => l.text)
        );
        const centeredLines = calculateCenterPositions(badge1Data.lines);
        setBadge({
          ...badge1Data,
          lines: centeredLines,
          templateId: universalTemplateId,
        });
      }
    } else {
      // Load CSV badge for editing
      const csvBadge = multipleBadges[index - 1];
      if (csvBadge) {
        console.log(
          `[UNIVERSAL] Loading CSV badge ${index} for editing:`,
          csvBadge.lines.map((l: BadgeLine) => l.text)
        );
        const centeredLines = calculateCenterPositions(csvBadge.lines);
        setBadge({
          ...csvBadge,
          lines: centeredLines,
          templateId: universalTemplateId,
        });
      }
    }
  };

  // UNIVERSAL TEMPLATE: When template changes, update all badges and auto-scale text to fit
  const handleUniversalTemplateChange = async (newTemplateId: string) => {
    console.log(`[UNIVERSAL] Template changed to: ${newTemplateId}`);
    setUniversalTemplateId(newTemplateId);

    // Load the new template to get its designBox
    const newTemplate = await loadTemplateById(newTemplateId);
    if (!newTemplate) {
      console.error("Template not found:", newTemplateId);
      return;
    }

    const newDesignBox = newTemplate.designBox;
    // Account for 0.1" (9.6px) inset on each side for text clipping
    const INSET_INCHES = 0.1;
    const INSET_PX = INSET_INCHES * 96; // 9.6px at 96 DPI
    const maxTextWidth = newDesignBox.width - INSET_PX * 2 - 4; // Subtract inset and margin

    // Auto-scale function to ensure text fits within new template boundaries
    const autoScaleLinesForNewTemplate = (lines: BadgeLine[]): BadgeLine[] => {
      return lines.map((line) => {
        const designBoxHeight = newDesignBox.height;
        let fontSize = (line.sizeNorm ?? 0.15) * designBoxHeight;
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
            italic
          );
          const minSizeNorm = 0.05; // Minimum 5% of badge height

          // Auto-scale down if text is too wide - constrain to badge boundaries
          while (textWidth > maxTextWidth) {
            fontSize = fontSize * 0.95; // Reduce by 5% each iteration
            const newSizeNorm = fontSize / designBoxHeight;
            if (newSizeNorm <= minSizeNorm) {
              return { ...line, sizeNorm: minSizeNorm };
            }
            textWidth = measureTextWidth(
              text,
              fontSize,
              fontFamily,
              bold,
              italic
            );
            line.sizeNorm = newSizeNorm;
          }
        }

        return { ...line };
      });
    };

    // Update current badge with auto-scaled text
    setBadge((prev) => {
      const scaledLines = autoScaleLinesForNewTemplate(prev.lines);
      const centeredLines = calculateCenterPositions(scaledLines);
      return { ...prev, templateId: newTemplateId, lines: centeredLines };
    });

    // Update saved badge1Data with auto-scaled text
    if (badge1Data) {
      setBadge1Data((prev) => {
        if (!prev) return null;
        const scaledLines = autoScaleLinesForNewTemplate(prev.lines);
        const centeredLines = calculateCenterPositions(scaledLines);
        return { ...prev, templateId: newTemplateId, lines: centeredLines };
      });
    }

    // Update all CSV badges with auto-scaled text
    setMultipleBadges((prev) =>
      prev.map((badge) => {
        const scaledLines = autoScaleLinesForNewTemplate(badge.lines);
        const centeredLines = calculateCenterPositions(scaledLines);
        return { ...badge, templateId: newTemplateId, lines: centeredLines };
      })
    );
  };

  // Send to Supabase - Upload PDF, SVG, PNG and save to badge_order_items
  const sendToSupabase = async () => {
    if (isSendingToSupabase) return;
    setIsSendingToSupabase(true);

    try {
      // Bypass shop check for testing - will add shop connection later
      const shopData = getCurrentShop(_shop);

      // Finalize all badge states before generating files
      let finalizedBadge1 = badge;
      let finalizedMultipleBadges = [...multipleBadges];

      if (selectedBadgeIndex === 0) {
        finalizedBadge1 = {
          ...badge,
          templateId: universalTemplateId,
          backgroundColor: badge.backgroundColor || "#FFFFFF",
        };
        setBadge1Data(finalizedBadge1);
      } else {
        finalizedBadge1 = badge1Data || {
          ...badge,
          templateId: universalTemplateId,
          backgroundColor: badge.backgroundColor || "#FFFFFF",
        };
        const updatedMultiple = [...multipleBadges];
        updatedMultiple[selectedBadgeIndex - 1] = {
          ...badge,
          templateId: universalTemplateId,
          backgroundColor: badge.backgroundColor || "#FFFFFF",
        };
        finalizedMultipleBadges = updatedMultiple;
        setMultipleBadges(updatedMultiple);
      }

      // Get the badge to export (use badge1Data if available, otherwise current badge)
      const badgeToExport = finalizedBadge1;
      const templateToUse = activeTemplate;

      if (!templateToUse) {
        alert("Template not loaded. Please wait and try again.");
        return;
      }

      // Generate design ID
      const designId = `design_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 11)}`;

      // Generate files as blobs
      console.log("Generating PDF, SVG, and PNG...");

      // Generate PDF
      const pdfBlob = await generatePDFAsBlob(
        badgeToExport,
        finalizedMultipleBadges.length > 0 ? finalizedMultipleBadges : undefined
      );

      // Generate SVG
      const svgBlob = await generateSVGAsBlob(badgeToExport, templateToUse);

      // Generate PNG (use scale 2 for good quality)
      const pngBlob = await generatePNGAsBlob(badgeToExport, templateToUse, 2);

      // Prepare design data (use shop data if available, otherwise use defaults for testing)
      const designData = {
        badge: badgeToExport,
        multipleBadges: finalizedMultipleBadges,
        allBadges: [badgeToExport, ...finalizedMultipleBadges],
        timestamp: new Date().toISOString(),
        shopId: shopData?.shopId || "test-shop",
        productId: _productId || "test-product",
        backgroundColor: badgeToExport.backgroundColor,
        backingType: badgeToExport.backing,
        textLines: badgeToExport.lines,
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
      formData.append("pdf", pdfBlob, "badge-design.pdf");
      formData.append("svg", svgBlob, "badge-design.svg");
      formData.append("png", pngBlob, "badge-design.png");

      const response = await fetch("/api/send-to-supabase", {
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
          ? `PDF: ${result.uploads.pdf ? "✓" : "✗"}, SVG: ${
              result.uploads.svg ? "✓" : "✗"
            }, PNG: ${result.uploads.png ? "✓" : "✗"}`
          : "";
        alert(
          `${result.message}\nDesign ID: ${designId}${
            uploadStatus ? `\n${uploadStatus}` : ""
          }`
        );
      } else {
        // Show more helpful error message
        const errorMsg = result.error || result.message || "Unknown error";
        if (result.warning) {
          alert(
            `Warning: ${errorMsg}\n\nFiles were generated but could not be uploaded to Supabase.`
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
          `Cannot connect to Supabase.\n\nPlease check:\n- Your network connection\n- Supabase configuration\n- That Supabase is accessible\n\nError: ${errorMessage}`
        );
      } else {
        alert(`Failed to upload badge design to Supabase:\n${errorMessage}`);
      }
    } finally {
      setIsSendingToSupabase(false);
    }
  };

  // Save design - FINALIZES and locks all badge states
  const saveBadge = async () => {
    try {
      const shopData = getCurrentShop(_shop);
      if (!shopData) {
        alert("Shop information not found. Please reload the page.");
        return;
      }

      // CRITICAL: Finalize all badge states before saving
      // Auto-save current badge state first
      let finalizedBadge1 = badge;
      let finalizedMultipleBadges = [...multipleBadges];

      if (selectedBadgeIndex === 0) {
        // Finalize Badge 1
        finalizedBadge1 = {
          ...badge,
          templateId: universalTemplateId,
          backgroundColor: badge.backgroundColor || "#FFFFFF",
        };
        setBadge1Data(finalizedBadge1);
      } else {
        // Finalize current CSV badge
        finalizedBadge1 = badge1Data || {
          ...badge,
          templateId: universalTemplateId,
          backgroundColor: badge.backgroundColor || "#FFFFFF",
        };
        const updatedMultiple = [...multipleBadges];
        updatedMultiple[selectedBadgeIndex - 1] = {
          ...badge,
          templateId: universalTemplateId,
          backgroundColor: badge.backgroundColor || "#FFFFFF",
        };
        finalizedMultipleBadges = updatedMultiple;
        setMultipleBadges(updatedMultiple);
      }

      // Ensure all badges have consistent state
      const allFinalizedBadges = [
        finalizedBadge1,
        ...finalizedMultipleBadges,
      ].map((b) => ({
        ...b,
        templateId: b.templateId || universalTemplateId,
        backgroundColor: b.backgroundColor || "#FFFFFF",
      }));

      console.log(
        `[FINALIZE] Saving ${allFinalizedBadges.length} badges with finalized states`
      );
      allFinalizedBadges.forEach((b, i) => {
        console.log(
          `[FINALIZE] Badge ${i + 1}: backgroundColor=${
            b.backgroundColor
          }, templateId=${b.templateId}`
        );
      });

      const basePrice = 9.99;
      const backingPrice =
        badge.backing === "magnetic"
          ? 2.0
          : badge.backing === "adhesive"
          ? 1.0
          : 0;
      const totalPrice = basePrice + backingPrice;

      const badgeDesignData = {
        shopId: shopData.shopId,
        productId: _productId,
        designId: `design_${Date.now()}_${Math.random()
          .toString(36)
          .slice(2, 11)}`,
        status: "saved",
        designData: {
          badge: finalizedBadge1,
          multipleBadges: finalizedMultipleBadges,
          allBadges: allFinalizedBadges,
          timestamp: new Date().toISOString(),
        },
        backgroundColor: finalizedBadge1.backgroundColor,
        backingType: finalizedBadge1.backing,
        basePrice,
        backingPrice,
        totalPrice,
        textLines: finalizedBadge1.lines,
      };

      const savedDesign = await api.saveBadgeDesign(badgeDesignData, shopData);
      // eslint-disable-next-line no-alert
      alert(
        `Badge design saved and finalized! Design ID: ${
          savedDesign.id || "Unknown"
        }`
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
      alert("Failed to save badge design. Please try again.");
    }
  };

  // Add to cart
  const basePrice = 9.99;
  const backingPrice =
    badge.backing === "magnetic" ? 2 : badge.backing === "adhesive" ? 1 : 0;
  const totalPrice = (basePrice + backingPrice).toFixed(2);

  const addToCart = async () => {
    if (isAddingToCart) return;
    setIsAddingToCart(true);

    try {
      const shopData = getCurrentShop(_shop);
      if (!shopData) {
        alert("Shop information not found. Please reload the page.");
        return;
      }

      const savedDesign = await api.saveBadgeDesign(
        {
          badge,
          productId: _productId,
          shopId: shopData.shopId,
          designId: `design_${Date.now()}_${Math.random()
            .toString(36)
            .slice(2, 11)}`,
          status: "saved",
          backgroundColor: badge.backgroundColor,
          backingType: badge.backing,
          basePrice: 9.99,
          backingPrice: 0,
          totalPrice,
          textLines: badge.lines,
        },
        shopData
      );

      // Variant resolver
      const getVariantId = (backingType: string) => {
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

      // Generate images (best-effort)
      let fullImage = "";
      let thumbnailImage = "";
      try {
        fullImage = await generateFullBadgeImage(badge);
        thumbnailImage = await generateThumbnailFromFullImage(
          fullImage,
          100,
          50
        );

        if (savedDesign.id) {
          await api.updateBadgeDesign(savedDesign.id, {
            fullImageUrl: fullImage,
            thumbnailUrl: thumbnailImage,
          });
        }
      } catch (e) {
        console.warn("Failed to generate images:", e);
      }

      const badgeData = {
        variantId: getVariantId(badge.backing),
        quantity: 1,
        properties: {
          "Custom Badge Design": "Yes",
          "Badge Text Line 1": badge.lines[0]?.text || "",
          "Badge Text Line 2": badge.lines[1]?.text || "",
          "Badge Text Line 3": badge.lines[2]?.text || "",
          "Badge Text Line 4": badge.lines[3]?.text || "",
          "Background Color": badge.backgroundColor,
          "Font Family": badge.lines[0]?.fontFamily || "Arial",
          "Backing Type": badge.backing,
          "Design ID": savedDesign.designId,
          "Gadget Design ID": savedDesign.id,
          Price: `$${totalPrice}`,
        },
      };

      const result = await api.addToCart(badgeData);
      if (!result.success) {
        alert("Failed to add badge to cart. Please try again.");
      }
    } catch (error) {
      console.error("Failed to add to cart:", error);
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
        .map((row: string) => row.split(","));
      setCsvPreview(rows);
    } catch {
      setCsvError("Invalid CSV format.");
      setCsvPreview([]);
    }
  }

  // Actually create badges from CSV
  function parseCsv(text: string) {
    console.log(
      `[DEBUG] parseCsv called with current badge:`,
      badge.lines.map((l) => l.text)
    );
    try {
      setCsvError("");
      const rows = text
        .trim()
        .split(/\r?\n/)
        .map((row: string) => row.split(","));

      if (rows.length > 0 && rows[0].length > 0) {
        // Create badges based on current badge template but with CSV text
        // CRITICAL: Each badge maintains its own backgroundColor as single source of truth
        const badges = rows.map((row: any, index: number) => {
          // Start with current badge's backgroundColor to maintain consistency
          const badgeWithCsvText = {
            ...badge,
            id: `badge-csv-${index + 1}`,
            // UNIVERSAL TEMPLATE: All CSV badges use the same universal template
            templateId: universalTemplateId,
            // CRITICAL: Preserve backgroundColor from current badge (single source of truth)
            backgroundColor: badge.backgroundColor || "#FFFFFF",
            lines: row.map((cell: any, i: number) => {
              const baseLine = badge.lines[i] || badge.lines[0];
              return {
                ...baseLine,
                text: cell || "",
                color: "#000000", // Black text for all CSV badges
                sizeNorm: i === 0 ? 0.2 : 0.143, // 14pt for line 1, 10pt for lines 2,3,4
                align:
                  baseLine.align === "left" ||
                  baseLine.align === "center" ||
                  baseLine.align === "right"
                    ? baseLine.align
                    : "center",
              } as BadgeLine;
            }),
          };

          // Apply center-based positioning to CSV badges
          const centeredLines = calculateCenterPositions(
            badgeWithCsvText.lines
          );
          const finalBadge = {
            ...badgeWithCsvText,
            lines: centeredLines,
          };

          // Ensure backgroundColor is explicitly set (single source of truth)
          console.log(
            `[COLOR TRACKING] CSV Badge ${
              index + 1
            } created with backgroundColor: ${finalBadge.backgroundColor}`
          );
          return finalBadge;
        });

        console.log(
          `[DEBUG] Created ${badges.length} CSV badges:`,
          badges.map((b) => b.lines.map((l: BadgeLine) => l.text))
        );

        // CRITICAL: Migrate badges to ensure they have proper backgroundColor
        const migratedBadges = migrateBadgeArray(badges);
        console.log(
          `[MIGRATION] Migrated ${migratedBadges.length} CSV badges with individual background colors:`,
          migratedBadges.map((b) => b.backgroundColor)
        );
        setMultipleBadges(migratedBadges);

        // Initialize badge1Data with current badge if not already set
        if (!badge1Data) {
          console.log(
            `[DEBUG] Initializing badge1Data with current badge:`,
            badge.lines.map((l) => l.text)
          );
          const migratedBadge1 = migrateLegacyBadge(badge);
          console.log(
            `[MIGRATION] Migrated Badge 1 with backgroundColor: ${migratedBadge1.backgroundColor}`
          );
          setBadge1Data(migratedBadge1);
        } else {
          console.log(
            `[DEBUG] badge1Data already exists:`,
            badge1Data.lines.map((l) => l.text)
          );
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

  // Pricing display
  const prettyPrice = `$${totalPrice}`;

  // Early guard - don't render until we have a concrete template
  if (!activeTemplate) {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading templates...</p>
        </div>
      </div>
    );
  }

  const totalBadges = 1 + multipleBadges.length;
  const canGoPrev = selectedBadgeIndex > 0;
  const canGoNext = selectedBadgeIndex < totalBadges - 1;

  const getSavedBadgeFor = (i: number) =>
    i === 0 ? badge1Data : multipleBadges[i - 1] ?? null;

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
              Customize Your Badge{" "}
              {selectedBadgeIndex === 0 ? "1" : `${selectedBadgeIndex + 1}`}
              {multipleBadges.length > 0 ? ` of ${totalBadges}` : ""}
            </h2>
            <span className="text-xl font-bold text-red-600">
              {activeTemplate.name}
            </span>
          </div>
          <button
            type="button"
            className="flex-shrink-0 p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
            onClick={() => setShowBadgeGridModal(true)}
            aria-label="View all badges"
            title="View all badges"
          >
            <Squares2X2Icon className="w-6 h-6" />
          </button>
        </div>

        {/* Large preview: one badge, prev/next arrows, swipe to change. Sizing from MOBILE_PREVIEW. */}
        <div
          className="w-full flex items-center justify-center relative select-none bg-white/60 rounded-lg border border-gray-200 overflow-x-auto"
          style={{
            padding: `${MOBILE_PREVIEW.boxMarginYRem}rem ${MOBILE_PREVIEW.badgeMarginXRem}rem`,
          }}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          {totalBadges > 1 && canGoPrev && (
            <button
              type="button"
              className="absolute left-2 z-10 p-2 rounded-full bg-white/90 shadow border border-gray-200 text-gray-700 hover:bg-gray-100"
              onClick={() => selectBadge(selectedBadgeIndex - 1)}
              aria-label="Previous badge"
            >
              <ChevronLeftIcon className="w-6 h-6" />
            </button>
          )}
          {totalBadges > 1 && canGoNext && (
            <button
              type="button"
              className="absolute right-2 z-10 p-2 rounded-full bg-white/90 shadow border border-gray-200 text-gray-700 hover:bg-gray-100"
              onClick={() => selectBadge(selectedBadgeIndex + 1)}
              aria-label="Next badge"
            >
              <ChevronRightIcon className="w-6 h-6" />
            </button>
          )}
          <div
            className="flex flex-shrink-0 items-center justify-center"
            style={{
              height: `${MOBILE_PREVIEW.badgeHeightVh}vh`,
              width: `${3 * MOBILE_PREVIEW.badgeHeightVh}vh`,
            }}
          >
            <BadgeSvgRenderer
              badge={getBadgeForPreview(selectedBadgeIndex, getSavedBadgeFor(selectedBadgeIndex)).badge}
              templateId={getBadgeForPreview(selectedBadgeIndex, getSavedBadgeFor(selectedBadgeIndex)).templateId}
              height="100%"
            />
          </div>
        </div>
      </div>

      {/* LEFT COLUMN - Controls */}
      <div
        className="w-full md:w-1/2 mb-4 md:mb-0 md:pr-3 overflow-y-auto flex-1 min-h-0 md:flex-initial md:min-h-0 md:max-h-[90vh]"
      >
        <div className="section-container mb-4">
          <div className="hidden md:flex justify-between items-center mb-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-bold text-gray-800">
                Customize Your Badge{" "}
                {selectedBadgeIndex === 0 ? "1" : `${selectedBadgeIndex + 1}`}
                {multipleBadges.length > 0 &&
                  ` of ${multipleBadges.length + 1}`}
              </h2>
              <span className="text-xl font-bold text-red-600">
                {activeTemplate.name}
              </span>
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
          </div>

          {/* Template Selector - Image Swatches */}
          <div className="mb-4">
            <label className="block text-sm font-semibold mb-2">
              Shape / Template
            </label>
            <div className="grid grid-cols-2 gap-2">
              {templates.length === 0 ? (
                <div className="text-sm text-gray-500">
                  Loading templates...
                </div>
              ) : (
                templates.map((t) => {
                  // Map template IDs to JPG thumbnail filenames
                  const getThumbnailFilename = (templateId: string): string => {
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
                    return thumbnailMap[templateId] || templateId; // Fallback to templateId if not mapped
                  };

                  const thumbnailFilename = getThumbnailFilename(t.id);
                  const thumbnailPath = `/templates/${thumbnailFilename}.jpg`;
                  const svgPath = `/templates/${t.id}.svg`; // Fallback to SVG if JPG not found
                  const isSelected = universalTemplateId === t.id;

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
                          console.log("[UNIVERSAL] Template changed to:", t.id);
                          handleUniversalTemplateChange(t.id);
                        }}
                        title={t.name}
                      >
                        {/* Label at top - fixed height, not obscuring the shape */}
                        <div
                          className={`text-[10px] text-center py-1 flex-shrink-0 ${
                            isSelected
                              ? "bg-blue-600 text-white"
                              : "bg-gray-200 text-gray-700"
                          }`}
                        >
                          {t.name}
                        </div>

                        {/* Image container - fills remaining space, crops white space with small padding */}
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
                          {/* Try to load JPG thumbnail first, fallback to SVG */}
                          <img
                            src={thumbnailPath}
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
                              // Fallback to SVG if JPG doesn't exist
                              const target = e.target as HTMLImageElement;
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
                            }}
                          />
                        </div>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Export Options */}
          <div className="mb-4">
            <h3 className="font-semibold text-gray-700 mb-2">Export Options</h3>
            <div className="mt-4 flex flex-wrap gap-1">
              <button
                className="px-2 py-1 text-xs border rounded"
                onClick={async () => {
                  if (multipleBadges.length > 0) {
                    const allBadges = getAllBadges(badge1Data, multipleBadges);
                    const allTemplates = getAllTemplates(
                      badge1Data,
                      multipleBadges,
                      templates
                    );
                    downloadMultipleSVGs(allBadges, allTemplates, "badge");
                  } else {
                    const badgeToExport = badge1Data || badge;
                    await downloadSVG(
                      {
                        ...badgeToExport,
                        id: badgeToExport.id || "badge",
                        templateId:
                          badgeToExport.templateId || universalTemplateId,
                      },
                      activeTemplate,
                      "badge.svg"
                    );
                  }
                }}
              >
                SVG
              </button>
              <button
                className="px-2 py-1 text-xs border rounded"
                onClick={async () => {
                  if (multipleBadges.length > 0) {
                    const allBadges = getAllBadges(badge1Data, multipleBadges);
                    const allTemplates = getAllTemplates(
                      badge1Data,
                      multipleBadges,
                      templates
                    );
                    downloadMultiplePNGs(allBadges, allTemplates, "badge");
                  } else {
                    const badgeToExport = badge1Data || badge;
                    await downloadPNG(
                      {
                        ...badgeToExport,
                        id: badgeToExport.id || "badge",
                        templateId:
                          badgeToExport.templateId || universalTemplateId,
                      },
                      activeTemplate,
                      "badge.png",
                      2
                    );
                  }
                }}
              >
                PNG
              </button>
              <button
                className="px-2 py-1 text-xs border rounded"
                onClick={async () => {
                  if (multipleBadges.length > 0) {
                    const allBadges = getAllBadges(badge1Data, multipleBadges);
                    const allTemplates = getAllTemplates(
                      badge1Data,
                      multipleBadges,
                      templates
                    );
                    downloadMultipleTIFFs(allBadges, allTemplates, "badge");
                  } else {
                    const badgeToExport = badge1Data || badge;
                    await downloadTIFF(
                      {
                        ...badgeToExport,
                        id: badgeToExport.id || "badge",
                        templateId:
                          badgeToExport.templateId || universalTemplateId,
                      },
                      activeTemplate,
                      "badge.tiff",
                      4
                    );
                  }
                }}
              >
                TIFF
              </button>
              <button
                className="px-2 py-1 text-xs border rounded"
                onClick={async () => {
                  if (multipleBadges.length > 0) {
                    const allBadges = getAllBadges(badge1Data, multipleBadges);
                    const allTemplates = getAllTemplates(
                      badge1Data,
                      multipleBadges,
                      templates
                    );
                    downloadMultipleCDRs(allBadges, allTemplates, "badge");
                  } else {
                    const badgeToExport = badge1Data || badge;
                    await downloadCDR(
                      {
                        ...badgeToExport,
                        id: badgeToExport.id || "badge",
                        templateId:
                          badgeToExport.templateId || universalTemplateId,
                      },
                      activeTemplate,
                      "badge.cdr"
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
                    if (multipleBadges.length > 0) {
                      const allBadges = getAllBadges(
                        badge1Data,
                        multipleBadges
                      );
                      // generatePDF takes first badge as badgeData, rest as multipleBadges array
                      await generatePDF(allBadges[0], allBadges.slice(1));
                    } else {
                      const badgeToExport = badge1Data || badge;
                      await generatePDF({
                        ...badgeToExport,
                        id: badgeToExport.id || "badge",
                        templateId:
                          badgeToExport.templateId || universalTemplateId,
                      });
                    }
                  } catch (error) {
                    console.error("Error generating PDF:", error);
                    alert("Error generating PDF. Please try again.");
                  }
                }}
              >
                PDF
              </button>
            </div>
          </div>

          {/* Background Color */}
          <div className="flex flex-col items-center w-full mb-6">
            {/* Background Color - Smart palette grid (columns = color families, rows = gradients) */}
            <div className="flex flex-col items-center w-full">
              <span className="font-semibold text-gray-700 mb-2">
                Background Color
              </span>
              <div className="grid grid-cols-9 gap-2 w-full max-w-2xl">
                {SMART_PALETTE_COLORS.map((c) => (
                  <button
                    key={c.value}
                    className={`w-7 h-7 border rounded ${
                      badge.backgroundColor === c.value
                        ? "ring-2 ring-offset-1 " + c.ring
                        : ""
                    }`}
                    style={{ backgroundColor: c.value }}
                    title={c.name}
                    onClick={(e) => {
                      e.preventDefault();
                      const updatedBadge = {
                        ...badge,
                        backgroundColor: c.value,
                      };
                      console.log(
                        `[COLOR TRACKING] Background color changed to: ${c.value}`
                      );
                      setBadge(updatedBadge);
                      // CRITICAL: If we're on badge 1, update badge1Data immediately
                      if (selectedBadgeIndex === 0) {
                        setBadge1Data(updatedBadge);
                      }
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Text Lines */}
          <BadgeEditPanel
            badge={badge}
            maxLines={maxLines}
            onLineChange={updateLine}
            onAlignmentChange={(index, alignment) => {
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
              setBadge({ ...badge, lines: newLines });
            }}
            onBackgroundColorChange={(backgroundColor) =>
              setBadge({ ...badge, backgroundColor })
            }
            onRemoveLine={removeLine}
            addLine={addLine}
            showRemove={true}
            editable={true}
          />

          {/* Actions */}
          <div className="flex justify-end items-center gap-2 mb-4">
            <button
              className="control-button flex items-center gap-1 px-3 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-400"
              onClick={(e) => {
                e.preventDefault();
                resetBadge();
              }}
            >
              <ArrowPathIcon className="w-5 h-5" />
              Reset
            </button>

            {multipleBadges.length > 0 && (
              <button
                className="control-button flex items-center gap-1 px-3 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-400"
                onClick={(e) => {
                  e.preventDefault();
                  resetAllBadges();
                }}
              >
                <ArrowPathIcon className="w-5 h-5" />
                Reset All
              </button>
            )}

            <button
              className="control-button bg-blue-500 text-white hover:bg-blue-600 px-3 py-2 text-sm"
              style={{ minWidth: 120 }}
              onClick={(e) => {
                e.preventDefault();
                setCsvText("");
                setCsvPreview([]);
                setCsvError("");
                setShowCsvModal(true);
              }}
            >
              Add Multiple Badges
            </button>
          </div>

          {/* Backing Options */}
          <div className="mb-4">
            <h3 className="font-semibold text-gray-700 mb-2">Backing Type</h3>
            <div className="flex gap-3">
              {[
                { value: "pin", label: "Pin (Included)" },
                { value: "magnetic", label: "Magnetic (+$2.00)" },
                { value: "adhesive", label: "Adhesive (+$1.00)" },
              ].map((option) => (
                <label
                  key={option.value}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="radio"
                    name="backing"
                    value={option.value}
                    checked={badge.backing === option.value}
                    onChange={(e) =>
                      setBadge({
                        ...badge,
                        backing: e.target.value as
                          | "pin"
                          | "magnetic"
                          | "adhesive",
                      })
                    }
                    className="text-blue-600"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Save / Add to cart */}
          <div className="flex justify-end mt-2 mb-4 gap-2">
            <button
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow"
              onClick={(e) => {
                e.preventDefault();
                saveBadge();
              }}
            >
              Save Design
            </button>
            <button
              className={`px-4 py-2 rounded shadow ${
                isSendingToSupabase
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-purple-600 hover:bg-purple-700"
              } text-white`}
              onClick={(e) => {
                e.preventDefault();
                if (!isSendingToSupabase) sendToSupabase();
              }}
              disabled={isSendingToSupabase}
            >
              {isSendingToSupabase ? "Uploading..." : "Send to Supabase"}
            </button>
            <button
              className={`px-4 py-2 rounded shadow ${
                isAddingToCart
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              } text-white`}
              onClick={(e) => {
                e.preventDefault();
                if (!isAddingToCart) addToCart();
              }}
              disabled={isAddingToCart}
            >
              {isAddingToCart
                ? "Adding to Cart..."
                : `Add to Cart - ${prettyPrice}`}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN - Badge preview (Desktop only). Current badge at top; rest scrollable. */}
      <div
        className={`hidden md:flex md:w-1/2 md:pl-3 flex-col items-center min-h-0 ${
          multipleBadges.length > 0 ? "md:h-[90vh]" : ""
        }`}
      >
        <div className="flex items-center justify-between w-full mb-4 flex-shrink-0">
          <h2 className="text-xl font-bold">Badge Preview</h2>
          <button
            type="button"
            className="p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
            onClick={() => setShowBadgeGridModal(true)}
            aria-label="View all badges"
            title="View all badges"
          >
            <Squares2X2Icon className="w-5 h-5" />
          </button>
        </div>
        {multipleBadges.length === 0 ? (
          <div
            className="flex flex-col items-center w-full h-[200px] flex-shrink-0"
            style={{ overflow: "visible" }}
          >
            <BadgeSvgRenderer
              badge={getBadgeForPreview(0, badge1Data).badge}
              templateId={getBadgeForPreview(0, badge1Data).templateId}
            />
          </div>
        ) : (
          <div className="flex flex-col w-full items-center gap-4 flex-1 min-h-0">
            {/* Current badge being edited - fixed at top */}
            <div className="flex flex-col items-center w-full flex-shrink-0">
              <div className="text-sm font-semibold text-blue-600 mb-0.5">
                Now editing badge {selectedBadgeIndex + 1}
              </div>
              <div
                className="flex flex-col items-center justify-center w-full h-[260px] border-2 border-blue-400 rounded-lg bg-blue-50/50 py-2"
                style={{ overflow: "hidden" }}
              >
                <BadgeSvgRenderer
                  badge={getBadgeForPreview(selectedBadgeIndex, getSavedBadgeFor(selectedBadgeIndex)).badge}
                  templateId={getBadgeForPreview(selectedBadgeIndex, getSavedBadgeFor(selectedBadgeIndex)).templateId}
                  height="100%"
                />
              </div>
            </div>

            {/* Rest: scrollable list - click Edit to bring that badge to the top */}
            <div className="flex flex-col gap-4 w-full flex-1 min-h-0 overflow-y-auto">
              {Array.from({ length: totalBadges }, (_, i) => i)
                .filter((i) => i !== selectedBadgeIndex)
                .map((i) => {
                  const saved = getSavedBadgeFor(i);
                  const { badge: b, templateId: tid } = getBadgeForPreview(i, saved);
                  return (
                    <div key={i} className="flex flex-row items-center gap-2 w-full flex-shrink-0">
                      <div className="flex flex-col items-center justify-center mr-2">
                        <span
                          className="text-lg font-bold mb-2"
                          style={{ width: 32, textAlign: "center" }}
                        >
                          {i + 1}.
                        </span>
                        <button
                          className="control-button flex items-center justify-center text-xs font-medium px-2 py-1 bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200"
                          onClick={(e) => {
                            e.preventDefault();
                            selectBadge(i);
                          }}
                        >
                          Edit
                        </button>
                        {i >= 1 && (
                          <>
                            <div className="h-2" />
                            <button
                              className="control-button p-1 bg-red-100 text-red-700 border-red-300 hover:bg-red-200 flex items-center justify-center"
                              style={{ width: 28, height: 28 }}
                              onClick={(e) => {
                                e.preventDefault();
                                setMultipleBadges(multipleBadges.filter((_, idx) => idx !== i - 1));
                              }}
                            >
                              <XMarkIcon className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                      <div
                        className="flex flex-col items-center w-full h-[200px]"
                        style={{ overflow: "visible" }}
                      >
                        <BadgeSvgRenderer badge={b} templateId={tid} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>

      {/* Badge grid picker modal (mobile + desktop) */}
      {showBadgeGridModal && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50 p-4"
          onClick={() => setShowBadgeGridModal(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Select badge to edit"
        >
          <div
            className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-bold text-gray-800">Select badge to edit</h3>
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
                const { badge: b, templateId: tid } = getBadgeForPreview(i, getSavedBadgeFor(i));
                const isSelected = selectedBadgeIndex === i;
                return (
                  <button
                    key={i}
                    type="button"
                    className={`flex flex-col items-center p-2 rounded-lg border-2 transition-colors ${
                      isSelected
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"
                    }`}
                    onClick={() => {
                      selectBadge(i);
                      setShowBadgeGridModal(false);
                    }}
                  >
                    <span className="text-sm font-bold text-gray-700 mb-1">{i + 1}.</span>
                    <div className="w-full flex items-center justify-center" style={{ height: 80 }}>
                      <BadgeSvgRenderer badge={b} templateId={tid} height={80} />
                    </div>
                  </button>
                );
              })}
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
            <h3 className="text-lg font-bold mb-2">Add Multiple Badges</h3>
            <p className="mb-2 text-sm text-gray-700">
              You can upload a CSV file or paste CSV data below. Each row should
              represent a badge.
            </p>
            <p className="mb-2 text-sm text-gray-700">
              <b>Add a comma (,) to indicate a new line. Add up to 4 lines.</b>
            </p>
            <div className="mb-2 text-sm">
              <b>Example:</b>
              <br />
              <span className="font-mono bg-gray-100 p-1 rounded inline-block mb-1">
                Names,Title,Company
              </span>
              <br />
              <span className="font-mono bg-gray-100 p-1 rounded inline-block mb-1">
                John Doe,Manager,Blue
              </span>
              <br />
              <span className="font-mono bg-gray-100 p-1 rounded inline-block mb-1">
                Jane Smith,Developer,Red
              </span>
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
              placeholder="Paste CSV data here..."
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
                <div className="font-semibold mb-1">Preview:</div>
                <table className="w-full text-xs border">
                  <tbody>
                    {csvPreview.map((row, i) => (
                      <tr key={i} className="border-t">
                        {row.map((cell, j) => (
                          <td key={j} className="border px-2 py-1">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded"
                onClick={(e) => {
                  e.preventDefault();
                  if (csvText.trim()) {
                    parseCsv(csvText);
                    if (!csvError) {
                      setCsvText("");
                      setCsvPreview([]);
                      setCsvError("");
                      setShowCsvModal(false);
                    }
                  }
                }}
              >
                Add Badges
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BadgeDesigner;
