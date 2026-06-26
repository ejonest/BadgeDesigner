import type { MetaFunction } from "@remix-run/node";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import templatesJson from "~/data/templates.local.json";
import {
  buildResolvedBlankBadgePhotoFromPixelRects,
  defaultBadgeFaceRect,
  defaultPreviewCropRect,
  defaultTextWithIconRect,
  denormalizeRect,
  getBlankPhotoCanvasSize,
  type NormRect,
  type PixelRect,
} from "~/utils/badgeBlankPhotos";
import {
  buildCustomBadgeBackgroundSrc,
  getCustomBadgeBackgroundById,
  getCustomBackgroundConfigFile,
  listCustomBadgeBackgroundIds,
} from "~/utils/badgeCustomBackgrounds";
import BadgeSvgRenderer from "~/components/BadgeSvgRenderer";
import { badgeDieOverlaySvgMarkup } from "~/utils/badgeDieOverlaySvg";
import type { Badge } from "~/types/badge";

export const meta: MetaFunction = () => [
  { title: "Custom badge background bounds calibration" },
];

type TemplatesFile = {
  templates: Array<{
    id: string;
    name: string;
    svgFile: string;
    widthInches: number;
    heightInches: number;
  }>;
};

const CANVAS = getBlankPhotoCanvasSize();

function pixelToNorm(rect: PixelRect): NormRect {
  return {
    xNorm: rect.x / CANVAS.widthPx,
    yNorm: rect.y / CANVAS.heightPx,
    widthNorm: rect.width / CANVAS.widthPx,
    heightNorm: rect.height / CANVAS.heightPx,
  };
}

type DragMode = "move" | "resize-se" | null;
type RectKind = "face" | "text" | "textWithIcon" | "icon" | "previewCrop";

type RectLayerDef = {
  kind: RectKind;
  label: string;
  color: string;
  borderColor: string;
  dashed?: boolean;
};

const RECT_LAYERS: RectLayerDef[] = [
  {
    kind: "previewCrop",
    label: "Preview window",
    color: "rgba(244,114,182,0.08)",
    borderColor: "#db2777",
    dashed: true,
  },
  {
    kind: "face",
    label: "Badge face",
    color: "rgba(245,158,11,0.12)",
    borderColor: "#d97706",
    dashed: true,
  },
  {
    kind: "icon",
    label: "Icon",
    color: "rgba(59,130,246,0.25)",
    borderColor: "#2563eb",
  },
  {
    kind: "textWithIcon",
    label: "Text (with icon)",
    color: "rgba(139,92,246,0.2)",
    borderColor: "#7c3aed",
  },
  {
    kind: "text",
    label: "Text (no icon)",
    color: "rgba(34,197,94,0.2)",
    borderColor: "#16a34a",
  },
];

const ALL_RECTS_VISIBLE: Record<RectKind, boolean> = {
  previewCrop: true,
  face: true,
  text: true,
  textWithIcon: true,
  icon: true,
};

const ALL_RECTS_HIDDEN: Record<RectKind, boolean> = {
  previewCrop: false,
  face: false,
  text: false,
  textWithIcon: false,
  icon: false,
};

function loadRectsForBackground(backgroundId: string) {
  const cfg = getCustomBadgeBackgroundById(backgroundId);
  const text = denormalizeRect(
    cfg?.textRectNorm ?? {
      xNorm: 0.15,
      yNorm: 0.383,
      widthNorm: 0.7,
      heightNorm: 0.233,
    },
    CANVAS.widthPx,
    CANVAS.heightPx,
  );
  const icon = denormalizeRect(
    cfg?.iconRectNorm ?? {
      xNorm: 0.17,
      yNorm: 0.383,
      widthNorm: 0.11,
      heightNorm: 0.233,
    },
    CANVAS.widthPx,
    CANVAS.heightPx,
  );
  const face = cfg?.badgeFaceRectNorm
    ? denormalizeRect(cfg.badgeFaceRectNorm, CANVAS.widthPx, CANVAS.heightPx)
    : defaultBadgeFaceRect(text, icon);
  const previewCrop = cfg?.previewCropRectNorm
    ? denormalizeRect(cfg.previewCropRectNorm, CANVAS.widthPx, CANVAS.heightPx)
    : defaultPreviewCropRect(face, CANVAS.widthPx, CANVAS.heightPx);
  const textWithIcon = cfg?.textWithIconRectNorm
    ? denormalizeRect(cfg.textWithIconRectNorm, CANVAS.widthPx, CANVAS.heightPx)
    : defaultTextWithIconRect(text, icon);
  return { face, previewCrop, text, textWithIcon, icon };
}

function RectOverlay({
  rect,
  color,
  borderColor,
  label,
  dashed = false,
  onPointerDown,
}: {
  rect: PixelRect;
  color: string;
  borderColor: string;
  label: string;
  dashed?: boolean;
  onPointerDown: (e: React.PointerEvent, mode: DragMode) => void;
}) {
  const style: React.CSSProperties = {
    left: `${(rect.x / CANVAS.widthPx) * 100}%`,
    top: `${(rect.y / CANVAS.heightPx) * 100}%`,
    width: `${(rect.width / CANVAS.widthPx) * 100}%`,
    height: `${(rect.height / CANVAS.heightPx) * 100}%`,
    background: color,
    border: `2px ${dashed ? "dashed" : "solid"} ${borderColor}`,
  };

  return (
    <div className="absolute z-10 touch-none" style={style}>
      <div
        className="absolute inset-0 cursor-move"
        onPointerDown={(e) => onPointerDown(e, "move")}
      />
      <span
        className="absolute left-1 top-1 z-20 max-w-[95%] truncate rounded px-1 text-[10px] font-bold text-white"
        style={{ background: borderColor }}
      >
        {label}
      </span>
      <div
        className="absolute bottom-0 right-0 z-20 h-4 w-4 cursor-se-resize rounded-tl bg-white/80"
        style={{
          borderTop: `2px solid ${borderColor}`,
          borderLeft: `2px solid ${borderColor}`,
        }}
        onPointerDown={(e) => onPointerDown(e, "resize-se")}
      />
    </div>
  );
}

export default function DevBadgeCustomBackgroundCalibrateRoute() {
  const backgroundIds = listCustomBadgeBackgroundIds();
  const templateMeta = useMemo(() => {
    const names = new Map<string, string>();
    const svgs = new Map<string, string>();
    const aspects = new Map<string, number>();
    for (const t of (templatesJson as TemplatesFile).templates) {
      names.set(t.id, t.name);
      svgs.set(t.id, t.svgFile);
      aspects.set(t.id, t.widthInches / t.heightInches);
    }
    return { names, svgs, aspects };
  }, []);

  const [backgroundId, setBackgroundId] = useState(backgroundIds[0] ?? "");
  const entry = getCustomBadgeBackgroundById(backgroundId);
  const templateId = entry?.templateId ?? "rect-1x3";
  const initial = loadRectsForBackground(backgroundIds[0] ?? "");
  const [faceRect, setFaceRect] = useState<PixelRect>(initial.face);
  const [previewCropRect, setPreviewCropRect] = useState<PixelRect>(
    initial.previewCrop,
  );
  const [textRect, setTextRect] = useState<PixelRect>(initial.text);
  const [textWithIconRect, setTextWithIconRect] = useState<PixelRect>(
    initial.textWithIcon,
  );
  const [iconRect, setIconRect] = useState<PixelRect>(initial.icon);
  const [visibleRects, setVisibleRects] =
    useState<Record<RectKind, boolean>>(ALL_RECTS_VISIBLE);
  const [showSvgOverlay, setShowSvgOverlay] = useState(false);
  const [svgOverlayOpacity, setSvgOverlayOpacity] = useState(0.45);
  const [autoSave, setAutoSave] = useState(true);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveError, setSaveError] = useState("");
  const skipNextAutoSaveRef = useRef(true);
  const [svgOverlayMarkup, setSvgOverlayMarkup] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    kind: RectKind;
    mode: DragMode;
    startX: number;
    startY: number;
    origin: PixelRect;
  } | null>(null);

  const photoSrc = entry ? buildCustomBadgeBackgroundSrc(entry.fileName) : "";
  const svgOverlaySrc = templateMeta.svgs.get(templateId);
  const templateAspect = templateMeta.aspects.get(templateId) ?? 3;

  useEffect(() => {
    if (!showSvgOverlay || !svgOverlaySrc) {
      setSvgOverlayMarkup("");
      return;
    }
    let cancelled = false;
    fetch(svgOverlaySrc)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) setSvgOverlayMarkup(badgeDieOverlaySvgMarkup(text));
      })
      .catch(() => {
        if (!cancelled) setSvgOverlayMarkup("");
      });
    return () => {
      cancelled = true;
    };
  }, [showSvgOverlay, svgOverlaySrc, templateId]);

  useEffect(() => {
    const r = loadRectsForBackground(backgroundId);
    setFaceRect(r.face);
    setPreviewCropRect(r.previewCrop);
    setTextRect(r.text);
    setTextWithIconRect(r.textWithIcon);
    setIconRect(r.icon);
    skipNextAutoSaveRef.current = true;
  }, [backgroundId]);

  const buildExportEntry = useCallback(
    () => ({
      textRectNorm: pixelToNorm(textRect),
      iconRectNorm: pixelToNorm(iconRect),
      badgeFaceRectNorm: pixelToNorm(faceRect),
      previewCropRectNorm: pixelToNorm(previewCropRect),
      textWithIconRectNorm: pixelToNorm(textWithIconRect),
    }),
    [faceRect, previewCropRect, textRect, textWithIconRect, iconRect],
  );

  const persistToConfigFile = useCallback(
    async (id: string = backgroundId) => {
      if (!id) return false;
      setSaveStatus("saving");
      setSaveError("");
      try {
        const res = await fetch(
          "/api/dev/badge-custom-background-calibrate/save",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id, entry: buildExportEntry() }),
          },
        );
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) {
          throw new Error(data.error ?? `Save failed (${res.status})`);
        }
        setSaveStatus("saved");
        return true;
      } catch (err) {
        setSaveStatus("error");
        setSaveError(err instanceof Error ? err.message : "Save failed");
        return false;
      }
    },
    [backgroundId, buildExportEntry],
  );

  useEffect(() => {
    if (!autoSave) return;
    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void persistToConfigFile();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [
    autoSave,
    faceRect,
    previewCropRect,
    textRect,
    textWithIconRect,
    iconRect,
    backgroundId,
    persistToConfigFile,
  ]);

  const rectState: Record<
    RectKind,
    { rect: PixelRect; set: (r: PixelRect) => void }
  > = {
    face: { rect: faceRect, set: setFaceRect },
    previewCrop: { rect: previewCropRect, set: setPreviewCropRect },
    text: { rect: textRect, set: setTextRect },
    textWithIcon: { rect: textWithIconRect, set: setTextWithIconRect },
    icon: { rect: iconRect, set: setIconRect },
  };

  const displayScale = useCallback(() => {
    const el = containerRef.current;
    if (!el) return 1;
    return el.clientWidth / CANVAS.widthPx;
  }, []);

  const onPointerDown = (
    e: React.PointerEvent,
    kind: RectKind,
    mode: DragMode,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      kind,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origin: { ...rectState[kind].rect },
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const scale = displayScale();
    const dx = (e.clientX - drag.startX) / scale;
    const dy = (e.clientY - drag.startY) / scale;
    const minSize = 20;
    const apply = (setter: (r: PixelRect) => void) => {
      if (drag.mode === "move") {
        setter({
          ...drag.origin,
          x: Math.max(
            0,
            Math.min(CANVAS.widthPx - drag.origin.width, drag.origin.x + dx),
          ),
          y: Math.max(
            0,
            Math.min(CANVAS.heightPx - drag.origin.height, drag.origin.y + dy),
          ),
        });
      } else if (drag.mode === "resize-se") {
        setter({
          ...drag.origin,
          width: Math.max(
            minSize,
            Math.min(CANVAS.widthPx - drag.origin.x, drag.origin.width + dx),
          ),
          height: Math.max(
            minSize,
            Math.min(CANVAS.heightPx - drag.origin.y, drag.origin.height + dy),
          ),
        });
      }
    };
    apply(rectState[drag.kind].set);
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const photoPlateOverride = useMemo(() => {
    if (!photoSrc) return undefined;
    return buildResolvedBlankBadgePhotoFromPixelRects(photoSrc, {
      badgeFaceRect: faceRect,
      previewCropRect,
      textRect,
      textWithIconRect,
      iconRect,
    });
  }, [photoSrc, faceRect, previewCropRect, textRect, textWithIconRect, iconRect]);

  const calibratePreviewBadge = useMemo((): Badge => {
    return {
      id: "calibrate-preview",
      templateId,
      customBadgeBackgroundId: backgroundId,
      backgroundColor: "#FFFFFF",
      badgeIconId: "utensils",
      lines: [
        {
          id: "l1",
          text: "Sample Name",
          sizeNorm: 0.15,
          xNorm: 0.5,
          yNorm: 0.45,
          color: "#000000",
          align: "center",
        },
        {
          id: "l2",
          text: "Title",
          sizeNorm: 0.12,
          xNorm: 0.5,
          yNorm: 0.62,
          color: "#000000",
          align: "center",
        },
      ],
      backing: "pin",
    };
  }, [templateId, backgroundId]);

  const svgOverlayStyle = useMemo((): React.CSSProperties => {
    const boxAspect = faceRect.width / faceRect.height;
    let w = faceRect.width;
    let h = faceRect.height;
    let x = faceRect.x;
    let y = faceRect.y;
    if (templateAspect > boxAspect) {
      h = faceRect.width / templateAspect;
      y = faceRect.y + (faceRect.height - h) / 2;
    } else {
      w = faceRect.height * templateAspect;
      x = faceRect.x + (faceRect.width - w) / 2;
    }
    return {
      left: `${(x / CANVAS.widthPx) * 100}%`,
      top: `${(y / CANVAS.heightPx) * 100}%`,
      width: `${(w / CANVAS.widthPx) * 100}%`,
      height: `${(h / CANVAS.heightPx) * 100}%`,
      opacity: svgOverlayOpacity,
    };
  }, [faceRect, templateAspect, svgOverlayOpacity]);

  const groupedOptions = useMemo(() => {
    const cfg = getCustomBackgroundConfigFile();
    const byCategory = new Map<string, typeof cfg.backgrounds>();
    for (const bg of cfg.backgrounds) {
      const list = byCategory.get(bg.category) ?? [];
      list.push(bg);
      byCategory.set(bg.category, list);
    }
    return [...byCategory.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, []);

  const toggleRectVisibility = (kind: RectKind) => {
    setVisibleRects((prev) => ({ ...prev, [kind]: !prev[kind] }));
  };

  const visibleRectCount = RECT_LAYERS.filter(
    (layer) => visibleRects[layer.kind],
  ).length;

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans text-neutral-900">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-2 text-2xl font-bold">
          Custom badge background bounds calibration
        </h1>
        <p className="mb-4 max-w-3xl text-sm text-neutral-600">
          Calibrate text and preview bounds for each custom background image.
          Saves to{" "}
          <code className="rounded bg-neutral-200 px-1">
            app/data/badge-custom-backgrounds.local.json
          </code>
          .
        </p>

        <div className="mb-4 flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Background
            <select
              className="max-w-md rounded border border-neutral-300 bg-white px-3 py-2"
              value={backgroundId}
              onChange={(e) => {
                const next = e.target.value;
                if (autoSave && next !== backgroundId) {
                  void persistToConfigFile(backgroundId);
                }
                setBackgroundId(next);
              }}
            >
              {groupedOptions.map(([category, items]) => (
                <optgroup key={category} label={category}>
                  {items.map((bg) => (
                    <option key={bg.id} value={bg.id}>
                      {bg.name} ({bg.templateId})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={showSvgOverlay}
              onChange={(e) => setShowSvgOverlay(e.target.checked)}
            />
            Show SVG die overlay
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={autoSave}
              onChange={(e) => setAutoSave(e.target.checked)}
            />
            Auto-save to config file
          </label>
          {saveStatus === "saved" && (
            <span className="self-center text-sm text-green-700">Saved</span>
          )}
          {saveStatus === "error" && (
            <span className="self-center text-sm text-red-600">
              {saveError}
            </span>
          )}
        </div>

        <div className="mb-3 rounded-lg border border-neutral-200 bg-white p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-neutral-800">
              Binding boxes ({visibleRectCount}/{RECT_LAYERS.length} visible)
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                onClick={() => setVisibleRects(ALL_RECTS_VISIBLE)}
              >
                Show all
              </button>
              <button
                type="button"
                className="rounded border border-neutral-300 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                onClick={() => setVisibleRects(ALL_RECTS_HIDDEN)}
              >
                Hide all
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {RECT_LAYERS.map((layer) => {
              const on = visibleRects[layer.kind];
              return (
                <button
                  key={layer.kind}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleRectVisibility(layer.kind)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    on
                      ? "border-neutral-400 bg-neutral-50 text-neutral-900 shadow-sm"
                      : "border-neutral-200 bg-white text-neutral-400 line-through"
                  }`}
                >
                  <span
                    className="h-3 w-3 shrink-0 rounded-sm border-2"
                    style={{
                      background: on ? layer.color : "transparent",
                      borderColor: layer.borderColor,
                      borderStyle: layer.dashed ? "dashed" : "solid",
                    }}
                    aria-hidden
                  />
                  {layer.label}
                </button>
              );
            })}
          </div>
        </div>

        <div
          ref={containerRef}
          className="relative mx-auto aspect-square w-full max-w-3xl select-none overflow-hidden rounded-lg border-2 border-neutral-400 bg-white shadow-md"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {photoSrc && (
            <img
              src={photoSrc}
              alt=""
              className="pointer-events-none absolute inset-0 h-full w-full"
              style={{ objectFit: "fill" }}
              draggable={false}
            />
          )}
          {showSvgOverlay && svgOverlayMarkup && (
            <div
              className="pointer-events-none absolute [&>svg]:h-full [&>svg]:w-full"
              style={svgOverlayStyle}
              dangerouslySetInnerHTML={{ __html: svgOverlayMarkup }}
            />
          )}
          {RECT_LAYERS.filter((layer) => visibleRects[layer.kind]).map(
            (layer) => (
              <RectOverlay
                key={layer.kind}
                rect={rectState[layer.kind].rect}
                color={layer.color}
                borderColor={layer.borderColor}
                label={layer.label}
                dashed={layer.dashed}
                onPointerDown={(e, mode) => onPointerDown(e, layer.kind, mode)}
              />
            ),
          )}
        </div>

        {photoPlateOverride ? (
          <div className="mt-8">
            <h2 className="mb-2 text-sm font-semibold">Live renderer preview</h2>
            <div
              className="mx-auto w-full max-w-md overflow-hidden rounded-lg border border-neutral-300 bg-white"
              style={{
                aspectRatio: `${previewCropRect.width} / ${previewCropRect.height}`,
              }}
            >
              <BadgeSvgRenderer
                badge={calibratePreviewBadge}
                templateId={templateId}
                variant="badge"
                height="100%"
                photoPlateOverride={photoPlateOverride}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <button
            type="button"
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
            onClick={() => void persistToConfigFile()}
          >
            Save to config file now
          </button>
        </div>
      </div>
    </div>
  );
}
