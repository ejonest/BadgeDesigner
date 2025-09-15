import { renderBadgeToSvgString } from "./renderSvg";
import type { Badge } from "../../src/types/badge";
import type { LoadedTemplate } from "./templates";
import { jsPDF } from "jspdf";

export function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadSVG(badge: Badge, template: LoadedTemplate, filename = "badge.svg") {
  const svg = renderBadgeToSvgString(badge, template);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
}

export function downloadCDR(badge: Badge, template: LoadedTemplate, filename = "badge.cdr") {
  // CorelDRAW opens SVGs. This is the same SVG with a .cdr filename for now.
  const svg = renderBadgeToSvgString(badge, template);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
}

export function rasterizeToPNGDataUrl(badge: Badge, template: LoadedTemplate, scale = 2): Promise<string> {
  const svg = renderBadgeToSvgString(badge, template);
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const svgUrl = URL.createObjectURL(svgBlob);

  const img = new Image();
  const W = template.widthPx * scale;
  const H = template.heightPx * scale;

  return new Promise<string>((resolve, reject) => {
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context not available"));
        return;
      }
      ctx.drawImage(img, 0, 0, W, H);
      URL.revokeObjectURL(svgUrl);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = svgUrl;
  });
}

export function downloadPNG(badge: Badge, template: LoadedTemplate, filename = "badge.png", scale = 2) {
  rasterizeToPNGDataUrl(badge, template, scale).then(dataUrl => {
    fetch(dataUrl).then(res => res.blob()).then(blob => {
      downloadBlob(blob, filename);
    });
  });
}

export function downloadPDF(badge: Badge, template: LoadedTemplate, filename = "badge.pdf", scale = 3) {
  rasterizeToPNGDataUrl(badge, template, scale).then(dataUrl => {
    const Wmm = (template.widthPx / 96) * 25.4;  // convert pixels to mm
    const Hmm = (template.heightPx / 96) * 25.4;

    const doc = new jsPDF({
      orientation: Wmm > Hmm ? "landscape" : "portrait",
      unit: "mm",
      format: [Wmm, Hmm]
    });

    doc.addImage(dataUrl, "PNG", 0, 0, Wmm, Hmm);
    doc.save(filename);
  });
}

export function downloadTIFF(badge: Badge, template: LoadedTemplate, filename = "badge.tiff", scale = 4) {
  // Placeholder: export a high-res PNG but with .tiff extension for now
  rasterizeToPNGDataUrl(badge, template, scale).then(dataUrl => {
    fetch(dataUrl).then(res => res.blob()).then(blob => {
      const fakeTiff = new File([blob], "badge.tiff", { type: "image/tiff" });
      downloadBlob(fakeTiff, filename);
    });
  });
}
