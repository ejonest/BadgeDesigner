import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import BadgeSvgRenderer from "~/components/BadgeSvgRenderer";
import plaqueTemplatesJson from "~/data/plaque-templates.local.json";
import type { Badge } from "~/types/badge";
import { getEffectiveSignTextLayoutAndLogoDrawForBadge } from "~/utils/renderSvg";
import {
  isPlaqueAttachedTemplateId,
  isPlaqueDetachedTemplateId,
  plaqueAttachedImagePlaceholderRect,
} from "~/utils/plaqueRender";
import { loadTemplateById, type LoadedTemplate } from "~/utils/templates";
import { buildPlaqueLayoutPreviewBadge } from "~/utils/plaqueAwardFormatPreview";

export const meta: MetaFunction = () => [{ title: "Plaque bounds calibration" }];

export async function loader(_args: LoaderFunctionArgs) {
  if (process.env.NODE_ENV === "production") {
    throw new Response("Not found", { status: 404 });
  }
  return json({ ok: true });
}

type NormRect = {
  xNorm: number;
  yNorm: number;
  widthNorm: number;
  heightNorm: number;
};
type DragMode = "move" | "resize";
type PlaqueTemplateEntry = {
  id: string;
  name: string;
  widthInches: number;
  heightInches: number;
  plaquePhotoRectNorm?: NormRect;
  plaqueImageRectNorm?: NormRect;
};

const templates = (
  plaqueTemplatesJson as { templates: PlaqueTemplateEntry[] }
).templates;
const PAD = 24;
const DEFAULT_LINE = {
  id: "plaque-calibration-line",
  text: "YOUR NAME",
  xNorm: 0.5,
  yNorm: 0.5,
  sizeNorm: 0.08,
  align: "center" as const,
  color: "#111111",
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pxToNorm(
  rect: { x: number; y: number; width: number; height: number },
  template: LoadedTemplate,
): NormRect {
  return {
    xNorm: rect.x / template.widthPx,
    yNorm: rect.y / template.heightPx,
    widthNorm: rect.width / template.widthPx,
    heightNorm: rect.height / template.heightPx,
  };
}

function previewBadgeFor(entry: PlaqueTemplateEntry): Badge {
  return (
    buildPlaqueLayoutPreviewBadge({
      layoutId: entry.id.replace(/-(small|medium|large)$/i, ""),
      templateId: entry.id,
      defaultLineShape: DEFAULT_LINE,
    }) ?? {
      templateId: entry.id,
      backgroundColor: "#e7bd58",
      backing: "magnetic",
      lines: [DEFAULT_LINE],
    }
  );
}

async function defaultImageRect(
  entry: PlaqueTemplateEntry,
  template: LoadedTemplate,
): Promise<NormRect> {
  if (entry.plaqueImageRectNorm) return entry.plaqueImageRectNorm;
  if (isPlaqueAttachedTemplateId(entry.id)) {
    return pxToNorm(
      plaqueAttachedImagePlaceholderRect(template.designBox),
      template,
    );
  }

  const probe: Badge = {
    ...previewBadgeFor(entry),
    logo: {
      src: "__plaque-calibration-icon__",
      placement: "left",
      intrinsicWidth: 100,
      intrinsicHeight: 100,
    },
  };
  const draw = getEffectiveSignTextLayoutAndLogoDrawForBadge(
    template,
    probe,
  ).draw;
  return draw
    ? pxToNorm(draw, template)
    : { xNorm: 0.1, yNorm: 0.75, widthNorm: 0.15, heightNorm: 0.15 };
}

function rectStyle(
  rect: NormRect,
  template: LoadedTemplate,
): CSSProperties {
  const totalW = template.widthPx + PAD * 2;
  const totalH = template.heightPx + PAD * 2;
  return {
    left: `${((PAD + rect.xNorm * template.widthPx) / totalW) * 100}%`,
    top: `${((PAD + rect.yNorm * template.heightPx) / totalH) * 100}%`,
    width: `${((rect.widthNorm * template.widthPx) / totalW) * 100}%`,
    height: `${((rect.heightNorm * template.heightPx) / totalH) * 100}%`,
  };
}

export default function DevPlaqueCalibrateRoute() {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const entry = (templates.find((item) => item.id === templateId) ??
    templates[0])!;
  const [loadedTemplate, setLoadedTemplate] = useState<LoadedTemplate | null>(
    null,
  );
  const [imageRect, setImageRect] = useState<NormRect>({
    xNorm: 0.25,
    yNorm: 0.1,
    widthNorm: 0.5,
    heightNorm: 0.25,
  });
  const [saveStatus, setSaveStatus] = useState("");
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    pointerId: number;
    startX: number;
    startY: number;
    origin: NormRect;
  } | null>(null);

  const badge = useMemo(() => previewBadgeFor(entry), [entry]);
  const detached = isPlaqueDetachedTemplateId(entry.id);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const template = await loadTemplateById(entry.id, "plaque");
      if (!template || cancelled) return;
      const nextImage = await defaultImageRect(entry, template);
      if (cancelled) return;
      setLoadedTemplate(template);
      setImageRect(nextImage);
      setSaveStatus("");
    })();
    return () => {
      cancelled = true;
    };
  }, [entry]);

  const beginDrag = (
    event: ReactPointerEvent<HTMLElement>,
    mode: DragMode,
    rect: NormRect,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...rect },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    const template = loadedTemplate;
    if (!drag || !stage || !template) return;
    const bounds = stage.getBoundingClientRect();
    const contentW =
      bounds.width * (template.widthPx / (template.widthPx + PAD * 2));
    const contentH =
      bounds.height * (template.heightPx / (template.heightPx + PAD * 2));
    const dx = (event.clientX - drag.startX) / contentW;
    const dy = (event.clientY - drag.startY) / contentH;
    const origin = drag.origin;

    if (drag.mode === "move") {
      setImageRect({
        ...origin,
        xNorm: clamp(origin.xNorm + dx, 0, 1 - origin.widthNorm),
        yNorm: clamp(origin.yNorm + dy, 0, 1 - origin.heightNorm),
      });
      return;
    }
    setImageRect({
      ...origin,
      widthNorm: clamp(origin.widthNorm + dx, 0.03, 1 - origin.xNorm),
      heightNorm: clamp(origin.heightNorm + dy, 0.03, 1 - origin.yNorm),
    });
  };

  const save = async () => {
    setSaveStatus("Saving…");
    try {
      const response = await fetch("/api/dev/plaque-calibrate/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          plaqueImageRectNorm: imageRect,
          // Detached photo opening is customer-supplied — do not overwrite it here.
          plaquePhotoRectNorm: null,
        }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? `Save failed (${response.status})`);
      }
      setSaveStatus(result.message ?? "Saved");
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "Save failed");
    }
  };

  const setPercent = (key: keyof NormRect, value: string) => {
    const number = Number(value) / 100;
    if (!Number.isFinite(number)) return;
    const next = { ...imageRect, [key]: number };
    next.widthNorm = clamp(next.widthNorm, 0.03, 1 - next.xNorm);
    next.heightNorm = clamp(next.heightNorm, 0.03, 1 - next.yNorm);
    next.xNorm = clamp(next.xNorm, 0, 1 - next.widthNorm);
    next.yNorm = clamp(next.yNorm, 0, 1 - next.heightNorm);
    setImageRect(next);
  };

  if (!entry) return <p className="p-6">No plaque templates found.</p>;

  return (
    <main className="min-h-screen bg-slate-100 p-5 text-slate-900">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold">Plaque bounds calibration</h1>
        <p className="mt-1 text-sm text-slate-600">
          {detached
            ? "For photo plaques, calibrate only the plate icon. Drag to move; use the blue handle to resize. The left edge is the left bound — horizontal position is centered between that bound and the text at runtime."
            : "Drag the image rectangle to move it; drag its blue lower-right handle to resize. Attached plates use this as a fixed image slot."}
        </p>

        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section className="rounded-xl border bg-white p-4 shadow-sm">
            <div
              ref={stageRef}
              className="relative mx-auto w-full max-w-2xl overflow-hidden rounded-lg bg-slate-200"
              style={{
                aspectRatio: loadedTemplate
                  ? `${loadedTemplate.widthPx + PAD * 2} / ${
                      loadedTemplate.heightPx + PAD * 2
                    }`
                  : `${entry.widthInches} / ${entry.heightInches}`,
              }}
              onPointerMove={onPointerMove}
              onPointerUp={() => {
                dragRef.current = null;
              }}
              onPointerCancel={() => {
                dragRef.current = null;
              }}
            >
              <BadgeSvgRenderer
                key={templateId}
                variant="plaque"
                badge={badge}
                templateId={templateId}
                height="100%"
                className="h-full w-full"
              />
              {loadedTemplate ? (
                <div
                  className="absolute border-2 border-fuchsia-500 bg-fuchsia-300/20 cursor-move touch-none ring-2 ring-white"
                  style={rectStyle(imageRect, loadedTemplate)}
                  onPointerDown={(event) =>
                    beginDrag(event, "move", imageRect)
                  }
                >
                  <span className="absolute left-1 top-0.5 rounded bg-black/70 px-1 text-[10px] font-bold text-white">
                    {detached ? "ICON (left = bound)" : "IMAGE"}
                  </span>
                  {detached ? (
                    <div className="absolute inset-y-0 left-0 w-0.5 bg-amber-400" />
                  ) : null}
                  <button
                    type="button"
                    aria-label="Resize icon bounds"
                    className="absolute -bottom-2 -right-2 h-4 w-4 cursor-se-resize rounded-sm border border-white bg-blue-600"
                    onPointerDown={(event) =>
                      beginDrag(event, "resize", imageRect)
                    }
                  />
                </div>
              ) : null}
            </div>
          </section>

          <aside className="space-y-4 rounded-xl border bg-white p-4 shadow-sm">
            <label className="block text-sm font-semibold">
              Plaque template
              <select
                className="mt-1 w-full rounded border px-2 py-2 font-normal"
                value={templateId}
                onChange={(event) => setTemplateId(event.target.value)}
              >
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>

            {detached ? (
              <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                The large wood photo opening is customer-supplied (not printed by
                us). Only calibrate the plate icon: size, vertical position, and
                left bound.
              </p>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["xNorm", detached ? "Left bound X" : "X"],
                  ["yNorm", "Y"],
                  ["widthNorm", "Width"],
                  ["heightNorm", "Height"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="text-xs font-medium text-slate-600">
                  {label} (%)
                  <input
                    type="number"
                    step="0.1"
                    className="mt-1 w-full rounded border px-2 py-1.5 text-sm text-slate-900"
                    value={(imageRect[key] * 100).toFixed(2)}
                    onChange={(event) => setPercent(key, event.target.value)}
                  />
                </label>
              ))}
            </div>

            <button
              type="button"
              onClick={() => void save()}
              className="w-full rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
            >
              Save bounds
            </button>
            {saveStatus ? (
              <p className="text-xs text-slate-600">{saveStatus}</p>
            ) : null}
            <p className="text-xs leading-relaxed text-slate-500">
              Saves to <code>app/data/plaque-templates.local.json</code>. Dev
              only.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
