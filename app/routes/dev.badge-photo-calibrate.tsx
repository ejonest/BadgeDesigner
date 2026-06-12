import type { MetaFunction } from "@remix-run/node";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import templatesJson from "~/data/templates.local.json";
import {
  buildBlankBadgePhotoSrc,
  buildResolvedBlankBadgePhotoFromPixelRects,
  defaultBadgeFaceRect,
  defaultPreviewCropRect,
  defaultTextWithIconRect,
  denormalizeRect,
  getBlankPhotoCanvasSize,
  getBlankPhotoConfigFile,
  getBlankPhotoPlateConfig,
  listBlankPhotoColorOptions,
  listBlankPhotoTemplateIds,
  type NormRect,
  type PixelRect,
} from "~/utils/badgeBlankPhotos";
import { BADGE_DESIGNER_TEMPLATE_ID } from "~/constants/badgeIconLayout";
import { FEATURED_BRUSHED_GOLD_HEX } from "~/constants/colors";
import BadgeSvgRenderer from "~/components/BadgeSvgRenderer";
import { badgeDieOverlaySvgMarkup } from "~/utils/badgeDieOverlaySvg";
import type { Badge } from "~/types/badge";

export const meta: MetaFunction = () => [
  { title: "Badge photo bounds calibration" },
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

function loadRectsForTemplate(templateId: string): {
  face: PixelRect;
  previewCrop: PixelRect;
  text: PixelRect;
  textWithIcon: PixelRect;
  icon: PixelRect;
} {
  const cfg = getBlankPhotoPlateConfig(templateId);
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
    ? denormalizeRect(
        cfg.textWithIconRectNorm,
        CANVAS.widthPx,
        CANVAS.heightPx,
      )
    : defaultTextWithIconRect(text, icon);
  return { face, previewCrop, text, textWithIcon, icon };
}

export default function DevBadgePhotoCalibrateRoute() {
  const templateIds = listBlankPhotoTemplateIds();
  const colorOptions = listBlankPhotoColorOptions();
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

  const [templateId, setTemplateId] = useState(templateIds[0] ?? "rect-1x3");
  const [colorSuffix, setColorSuffix] = useState(
    colorOptions[0]?.suffix ?? "white",
  );
  const initial = loadRectsForTemplate(templateIds[0] ?? "rect-1x3");
  const [faceRect, setFaceRect] = useState<PixelRect>(initial.face);
  const [previewCropRect, setPreviewCropRect] = useState<PixelRect>(
    initial.previewCrop,
  );
  const [textRect, setTextRect] = useState<PixelRect>(initial.text);
  const [textWithIconRect, setTextWithIconRect] = useState<PixelRect>(
    initial.textWithIcon,
  );
  const [iconRect, setIconRect] = useState<PixelRect>(initial.icon);
  const [showSvgOverlay, setShowSvgOverlay] = useState(false);
  const [svgOverlayOpacity, setSvgOverlayOpacity] = useState(0.45);
  const [copyStatus, setCopyStatus] = useState("");
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

  const plate = getBlankPhotoPlateConfig(templateId);
  const photoSrc =
    plate && colorSuffix ? buildBlankBadgePhotoSrc(plate, colorSuffix) : "";
  const supportsIcon = templateId !== BADGE_DESIGNER_TEMPLATE_ID;
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
        if (!cancelled) {
          setSvgOverlayMarkup(badgeDieOverlaySvgMarkup(text));
        }
      })
      .catch(() => {
        if (!cancelled) setSvgOverlayMarkup("");
      });
    return () => {
      cancelled = true;
    };
  }, [showSvgOverlay, svgOverlaySrc, templateId]);

  useEffect(() => {
    const r = loadRectsForTemplate(templateId);
    setFaceRect(r.face);
    setPreviewCropRect(r.previewCrop);
    setTextRect(r.text);
    setTextWithIconRect(r.textWithIcon);
    setIconRect(r.icon);
    skipNextAutoSaveRef.current = true;
  }, [templateId]);

  const buildExportEntry = useCallback(() => {
    if (!plate?.assetFolder || !plate?.filePrefix) return null;
    return {
      assetFolder: plate.assetFolder,
      filePrefix: plate.filePrefix,
      badgeFaceRectNorm: pixelToNorm(faceRect),
      previewCropRectNorm: pixelToNorm(previewCropRect),
      textRectNorm: pixelToNorm(textRect),
      textWithIconRectNorm: pixelToNorm(textWithIconRect),
      iconRectNorm: pixelToNorm(iconRect),
    };
  }, [plate, faceRect, previewCropRect, textRect, textWithIconRect, iconRect]);

  const persistToConfigFile = useCallback(
    async (tid: string = templateId) => {
      const entry = buildExportEntry();
      if (!entry) {
        setSaveStatus("error");
        setSaveError("Missing template metadata.");
        return false;
      }
      setSaveStatus("saving");
      setSaveError("");
      try {
        const res = await fetch("/api/dev/badge-photo-calibrate/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateId: tid, entry }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          message?: string;
        };
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
    [buildExportEntry, templateId],
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
    templateId,
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

  const faceNorm = pixelToNorm(faceRect);
  const previewCropNorm = pixelToNorm(previewCropRect);
  const textNorm = pixelToNorm(textRect);
  const textWithIconNorm = pixelToNorm(textWithIconRect);
  const iconNorm = pixelToNorm(iconRect);

  const exportEntry = buildExportEntry();

  const copyFullEntry = async () => {
    if (!exportEntry) return;
    const entry = `"${templateId}": ${JSON.stringify(exportEntry, null, 2)}`;
    await navigator.clipboard.writeText(entry);
    setCopyStatus("Copied template entry.");
    setTimeout(() => setCopyStatus(""), 2000);
  };

  const downloadConfig = () => {
    if (!exportEntry) return;
    const base = getBlankPhotoConfigFile();
    const merged = {
      ...base,
      templates: {
        ...base.templates,
        [templateId]: {
          ...base.templates[templateId],
          ...exportEntry,
        },
      },
    };
    const blob = new Blob([JSON.stringify(merged, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "badge-blank-photos.local.json";
    a.click();
    URL.revokeObjectURL(url);
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
    const hexBySuffix: Record<string, string> = {
      white: "#FFFFFF",
      "brushed-gold": FEATURED_BRUSHED_GOLD_HEX,
      "brushed-silver": "#E2E2E2",
      black: "#2C2C2C",
      red: "#C0392B",
      blue: "#1A5C8E",
    };
    return {
      id: "calibrate-preview",
      templateId,
      backgroundColor: hexBySuffix[colorSuffix] ?? "#FFFFFF",
      badgeIconId: supportsIcon ? "utensils" : undefined,
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
  }, [templateId, colorSuffix, supportsIcon]);

  /** Fit SVG die inside badge face rect (template aspect), centered in that box. */
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

  return (
    <div className="min-h-screen bg-neutral-100 p-6 font-sans text-neutral-900">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-2 text-2xl font-bold">Badge photo bounds calibration</h1>
        <p className="mb-4 max-w-3xl text-sm text-neutral-600">
          Calibrate in this order:{" "}
          <strong className="text-pink-700">Preview window</strong> (what the
          designer shows — badge plus a little margin),{" "}
          <strong className="text-amber-700">Badge face</strong> (edges of the
          physical badge — SVG overlay aligns here), then{" "}
          <strong className="text-blue-700">Icon</strong>,{" "}
          <strong className="text-green-700">Text (no icon)</strong>, and{" "}
          <strong className="text-violet-700">Text (with icon)</strong>. Bounds
          auto-save to{" "}
          <code className="rounded bg-neutral-200 px-1">
            app/data/badge-blank-photos.local.json
          </code>{" "}
          in local dev (toggle below).
        </p>

        <div className="mb-4 flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm">
            Shape
            <select
              className="rounded border border-neutral-300 bg-white px-3 py-2"
              value={templateId}
              onChange={(e) => {
                const next = e.target.value;
                if (autoSave && next !== templateId) {
                  void persistToConfigFile(templateId);
                }
                setTemplateId(next);
              }}
            >
              {templateIds.map((id) => (
                <option key={id} value={id}>
                  {templateMeta.names.get(id) ?? id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Photo color (framing is identical)
            <select
              className="rounded border border-neutral-300 bg-white px-3 py-2"
              value={colorSuffix}
              onChange={(e) => setColorSuffix(e.target.value)}
            >
              {colorOptions.map((c) => (
                <option key={c.suffix} value={c.suffix}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={showSvgOverlay}
              onChange={(e) => setShowSvgOverlay(e.target.checked)}
            />
            Show SVG die overlay (fits badge face box)
          </label>
          {showSvgOverlay && (
            <label className="flex flex-col gap-1 text-sm">
              Overlay opacity
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={svgOverlayOpacity}
                onChange={(e) => setSvgOverlayOpacity(Number(e.target.value))}
              />
            </label>
          )}
          <label className="flex items-center gap-2 self-end text-sm">
            <input
              type="checkbox"
              checked={autoSave}
              onChange={(e) => setAutoSave(e.target.checked)}
            />
            Auto-save to config file
          </label>
          {saveStatus === "saving" && (
            <span className="self-center text-sm text-neutral-500">
              Saving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="self-center text-sm text-green-700">
              Saved to badge-blank-photos.local.json
            </span>
          )}
          {saveStatus === "error" && (
            <span className="self-center text-sm text-red-600">
              Save failed: {saveError}
            </span>
          )}
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

          <RectOverlay
            rect={previewCropRect}
            color="rgba(244,114,182,0.08)"
            borderColor="#db2777"
            label="Preview window"
            dashed
            onPointerDown={(e, mode) => onPointerDown(e, "previewCrop", mode)}
          />
          <RectOverlay
            rect={faceRect}
            color="rgba(245,158,11,0.12)"
            borderColor="#d97706"
            label="Badge face"
            dashed
            onPointerDown={(e, mode) => onPointerDown(e, "face", mode)}
          />
          {supportsIcon && (
            <>
              <RectOverlay
                rect={iconRect}
                color="rgba(59,130,246,0.25)"
                borderColor="#2563eb"
                label="Icon"
                onPointerDown={(e, mode) => onPointerDown(e, "icon", mode)}
              />
              <RectOverlay
                rect={textWithIconRect}
                color="rgba(139,92,246,0.2)"
                borderColor="#7c3aed"
                label="Text (with icon)"
                onPointerDown={(e, mode) =>
                  onPointerDown(e, "textWithIcon", mode)
                }
              />
            </>
          )}
          <RectOverlay
            rect={textRect}
            color="rgba(34,197,94,0.2)"
            borderColor="#16a34a"
            label="Text (no icon)"
            onPointerDown={(e, mode) => onPointerDown(e, "text", mode)}
          />
        </div>

        {photoPlateOverride ? (
          <div className="mt-8">
            <h2 className="mb-2 text-sm font-semibold text-neutral-800">
              Live renderer preview
            </h2>
            <p className="mb-3 text-xs text-neutral-600">
              Uses the same SVG photo renderer as the badge designer. Text/icon
              should sit on the badge face before you leave this page.
            </p>
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

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <NormPanel title="previewCropRectNorm" value={previewCropNorm} />
          <NormPanel title="badgeFaceRectNorm" value={faceNorm} />
          <NormPanel title="textRectNorm" value={textNorm} />
          {supportsIcon && (
            <NormPanel title="textWithIconRectNorm" value={textWithIconNorm} />
          )}
          {supportsIcon && (
            <NormPanel title="iconRectNorm" value={iconNorm} />
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white"
            onClick={() => void persistToConfigFile()}
          >
            Save to config file now
          </button>
          <button
            type="button"
            className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
            onClick={() => void copyFullEntry()}
          >
            Copy JSON for this shape
          </button>
          <button
            type="button"
            className="rounded border border-neutral-300 bg-white px-4 py-2 text-sm"
            onClick={downloadConfig}
          >
            Download full config JSON
          </button>
          {copyStatus && (
            <span className="self-center text-sm text-green-700">
              {copyStatus}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function NormPanel({ title, value }: { title: string; value: NormRect }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold">{title}</h2>
      <pre className="overflow-auto text-xs">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
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
