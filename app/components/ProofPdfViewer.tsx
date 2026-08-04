import { useEffect, useRef, useState } from "react";

type ProofPdfViewerProps = {
  url: string;
  title?: string;
  className?: string;
};

type LoadState = "loading" | "ready" | "error";

/**
 * Cross-browser PDF proof preview via PDF.js (canvas), so Android Chrome and
 * similar browsers show the design instead of a download/Open sheet.
 */
export function ProofPdfViewer({
  url,
  title = "Design proof",
  className = "",
}: ProofPdfViewerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const host = hostRef.current;
    if (!host || !url) return;

    host.replaceChildren();
    setState("loading");
    setErrorMessage(null);
    setPageCount(0);

    const render = async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        const workerMod = await import(
          "pdfjs-dist/build/pdf.worker.min.mjs?url"
        );
        pdfjs.GlobalWorkerOptions.workerSrc = workerMod.default;

        // Prefer raw bytes over blob: URL - more reliable across Android Chromium.
        const pdfBytes = await fetch(url).then((res) => {
          if (!res.ok) {
            throw new Error(`Failed to load proof PDF (${res.status})`);
          }
          return res.arrayBuffer();
        });
        if (cancelled) return;

        const loadingTask = pdfjs.getDocument({ data: pdfBytes });
        const pdf = await loadingTask.promise;
        if (cancelled) {
          await pdf.destroy();
          return;
        }

        const cssWidth = Math.max(host.clientWidth || 320, 200);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
          if (cancelled) break;
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const fitScale = cssWidth / baseViewport.width;
          const viewport = page.getViewport({ scale: fitScale * dpr });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          canvas.style.width = `${cssWidth}px`;
          canvas.style.height = `${Math.floor(baseViewport.height * fitScale)}px`;
          canvas.style.display = "block";
          canvas.style.maxWidth = "100%";
          canvas.style.background = "#fff";
          if (pageNumber > 1) {
            canvas.style.marginTop = "8px";
          }
          canvas.setAttribute(
            "aria-label",
            `${title} page ${pageNumber} of ${pdf.numPages}`,
          );

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            throw new Error("Could not create canvas context for PDF preview");
          }

          host.appendChild(canvas);
          await page.render({
            canvasContext: ctx,
            viewport,
          }).promise;
        }

        if (cancelled) {
          await pdf.destroy();
          return;
        }

        setPageCount(pdf.numPages);
        setState("ready");
        await pdf.destroy();
      } catch (err) {
        if (cancelled) return;
        console.error("[ProofPdfViewer] failed to render proof PDF", err);
        setErrorMessage(
          err instanceof Error ? err.message : "Could not render the proof PDF.",
        );
        setState("error");
      }
    };

    void render();

    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [url, title]);

  return (
    <div
      className={`relative h-full w-full overflow-auto bg-[#e8e8e8] ${className}`}
      style={{ WebkitOverflowScrolling: "touch" }}
      role="img"
      aria-label={title}
    >
      {state === "loading" ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f7f5f0]">
          <div className="px-4 text-center">
            <div
              className="mx-auto mb-2 h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-[#02132B]"
              aria-hidden
            />
            <p className="text-sm text-gray-600">Loading proof preview...</p>
          </div>
        </div>
      ) : null}

      {state === "error" ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#f7f5f0] p-4">
          <div className="max-w-sm space-y-3 text-center">
            <p className="text-sm font-medium text-gray-800">
              Could not show the in-page preview.
            </p>
            {errorMessage ? (
              <p className="break-words text-xs text-gray-500">{errorMessage}</p>
            ) : null}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md bg-[#02132B] px-3 py-2 text-sm font-semibold text-white"
            >
              Open PDF in a new tab
            </a>
          </div>
        </div>
      ) : null}

      <div ref={hostRef} className="min-h-full w-full p-2" />

      {state === "ready" && pageCount > 1 ? (
        <p className="px-2 pb-2 text-center text-[11px] text-gray-500">
          {pageCount} pages - scroll to review all
        </p>
      ) : null}
    </div>
  );
}
