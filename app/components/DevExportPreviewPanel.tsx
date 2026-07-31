import { useCallback, useEffect, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/24/outline";
import type { Badge } from "~/types/badge";
import type { DesignerVariant } from "~/constants/designerVariants";
import type { LoadedTemplate } from "~/utils/templates";
import { loadTemplateById } from "~/utils/templates";
import {
  downloadBlob,
  generatePrintSVGAsString,
  generateSVGAsString,
} from "~/utils/export";
import { generateFullBadgeImage } from "~/utils/badgeThumbnail";
import { getPhotoPlateViewBoxSize } from "~/utils/badgeBlankPhotos";
import { resolveBadgePlatePhoto } from "~/utils/badgeCustomBackgrounds";
import {
  isPlaqueTemplateId,
} from "~/utils/plaqueRender";
import { getEffectiveDesignBox } from "~/utils/renderSvg";

/** Expand safeInset layout box back to true #Inner plate outer (print die). */
function plaquePrintDieRect(
  template: LoadedTemplate,
  badge: Badge,
): { x: number; y: number; width: number; height: number } {
  const inset = Math.max(0, template.safeInsetPx ?? 0);
  const box = getEffectiveDesignBox(template, badge);
  if (inset > 0) {
    return {
      x: box.x - inset,
      y: box.y - inset,
      width: box.width + inset * 2,
      height: box.height + inset * 2,
    };
  }
  return box;
}

type OverlapMode = "mono" | "rgcyan" | "swipe";

/** `<img src>` is happier with px width/height than physical `in` units. */
function svgBlobUrlForImgPreview(svg: string, widthPx: number, heightPx: number) {
  const w = Math.max(1, Math.round(widthPx));
  const h = Math.max(1, Math.round(heightPx));
  // Only rewrite the root <svg> size — never strip width/height from nested
  // <rect>/<image> (that made the metal fill invisible → magenta-only preview).
  const out = svg.replace(
    /<svg\b([^>]*)>/i,
    (_full, attrs: string) => {
      const cleaned = String(attrs).replace(
        /\s(?:width|height)\s*=\s*("[^"]*"|'[^']*')/gi,
        "",
      );
      return `<svg width="${w}" height="${h}"${cleaned}>`;
    },
  );
  const blob = new Blob([out], { type: "image/svg+xml;charset=utf-8" });
  return { blob, url: URL.createObjectURL(blob) };
}

type Props = {
  badge: Badge;
  activeTemplate: LoadedTemplate | null | undefined;
  universalTemplateId?: string;
  variant: DesignerVariant;
  /** Download / label basename, e.g. "plaque". */
  fileBasename: string;
  /** When true, also generate the order thumbnail PNG (same path as cart upload). */
  includeThumbnail?: boolean;
  /** Product label for copy, e.g. "plaque". */
  productLabel?: string;
};

/**
 * Vite DEV-only panel: inspect the same proof SVG, print SVG, and optional
 * thumbnail PNG generated on add-to-cart / order upload.
 */
export default function DevExportPreviewPanel({
  badge,
  activeTemplate,
  universalTemplateId,
  variant,
  fileBasename,
  includeThumbnail = true,
  productLabel,
}: Props) {
  const enabled = Boolean((import.meta.env as { DEV?: boolean }).DEV);
  const label = productLabel ?? fileBasename;

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [printUrl, setPrintUrl] = useState<string | null>(null);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const [proofBlob, setProofBlob] = useState<Blob | null>(null);
  const [printBlob, setPrintBlob] = useState<Blob | null>(null);
  const [facePct, setFacePct] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [printOverlayPct, setPrintOverlayPct] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [printGeom, setPrintGeom] = useState<{
    printW: number;
    printH: number;
    dieW: number;
    dieH: number;
    pad: number;
    dieMarkup: string;
  } | null>(null);
  const [overlapMode, setOverlapMode] = useState<OverlapMode>("mono");
  const [swipePct, setSwipePct] = useState(50);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setBusy(true);
    setError(null);
    try {
      const templateId =
        badge.templateId ||
        activeTemplate?.id ||
        universalTemplateId ||
        "rect-1x3";
      const template =
        activeTemplate?.id === templateId
          ? activeTemplate
          : await loadTemplateById(templateId, variant);
      if (!template) {
        throw new Error(`Template not loaded: ${templateId}`);
      }
      const badgeForSvg: Badge = {
        ...badge,
        templateId,
      };

      const [proofSvg, printSvg, thumbDataUrl] = await Promise.all([
        generateSVGAsString(badgeForSvg, template, variant),
        generatePrintSVGAsString(badgeForSvg, template, variant),
        includeThumbnail
          ? generateFullBadgeImage(badgeForSvg, variant)
          : Promise.resolve(null as string | null),
      ]);

      const PADDING_PX = 24;
      const printBleedPadPx = 0.05 * 96;
      const plateOuter = isPlaqueTemplateId(template.id)
        ? plaquePrintDieRect(template, badgeForSvg)
        : null;
      const dieW = plateOuter?.width ?? template.widthPx;
      const dieH = plateOuter?.height ?? template.heightPx;
      const printW = dieW + printBleedPadPx * 2;
      const printH = dieH + printBleedPadPx * 2;

      setPrintGeom({
        printW,
        printH,
        dieW,
        dieH,
        pad: printBleedPadPx,
        dieMarkup: plateOuter
          ? `<rect x="0" y="0" width="${dieW}" height="${dieH}" />`
          : (
              template.innerElement ||
              template.outlineElement ||
              `<rect x="0" y="0" width="${dieW}" height="${dieH}" />`
            ).replace(/\sfill="[^"]*"/g, ""),
      });

      const applyFaceGuide = (face: {
        left: number;
        top: number;
        width: number;
        height: number;
      }) => {
        setFacePct(face);
        setPrintOverlayPct({
          left: face.left - face.width * (printBleedPadPx / dieW),
          top: face.top - face.height * (printBleedPadPx / dieH),
          width: face.width * (printW / dieW),
          height: face.height * (printH / dieH),
        });
      };

      const photo =
        variant === "badge"
          ? resolveBadgePlatePhoto(templateId, badgeForSvg)
          : null;
      if (photo) {
        const proofViewBox = getPhotoPlateViewBoxSize(photo);
        const contentTx = PADDING_PX - photo.previewCropRect.x;
        const contentTy = PADDING_PX - photo.previewCropRect.y;
        const face = photo.badgeFaceRect;
        applyFaceGuide({
          left: ((contentTx + face.x) / proofViewBox.widthPx) * 100,
          top: ((contentTy + face.y) / proofViewBox.heightPx) * 100,
          width: (face.width / proofViewBox.widthPx) * 100,
          height: (face.height / proofViewBox.heightPx) * 100,
        });
      } else if (plateOuter) {
        const proofW = template.standardViewBoxWidth + PADDING_PX * 2;
        const proofH = template.standardViewBoxHeight + PADDING_PX * 2;
        // Print is plate-only; overlay the plate rect from the wood mockup proof.
        applyFaceGuide({
          left: ((PADDING_PX + plateOuter.x) / proofW) * 100,
          top: ((PADDING_PX + plateOuter.y) / proofH) * 100,
          width: (plateOuter.width / proofW) * 100,
          height: (plateOuter.height / proofH) * 100,
        });
      } else {
        const proofW = template.standardViewBoxWidth + PADDING_PX * 2;
        const proofH = template.standardViewBoxHeight + PADDING_PX * 2;
        applyFaceGuide({
          left: (PADDING_PX / proofW) * 100,
          top: (PADDING_PX / proofH) * 100,
          width: (template.widthPx / proofW) * 100,
          height: (template.heightPx / proofH) * 100,
        });
      }

      const nextProofBlob = new Blob([proofSvg], {
        type: "image/svg+xml;charset=utf-8",
      });
      // Downloads keep production SVG (incl. physical inch size for print).
      const nextPrintBlob = new Blob([printSvg], {
        type: "image/svg+xml;charset=utf-8",
      });
      const nextProofUrl = URL.createObjectURL(nextProofBlob);
      // Preview uses px dimensions so <img> gets a reliable intrinsic size.
      const printPreview = svgBlobUrlForImgPreview(printSvg, printW, printH);

      setProofUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return nextProofUrl;
      });
      setPrintUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return printPreview.url;
      });
      setProofBlob(nextProofBlob);
      setPrintBlob(nextPrintBlob);

      if (thumbDataUrl) {
        setThumbUrl((prev) => {
          if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
          return thumbDataUrl;
        });
      } else {
        setThumbUrl(null);
      }
    } catch (err) {
      console.warn("[DevExportPreviewPanel] preview failed:", err);
      setError(
        err instanceof Error ? err.message : "Failed to generate export previews",
      );
    } finally {
      setBusy(false);
    }
  }, [
    enabled,
    badge,
    activeTemplate,
    universalTemplateId,
    variant,
    includeThumbnail,
  ]);

  useEffect(() => {
    if (!enabled || !open) return;
    void refresh();
  }, [
    enabled,
    open,
    badge.templateId,
    badge.backgroundColor,
    badge.lines,
    badge.logo?.src,
    badge.plaqueFormatId,
    badge.badgeIconId,
    badge.customBadgeBackgroundId,
    refresh,
  ]);

  useEffect(() => {
    return () => {
      if (proofUrl) URL.revokeObjectURL(proofUrl);
      if (printUrl) URL.revokeObjectURL(printUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revoke on unmount
  }, []);

  if (!enabled) return null;

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50/60 p-3">
      <button
        type="button"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) void refresh();
        }}
        className="flex items-center justify-between w-full text-left"
      >
        <h3 className="text-lg font-semibold text-[#02132B]">
          Dev export QA ({label})
        </h3>
        {open ? (
          <ChevronUpIcon className="w-5 h-5 text-gray-600" />
        ) : (
          <ChevronDownIcon className="w-5 h-5 text-gray-600" />
        )}
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-amber-950/80 leading-snug">
            Local-only. Same assets as add-to-cart / order upload:{" "}
            <strong>design.svg</strong> (full mockup proof),{" "}
            <strong>print.svg</strong>
            {fileBasename === "plaque"
              ? " (metal plate only + 0.05″ bleed — no wood), "
              : " (print-ready), "}
            and the order <strong>thumbnail / PDF mockup</strong>. On-screen
            preview may still show placeholders; production design SVG omits
            those when no logo is uploaded.
          </p>
          <svg
            aria-hidden="true"
            width="0"
            height="0"
            style={{ position: "absolute" }}
          >
            <filter id="devExportQaRed" colorInterpolationFilters="sRGB">
              <feColorMatrix
                type="matrix"
                values="0.30 0.59 0.11 0 0
                        0    0    0    0 0
                        0    0    0    0 0
                        0    0    0    1 0"
              />
            </filter>
            <filter id="devExportQaCyan" colorInterpolationFilters="sRGB">
              <feColorMatrix
                type="matrix"
                values="0    0    0    0 0
                        0.30 0.59 0.11 0 0
                        0.30 0.59 0.11 0 0
                        0    0    0    1 0"
              />
            </filter>
          </svg>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="px-2 py-1 text-xs border border-amber-400 rounded bg-white hover:bg-amber-50 disabled:opacity-60"
              disabled={busy}
              onClick={() => void refresh()}
            >
              {busy ? "Generating…" : "Refresh previews"}
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs border border-amber-400 rounded bg-white hover:bg-amber-50 disabled:opacity-60"
              disabled={!proofBlob}
              onClick={() => {
                if (proofBlob)
                  downloadBlob(proofBlob, `${fileBasename}-design.svg`);
              }}
            >
              Download design.svg
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs border border-amber-400 rounded bg-white hover:bg-amber-50 disabled:opacity-60"
              disabled={!printBlob}
              onClick={() => {
                if (printBlob)
                  downloadBlob(printBlob, `${fileBasename}-print.svg`);
              }}
            >
              Download print.svg
            </button>
            <button
              type="button"
              className="px-2 py-1 text-xs border border-amber-400 rounded bg-white hover:bg-amber-50 disabled:opacity-60"
              disabled={!printBlob}
              onClick={() => {
                if (printBlob)
                  downloadBlob(printBlob, `${fileBasename}-print.cdr`);
              }}
            >
              Download as .cdr
            </button>
            {includeThumbnail && thumbUrl ? (
              <a
                className="px-2 py-1 text-xs border border-amber-400 rounded bg-white hover:bg-amber-50"
                href={thumbUrl}
                download={`${fileBasename}-thumbnail.png`}
              >
                Download thumbnail.png
              </a>
            ) : null}
          </div>
          {error ? <p className="text-xs text-red-700">{error}</p> : null}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded border border-amber-200 bg-white p-2">
              <div className="text-xs font-semibold mb-2 text-[#02132B]">
                Proof / design.svg (uploaded as full_image)
              </div>
              {proofUrl ? (
                <img
                  src={proofUrl}
                  alt="Proof design SVG"
                  className="w-full h-auto max-h-56 object-contain bg-[#f7f5f0]"
                />
              ) : (
                <div className="text-xs text-gray-500 py-8 text-center">
                  {busy ? "Generating…" : "No preview yet"}
                </div>
              )}
            </div>
            <div className="rounded border border-amber-200 bg-white p-2">
              <div className="text-xs font-semibold mb-1 text-[#02132B]">
                Print.svg (print-ready)
              </div>
              <p className="text-[11px] text-amber-950/70 mb-2 leading-snug">
                Metal plate only (no wood) — same brushed fill, image/icon, text,
                and borders as the designer. Dashed magenta = die; canvas includes
                0.05″ bleed.
              </p>
              {printUrl && printGeom ? (
                <div className="relative rounded border border-amber-100 bg-[#ece8e1] p-1">
                  <img
                    src={printUrl}
                    alt="Print-ready plate SVG"
                    className="block w-full h-auto max-h-72 object-contain bg-white"
                  />
                  <svg
                    className="pointer-events-none absolute inset-1 h-[calc(100%-0.5rem)] w-[calc(100%-0.5rem)]"
                    viewBox={`0 0 ${printGeom.printW} ${printGeom.printH}`}
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <g
                      transform={`translate(${printGeom.pad}, ${printGeom.pad})`}
                      style={{
                        fill: "none",
                        stroke: "#FF00AA",
                        strokeWidth: 1.5,
                        strokeDasharray: "6 4",
                      }}
                      dangerouslySetInnerHTML={{ __html: printGeom.dieMarkup }}
                    />
                  </svg>
                </div>
              ) : (
                <div className="text-xs text-gray-500 py-8 text-center">
                  {busy ? "Generating…" : "No preview yet"}
                </div>
              )}
            </div>
            {includeThumbnail ? (
              <div className="rounded border border-amber-200 bg-white p-2 md:col-span-2">
                <div className="text-xs font-semibold mb-2 text-[#02132B]">
                  Order thumbnail PNG
                </div>
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt="Order thumbnail"
                    className="w-full h-auto max-h-48 object-contain bg-[#f7f5f0]"
                  />
                ) : (
                  <div className="text-xs text-gray-500 py-8 text-center">
                    {busy ? "Generating…" : "No preview yet"}
                  </div>
                )}
              </div>
            ) : null}
            <div className="rounded border border-amber-200 bg-white p-2 md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="text-xs font-semibold text-[#02132B]">
                  Proof ↔ print overlap
                  {overlapMode === "mono"
                    ? " (mono difference)"
                    : overlapMode === "rgcyan"
                      ? " (red / cyan)"
                      : " (swipe)"}
                </div>
                <div className="flex flex-wrap gap-1">
                  {(
                    [
                      ["mono", "Mono"],
                      ["rgcyan", "R/C"],
                      ["swipe", "Swipe"],
                    ] as const
                  ).map(([mode, text]) => (
                    <button
                      key={mode}
                      type="button"
                      className={`px-2 py-0.5 text-[11px] border rounded ${
                        overlapMode === mode
                          ? "bg-amber-200 border-amber-500"
                          : "bg-white border-amber-300"
                      }`}
                      onClick={() => setOverlapMode(mode)}
                    >
                      {text}
                    </button>
                  ))}
                  {overlapMode === "swipe" ? (
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={swipePct}
                      onChange={(e) => setSwipePct(Number(e.target.value))}
                      className="w-24 align-middle"
                      aria-label="Swipe reveal"
                    />
                  ) : null}
                </div>
              </div>
              {proofUrl && printUrl && facePct && printOverlayPct ? (
                <div className="relative w-full max-h-64 overflow-hidden bg-[#f7f5f0]">
                  <img
                    src={proofUrl}
                    alt=""
                    className="block w-full h-auto"
                    style={
                      overlapMode === "mono"
                        ? { filter: "grayscale(1) contrast(1.1)" }
                        : overlapMode === "rgcyan"
                          ? { filter: "url(#devExportQaRed)" }
                          : undefined
                    }
                  />
                  <img
                    src={printUrl}
                    alt=""
                    className="absolute"
                    style={{
                      left: `${printOverlayPct.left}%`,
                      top: `${printOverlayPct.top}%`,
                      width: `${printOverlayPct.width}%`,
                      height: `${printOverlayPct.height}%`,
                      ...(overlapMode === "mono"
                        ? {
                            filter: "grayscale(1) contrast(1.1)",
                            mixBlendMode: "difference" as const,
                          }
                        : overlapMode === "rgcyan"
                          ? {
                              filter: "url(#devExportQaCyan)",
                              mixBlendMode: "screen" as const,
                            }
                          : {
                              clipPath: `inset(0 0 0 ${swipePct}%)`,
                            }),
                    }}
                  />
                  {overlapMode === "swipe" ? (
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 w-px bg-amber-600"
                      style={{
                        left: `${
                          printOverlayPct.left +
                          (printOverlayPct.width * swipePct) / 100
                        }%`,
                      }}
                    />
                  ) : null}
                  <div
                    className="pointer-events-none absolute border border-dashed border-[#FF00AA]"
                    style={{
                      left: `${facePct.left}%`,
                      top: `${facePct.top}%`,
                      width: `${facePct.width}%`,
                      height: `${facePct.height}%`,
                    }}
                  />
                </div>
              ) : (
                <div className="text-xs text-gray-500 py-8 text-center">
                  {busy ? "Generating…" : "No preview yet"}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
