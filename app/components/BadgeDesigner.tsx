// app/components/BadgeDesigner.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/solid';
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
  PencilIcon
} from '@heroicons/react/24/outline';

import { generatePDFWithLayoutEngine as generatePDF } from '../utils/pdfGenerator';
import { BadgeEditPanel } from './BadgeEditPanel';

import { BadgeLine, Badge } from '../types/badge';
import { BACKGROUND_COLORS, FONT_COLORS, EXTENDED_BACKGROUND_COLORS } from '../constants/colors';
import { BADGE_CONSTANTS } from '../constants/badge';
import { generateFullBadgeImage, generateThumbnailFromFullImage } from '../utils/badgeThumbnail';
import { getCurrentShop } from '../utils/shopAuth';
import { createApi } from '../utils/api';

import { loadTemplates, loadTemplateById } from '../utils/templates';
import type { LoadedTemplate } from '../utils/templates';
import { validateBadgeTemplate, validateBadgeData } from '../utils/badgeValidator';
import { migrateBadgeToTemplate, checkTemplateCompatibility, migrateLegacyBadge, migrateBadgeArray } from '../utils/badgeMigration';
import BadgeSvgRenderer from './BadgeSvgRenderer';
import { 
  downloadSVG, downloadPNG, downloadCDR, downloadTIFF,
  downloadMultipleSVGs, downloadMultiplePNGs, downloadMultipleCDRs, downloadMultipleTIFFs
} from '../utils/export';

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

// Helper functions for multi-badge exports
const getAllBadges = (badge1Data: Badge | null, multipleBadges: Badge[]): Badge[] => {
  // Ensure all badges have IDs and templateIds
  const ensureBadgeIds = (b: Badge, index: number): Badge => ({
    ...b,
    id: b.id || `badge-${index + 1}`,
    templateId: b.templateId || 'rect-1x3'
  });
  
  // Use saved badge1Data instead of current main preview
  const savedBadge1 = badge1Data || { 
    id: 'badge-1', 
    templateId: 'rect-1x3', 
    lines: [], 
    backgroundColor: '#FFFFFF', 
    backing: 'pin' as const
  };
  return [ensureBadgeIds(savedBadge1, 0), ...multipleBadges.map((b, i) => ensureBadgeIds(b, i + 1))];
};

const getAllTemplates = (badge1Data: Badge | null, multipleBadges: Badge[], templates: LoadedTemplate[]): LoadedTemplate[] => {
  // UNIVERSAL TEMPLATE: All badges use the same template
  const universalTemplate = templates[0] || { 
    id: 'rect-1x3', 
    name: 'Rectangle 1×3', 
    widthIn: 3.0,
    heightIn: 1.0,
    safeInsetPx: 6,
    innerPathSvg: '<path d="M25,0 L275,0 A25,25 0 0,1 300,25 L300,75 A25,25 0 0,1 275,100 L25,100 A25,25 0 0,1 0,75 L0,25 A25,25 0 0,1 25,0 Z" fill="#000"/>'
  };
  
  // Return the same template for all badges
  return Array(getAllBadges(badge1Data, multipleBadges).length).fill(universalTemplate);
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
    return lines.map(line => ({
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
  
  return lines.map(line => {
    // If line already has normalized coordinates, keep them
    if (line.xNorm !== undefined && line.yNorm !== undefined && line.sizeNorm !== undefined) {
      return line;
    }

    // Convert legacy absolute coordinates to normalized
    let xNorm = 0.5, yNorm = 0.5, sizeNorm = 0.15;
    
    if (line.x !== undefined || line.y !== undefined) {
      // Convert from old absolute coordinates to normalized
      xNorm = line.x !== undefined ? (line.x - oldDesignBox.x) / oldDesignBox.width : 0.5;
      yNorm = line.y !== undefined ? (line.y - oldDesignBox.y) / oldDesignBox.height : 0.5;
      
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

const BadgeDesigner: React.FC<BadgeDesignerProps> = ({ productId: _productId, shop: _shop, gadgetApiUrl, gadgetApiKey }) => {
  // API
  const api = createApi(gadgetApiUrl, gadgetApiKey);

  // State
  const [badge, setBadge] = useState<Badge>({
    ...INITIAL_BADGE,
    lines: INITIAL_BADGE.lines.map(line => ({...line}))
  });
  const [templates, setTemplates] = useState<LoadedTemplate[]>([]);


  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [csvError, setCsvError] = useState('');
  const [multipleBadges, setMultipleBadges] = useState<any[]>([]);
  const [selectedBadgeIndex, setSelectedBadgeIndex] = useState<number>(0); // 0 = main badge, 1+ = CSV badges
  const [badge1Data, setBadge1Data] = useState<Badge | null>(null); // Store badge 1's data separately
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showExtendedBgPicker, setShowExtendedBgPicker] = useState(false);
  // UNIVERSAL TEMPLATE: Single template for all badges
  const [universalTemplateId, setUniversalTemplateId] = useState<string>('rect-1x3');

  // Load templates once
  useEffect(() => {
    (async () => {
      try {
        const list = await loadTemplates();
        setTemplates(list);
        console.log('[BadgeDesigner] templates loaded:', list.map(t => t.id));

        // Initialize with first template
        if (list.length > 0) {
          setUniversalTemplateId(list[0].id);
        }
      } catch (error) {
        console.error('Failed to load templates:', error);
      }
    })();
  }, []);

  // Auto-save removed - now handled in selectBadge function to prevent data overwriting

  // Recalculate initial badge positions when templates load
  useEffect(() => {
    if (templates.length > 0 && badge.lines.length > 0) {
      // Check if this is the initial badge with default positions
      const hasDefaultPositions = badge.lines.every(line => line.yNorm === 0.5);
      
      if (hasDefaultPositions) {
        console.log('[DEBUG] Recalculating initial badge positions');
        const centeredLines = calculateCenterPositions(badge.lines);
        setBadge(prevBadge => ({
          ...prevBadge,
          lines: centeredLines
        }));
      }
    }
  }, [templates.length]); // Only when templates first load

  // Initialize badge1Data when badge is first loaded, prevent overwriting from other badges
  useEffect(() => {
    // Only update badge1Data if we're currently on badge 1 and it's not already set
    if (selectedBadgeIndex === 0 && !badge1Data && badge.lines.length > 0) {
      console.log(`[DEBUG] useEffect: Initializing badge1Data with badge:`, badge.lines.map(l => l.text));
      setBadge1Data(badge);
    }
  }, [badge, selectedBadgeIndex, badge1Data]);

  // Stage 2: Removed problematic auto-sync - saving is now explicit via "Save Changes" button

  // UNIVERSAL TEMPLATE: Get the active template
  const activeTemplate: LoadedTemplate = useMemo(() => {
    const template = templates.find(t => t.id === universalTemplateId);
    if (!template) {
      console.warn('[BadgeDesigner] Universal template not found:', universalTemplateId);
    }
    return template || templates[0] || { 
      id: 'rect-1x3', 
      name: 'Rectangle 1×3', 
      widthIn: 3.0,
      heightIn: 1.0,
      safeInsetPx: 6,
      innerPathSvg: '<path d="M25,0 L275,0 A25,25 0 0,1 300,25 L300,75 A25,25 0 0,1 275,100 L25,100 A25,25 0 0,1 0,75 L0,25 A25,25 0 0,1 25,0 Z" fill="#000"/>'
    };
  }, [templates, universalTemplateId]);

  // UNIVERSAL TEMPLATE: No need to recalculate on template change since all badges use same template

  // Measure text width for auto-shrink
  const measureTextWidth = (text: string, fontSize: number, fontFamily: string, bold: boolean, italic: boolean) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.font = `${bold ? 'bold ' : ''}${italic ? 'italic ' : ''}${fontSize}px ${fontFamily || 'Arial'}`;
    return ctx.measureText(text).width;
  };

  // PRESERVE TEXT SIZES: Only recalculate positions, not sizes
  const calculateCenterPositions = (lines: BadgeLine[]): BadgeLine[] => {
    if (!activeTemplate?.designBox) return lines;
    
    const designBoxHeight = activeTemplate.designBox.height;
    const designBoxCenterY = designBoxHeight / 2;
    
    // Calculate total text height using existing sizeNorm values
    const totalTextHeight = lines.reduce((sum, line) => {
      const fontSize = (line.sizeNorm || 0.15) * designBoxHeight;
      return sum + fontSize * 1.2; // 1.2 for line spacing
    }, 0);
    
    // Calculate starting Y position (center minus half total height)
    const startY = designBoxCenterY - (totalTextHeight / 2);
    
    // Position each line while preserving sizeNorm
    let currentY = startY;
    return lines.map((line, index) => {
      const fontSize = (line.sizeNorm || 0.15) * designBoxHeight;
      const yPosition = currentY + (fontSize / 2); // Center the text on the line
      
      // Convert to normalized coordinates
      const yNorm = yPosition / designBoxHeight;
      
      currentY += fontSize * 1.2; // Move to next line position
      
      return {
        ...line,
        yNorm: Math.max(0.1, Math.min(0.9, yNorm)), // Only update position, preserve sizeNorm
        xNorm: line.xNorm || 0.5 // Ensure xNorm exists
      };
    });
  };

  // Text updates
  const updateLine = (index: number, changes: Partial<BadgeLine>) => {
    const newLines = badge.lines.map((l: BadgeLine, i: number) => {
      if (i !== index) {
        return {
          ...l,
          align:
            l.align === 'left' || l.align === 'center' || l.align === 'right'
              ? l.align
              : 'center',
        };
      }

      let updated = { ...l, ...changes };

      if (typeof changes.text !== 'undefined') {
        let fontSize = updated.fontSize || 18;
        let textWidth = measureTextWidth(
          updated.text,
          fontSize,
          updated.fontFamily || 'Arial',
          updated.bold || false,
          updated.italic || false
        );
        while (textWidth > badgeWidth - 24 && fontSize > MIN_FONT_SIZE) {
          fontSize--;
          textWidth = measureTextWidth(
            updated.text,
            fontSize,
            updated.fontFamily || 'Arial',
            updated.bold || false,
            updated.italic || false
          );
        }
        updated.fontSize = fontSize;
      }

      if (typeof updated.align !== 'undefined') {
        updated.align =
          updated.align === 'left' || updated.align === 'center' || updated.align === 'right'
            ? updated.align
            : 'center';
      } else {
        updated.align = 'center';
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
      const currentTemplate = templates.find(t => t.id === badge.templateId);
      const designBox = currentTemplate?.designBox || { x: 0, y: 0, width: 288, height: 96 };
      
      const newLines = [
          ...badge.lines,
          {
          id: `line-${Date.now()}`,
          text: 'Line Text',
          xNorm: 0.5,
          yNorm: 0.5, // Will be repositioned by calculateCenterPositions
          sizeNorm: badge.lines.length === 0 ? 0.20 : 0.143, // 14pt for line 1, 10pt for lines 2,3,4
          color: '#000000',
          bold: false,
          italic: false,
          fontFamily: 'Arial',
          align: 'center',
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
            l.align === 'left' || l.align === 'center' || l.align === 'right'
              ? l.align
              : 'center',
        })),
      });
    }
  };

  const resetBadge = () => {
    const fallbackId = templates[0]?.id || 'rect-1x3';
    const defaultLines = [
      { 
        id: 'line-1',
        text: 'Your Name', 
        xNorm: 0.5,
        yNorm: 0.5, // Will be repositioned by calculateCenterPositions
        sizeNorm: 0.12,
        color: '#000000', 
        bold: false, 
        italic: false, 
        fontFamily: 'Arial', 
        align: 'center' 
      } as BadgeLine,
      { 
        id: 'line-2',
        text: 'Title', 
        xNorm: 0.5,
        yNorm: 0.5, // Will be repositioned by calculateCenterPositions
        sizeNorm: 0.08,
        color: '#000000', 
        bold: false, 
        italic: false, 
        fontFamily: 'Arial', 
        align: 'center' 
      } as BadgeLine,
    ];
    
    // Apply center-based positioning
    const centeredLines = calculateCenterPositions(defaultLines);
    
    setBadge({
      templateId: badge.templateId || fallbackId,
      lines: centeredLines,
      backgroundColor: '#FFFFFF',
      backing: 'pin',
    });
  };

  // CLEAN ARCHITECTURE: Auto-save on switch (no manual save button)

  // UNIVERSAL PREVIEW: All badges use the same template
  const getBadgeForPreview = (badgeIndex: number, savedBadge: Badge | null) => {
    const isCurrentlyEditing = selectedBadgeIndex === badgeIndex;
    
    if (isCurrentlyEditing) {
      // LIVE PREVIEW: Mirror left-hand preview when editing
      console.log(`[UNIVERSAL] Badge ${badgeIndex} LIVE PREVIEW - using current badge with backgroundColor: ${badge.backgroundColor}`);
      return {
        badge: badge,
        templateId: universalTemplateId // Always use universal template
      };
    } else {
      // STATIC: Show saved state when not editing
      if (savedBadge) {
        console.log(`[UNIVERSAL] Badge ${badgeIndex} STATIC PREVIEW - using saved badge with backgroundColor: ${savedBadge.backgroundColor}`);
        const previewBadge = {
          ...savedBadge, 
          lines: calculateCenterPositions(savedBadge.lines),
          backgroundColor: savedBadge.backgroundColor // Explicitly preserve saved backgroundColor
        };
        return {
          badge: previewBadge,
          templateId: universalTemplateId // Always use universal template
        };
      } else {
        // Fallback to current badge if no saved state
        console.log(`[UNIVERSAL] Badge ${badgeIndex} FALLBACK PREVIEW - no saved state, using current badge`);
        return {
          badge: badge,
          templateId: universalTemplateId // Always use universal template
        };
      }
    }
  };

  // UNIVERSAL TEMPLATE: Auto-save on switch, all badges use same template
  const selectBadge = (index: number) => {
    console.log(`[UNIVERSAL] selectBadge called: index=${index}, current selectedBadgeIndex=${selectedBadgeIndex}`);
    
    // AUTO-SAVE: Save current badge state when switching
    if (selectedBadgeIndex === 0) {
      // Auto-save Badge 1
      const validatedBadge = { ...badge, templateId: universalTemplateId };
      console.log(`[UNIVERSAL] Auto-saving Badge 1:`, validatedBadge.lines.map(l => l.text));
      setBadge1Data(validatedBadge);
    } else {
      // Auto-save CSV badge
      const validatedBadge = { ...badge, templateId: universalTemplateId };
      console.log(`[UNIVERSAL] Auto-saving CSV badge ${selectedBadgeIndex}:`, validatedBadge.lines.map(l => l.text));
      const newMultipleBadges = [...multipleBadges];
      newMultipleBadges[selectedBadgeIndex - 1] = validatedBadge;
      setMultipleBadges(newMultipleBadges);
    }

    // SWITCH: Load the selected badge for editing
    setSelectedBadgeIndex(index);
    
    if (index === 0) {
      // Load Badge 1 for editing
      if (badge1Data) {
        console.log(`[UNIVERSAL] Loading Badge 1 for editing:`, badge1Data.lines.map((l: BadgeLine) => l.text));
        const centeredLines = calculateCenterPositions(badge1Data.lines);
        setBadge({ ...badge1Data, lines: centeredLines, templateId: universalTemplateId });
      }
    } else {
      // Load CSV badge for editing
      const csvBadge = multipleBadges[index - 1];
      if (csvBadge) {
        console.log(`[UNIVERSAL] Loading CSV badge ${index} for editing:`, csvBadge.lines.map((l: BadgeLine) => l.text));
        const centeredLines = calculateCenterPositions(csvBadge.lines);
        setBadge({ ...csvBadge, lines: centeredLines, templateId: universalTemplateId });
      }
    }
  };

  // UNIVERSAL TEMPLATE: When template changes, update all badges
  const handleUniversalTemplateChange = (newTemplateId: string) => {
    console.log(`[UNIVERSAL] Template changed to: ${newTemplateId}`);
    setUniversalTemplateId(newTemplateId);
    
    // Update current badge
    setBadge(prev => ({ ...prev, templateId: newTemplateId }));
    
    // Update saved badge1Data
    if (badge1Data) {
      setBadge1Data(prev => prev ? { ...prev, templateId: newTemplateId } : null);
    }
    
    // Update all CSV badges
    setMultipleBadges(prev => prev.map(badge => ({ ...badge, templateId: newTemplateId })));
  };


  // Save design
  const saveBadge = async () => {
    try {
      const shopData = getCurrentShop(_shop);
      if (!shopData) {
        alert('Shop information not found. Please reload the page.');
        return;
      }

      const basePrice = 9.99;
      const backingPrice = badge.backing === 'magnetic' ? 2.00 : badge.backing === 'adhesive' ? 1.00 : 0;
      const totalPrice = basePrice + backingPrice;

      const badgeDesignData = {
        shopId: shopData.shopId,
        productId: _productId,
        designId: `design_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        status: 'saved',
        designData: {
          badge,
          timestamp: new Date().toISOString(),
        },
        backgroundColor: badge.backgroundColor,
        backingType: badge.backing,
        basePrice,
        backingPrice,
        totalPrice,
        textLines: badge.lines,
      };

      const savedDesign = await api.saveBadgeDesign(badgeDesignData, shopData);
      // eslint-disable-next-line no-alert
      alert(`Badge design saved! Design ID: ${savedDesign.id || 'Unknown'}`);

      api.sendToParent({
        action: 'design-saved',
        payload: {
          id: savedDesign.id,
          designData: badgeDesignData,
          designId: savedDesign.designId,
        },
      });
    } catch (error) {
      console.error('Failed to save badge:', error);
      alert('Failed to save badge design. Please try again.');
    }
  };

  // Add to cart
  const basePrice = 9.99;
  const backingPrice = badge.backing === 'magnetic' ? 2 : badge.backing === 'adhesive' ? 1 : 0;
  const totalPrice = (basePrice + backingPrice).toFixed(2);

  const addToCart = async () => {
    if (isAddingToCart) return;
    setIsAddingToCart(true);

    try {
      const shopData = getCurrentShop(_shop);
      if (!shopData) {
        alert('Shop information not found. Please reload the page.');
        return;
      }

      const savedDesign = await api.saveBadgeDesign({
        badge,
        productId: _productId,
        shopId: shopData.shopId,
        designId: `design_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        status: 'saved',
        backgroundColor: badge.backgroundColor,
        backingType: badge.backing,
        basePrice: 9.99,
        backingPrice: 0,
        totalPrice,
        textLines: badge.lines
      }, shopData);

      // Variant resolver
      const getVariantId = (backingType: string) => {
        switch (backingType) {
          case 'pin': return '47037830299903';
          case 'magnetic': return '47037830332671';
          case 'adhesive': return '47037830365439';
          default: return '47037830299903';
        }
      };

      // Generate images (best-effort)
      let fullImage = '';
      let thumbnailImage = '';
      try {
        fullImage = await generateFullBadgeImage(badge);
        thumbnailImage = await generateThumbnailFromFullImage(fullImage, 100, 50);

        if (savedDesign.id) {
          await api.updateBadgeDesign(savedDesign.id, {
            fullImageUrl: fullImage,
            thumbnailUrl: thumbnailImage,
          });
        }
      } catch (e) {
        console.warn('Failed to generate images:', e);
      }

      const badgeData = {
        variantId: getVariantId(badge.backing),
        quantity: 1,
        properties: {
          'Custom Badge Design': 'Yes',
          'Badge Text Line 1': badge.lines[0]?.text || '',
          'Badge Text Line 2': badge.lines[1]?.text || '',
          'Badge Text Line 3': badge.lines[2]?.text || '',
          'Badge Text Line 4': badge.lines[3]?.text || '',
          'Background Color': badge.backgroundColor,
          'Font Family': badge.lines[0]?.fontFamily || 'Arial',
          'Backing Type': badge.backing,
          'Design ID': savedDesign.designId,
          'Gadget Design ID': savedDesign.id,
          'Price': `$${totalPrice}`,
        }
      };

      const result = await api.addToCart(badgeData);
      if (!result.success) {
        alert('Failed to add badge to cart. Please try again.');
      }
    } catch (error) {
      console.error('Failed to add to cart:', error);
      alert('Failed to add badge to cart. Please try again.');
    } finally {
      setIsAddingToCart(false);
    }
  };

  // CSV helpers
  function parseCsv(text: string) {
    console.log(`[DEBUG] parseCsv called with current badge:`, badge.lines.map(l => l.text));
    try {
      setCsvError('');
      const rows = text.trim().split(/\r?\n/).map((row: string) => row.split(','));
      setCsvPreview(rows);

      if (rows.length > 0 && rows[0].length > 0) {
        // Create badges based on current badge template but with CSV text
        const badges = rows.map((row: any, index: number) => {
          const badgeWithCsvText = {
          ...badge,
          // UNIVERSAL TEMPLATE: All CSV badges use the same universal template
          templateId: universalTemplateId,
          // DEFAULT COLORS: All CSV badges use white background
          backgroundColor: '#FFFFFF',
          lines: row.map((cell: any, i: number) => {
            const baseLine = badge.lines[i] || badge.lines[0];
            return {
              ...baseLine,
              text: cell || '',
              color: '#000000', // Black text for all CSV badges
                sizeNorm: i === 0 ? 0.20 : 0.143, // 14pt for line 1, 10pt for lines 2,3,4
                align:
                  baseLine.align === 'left' || baseLine.align === 'center' || baseLine.align === 'right'
                    ? baseLine.align
                  : 'center',
            } as BadgeLine;
          })
          };
          
          // Apply center-based positioning to CSV badges
          const centeredLines = calculateCenterPositions(badgeWithCsvText.lines);
          return { 
            ...badgeWithCsvText, 
            lines: centeredLines
          };
        });
        
        console.log(`[DEBUG] Created ${badges.length} CSV badges:`, badges.map(b => b.lines.map((l: BadgeLine) => l.text)));
        
        // CRITICAL: Migrate badges to ensure they have proper backgroundColor
        const migratedBadges = migrateBadgeArray(badges);
        console.log(`[MIGRATION] Migrated ${migratedBadges.length} CSV badges with individual background colors:`, migratedBadges.map(b => b.backgroundColor));
        setMultipleBadges(migratedBadges);
        
        // Initialize badge1Data with current badge if not already set
        if (!badge1Data) {
          console.log(`[DEBUG] Initializing badge1Data with current badge:`, badge.lines.map(l => l.text));
          const migratedBadge1 = migrateLegacyBadge(badge);
          console.log(`[MIGRATION] Migrated Badge 1 with backgroundColor: ${migratedBadge1.backgroundColor}`);
          setBadge1Data(migratedBadge1);
        } else {
          console.log(`[DEBUG] badge1Data already exists:`, badge1Data.lines.map(l => l.text));
        }
      }
    } catch {
      setCsvError('Invalid CSV format.');
      setCsvPreview([]);
      setMultipleBadges([]);
    }
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      parseCsv(text);
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

  return (
    <div className="flex flex-col md:flex-row bg-gray-100 p-4 md:p-6 rounded-lg shadow-lg mx-auto max-w-5xl min-h-[600px]">
      {/* LEFT COLUMN - Controls */}
      <div className="w-full mb-4 overflow-y-auto" style={{ maxHeight: '90vh' }}>
        <div className="section-container mb-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-800">
                Customize Your Badge {selectedBadgeIndex === 0 ? '1' : `${selectedBadgeIndex + 1}`}
                {multipleBadges.length > 0 && ` of ${multipleBadges.length + 1}`}
              </h2>
              <span className="text-xl font-bold text-red-600">{activeTemplate.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => generatePDF(badge, multipleBadges)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Download PDF
              </button>
            </div>
          </div>

          {/* Template Selector */}
          <div className="mb-4">
              <label className="block text-sm font-semibold mb-1">Shape / Template</label>
            <select
              className="border rounded px-2 py-1 text-sm bg-white"
              value={universalTemplateId}
              onChange={(e) => {
                const newTemplateId = e.target.value;
                console.log('[UNIVERSAL] Template changed to:', newTemplateId);
                handleUniversalTemplateChange(newTemplateId);
              }}
            >
              {templates.length === 0 ? (
                <option value="rect-1x3">Loading templates...</option>
              ) : (
                templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))
              )}
            </select>
          </div>

          {/* Export Options */}
          <div className="mb-4">
            <h3 className="font-semibold text-gray-700 mb-2">Export Options</h3>
            <div className="mt-4 flex flex-wrap gap-1">
              <button className="px-2 py-1 text-xs border rounded" onClick={() => {
                if (multipleBadges.length > 0) {
                  const allBadges = getAllBadges(badge1Data, multipleBadges);
                  const allTemplates = getAllTemplates(badge1Data, multipleBadges, templates);
                  downloadMultipleSVGs(allBadges, allTemplates, 'badge');
                  } else {
                    downloadSVG({...badge, id: badge.id || 'badge', templateId: badge.templateId || universalTemplateId}, activeTemplate, 'badge.svg');
                  }
              }}>
                SVG
              </button>
              <button className="px-2 py-1 text-xs border rounded" onClick={() => {
                if (multipleBadges.length > 0) {
                  const allBadges = getAllBadges(badge1Data, multipleBadges);
                  const allTemplates = getAllTemplates(badge1Data, multipleBadges, templates);
                  downloadMultiplePNGs(allBadges, allTemplates, 'badge');
                  } else {
                    downloadPNG({...badge, id: badge.id || 'badge', templateId: badge.templateId || universalTemplateId}, activeTemplate, 'badge.png', 2);
                  }
              }}>
                PNG
              </button>
              <button className="px-2 py-1 text-xs border rounded" onClick={() => {
                if (multipleBadges.length > 0) {
                  const allBadges = getAllBadges(badge1Data, multipleBadges);
                  const allTemplates = getAllTemplates(badge1Data, multipleBadges, templates);
                  downloadMultipleTIFFs(allBadges, allTemplates, 'badge');
                  } else {
                    downloadTIFF({...badge, id: badge.id || 'badge', templateId: badge.templateId || universalTemplateId}, activeTemplate, 'badge.tiff', 4);
                  }
              }}>
                TIFF
              </button>
              <button className="px-2 py-1 text-xs border rounded" onClick={() => {
                if (multipleBadges.length > 0) {
                  const allBadges = getAllBadges(badge1Data, multipleBadges);
                  const allTemplates = getAllTemplates(badge1Data, multipleBadges, templates);
                  downloadMultipleCDRs(allBadges, allTemplates, 'badge');
                  } else {
                    downloadCDR({...badge, id: badge.id || 'badge', templateId: badge.templateId || universalTemplateId}, activeTemplate, 'badge.cdr');
                  }
              }}>
                CDR (Artwork)
              </button>
            </div>
          </div>

          {/* Background + Preview */}
          <div className="flex flex-row gap-6 items-start w-full mb-6">
            <div className="flex flex-col items-start justify-center w-[180px]" style={{ alignSelf: 'flex-start' }}>
              <span className="font-semibold text-gray-700 mb-2">Background Color</span>
              <div className="grid grid-cols-4 gap-2 w-full">
                {backgroundColors.map((bg: any) => (
                  <button
                    key={bg.value}
                    className={`color-button ${badge.backgroundColor === bg.value ? 'ring-2 ring-offset-2 ' + bg.ring : ''}`}
                    style={{ backgroundColor: bg.value }}
                    onClick={(e) => { e.preventDefault(); setBadge({ ...badge, backgroundColor: bg.value }); }}
                    title={bg.name}
                  />
                ))}
              </div>
              <button
                className="mt-3 text-xs px-2 py-1 border rounded bg-white hover:bg-gray-50"
                onClick={(e) => { e.preventDefault(); setShowExtendedBgPicker(true); }}
              >
                More colors…
              </button>
            </div>

            {/* neutral, no borders/background/size clamps */}
            <div className="h-[320px] w-full" style={{ background: "transparent", border: "none", boxShadow: "none" }}>
              <BadgeSvgRenderer badge={badge} templateId={activeTemplate.id} />
            </div>
            
          </div>

          {/* Text Lines */}
          <BadgeEditPanel
            badge={badge}
            maxLines={maxLines}
            onLineChange={updateLine}
            onAlignmentChange={(index, alignment) =>
              setBadge({
                ...badge,
                lines: badge.lines.map((l, i) =>
                  i === index ? { ...l, align: alignment as 'left' | 'center' | 'right' } : l
                ) as BadgeLine[],
              })
            }
            onBackgroundColorChange={(backgroundColor) => setBadge({ ...badge, backgroundColor })}
            onRemoveLine={removeLine}
            addLine={addLine}
            showRemove={true}
            editable={true}
          />

          {/* Actions */}
          <div className="flex justify-end items-center gap-2 mb-4">
            <button
              className="control-button flex items-center gap-1 px-3 py-2 bg-gray-200 text-gray-700 hover:bg-gray-300 border border-gray-400"
              onClick={(e) => { e.preventDefault(); resetBadge(); }}
            >
              <ArrowPathIcon className="w-5 h-5" />
              Reset
            </button>

            <button
              className="control-button bg-blue-500 text-white hover:bg-blue-600 px-3 py-2 text-sm"
              style={{ minWidth: 120 }}
              onClick={(e) => { e.preventDefault(); setShowCsvModal(true); }}
            >
              Add Multiple Badges
            </button>
          </div>

          {/* Backing Options */}
          <div className="mb-4">
            <h3 className="font-semibold text-gray-700 mb-2">Backing Type</h3>
            <div className="flex gap-3">
              {[
                { value: 'pin', label: 'Pin (Included)' },
                { value: 'magnetic', label: 'Magnetic (+$2.00)' },
                { value: 'adhesive', label: 'Adhesive (+$1.00)' },
              ].map((option) => (
                <label key={option.value} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="backing"
                    value={option.value}
                    checked={badge.backing === option.value}
                    onChange={(e) => setBadge({ ...badge, backing: e.target.value as 'pin' | 'magnetic' | 'adhesive' })}
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
              onClick={(e) => { e.preventDefault(); saveBadge(); }}
            >
              Save Design
            </button>
            <button
              className={`px-4 py-2 rounded shadow ${isAddingToCart ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} text-white`}
              onClick={(e) => { e.preventDefault(); if (!isAddingToCart) addToCart(); }}
              disabled={isAddingToCart}
            >
              {isAddingToCart ? 'Adding to Cart...' : `Add to Cart - ${prettyPrice}`}
            </button>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN - Previews for CSV multi-badges */}
      <div className="w-full md:w-1/2 md:pl-3 flex flex-col items-center">
        {multipleBadges.length > 0 && (
          <>
            <h2 className="text-xl font-bold mb-4">Badge Preview</h2>
            <div className="flex flex-col gap-6 w-full items-center">
              {/* First (original) */}
              <div className="flex flex-row items-center gap-2 w-full">
                <div className="flex flex-col items-center justify-center mr-2">
                  <span className="text-lg font-bold mb-2" style={{ width: 32, textAlign: 'center' }}>1.</span>
                  <button
                    className={`control-button flex items-center justify-center text-xs font-medium px-2 py-1 ${
                      selectedBadgeIndex === 0 
                        ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600' 
                        : 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200'
                    }`}
                    onClick={(e) => { e.preventDefault(); selectBadge(0); }}
                  >
                    Edit
                  </button>
                </div>
                <div className="flex flex-col items-center w-full h-[200px]" style={{ overflow: "visible" }}>
                  <BadgeSvgRenderer 
                    badge={getBadgeForPreview(0, badge1Data).badge}
                    templateId={getBadgeForPreview(0, badge1Data).templateId}
                  />
                </div>
              </div>

              {/* CSV-generated badges */}
              {multipleBadges.map((b, i) => (
                <React.Fragment key={i}>
                  <div className="flex flex-row items-center gap-2 w-full">
                    <div className="flex flex-col items-center justify-center mr-2">
                      <span className="text-lg font-bold mb-2" style={{ width: 32, textAlign: 'center' }}>{i + 2}.</span>
                      <button
                        className={`control-button flex items-center justify-center text-xs font-medium px-2 py-1 ${
                          selectedBadgeIndex === (i + 1)
                            ? 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600' 
                            : 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200'
                        }`}
                        onClick={(e) => { e.preventDefault(); selectBadge(i + 1); }}
                      >
                        Edit
                      </button>
                      <div className="h-2" />
                      <button
                        className="control-button p-1 bg-red-100 text-red-700 border-red-300 hover:bg-red-200 flex items-center justify-center"
                        style={{ width: 28, height: 28 }}
                        onClick={(e) => { e.preventDefault(); setMultipleBadges(multipleBadges.filter((_, idx) => idx !== i)); }}
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex flex-col items-center w-full h-[200px]" style={{ overflow: "visible" }}>
                      <BadgeSvgRenderer 
                        badge={getBadgeForPreview(i + 1, b).badge}
                        templateId={getBadgeForPreview(i + 1, b).templateId}
                      />
                    </div>
                  </div>

                </React.Fragment>
              ))}
            </div>
          </>
        )}
      </div>

      {/* CSV Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-lg relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl"
              onClick={(e) => { e.preventDefault(); setShowCsvModal(false); }}
              aria-label="Close"
            >
              &times;
            </button>
            <h3 className="text-lg font-bold mb-2">Add Multiple Badges</h3>
            <p className="mb-2 text-sm text-gray-700">
              You can upload a CSV file or paste CSV data below. Each row should represent a badge.
            </p>
            <p className="mb-2 text-sm text-gray-700">
              <b>Add a comma (,) to indicate a new line. Add up to 4 lines.</b>
            </p>
            <div className="mb-2 text-sm">
              <b>Example:</b><br />
              <span className="font-mono bg-gray-100 p-1 rounded inline-block mb-1">Names,Title,Company</span><br />
              <span className="font-mono bg-gray-100 p-1 rounded inline-block mb-1">John Doe,Manager,Blue</span><br />
              <span className="font-mono bg-gray-100 p-1 rounded inline-block mb-1">Jane Smith,Developer,Red</span>
            </div>
            <div className="mb-2">
              <input type="file" accept=".csv" onChange={handleCsvFile} className="mb-2" />
            </div>
            <textarea
              className="w-full border rounded p-2 mb-2 text-sm text-gray-900 bg-white"
              rows={4}
              placeholder="Paste CSV data here..."
              value={csvText}
              onChange={(e) => { setCsvText(e.target.value); parseCsv(e.target.value); }}
            />
            {csvError && <div className="text-red-600 text-sm mb-2">{csvError}</div>}
            {csvPreview.length > 0 && (
              <div className="mb-2">
                <div className="font-semibold mb-1">Preview:</div>
                <table className="w-full text-xs border">
                  <tbody>
                    {csvPreview.map((row, i) => (
                      <tr key={i} className="border-t">
                        {row.map((cell, j) => (
                          <td key={j} className="border px-2 py-1">{cell}</td>
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
                onClick={(e) => { e.preventDefault(); setShowCsvModal(false); }}
              >
                Cancel
              </button>
              <button
                className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded"
                onClick={(e) => { e.preventDefault(); parseCsv(csvText); setTimeout(() => { if (!csvError) setShowCsvModal(false); }, 0); }}
              >
                Add Badges
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extended BG picker */}
      {showExtendedBgPicker && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded-lg shadow-lg p-4 w-full max-w-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl"
              onClick={(e) => { e.preventDefault(); setShowExtendedBgPicker(false); }}
              aria-label="Close"
            >
              ×
            </button>
            <h3 className="text-lg font-bold mb-3">Choose Background Color</h3>
            <div className="grid grid-cols-9 gap-2">
              {EXTENDED_BACKGROUND_COLORS.map((c) => (
                <button
                  key={c.value}
                  className={`w-7 h-7 border rounded ${badge.backgroundColor === c.value ? 'ring-2 ring-offset-1 ' + c.ring : ''}`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                  onClick={(e) => { e.preventDefault(); setBadge({ ...badge, backgroundColor: c.value }); setShowExtendedBgPicker(false); }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BadgeDesigner;