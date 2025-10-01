import { renderBadgeToSvgString, renderBadgeToSvgStringWithFonts } from "./renderSvg";
import type { Badge } from "../types/badge";
import type { LoadedTemplate } from "./templates";

export function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadSVG(badge: Badge, template: LoadedTemplate, filename = "badge.svg") {
  const svg = await renderBadgeToSvgStringWithFonts(badge, template);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
}


export async function downloadCDR(badge: Badge, template: LoadedTemplate, filename = "badge.cdr") {
  // CorelDRAW opens SVGs. This is the same SVG with a .cdr filename for now.
  const svg = await renderBadgeToSvgStringWithFonts(badge, template);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
}


export async function rasterizeToPNGDataUrl(badge: Badge, template: LoadedTemplate, scale = 2): Promise<string> {
  const svg = await renderBadgeToSvgStringWithFonts(badge, template);
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

export async function downloadPNG(badge: Badge, template: LoadedTemplate, filename = "badge.png", scale = 2) {
  const dataUrl = await rasterizeToPNGDataUrl(badge, template, scale);
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  downloadBlob(blob, filename);
}




export async function downloadTIFF(badge: Badge, template: LoadedTemplate, filename = "badge.tiff", scale = 4) {
  // Placeholder: export a high-res PNG but with .tiff extension for now
  const dataUrl = await rasterizeToPNGDataUrl(badge, template, scale);
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const fakeTiff = new File([blob], "badge.tiff", { type: "image/tiff" });
  downloadBlob(fakeTiff, filename);
}



// ========== MULTI-BADGE EXPORT FUNCTIONS ==========



/**
 * Downloads multiple badges as separate CDR files
 */
export async function downloadMultipleCDRs(badges: Badge[], templates: LoadedTemplate[], baseFilename = "badge") {
  for (let i = 0; i < badges.length; i++) {
    const badge = badges[i];
    const template = templates[i] || templates[0];
    const filename = `${baseFilename}_${i + 1}.cdr`;
    
    downloadCDR(badge, template, filename);
    
    // Add small delay to prevent browser blocking multiple downloads
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Downloads multiple badges as a single multi-page CDR file
 */
export async function downloadMultiPageCDR(badges: Badge[], templates: LoadedTemplate[], filename = "badges.cdr") {
  try {
    // Create a multi-page SVG document
    let multiPageSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">`;

    let yOffset = 0;
    const pageSpacing = 50; // Space between pages

    for (let i = 0; i < badges.length; i++) {
      const badge = badges[i];
      const template = templates[i] || templates[0];
      
      // Generate SVG for this badge
      const badgeSvg = renderBadgeToSvgString(badge, template);
      
      // Extract the content from the badge SVG (remove the outer svg tags)
      const svgContent = badgeSvg.replace(/<svg[^>]*>/, '').replace(/<\/svg>$/, '');
      
      // Add this badge as a group with vertical offset
      multiPageSvg += `
  <g transform="translate(0, ${yOffset})">
    <text x="10" y="20" font-family="Arial" font-size="14" font-weight="bold">Badge ${i + 1}</text>
    <g transform="translate(0, 30)">
      ${svgContent}
    </g>
  </g>`;
      
      yOffset += template.heightPx + pageSpacing + 50; // Badge height + spacing + title space
    }

    multiPageSvg += `
</svg>`;

    const blob = new Blob([multiPageSvg], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, filename);
  } catch (error) {
    console.error('Multi-page CDR export failed:', error);
    // Fallback to separate files
    downloadMultipleCDRs(badges, templates, baseFilename);
  }
}

/**
 * Downloads multiple badges as separate TIFF files
 */
export async function downloadMultipleTIFFs(badges: Badge[], templates: LoadedTemplate[], baseFilename = "badge") {
  for (let i = 0; i < badges.length; i++) {
    const badge = badges[i];
    const template = templates[i] || templates[0];
    const filename = `${baseFilename}_${i + 1}.tiff`;
    
    downloadTIFF(badge, template, filename, 4);
    
    // Add small delay to prevent browser blocking multiple downloads
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Downloads multiple badges as separate PNG files
 */
export async function downloadMultiplePNGs(badges: Badge[], templates: LoadedTemplate[], baseFilename = "badge") {
  for (let i = 0; i < badges.length; i++) {
    const badge = badges[i];
    const template = templates[i] || templates[0];
    const filename = `${baseFilename}_${i + 1}.png`;
    
    downloadPNG(badge, template, filename, 2);
    
    // Add small delay to prevent browser blocking multiple downloads
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

/**
 * Downloads multiple badges as separate SVG files
 */
export async function downloadMultipleSVGs(badges: Badge[], templates: LoadedTemplate[], baseFilename = "badge") {
  for (let i = 0; i < badges.length; i++) {
    const badge = badges[i];
    const template = templates[i] || templates[0];
    const filename = `${baseFilename}_${i + 1}.svg`;
    
    downloadSVG(badge, template, filename);
    
    // Add small delay to prevent browser blocking multiple downloads
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
