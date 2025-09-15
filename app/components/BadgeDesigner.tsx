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

import { BadgeLine, Badge, BadgeImage } from '../../src/types/badge';
import { BACKGROUND_COLORS, FONT_COLORS, EXTENDED_BACKGROUND_COLORS } from '../constants/colors';
import { BADGE_CONSTANTS } from '../constants/badge';
import { generateFullBadgeImage, generateThumbnailFromFullImage } from '../utils/badgeThumbnail';
import { getCurrentShop } from '../utils/shopAuth';
import { createApi } from '../utils/api';

import { loadTemplates, loadTemplateById, type LoadedTemplate } from '../utils/templates';
import BadgeSvgRenderer from './BadgeSvgRenderer';
import { ImageControls } from '../../src/components/ImageControls';
import { downloadSVG, downloadPNG, downloadCDR, downloadPDF, downloadTIFF } from '../utils/export';
import { INITIAL_BADGE } from '../../src/constants/badge';

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
const badgeHeight = BADGE_CONSTANTS.BADGE_HEIGHT;
const MIN_FONT_SIZE = BADGE_CONSTANTS.MIN_FONT_SIZE;
const LINE_HEIGHT_MULTIPLIER = 1.3;

const BadgeDesigner: React.FC<BadgeDesignerProps> = ({ productId: _productId, shop: _shop, gadgetApiUrl, gadgetApiKey }) => {
  // API
  const api = createApi(gadgetApiUrl, gadgetApiKey);

  // State
  const [badge, setBadge] = useState<Badge>(INITIAL_BADGE);
  const [templates, setTemplates] = useState<LoadedTemplate[]>([]);
  const [debug, setDebug] = useState(false);

  // DEBUG: set a BG quickly from DevTools: window.setBg('data:,...')
  if (typeof window !== "undefined") {
    (window as any).setBg = (src: string) => {
      loadTemplateById(badge.templateId).then(t => {
        setBadge(b => ({
          ...b,
          backgroundImage: { src, widthPx: t.widthPx, heightPx: t.heightPx, scale: 1, offsetX: 0, offsetY: 0 },
          backgroundColor: undefined
        }));
      });
    };
  }

  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvPreview, setCsvPreview] = useState<string[][]>([]);
  const [csvError, setCsvError] = useState('');
  const [multipleBadges, setMultipleBadges] = useState<any[]>([]);
  const [editModalIndex, setEditModalIndex] = useState<number | null>(null);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const [showExtendedBgPicker, setShowExtendedBgPicker] = useState(false);

  // Load templates once, and ensure badge.templateId is initialized
  useEffect(() => {
    const loadTemplatesAsync = async () => {
      try {
        const list = await loadTemplates();
        setTemplates(list);
        // eslint-disable-next-line no-console
        console.log('[BadgeDesigner] templates loaded:', list.map(t => t.id));

        setBadge(prev => {
          if (!prev?.templateId) {
            const first = list[0]?.id ?? 'rect-1x3';
            return { ...prev, templateId: first };
          }
          // If existing templateId is no longer present, fall back
          if (!list.find(t => t.id === prev.templateId)) {
            const first = list[0]?.id ?? 'rect-1x3';
            return { ...prev, templateId: first };
          }
          return prev;
        });
      } catch (error) {
        console.error('Failed to load templates:', error);
        // Set fallback template
        setTemplates([{
          id: 'rect-1x3',
          name: 'Rectangle 1×3',
          widthPx: 288,
          heightPx: 96,
          safeInsetPx: 6,
          innerElement: '<path id="inner" d="M25,0 L275,0 A25,25 0 0,1 300,25 L300,75 A25,25 0 0,1 275,100 L25,100 A25,25 0 0,1 0,75 L0,25 A25,25 0 0,1 25,0 Z"/>'
        }]);
      }
    };

    loadTemplatesAsync();
  }, []);

  // Resolve the active template (single source of truth: badge.templateId)
  const template: LoadedTemplate | undefined = useMemo(() => {
    const t = templates.find(t => t.id === badge.templateId);
    if (!t) {
      console.warn("[BadgeDesigner] Template not found:", badge.templateId, "Available:", templates.map(t=>t.id));
    }
    // eslint-disable-next-line no-console
    console.log('[BadgeDesigner] template selected:', t?.id);
    return t;
  }, [templates, badge.templateId]);

  // Hardened fallback - ensure we always have a valid template
  const activeTemplate: LoadedTemplate = useMemo(() => {
    if (!template) {
      // eslint-disable-next-line no-console
      console.warn(
        '[BadgeDesigner] Template not found for id:',
        badge.templateId,
        'Available ids:',
        templates.map(t => t.id)
      );
    }
    return template || templates[0] || { 
      id: 'rect-1x3', 
      name: 'Rectangle 1×3', 
      widthPx: 288,
      heightPx: 96,
      safeInsetPx: 6,
      innerElement: '<path id="inner" d="M25,0 L275,0 A25,25 0 0,1 300,25 L300,75 A25,25 0 0,1 275,100 L25,100 A25,25 0 0,1 0,75 L0,25 A25,25 0 0,1 25,0 Z"/>'
    };
  }, [template, templates, badge.templateId]);

  // If a background image exists, make line-1 white by default for readability
  useEffect(() => {
    const hasBgImage =
      typeof badge.backgroundImage === 'string'
        ? !!badge.backgroundImage
        : !!badge.backgroundImage?.src;

    if (hasBgImage) {
      setBadge((prev) => ({
        ...prev,
        lines: prev.lines.map((l, i) =>
          i === 0 && (!l.color || l.color.toLowerCase() === '#000000')
            ? { ...l, color: '#FFFFFF' }
            : l
        ),
      }));
    }
  }, [badge.backgroundImage]);

  // Measure text width for auto-shrink
  const measureTextWidth = (text: string, fontSize: number, fontFamily: string, bold: boolean, italic: boolean) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.font = `${bold ? 'bold ' : ''}${italic ? 'italic ' : ''}${fontSize}px ${fontFamily || 'Arial'}`;
    return ctx.measureText(text).width;
  };

  // Text updates
  const updateLine = (index: number, changes: Partial<BadgeLine>) => {
    const newLines = badge.lines.map((l: BadgeLine, i: number) => {
      if (i !== index) {
        return {
          ...l,
          alignment:
            l.alignment === 'left' || l.alignment === 'center' || l.alignment === 'right'
              ? l.alignment
              : 'center',
        };
      }

      let updated = { ...l, ...changes };

      if (typeof changes.text !== 'undefined') {
        let fontSize = updated.size;
        let textWidth = measureTextWidth(
          updated.text,
          fontSize,
          updated.fontFamily,
          updated.bold,
          updated.italic
        );
        while (textWidth > badgeWidth - 24 && fontSize > MIN_FONT_SIZE) {
          fontSize--;
          textWidth = measureTextWidth(
            updated.text,
            fontSize,
            updated.fontFamily,
            updated.bold,
            updated.italic
          );
        }
        updated.size = fontSize;
      }

      if (typeof updated.alignment !== 'undefined') {
        updated.alignment =
          updated.alignment === 'left' || updated.alignment === 'center' || updated.alignment === 'right'
            ? updated.alignment
            : 'center';
      } else {
        updated.alignment = 'center';
      }
      return updated;
    });

    const totalHeight = newLines.reduce((sum, l) => sum + l.size * LINE_HEIGHT_MULTIPLIER, 0);
    if (totalHeight > badgeHeight - 8) {
      // Could surface a warning if desired.
    }
    setBadge({ ...badge, lines: newLines });
  };

  const addLine = () => {
    if (badge.lines.length < maxLines) {
      setBadge({
        ...badge,
        lines: [
          ...badge.lines,
          {
            text: 'Line Text',
            size: 13,
            color: '#000000',
            bold: false,
            italic: false,
            underline: false,
            fontFamily: 'Arial',
            alignment: 'center',
          } as BadgeLine,
        ],
      });
    }
  };

  const removeLine = (index: number) => {
    if (badge.lines.length > 1) {
      const newLines = [...badge.lines];
      newLines.splice(index, 1);
      setBadge({
        ...badge,
        lines: newLines.map((l) => ({
          ...l,
          alignment:
            l.alignment === 'left' || l.alignment === 'center' || l.alignment === 'right'
              ? l.alignment
              : 'center',
        })),
      });
    }
  };

  const resetBadge = () => {
    const fallbackId = templates[0]?.id || 'rect-1x3';
    setBadge({
      templateId: badge.templateId || fallbackId,
      lines: [
        { text: 'Your Name', size: 18, color: '#000000', bold: false, italic: false, underline: false, fontFamily: 'Arial', alignment: 'center' } as BadgeLine,
        { text: 'Title', size: 13, color: '#000000', bold: false, italic: false, underline: false, fontFamily: 'Arial', alignment: 'center' } as BadgeLine,
      ],
      backgroundColor: '#FFFFFF',
      backing: 'pin',
      backgroundImage: undefined,
      logo: undefined,
    });
  };

  // Image helpers
  const handleImageUpload = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const updateImagePosition = (type: 'backgroundImage' | 'logo', x: number, y: number) => {
    const current = badge[type] as BadgeImage | undefined;
    if (!current) return;
    setBadge({
      ...badge,
      [type]: { ...current, x, y },
    });
  };

  const updateImageScale = (type: 'backgroundImage' | 'logo', scale: number) => {
    const current = badge[type] as BadgeImage | undefined;
    if (!current) return;
    setBadge({
      ...badge,
      [type]: { ...current, scale },
    });
  };

  const removeImage = (type: 'backgroundImage' | 'logo') => {
    setBadge({ ...badge, [type]: undefined });
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
    try {
      setCsvError('');
      const rows = text.trim().split(/\r?\n/).map((row: string) => row.split(','));
      setCsvPreview(rows);

      if (rows.length > 0 && rows[0].length > 0) {
        const badges = rows.map((row: any) => ({
          ...badge,
          lines: row.map((cell: any, i: number) => {
            const baseLine = badge.lines[i] || badge.lines[0];
            return {
              ...baseLine,
              text: cell || '',
              size: i === 0 ? 18 : 13,
              alignment:
                baseLine.alignment === 'left' || baseLine.alignment === 'center' || baseLine.alignment === 'right'
                  ? baseLine.alignment
                  : 'center',
            } as BadgeLine;
          })
        }));
        setMultipleBadges(badges);
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
    <div className="flex flex-col md:flex-row bg-gray-100 p-4 md:p-6 rounded-lg shadow-lg mx-auto max-w-6xl min-h-[600px]">
      {/* LEFT COLUMN - Controls */}
      <div className="w-full pr-4 mb-4 overflow-y-auto" style={{ maxHeight: '90vh' }}>
        <div className="section-container mb-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-gray-800">Customize Your Badge</h2>
              <span className="text-xl font-bold text-red-600">{activeTemplate.name}</span>
            </div>
            <div className="flex items-center gap-2">
              {/* Quick template switcher (bound to badge.templateId) */}
              <select
                className="border rounded px-2 py-1 text-sm"
                value={badge.templateId || templates[0]?.id || 'rect-1x3'}
                onChange={(e) => setBadge({ ...badge, templateId: e.target.value })}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button
                onClick={() => generatePDF(badge, multipleBadges)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
              >
                Download PDF
              </button>
            </div>
          </div>

          {/* Template Selector + Debug */}
          <div className="mb-4">
            <div className="flex items-center gap-3">
              <label className="block text-sm font-semibold mb-1">Shape / Template</label>
              <label className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked={debug} onChange={(e) => setDebug(e.target.checked)} />
                Debug
              </label>
            </div>
            <select
              className="border rounded px-2 py-1 text-sm bg-white"
              value={badge.templateId || templates[0]?.id || 'rect-1x3'}
              onChange={(e) => {
                // eslint-disable-next-line no-console
                console.log('[BadgeDesigner] Template changed to:', e.target.value);
                setBadge({ ...badge, templateId: e.target.value });
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
            <div className="mt-1 text-xs text-gray-500">
              Current: <span className="font-mono">{activeTemplate.id}</span> ({activeTemplate.widthPx}×{activeTemplate.heightPx}px)
            </div>
          </div>

          {/* Export Options */}
          <div className="mb-4">
            <h3 className="font-semibold text-gray-700 mb-2">Export Options</h3>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="px-3 py-2 border rounded" onClick={() => downloadSVG(badge, activeTemplate, 'badge.svg')}>
                Download SVG
              </button>
              <button className="px-3 py-2 border rounded" onClick={() => downloadPNG(badge, activeTemplate, 'badge.png', 2)}>
                Download PNG (2×)
              </button>
              <button className="px-3 py-2 border rounded" onClick={() => downloadCDR(badge, activeTemplate, 'badge.cdr')}>
                Download CDR (SVG)
              </button>
              <button className="px-3 py-2 border rounded" onClick={() => downloadPDF(badge, activeTemplate, 'badge.pdf', 3)}>
                Download PDF
              </button>
              <button className="px-3 py-2 border rounded" onClick={() => downloadTIFF(badge, activeTemplate, 'badge.tiff', 4)}>
                Download TIFF (placeholder)
              </button>
            </div>
          </div>

          {/* Background + Preview */}
          <div className="flex flex-row gap-6 items-center w-full mb-6">
            <div className="flex flex-col items-start justify-center min-w-[120px] pr-2" style={{ alignSelf: 'flex-start' }}>
              <span className="font-semibold text-gray-700 mb-2">Background Color</span>
              <div className="grid grid-cols-4 gap-2">
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

          {/* Debug state */}
          {debug && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm">Badge State</summary>
              <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto">
                {JSON.stringify({ templateId: badge.templateId, badge }, null, 2)}
              </pre>
            </details>
          )}

          {/* Image Controls */}
          <div className="mb-6">
            <ImageControls badge={badge} onChange={(b) => setBadge(b)} />
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
                  i === index ? { ...l, alignment: alignment as 'left' | 'center' | 'right' } : l
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

          {/* Images */}
          <div className="mb-4">
            <h3 className="font-semibold text-gray-700 mb-2">Images</h3>

            {/* Background Image */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Background Image</label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const imageData = await handleImageUpload(file);
                      const tpl = await loadTemplateById(badge.templateId);
                      console.log("[BadgeDesigner] Background image upload:", { imageData: imageData.substring(0, 50) + "...", template: tpl.id, dimensions: `${tpl.widthPx}x${tpl.heightPx}` });
                      const updated = {
                        ...badge,
                        backgroundImage: {
                          src: imageData,
                          widthPx: tpl.widthPx,
                          heightPx: tpl.heightPx,
                          scale: 1,
                          offsetX: 0,
                          offsetY: 0
                        },
                        backgroundColor: undefined
                      };
                      console.log("[BadgeDesigner] Updated badge:", updated);
                      setBadge(updated);
                      // Make first line white if it was black
                      setBadge(prev => ({
                        ...prev,
                        lines: prev.lines.map((ln, i) =>
                          i === 0 && (!ln.color || ln.color.toLowerCase() === '#000000')
                            ? { ...ln, color: '#FFFFFF' }
                            : ln
                        ),
                      }));
                    } catch (err) {
                      console.error('Failed to upload background image:', err);
                      alert('Failed to upload image. Please try again.');
                    }
                  }}
                  className="text-sm"
                />
                {badge.backgroundImage && (
                  <button
                    onClick={() => removeImage('backgroundImage')}
                    className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>

              {badge.backgroundImage && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs">X Position:</label>
                    <input
                      type="number"
                      value={(badge.backgroundImage as BadgeImage).x}
                      onChange={(e) =>
                        updateImagePosition('backgroundImage', parseInt(e.target.value) || 0, (badge.backgroundImage as BadgeImage).y)
                      }
                      className="w-16 px-1 py-1 text-xs border rounded"
                    />
                    <label className="text-xs">Y Position:</label>
                    <input
                      type="number"
                      value={(badge.backgroundImage as BadgeImage).y}
                      onChange={(e) =>
                        updateImagePosition('backgroundImage', (badge.backgroundImage as BadgeImage).x, parseInt(e.target.value) || 0)
                      }
                      className="w-16 px-1 py-1 text-xs border rounded"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs">Scale:</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="3.0"
                      value={(badge.backgroundImage as BadgeImage).scale}
                      onChange={(e) => updateImageScale('backgroundImage', parseFloat(e.target.value) || 1.0)}
                      className="w-16 px-1 py-1 text-xs border rounded"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Logo */}
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">Logo</label>
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const imageData = await handleImageUpload(file);
                      setBadge({
                        ...badge,
                        logo: { src: imageData, x: 0, y: 0, scale: 1.0 },
                      });
                    } catch (err) {
                      console.error('Failed to upload logo:', err);
                      alert('Failed to upload image. Please try again.');
                    }
                  }}
                  className="text-sm"
                />
                {badge.logo && (
                  <button
                    onClick={() => removeImage('logo')}
                    className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Remove
                  </button>
                )}
              </div>

              {badge.logo && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs">X Position:</label>
                    <input
                      type="number"
                      value={(badge.logo as BadgeImage).x}
                      onChange={(e) =>
                        updateImagePosition('logo', parseInt(e.target.value) || 0, (badge.logo as BadgeImage).y)
                      }
                      className="w-16 px-1 py-1 text-xs border rounded"
                    />
                    <label className="text-xs">Y Position:</label>
                    <input
                      type="number"
                      value={(badge.logo as BadgeImage).y}
                      onChange={(e) =>
                        updateImagePosition('logo', (badge.logo as BadgeImage).x, parseInt(e.target.value) || 0)
                      }
                      className="w-16 px-1 py-1 text-xs border rounded"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-xs">Scale:</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="3.0"
                      value={(badge.logo as BadgeImage).scale}
                      onChange={(e) => updateImageScale('logo', parseFloat(e.target.value) || 1.0)}
                      className="w-16 px-1 py-1 text-xs border rounded"
                    />
                  </div>
                </div>
              )}
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
                </div>
                <div className="flex flex-col items-center w-full h-[200px]" style={{ overflow: "visible" }}>
                  <BadgeSvgRenderer badge={badge} templateId={activeTemplate.id} />
                </div>
              </div>

              {/* CSV-generated badges */}
              {multipleBadges.map((b, i) => (
                <React.Fragment key={i}>
                  <div className="flex flex-row items-center gap-2 w-full">
                    <div className="flex flex-col items-center justify-center mr-2">
                      <span className="text-lg font-bold mb-2" style={{ width: 32, textAlign: 'center' }}>{i + 2}.</span>
                      <button
                        className="control-button p-1 bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200 flex items-center justify-center"
                        style={{ width: 28, height: 28 }}
                        onClick={(e) => { e.preventDefault(); setEditModalIndex(i); }}
                      >
                        <ArrowPathIcon className="w-4 h-4" />
                      </button>
                      <div className="h-2" />
                      <button
                        className="control-button p-1 bg-red-100 text-red-700 border-red-300 hover:bg-red-200 flex items-center justify-center"
                        style={{ width: 28, height: 28 }}
                        onClick={(e) => { e.preventDefault(); setMultipleBadges(multipleBadges.filter((_, idx) => idx !== i)); }}
                      >
                        <span style={{ fontSize: 20, color: '#b91c1c' }}>X</span>
                      </button>
                    </div>
                    <div className="flex flex-col items-center w-full h-[200px]" style={{ overflow: "visible" }}>
                      <BadgeSvgRenderer badge={b} templateId={activeTemplate.id} />
                    </div>
                  </div>

                  {/* Modal editor */}
                  {editModalIndex === i && (
                    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
                      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl relative max-h-[90vh] overflow-y-auto">
                        <button
                          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl"
                          onClick={(e) => { e.preventDefault(); setEditModalIndex(null); }}
                          aria-label="Close"
                        >
                          <XMarkIcon className="w-6 h-6" />
                        </button>
                        <h3 className="text-lg font-bold mb-2">Edit Badge</h3>
                        {(() => {
                          const badgeToEdit = multipleBadges[editModalIndex];
                          if (!badgeToEdit) return null;
                          return (
                            <div className="flex flex-col gap-4">
                              <div className="flex flex-row gap-6 items-start w-full justify-center">
                                <div className="flex flex-col items-end justify-center min-w-[120px] pr-2" style={{ alignSelf: 'center' }}>
                                  <span className="font-semibold text-sm mb-1">Background Color</span>
                                  <div className="grid grid-cols-4 grid-rows-2 gap-2">
                                    {backgroundColors.map((bg: any) => (
                                      <button
                                        key={bg.value}
                                        className={`color-button ${badgeToEdit.backgroundColor === bg.value ? 'ring-2 ring-offset-2 ' + bg.ring : ''}`}
                                        style={{ backgroundColor: bg.value }}
                                        onClick={(e) => {
                                          e.preventDefault();
                                          const copy = [...multipleBadges];
                                          copy[editModalIndex] = { ...badgeToEdit, backgroundColor: bg.value };
                                          setMultipleBadges(copy);
                                        }}
                                      />
                                    ))}
                                  </div>
                                </div>
                                <div className="h-[200px] w-full">
                                  <BadgeSvgRenderer badge={badgeToEdit} templateId={activeTemplate.id} />
                                </div>
                              </div>

                              <div className="flex flex-col gap-6 w-full max-w-2xl">
                                <BadgeEditPanel
                                  badge={badgeToEdit}
                                  maxLines={maxLines}
                                  onLineChange={(lineIdx, changes) => {
                                    const copy = [...multipleBadges];
                                    const newLines = [...badgeToEdit.lines];
                                    newLines[lineIdx] = { ...newLines[lineIdx], ...changes };
                                    copy[editModalIndex] = { ...badgeToEdit, lines: newLines };
                                    setMultipleBadges(copy);
                                  }}
                                  onAlignmentChange={(lineIdx, alignment) => {
                                    const copy = [...multipleBadges];
                                    copy[editModalIndex] = {
                                      ...badgeToEdit,
                                      lines: badgeToEdit.lines.map((l: any, ii: number) =>
                                        ii === lineIdx ? { ...l, alignment: alignment as 'left' | 'center' | 'right' } : l
                                      ),
                                    };
                                    setMultipleBadges(copy);
                                  }}
                                  onBackgroundColorChange={(backgroundColor) => {
                                    const copy = [...multipleBadges];
                                    copy[editModalIndex] = { ...badgeToEdit, backgroundColor };
                                    setMultipleBadges(copy);
                                  }}
                                  onRemoveLine={(lineIdx) => {
                                    const copy = [...multipleBadges];
                                    const newLines = [...badgeToEdit.lines];
                                    newLines.splice(lineIdx, 1);
                                    copy[editModalIndex] = { ...badgeToEdit, lines: newLines };
                                    setMultipleBadges(copy);
                                  }}
                                  addLine={() => {
                                    if (badgeToEdit.lines.length < maxLines) {
                                      const copy = [...multipleBadges];
                                      copy[editModalIndex] = {
                                        ...badgeToEdit,
                                        lines: [
                                          ...badgeToEdit.lines,
                                          { text: 'Line Text', size: 13, color: '#000000', bold: false, italic: false, underline: false, fontFamily: 'Arial', alignment: 'center' } as BadgeLine,
                                        ],
                                      };
                                      setMultipleBadges(copy);
                                    }
                                  }}
                                  showRemove={true}
                                  editable={true}
                                />
                              </div>

                              <div className="flex justify-end mt-4">
                                <button
                                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow"
                                  onClick={(e) => { e.preventDefault(); setEditModalIndex(null); }}
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
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