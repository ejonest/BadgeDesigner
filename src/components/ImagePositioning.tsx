import React, { useEffect, useMemo, useRef, useState } from "react";
import { loadTemplateById, type LoadedTemplate } from "../../app/utils/templates";
import type { BadgeImage } from "../types/badge";

interface ImagePositioningProps {
  image: string;
  type: "background" | "logo";
  onSave: (positionedImage: BadgeImage) => void;
  onCancel: () => void;
  templateId?: string;
  badgeLogo?: BadgeImage;
  badgeBackgroundImage?: BadgeImage;
  backgroundColor?: string;
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);

const ImagePositioning: React.FC<ImagePositioningProps> = ({
  image,
  type,
  onSave,
  onCancel,
  templateId = "rect-1x3",
  badgeLogo,
  badgeBackgroundImage,
  backgroundColor = "#f9fafb",
}) => {
  const [template, setTemplate] = useState<LoadedTemplate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTemplate = async () => {
      try {
        setLoading(true);
        const loadedTemplate = await loadTemplateById(templateId);
        setTemplate(loadedTemplate);
      } catch (error) {
        console.error("Failed to load template:", error);
      } finally {
        setLoading(false);
      }
    };

    loadTemplate();
  }, [templateId]);

  const { width: ART_W, height: ART_H } = template ? { width: template.widthPx, height: template.heightPx } : { width: 300, height: 100 };

  // UI runs at 3x for easier manipulation
  const UI_SCALE = 3;
  const UI_W = ART_W * UI_SCALE;
  const UI_H = ART_H * UI_SCALE;

  // Image geo
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const existing = type === "logo" ? badgeLogo : badgeBackgroundImage;
    return existing ? { x: existing.x * UI_SCALE, y: existing.y * UI_SCALE } : { x: 0, y: 0 };
  });
  const [scale, setScale] = useState<number>(() => {
    const existing = type === "logo" ? badgeLogo : badgeBackgroundImage;
    return existing ? existing.scale * UI_SCALE : 0.35;
  });

  // Dragging state
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const lastPtRef = useRef<{ x: number; y: number } | null>(null);

  // RAF batching
  const nextFrameRef = useRef<number | null>(null);
  const pendingPosRef = useRef<{ x: number; y: number } | null>(null);
  const pendingScaleRef = useRef<number | null>(null);
  const requestFlush = () => {
    if (nextFrameRef.current != null) return;
    nextFrameRef.current = requestAnimationFrame(() => {
      nextFrameRef.current = null;
      if (pendingPosRef.current) {
        setPos(pendingPosRef.current);
        pendingPosRef.current = null;
      }
      if (pendingScaleRef.current != null) {
        setScale(pendingScaleRef.current);
        pendingScaleRef.current = null;
      }
    });
  };

  // Center new images when loaded (if no existing placement)
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const sw = iw * scale;
      const sh = ih * scale;
      const existing = type === "logo" ? badgeLogo : badgeBackgroundImage;
      if (!existing) {
        const cx = (UI_W - sw) / 2;
        const cy = (UI_H - sh) / 2;
        pendingPosRef.current = { x: cx, y: cy };
        requestFlush();
      }
    };
    img.src = image;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [image]);

  // Handlers (attached to the overlay that captures the pointer)
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
    lastPtRef.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !lastPtRef.current) return;
    const dx = e.clientX - lastPtRef.current.x;
    const dy = e.clientY - lastPtRef.current.y;
    lastPtRef.current = { x: e.clientX, y: e.clientY };
    pendingPosRef.current = { x: pos.x + dx, y: pos.y + dy };
    requestFlush();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    draggingRef.current = false;
    setDragging(false);
    lastPtRef.current = null;
  };

  // Wheel zoom (zoom to cursor) — attach to same overlay
  const svgRef = useRef<SVGSVGElement>(null);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const oldScale = scale;
    const newScale = clamp(oldScale * factor, 0.15, 6);

    const imgX = (mx - pos.x) / oldScale;
    const imgY = (my - pos.y) / oldScale;

    const newX = mx - imgX * newScale;
    const newY = my - imgY * newScale;

    pendingScaleRef.current = newScale;
    pendingPosRef.current = { x: newX, y: newY };
    requestFlush();
  };

  const handleSave = () => {
    onSave({
      src: image,
      x: pos.x / UI_SCALE,
      y: pos.y / UI_SCALE,
      scale: scale / UI_SCALE,
    });
  };

  const clipId = useMemo(() => `imgpos-clip-${template?.id || 'default'}`, [template?.id]);

  if (loading || !template) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
        <div className="bg-white rounded-lg shadow-xl p-6">
          <div className="flex items-center justify-center">
            <span className="text-gray-500">Loading template...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] no-select">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-6xl mx-4">
        <h3 className="text-lg font-semibold mb-4">
          Position {type === "background" ? "Background" : "Logo"} Image
        </h3>

        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">
            Zoom: {(scale / UI_SCALE).toFixed(2)}x
          </label>
          <input
            type="range"
            min={0.15}
            max={6}
            step={0.01}
            value={scale}
            onChange={(e) => {
              const newScale = parseFloat(e.target.value);
              pendingScaleRef.current = newScale;
              requestFlush();
            }}
            className="w-full"
          />
          <p className="text-xs text-gray-500 mt-1">
            Tip: Use mouse wheel to zoom towards the cursor. Drag the image to reposition.
          </p>
        </div>

        <div
          className="relative mx-auto border border-gray-300 bg-white"
          style={{ width: UI_W, height: UI_H }}
        >
          {/* All layers live in one SVG so clipPath + z-index are predictable */}
          <svg
            ref={svgRef}
            width={UI_W}
            height={UI_H}
            viewBox={`0 0 ${UI_W} ${UI_H}`}
            className="block"
          >
            <defs>
              <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                {template.innerElement ? (
                  <g dangerouslySetInnerHTML={{ __html: template.innerElement }} />
                ) : (
                  <rect
                    x={0}
                    y={0}
                    width={UI_W}
                    height={UI_H}
                    rx={25}
                    ry={25}
                  />
                )}
              </clipPath>
            </defs>

            {/* 1) BACKGROUND FILL (in case no image) */}
            <g clipPath={`url(#${clipId})`}>
              {type === "background" || type === "logo" ? (
                <rect x={0} y={0} width={UI_W} height={UI_H} fill={backgroundColor} />
              ) : null}
            </g>

            {/* 2) LOCKED BACKGROUND IMAGE (only visible when positioning LOGO) */}
            {type === "logo" && badgeBackgroundImage?.src && (
              <g clipPath={`url(#${clipId})`}>
                <image
                  href={badgeBackgroundImage.src}
                  x={0}
                  y={0}
                  width={undefined}
                  height={undefined}
                  preserveAspectRatio="none"
                  transform={`translate(${(badgeBackgroundImage.x ?? 0) * UI_SCALE}, ${(badgeBackgroundImage.y ?? 0) * UI_SCALE}) scale(${(badgeBackgroundImage.scale ?? 1) * UI_SCALE})`}
                  style={{ imageRendering: "auto" }}
                />
              </g>
            )}

            {/* 3) DRAGGABLE IMAGE (background or logo), clipped + mouse-catching overlay on top */}
            <g clipPath={`url(#${clipId})`}>
              {/* Draggable visual */}
              <image
                href={image}
                x={0}
                y={0}
                width={undefined}
                height={undefined}
                preserveAspectRatio="none"
                transform={`translate(${pos.x}, ${pos.y}) scale(${scale})`}
                style={{ imageRendering: "auto", pointerEvents: "none", userSelect: "none" }}
              />
              {/* Invisible hit area to capture all pointer events inside the frame */}
              <rect
                x={0}
                y={0}
                width={UI_W}
                height={UI_H}
                fill="transparent"
                style={{ cursor: dragging ? "grabbing" : "grab" }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onWheel={onWheel}
              />
            </g>

            {/* 4) FRAME/OUTLINE (always on top) */}
            {template.outlineElement ? (
              <g dangerouslySetInnerHTML={{ __html: template.outlineElement }} />
            ) : (
              <rect
                x={0}
                y={0}
                width={UI_W}
                height={UI_H}
                rx={25}
                ry={25}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="4"
              />
            )}
          </svg>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Save Position
          </button>
        </div>
      </div>
    </div>
  );
};

export { ImagePositioning };
export default ImagePositioning;