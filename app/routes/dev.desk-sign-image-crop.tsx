import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  DESK_SIGN_IMAGE_CROP_ASSETS,
  DESK_SIGN_IMAGE_CROP_CONFIG,
  DESK_SIGN_IMAGE_OUTPUT_ASPECT,
  getDeskSignImageCropRect,
  type DeskSignImageCropRectNorm,
} from "~/utils/deskSignImageCrops";

export const meta: MetaFunction = () => [
  { title: "Desk-sign image crop tool" },
];

export async function loader(_args: LoaderFunctionArgs) {
  if (process.env.NODE_ENV === "production") {
    throw new Response("Not found", { status: 404 });
  }
  return json({ ok: true });
}

type ImageSize = { width: number; height: number };
type DragMode = "move" | "resize" | null;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function centeredMaxCrop(size: ImageSize): DeskSignImageCropRectNorm {
  const imageAspect = size.width / size.height;
  if (imageAspect >= DESK_SIGN_IMAGE_OUTPUT_ASPECT) {
    const widthNorm = DESK_SIGN_IMAGE_OUTPUT_ASPECT / imageAspect;
    return {
      xNorm: (1 - widthNorm) / 2,
      yNorm: 0,
      widthNorm,
      heightNorm: 1,
    };
  }
  const heightNorm = imageAspect / DESK_SIGN_IMAGE_OUTPUT_ASPECT;
  return {
    xNorm: 0,
    yNorm: (1 - heightNorm) / 2,
    widthNorm: 1,
    heightNorm,
  };
}

export default function DevDeskSignImageCropRoute() {
  const [assetId, setAssetId] = useState(
    DESK_SIGN_IMAGE_CROP_ASSETS[0]?.id ?? "",
  );
  const asset =
    DESK_SIGN_IMAGE_CROP_ASSETS.find((entry) => entry.id === assetId) ??
    DESK_SIGN_IMAGE_CROP_ASSETS[0];
  const [crop, setCrop] = useState<DeskSignImageCropRectNorm>(() =>
    getDeskSignImageCropRect(assetId),
  );
  const [cropByAsset, setCropByAsset] = useState<
    Record<string, DeskSignImageCropRectNorm>
  >(() =>
    Object.fromEntries(
      DESK_SIGN_IMAGE_CROP_ASSETS.map((entry) => [
        entry.id,
        getDeskSignImageCropRect(entry.id),
      ]),
    ),
  );
  const [imageSize, setImageSize] = useState<ImageSize | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [outputVersion, setOutputVersion] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    pointerId: number;
    startX: number;
    startY: number;
    origin: DeskSignImageCropRectNorm;
  } | null>(null);

  const selectAsset = (nextId: string) => {
    setCropByAsset((current) => ({ ...current, [assetId]: crop }));
    setAssetId(nextId);
    setCrop(cropByAsset[nextId] ?? getDeskSignImageCropRect(nextId));
    setImageSize(null);
    setSaveStatus("idle");
    setSaveMessage("");
  };

  const rectPx = useMemo(() => {
    if (!imageSize) return null;
    return {
      x: Math.round(crop.xNorm * imageSize.width),
      y: Math.round(crop.yNorm * imageSize.height),
      width: Math.round(crop.widthNorm * imageSize.width),
      height: Math.round(crop.heightNorm * imageSize.height),
    };
  }, [crop, imageSize]);

  const beginDrag = (
    event: React.PointerEvent<HTMLElement>,
    mode: Exclude<DragMode, null>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...crop },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const stage = stageRef.current;
    if (!drag || !stage || !imageSize) return;
    const bounds = stage.getBoundingClientRect();
    const dxPx = ((event.clientX - drag.startX) / bounds.width) * imageSize.width;
    const dyPx =
      ((event.clientY - drag.startY) / bounds.height) * imageSize.height;
    const originX = drag.origin.xNorm * imageSize.width;
    const originY = drag.origin.yNorm * imageSize.height;
    const originWidth = drag.origin.widthNorm * imageSize.width;
    const originHeight = drag.origin.heightNorm * imageSize.height;

    if (drag.mode === "move") {
      const x = clamp(originX + dxPx, 0, imageSize.width - originWidth);
      const y = clamp(originY + dyPx, 0, imageSize.height - originHeight);
      setCrop({
        ...drag.origin,
        xNorm: x / imageSize.width,
        yNorm: y / imageSize.height,
      });
      return;
    }

    const widthDeltaFromY = dyPx * DESK_SIGN_IMAGE_OUTPUT_ASPECT;
    const widthDelta =
      Math.abs(dxPx) >= Math.abs(widthDeltaFromY)
        ? dxPx
        : widthDeltaFromY;
    const maxWidth = Math.min(
      imageSize.width - originX,
      (imageSize.height - originY) * DESK_SIGN_IMAGE_OUTPUT_ASPECT,
    );
    const width = clamp(originWidth + widthDelta, 80, maxWidth);
    const height = width / DESK_SIGN_IMAGE_OUTPUT_ASPECT;
    setCrop({
      xNorm: drag.origin.xNorm,
      yNorm: drag.origin.yNorm,
      widthNorm: width / imageSize.width,
      heightNorm: height / imageSize.height,
    });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const setPixelField = (
    key: "x" | "y" | "width",
    rawValue: string,
  ) => {
    if (!imageSize || !rectPx) return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    if (key === "x") {
      setCrop((current) => ({
        ...current,
        xNorm:
          clamp(value, 0, imageSize.width - rectPx.width) / imageSize.width,
      }));
      return;
    }
    if (key === "y") {
      setCrop((current) => ({
        ...current,
        yNorm:
          clamp(value, 0, imageSize.height - rectPx.height) / imageSize.height,
      }));
      return;
    }
    const maxWidth = Math.min(
      imageSize.width - rectPx.x,
      (imageSize.height - rectPx.y) * DESK_SIGN_IMAGE_OUTPUT_ASPECT,
    );
    const width = clamp(value, 80, maxWidth);
    setCrop((current) => ({
      ...current,
      widthNorm: width / imageSize.width,
      heightNorm:
        width / DESK_SIGN_IMAGE_OUTPUT_ASPECT / imageSize.height,
    }));
  };

  const saveCrop = useCallback(async () => {
    if (!asset) return;
    setSaveStatus("saving");
    setSaveMessage("");
    try {
      const response = await fetch("/api/dev/desk-sign-image-crop/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: asset.id, cropRectNorm: crop }),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        message?: string;
      };
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? `Save failed (${response.status})`);
      }
      setSaveStatus("saved");
      setSaveMessage(result.message ?? "Saved");
      setCropByAsset((current) => ({ ...current, [asset.id]: crop }));
      setOutputVersion(Date.now());
    } catch (error) {
      setSaveStatus("error");
      setSaveMessage(
        error instanceof Error ? error.message : "Could not save crop",
      );
    }
  }, [asset, crop]);

  if (!asset) return null;

  return (
    <main className="min-h-screen bg-[#eef2f6] p-4 text-[#02132B] sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Desk-sign image crop tool</h1>
            <p className="mt-1 max-w-3xl text-sm text-[#52677a]">
              Drag the outlined window to position it. Drag its bottom-right
              handle to resize it. The crop is locked to 5:2 and saves an
              800×320 image used by the designer.
            </p>
          </div>
          <a
            href="/desk-sign-designer?designLibraryDummy=1"
            className="rounded border border-[#1a3d5c] bg-white px-3 py-2 text-sm font-semibold"
          >
            Open desk-sign designer
          </a>
        </div>

        <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-black/10 bg-white p-3 shadow-sm">
            {(
              ["Choose material", "Acrylic finish", "Rosewood plate"] as const
            ).map((group) => (
              <div key={group} className="mb-4 last:mb-0">
                <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#6b7f92]">
                  {group}
                </h2>
                <div className="space-y-1.5">
                  {DESK_SIGN_IMAGE_CROP_ASSETS.filter(
                    (entry) => entry.group === group,
                  ).map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => selectAsset(entry.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${
                        entry.id === asset.id
                          ? "border-[#1a3d5c] bg-[#e9f0f5] font-semibold"
                          : "border-transparent hover:bg-gray-50"
                      }`}
                    >
                      {entry.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </aside>

          <section className="space-y-4">
            <div className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold">{asset.label}</h2>
                  <p className="text-xs text-[#6b7f92]">
                    Source: {asset.sourceFile}
                    {imageSize
                      ? ` · ${imageSize.width}×${imageSize.height}px`
                      : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!imageSize}
                    onClick={() =>
                      imageSize && setCrop(centeredMaxCrop(imageSize))
                    }
                    className="rounded border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
                  >
                    Reset centered
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveCrop()}
                    disabled={saveStatus === "saving"}
                    className="rounded bg-[#1a3d5c] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {saveStatus === "saving" ? "Saving…" : "Save crop"}
                  </button>
                </div>
              </div>

              <div
                ref={stageRef}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="relative mx-auto w-full max-w-[980px] select-none overflow-hidden rounded-lg bg-[#d8dee5] touch-none"
              >
                <img
                  key={asset.id}
                  src={asset.sourceUrl}
                  alt={asset.label}
                  draggable={false}
                  onLoad={(event) => {
                    const img = event.currentTarget;
                    setImageSize({
                      width: img.naturalWidth,
                      height: img.naturalHeight,
                    });
                  }}
                  className="block h-auto w-full"
                />
                {imageSize ? (
                  <div
                    role="presentation"
                    onPointerDown={(event) => beginDrag(event, "move")}
                    className="absolute cursor-move border-2 border-[#ff8a00] shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]"
                    style={{
                      left: `${crop.xNorm * 100}%`,
                      top: `${crop.yNorm * 100}%`,
                      width: `${crop.widthNorm * 100}%`,
                      height: `${crop.heightNorm * 100}%`,
                    }}
                  >
                    <div className="pointer-events-none absolute left-2 top-2 rounded bg-[#ff8a00] px-2 py-1 text-[11px] font-bold text-white">
                      5:2 crop
                    </div>
                    <button
                      type="button"
                      aria-label="Resize crop"
                      onPointerDown={(event) => beginDrag(event, "resize")}
                      className="absolute -bottom-2.5 -right-2.5 h-6 w-6 cursor-se-resize rounded-full border-2 border-white bg-[#ff8a00] shadow"
                    />
                  </div>
                ) : null}
              </div>

              {rectPx ? (
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  {(
                    [
                      ["x", "X", rectPx.x],
                      ["y", "Y", rectPx.y],
                      ["width", "Width", rectPx.width],
                    ] as const
                  ).map(([key, label, value]) => (
                    <label key={key} className="text-xs font-semibold">
                      {label}
                      <input
                        type="number"
                        value={value}
                        min={0}
                        onChange={(event) =>
                          setPixelField(key, event.currentTarget.value)
                        }
                        className="mt-1 block w-24 rounded border border-gray-300 px-2 py-1.5 text-sm font-normal"
                      />
                    </label>
                  ))}
                  <div className="pb-1 text-xs text-[#6b7f92]">
                    Height: {rectPx.height}px (locked) · Output:{" "}
                    {DESK_SIGN_IMAGE_CROP_CONFIG.outputWidthPx}×
                    {DESK_SIGN_IMAGE_CROP_CONFIG.outputHeightPx}px
                  </div>
                  <div
                    className={`pb-1 text-xs font-semibold ${
                      saveStatus === "error"
                        ? "text-red-600"
                        : saveStatus === "saved"
                          ? "text-green-700"
                          : "text-[#6b7f92]"
                    }`}
                  >
                    {saveMessage}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-black/10 bg-white p-4 shadow-sm">
              <h2 className="mb-2 font-bold">Saved designer image</h2>
              <div className="aspect-[5/2] w-full max-w-[800px] overflow-hidden rounded-lg border bg-[#eef2f6]">
                <img
                  src={`${asset.outputUrl}?crop=${outputVersion}`}
                  alt={`${asset.label} saved crop`}
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
