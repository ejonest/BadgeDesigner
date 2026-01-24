// app/components/BadgeDesigner.tsx
import React, { useState, useEffect, useMemo, useRef } from "react";
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
} from "@heroicons/react/24/outline";

import {
  generatePDFWithLayoutEngine as generatePDF,
  generatePDFAsBlob,
} from "../utils/pdfGenerator";
import { BadgeEditPanel } from "./BadgeEditPanel";
import { BadgeEditorPanel } from "./BadgeEditorPanel";

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

const BadgeDesigner: React.FC<BadgeDesignerProps> = ({
  productId: _productId,
  shop: _shop,
  gadgetApiUrl,
  gadgetApiKey,
}) => {
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

  // Check if two colors are similar (within threshold RGB units)
  const areColorsSimilar = (
    color1: string,
    color2: string,
    threshold: number = 70,
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

  // Apply background color change (called after user confirms or if no warning needed)
  const applyBackgroundColor = (colorValue: string) => {
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
  };

  // Apply background color to all badges
  const applyBackgroundColorToAll = () => {
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
  };

  // Apply all formatting (background color + all text formatting) from current badge to all badges
  const applyAllFormattingToAll = () => {
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
  };

  const isRedColor = (color: string): boolean => {
    const [r, g, b] = hexToRgb(color);
    return r > 200 && g < 100 && b < 100;
  };

  // API
  const api = createApi(gadgetApiUrl, gadgetApiKey);

  // State
  // Initialize multipleBadges with one default badge
  const initialDefaultBadge: Badge = {
    ...INITIAL_BADGE,
    lines: INITIAL_BADGE.lines.map((line) => ({ ...line })),
  };
  const [multipleBadges, setMultipleBadges] = useState<Badge[]>([
    initialDefaultBadge,
  ]);
  const [badge, setBadge] = useState<Badge>({
    ...initialDefaultBadge,
    lines: initialDefaultBadge.lines.map((line) => ({ ...line })),
  });
  const [templates, setTemplates] = useState<LoadedTemplate[]>([]);
  const [templateRefreshKey, setTemplateRefreshKey] = useState(0); // Force template refresh

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [showCsvWarningModal, setShowCsvWarningModal] = useState(false);
  const [pendingCsvAction, setPendingCsvAction] = useState<
    "override" | "add" | null
  >(null);
  const [showBadgeGridModal, setShowBadgeGridModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateSortBy, setTemplateSortBy] = useState<
    "popularity" | "size" | "alphabetical"
  >("popularity");
  const [showColorModal, setShowColorModal] = useState(false);
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
  const [csvText, setCsvText] = useState("");
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [csvError, setCsvError] = useState("");
  const [selectedBadgeIndex, setSelectedBadgeIndex] = useState<number>(0); // 0 = first badge (multipleBadges[0]), 1+ = additional badges
  const [badge1Data, setBadge1Data] = useState<Badge | null>(null); // Keep for backward compatibility, synced with multipleBadges[0]
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [isSendingToSupabase, setIsSendingToSupabase] = useState(false);
  // UNIVERSAL TEMPLATE: Single template for all badges
  const [universalTemplateId, setUniversalTemplateId] =
    useState<string>("rect-1x3");
  // Collapsible sections state - only first section (template) open by default
  const [sectionsOpen, setSectionsOpen] = useState({
    template: true,
    export: false,
    background: false,
    textLines: false,
  });
  // Track which sections have been opened at least once
  const [sectionsOpened, setSectionsOpened] = useState({
    template: false, // Template starts open, but we'll mark it as opened when user interacts
    export: false,
    background: false,
    textLines: false,
  });
  // Refs for section headers to enable scroll-into-view
  const templateSectionRef = useRef<HTMLButtonElement | null>(null);
  const exportSectionRef = useRef<HTMLButtonElement | null>(null);
  const backgroundSectionRef = useRef<HTMLButtonElement | null>(null);
  const textLinesSectionRef = useRef<HTMLButtonElement | null>(null);

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
        prevOpenSectionRef.current === "textLines";
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

  // Load templates - refresh when templateRefreshKey changes
  useEffect(() => {
    (async () => {
      try {
        console.log(
          "[BadgeDesigner] Loading templates (refresh key:",
          templateRefreshKey,
          ")",
        );
        const list = await loadTemplates();
        setTemplates(list);
        console.log(
          "[BadgeDesigner] templates loaded:",
          list.map((t) => t.id),
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
        (line) => line.yNorm === 0.5,
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

  // Apply formatting from current line to all badges' corresponding lines
  const applyFormattingToAllLines = (lineIndex: number) => {
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
        } as BadgeLine),
    );
  };

  const resetBadge = () => {
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
      backing: badge.backing || "pin", // Preserve backing if it exists
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
        backing: badgeToReset.backing || "pin",
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
      backing: badge.backing || "pin",
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

    // Load the selected badge from multipleBadges array
    const selectedBadge = multipleBadges[index];
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
            italic,
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
              italic,
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

    // Update all badges in multipleBadges with auto-scaled text
    setMultipleBadges((prev) => {
      const updated = prev.map((badge) => {
        const scaledLines = autoScaleLinesForNewTemplate(badge.lines);
        const centeredLines = calculateCenterPositions(scaledLines);
        return { ...badge, templateId: newTemplateId, lines: centeredLines };
      });

      // Sync badge1Data with the first badge
      if (updated[0]) {
        setBadge1Data(updated[0]);
      }

      return updated;
    });
  };

  // Send to Supabase - Upload PDF, SVG, PNG and save to badge_order_items
  const sendToSupabase = async () => {
    if (isSendingToSupabase) return;

    // Check for similar colors before sending
    if (checkCurrentBadgeColorSimilarity()) {
      setShowSupabaseColorWarning(true);
      return;
    }

    await executeSendToSupabase();
  };

  // Actual Supabase upload function (called after warning is confirmed or if no warning needed)
  const executeSendToSupabase = async () => {
    setIsSendingToSupabase(true);

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

      // Generate files as blobs
      console.log("Generating PDF and PNGs...");

      // Generate PDF (first badge, rest as additional badges)
      const pdfBlob = await generatePDFAsBlob(
        allBadges[0],
        allBadges.length > 1 ? allBadges.slice(1) : undefined,
      );

      // Generate low-quality PNGs (for thumbnails) and SVGs (for full images) for each badge
      const thumbnailPngBlobs: Blob[] = [];
      const svgBlobs: Blob[] = [];

      for (let i = 0; i < allBadges.length; i++) {
        const badge = allBadges[i];
        try {
          // Load template for this badge
          const badgeTemplate = await loadTemplateById(
            badge.templateId || templateToUse.id,
          );
          if (!badgeTemplate) {
            console.warn(
              `Template not found for badge ${i}, skipping image generation`,
            );
            continue;
          }

          // Generate low-quality PNG for thumbnail (scale 1 for smaller file size)
          const thumbnailPngBlob = await generatePNGAsBlob(
            badge,
            badgeTemplate,
            1,
          );
          if (thumbnailPngBlob && thumbnailPngBlob.size > 0) {
            thumbnailPngBlobs.push(thumbnailPngBlob);
          } else {
            console.warn(
              `Generated thumbnail PNG for badge ${i} is empty, skipping`,
            );
            thumbnailPngBlobs.push(new Blob()); // Push empty blob to maintain index alignment
          }

          // Generate SVG for full image (high quality, scalable)
          const svgBlob = await generateSVGAsBlob(badge, badgeTemplate);
          if (svgBlob && svgBlob.size > 0) {
            svgBlobs.push(svgBlob);
          } else {
            console.warn(`Generated SVG for badge ${i} is empty, skipping`);
            svgBlobs.push(new Blob()); // Push empty blob to maintain index alignment
          }
        } catch (error) {
          console.error(`Error generating images for badge ${i}:`, error);
          // Push empty blobs to maintain index alignment
          thumbnailPngBlobs.push(new Blob());
          svgBlobs.push(new Blob());
        }
      }

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
      formData.append("pdf", pdfBlob, "badge-design.pdf");
      // Append each thumbnail PNG blob with index (low quality for thumbnails)
      thumbnailPngBlobs.forEach((pngBlob, index) => {
        if (pngBlob && pngBlob.size > 0) {
          formData.append(
            `thumbnail_png_${index}`,
            pngBlob,
            `badge-${index}-thumbnail.png`,
          );
        }
      });
      // Append each SVG blob with index (high quality for full images)
      svgBlobs.forEach((svgBlob, index) => {
        if (svgBlob && svgBlob.size > 0) {
          formData.append(`svg_${index}`, svgBlob, `badge-${index}-design.svg`);
        }
      });

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
        `[FINALIZE] Saving ${allFinalizedBadges.length} badges with finalized states`,
      );
      allFinalizedBadges.forEach((b, i) => {
        console.log(
          `[FINALIZE] Badge ${i + 1}: backgroundColor=${
            b.backgroundColor
          }, templateId=${b.templateId}`,
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
          badge: allFinalizedBadges[0],
          multipleBadges:
            allFinalizedBadges.length > 1 ? allFinalizedBadges.slice(1) : [],
          allBadges: allFinalizedBadges,
          timestamp: new Date().toISOString(),
        },
        backgroundColor: allFinalizedBadges[0].backgroundColor,
        backingType: allFinalizedBadges[0].backing,
        basePrice,
        backingPrice,
        totalPrice,
        textLines: allFinalizedBadges[0].lines,
      };

      const savedDesign = await api.saveBadgeDesign(badgeDesignData, shopData);
      // eslint-disable-next-line no-alert
      alert(
        `Badge design saved and finalized! Design ID: ${
          savedDesign.id || "Unknown"
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
        shopData,
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
          50,
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
        .filter((row: string) => row.trim().length > 0) // Filter out empty rows
        .map((row: string) => row.split(","));

      // Validate that each row has at most 4 comma-separated values
      const maxLines = BADGE_CONSTANTS.MAX_LINES;
      const invalidRows: number[] = [];
      rows.forEach((row, index) => {
        if (row.length > maxLines) {
          invalidRows.push(index + 1); // 1-indexed for user display
        }
      });

      if (invalidRows.length > 0) {
        setCsvError(
          `Each badge can have a maximum of ${maxLines} lines of text. ` +
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

  // Actually create badges from CSV
  function parseCsv(text: string, overrideExisting: boolean = false) {
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

      // Validate that each row has at most 4 comma-separated values
      const maxLines = BADGE_CONSTANTS.MAX_LINES;
      const invalidRows: number[] = [];
      rows.forEach((row, index) => {
        if (row.length > maxLines) {
          invalidRows.push(index + 1); // 1-indexed for user display
        }
      });

      if (invalidRows.length > 0) {
        setCsvError(
          `Each badge can have a maximum of ${maxLines} lines of text. ` +
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
              Customize Your Badge {selectedBadgeIndex + 1}
              {multipleBadges.length > 1 ? ` of ${totalBadges}` : ""}
            </h2>
            <span className="text-xl font-bold text-red-600">
              {activeTemplate.name}
            </span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              className="flex-shrink-0 w-14 h-14 flex items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
              onClick={() => setShowBadgeGridModal(true)}
              aria-label="View all badges"
              title="View all badges"
            >
              <Squares2X2Icon className="w-6 h-6" />
            </button>
            <div className="text-[10px] text-gray-600 text-center leading-tight">
              Grid
              <br />
              View
            </div>
          </div>
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
          </div>
        </div>
      </div>

      {/* LEFT COLUMN - Controls */}
      <div className="w-full md:w-1/2 mb-4 md:mb-0 md:pr-3 overflow-y-auto flex-1 min-h-0 md:flex-initial md:min-h-0 md:max-h-[90vh]">
        <div className="section-container mb-4">
          <div className="hidden md:flex justify-between items-center mb-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-bold text-gray-800">
                Customize Your Badge {selectedBadgeIndex + 1}
                {multipleBadges.length > 1 && ` of ${totalBadges}`}
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
            <button
              ref={templateSectionRef}
              type="button"
              onClick={() => {
                const willBeOpen = !sectionsOpen.template;
                setSectionsOpen({
                  template: willBeOpen,
                  export: false,
                  background: false,
                  textLines: false,
                });
                // Mark as opened when user interacts with the section
                setSectionsOpened((prev) => ({ ...prev, template: true }));
              }}
              className="flex items-center justify-between w-full mb-2 text-left"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-800">
                  Shape / Template
                </h3>
                {!sectionsOpen.template && sectionsOpened.template && (
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
                      const svgPath = `/templates/${t.id}.svg`;
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
                              console.log(
                                "[UNIVERSAL] Template changed to:",
                                t.id,
                              );
                              handleUniversalTemplateChange(t.id);
                            }}
                            title={t.name}
                          >
                            <div
                              className={`text-[10px] text-center py-1 flex-shrink-0 ${
                                isSelected
                                  ? "bg-blue-600 text-white"
                                  : "bg-gray-200 text-gray-700"
                              }`}
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
                    };

                    // Featured templates: Round 1x3, Round 1.5x3, Oval 1.5x3, House 1.5x3
                    const featuredTemplateIds = [
                      "rect-1x3",
                      "rect-1_5x3",
                      "oval-1_5x3",
                      "house-1_5x3",
                    ];
                    const featuredTemplates = featuredTemplateIds
                      .map((id) => templates.find((t) => t.id === id))
                      .filter((t): t is LoadedTemplate => t !== undefined);

                    return (
                      <>
                        {/* 2x2 Grid of Featured Templates */}
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          {featuredTemplates.map(renderTemplateButton)}
                        </div>
                        {/* More Templates Link */}
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

          {/* Background Color */}
          <div className="flex flex-col w-full mb-6">
            {/* Background Color - Smart palette grid (columns = color families, rows = gradients) */}
            <div className="flex flex-col w-full">
              <button
                ref={backgroundSectionRef}
                type="button"
                onClick={() => {
                  const willBeOpen = !sectionsOpen.background;
                  setSectionsOpen({
                    template: false,
                    export: false,
                    background: willBeOpen,
                    textLines: false,
                  });
                  // Mark as opened when user interacts with the section
                  setSectionsOpened((prev) => ({ ...prev, background: true }));
                }}
                className="flex items-center justify-between w-full mb-2 text-left"
              >
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold text-gray-800">
                    Background Color
                  </h3>
                  {!sectionsOpen.background && sectionsOpened.background && (
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
                          <div className="grid grid-cols-3 gap-2 w-fit">
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
                                  style={{ backgroundColor: c.value }}
                                  title={c.name}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleColorClick(c.value);
                                  }}
                                />
                                <span className="text-[10px] text-gray-600 text-center leading-tight">
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
                                  ) : (
                                    c.name
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                          {/* More Colors Link */}
                          <button
                            type="button"
                            onClick={() => setShowColorModal(true)}
                            className="text-sm text-blue-600 hover:text-blue-800 underline text-left py-1 w-fit"
                          >
                            more colors
                          </button>
                          {/* Apply to All Button */}
                          {multipleBadges.length > 1 && (
                            <div className="mt-2">
                              <button
                                type="button"
                                onClick={applyBackgroundColorToAll}
                                className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed whitespace-nowrap"
                                title="Apply background color to all badges"
                              >
                                Apply background color to all badges
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
                          <span className="text-[10px] text-gray-600 text-center">
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

          {/* Text Lines */}
          <div className="mb-4">
            <button
              ref={textLinesSectionRef}
              type="button"
              onClick={() => {
                const willBeOpen = !sectionsOpen.textLines;
                setSectionsOpen({
                  template: false,
                  export: false,
                  background: false,
                  textLines: willBeOpen,
                });
                // Mark as opened when user interacts with the section
                setSectionsOpened((prev) => ({ ...prev, textLines: true }));
              }}
              className="flex items-center justify-between w-full mb-2 text-left"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-800">
                  Text Lines
                </h3>
                {!sectionsOpen.textLines && sectionsOpened.textLines && (
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
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end items-start gap-3 mb-4">
            <div className="flex flex-col items-center gap-1">
              <button
                className="control-button w-14 h-14 flex items-center justify-center bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-400 rounded transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  resetBadge();
                }}
                title="Reset current badge to default settings"
              >
                <ArrowPathRoundedSquareIcon className="w-6 h-6" />
              </button>
              <div className="text-[10px] text-gray-600 text-center leading-tight">
                Reset
                <br />
                Format
              </div>
            </div>

            {multipleBadges.length > 1 && (
              <div className="flex flex-col items-center gap-1">
                <button
                  className="control-button w-14 h-14 flex items-center justify-center bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-400 rounded transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    resetAllBadges();
                  }}
                  title="Reset all badges to default settings"
                >
                  <ArrowPathIconOutline className="w-6 h-6" />
                </button>
                <div className="text-[10px] text-gray-600 text-center leading-tight">
                  Reset
                  <br />
                  All Badges
                </div>
              </div>
            )}

            {multipleBadges.length > 1 && (
              <div className="flex flex-col items-center gap-1">
                <button
                  className="control-button w-14 h-14 flex items-center justify-center bg-green-500 text-white hover:bg-green-600 border border-green-600 rounded transition-colors"
                  onClick={(e) => {
                    e.preventDefault();
                    applyAllFormattingToAll();
                  }}
                  title="Apply background color and all text formatting from current badge to all badges"
                >
                  <Square2StackIcon className="w-6 h-6" />
                </button>
                <div className="text-[10px] text-gray-600 text-center leading-tight">
                  Apply Format
                  <br />
                  to All Badges
                </div>
              </div>
            )}

            <div className="flex flex-col items-center gap-1">
              <button
                className="control-button w-14 h-14 flex items-center justify-center bg-blue-500 text-white hover:bg-blue-600 border border-blue-600 rounded transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  setCsvText("");
                  setCsvPreview([]);
                  setCsvError("");
                  setShowCsvModal(true);
                }}
                title="Add multiple badges from CSV file or data"
              >
                <SquaresPlusIcon className="w-6 h-6" />
              </button>
              <div className="text-[10px] text-gray-600 text-center leading-tight">
                Add
                <br />
                Badges
              </div>
            </div>
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

          {/* Export Options */}
          <div className="mb-4">
            <button
              ref={exportSectionRef}
              type="button"
              onClick={() => {
                const willBeOpen = !sectionsOpen.export;
                setSectionsOpen({
                  template: false,
                  export: willBeOpen,
                  background: false,
                  textLines: false,
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
                      "badge.svg",
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
                      "badge.cdr",
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
        </div>
      </div>

      {/* RIGHT COLUMN - Badge preview (Desktop only). Current badge at top; rest scrollable. */}
      <div
        className={`hidden md:flex md:w-1/2 md:pl-3 flex-col items-center min-h-0 ${
          multipleBadges.length > 1 ? "md:h-[90vh]" : ""
        }`}
      >
        <div className="flex items-center justify-between w-full mb-4 flex-shrink-0">
          <h2 className="text-xl font-bold">Badge Preview</h2>
          <div className="flex flex-col items-center gap-1">
            <button
              type="button"
              className="w-14 h-14 flex items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
              onClick={() => setShowBadgeGridModal(true)}
              aria-label="View all badges"
              title="View all badges"
            >
              <Squares2X2Icon className="w-6 h-6" />
            </button>
            <div className="text-[10px] text-gray-600 text-center leading-tight">
              Grid
              <br />
              View
            </div>
          </div>
        </div>
        {multipleBadges.length === 1 ? (
          <div
            className="flex flex-col items-center w-full h-[200px] flex-shrink-0"
            style={{ overflow: "visible" }}
          >
            <BadgeSvgRenderer
              badge={getBadgeForPreview(0, getSavedBadgeFor(0)).badge}
              templateId={getBadgeForPreview(0, getSavedBadgeFor(0)).templateId}
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
              </div>
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
                        {i >= 1 && (
                          <>
                            <div className="h-2" />
                            <button
                              className="control-button p-1 bg-red-100 text-red-700 border-red-300 hover:bg-red-200 flex items-center justify-center"
                              style={{ width: 28, height: 28 }}
                              onClick={(e) => {
                                e.preventDefault();
                                setMultipleBadges(
                                  multipleBadges.filter(
                                    (_, idx) => idx !== i - 1,
                                  ),
                                );
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
              <h3 className="text-lg font-bold text-gray-800">
                Select badge to edit
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
                        badge={b}
                        templateId={tid}
                        height={80}
                      />
                    </div>
                  </button>
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
                <label className="text-sm text-gray-600">Sort by:</label>
                <select
                  value={templateSortBy}
                  onChange={(e) =>
                    setTemplateSortBy(
                      e.target.value as "popularity" | "size" | "alphabetical",
                    )
                  }
                  className="text-sm border border-gray-300 rounded px-2 py-1 bg-white"
                >
                  <option value="popularity">Popularity</option>
                  <option value="size">Size(Height)</option>
                  <option value="alphabetical">Alphabetical</option>
                </select>
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
              ) : (
                (() => {
                  // Sort templates based on selected option
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
                    const svgPath = `/templates/${t.id}.svg`;
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
                            className={`text-[10px] text-center py-1 flex-shrink-0 ${
                              isSelected
                                ? "bg-blue-600 text-white"
                                : "bg-gray-200 text-gray-700"
                            }`}
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

      {/* Background Color Warning Modal */}
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
                Color Similarity Warning
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
            <p className="text-gray-700 mb-6">
              Some text may not show well with this background color. Consider
              picking a new background or text color.
            </p>
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
                    applyBackgroundColor(pendingBackgroundColor);
                  }
                  setShowBackgroundColorWarning(false);
                  setPendingBackgroundColor(null);
                }}
              >
                Continue Anyway
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
                className={`px-3 py-1 rounded ${
                  csvError || !csvText.trim()
                    ? "bg-gray-400 text-gray-600 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700 text-white"
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  if (csvText.trim() && !csvError) {
                    // Always show warning modal since we always have at least 1 badge (the default)
                    // This allows user to choose to override or add to existing badges
                    setShowCsvWarningModal(true);
                  }
                }}
                disabled={!!csvError || !csvText.trim()}
              >
                Add Badges
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
            <h3 className="text-lg font-bold mb-4">Existing Badges Found</h3>
            <p className="mb-4 text-sm text-gray-700">
              You currently have {multipleBadges.length} existing badge
              {multipleBadges.length !== 1 ? "s" : ""}. How would you like to
              proceed?
            </p>
            <div className="flex flex-col gap-3">
              <button
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
                onClick={(e) => {
                  e.preventDefault();
                  setPendingCsvAction("override");
                  setShowCsvWarningModal(false);
                  // Parse CSV with override flag
                  parseCsv(csvText, true);
                  if (!csvError) {
                    setCsvText("");
                    setCsvPreview([]);
                    setCsvError("");
                    setShowCsvModal(false);
                  }
                  setPendingCsvAction(null);
                }}
              >
                Override Existing Badges
                <span className="block text-xs mt-1 opacity-90">
                  (Replace all existing badges with new ones)
                </span>
              </button>
              <button
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
                onClick={(e) => {
                  e.preventDefault();
                  setPendingCsvAction("add");
                  setShowCsvWarningModal(false);
                  // Parse CSV with add flag
                  parseCsv(csvText, false);
                  if (!csvError) {
                    setCsvText("");
                    setCsvPreview([]);
                    setCsvError("");
                    setShowCsvModal(false);
                  }
                  setPendingCsvAction(null);
                }}
              >
                Add to Existing Badges
                <span className="block text-xs mt-1 opacity-90">
                  (Keep existing badges and add new ones)
                </span>
              </button>
              <button
                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-4 py-2 rounded"
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
        </div>
      )}
    </div>
  );
};

export default BadgeDesigner;
