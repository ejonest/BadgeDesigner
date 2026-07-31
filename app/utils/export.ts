import {
  renderBadgeToSvgString,
  renderBadgeToSvgStringWithFonts,
  resolvePrintRenderOpts,
  resolveProductionRenderOpts,
} from "./renderSvg";
import type { DesignerVariant } from "~/constants/designerVariants";
import type { Badge } from "../types/badge";
import type { LoadedTemplate } from "./templates";
import { isPlaqueTemplateId } from "./plaqueRender";
import { badgeWithPlaqueLogoInlinedForSvgImg } from "./plaqueLogoInline";

const plaqueExportLogoCache = new Map<string, string>();

export type SvgBlobExportOptions = {
  /**
   * Compact SVGs for multipart upload to Remix/Supabase:
   * keep https logo hrefs, skip wood data-URL inlining, skip font embedding on proof SVG.
   */
  forRemoteStorage?: boolean;
};

async function badgeForSvgExport(
  badge: Badge,
  template: LoadedTemplate,
  variant: DesignerVariant,
  options?: SvgBlobExportOptions,
): Promise<Badge> {
  if (variant === "plaque" || isPlaqueTemplateId(template.id)) {
    if (options?.forRemoteStorage) {
      const raw = badge.logo?.src?.trim();
      // https URLs stay as hrefs (small). Still inline blob: so storage SVG is self-contained.
      if (raw && /^https?:\/\//i.test(raw)) return badge;
    }
    return badgeWithPlaqueLogoInlinedForSvgImg(badge, plaqueExportLogoCache);
  }
  return badge;
}

export function downloadBlob(data: Blob, filename: string) {
  const url = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadSVG(badge: Badge, template: LoadedTemplate, filename = "badge.svg") {
  const svg = await renderBadgeToSvgStringWithFonts(badge, template, {
    plateRenderMode: "vector",
  });
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
}


export async function downloadCDR(badge: Badge, template: LoadedTemplate, filename = "badge.cdr") {
  // CorelDRAW opens SVGs. Print-ready SVG (text + icon + die outline, no background art).
  const svg = await renderBadgeToSvgStringWithFonts(badge, template, {
    ...resolvePrintRenderOpts(badge, template, "badge"),
  });
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  downloadBlob(blob, filename);
}


export async function rasterizeToPNGDataUrl(badge: Badge, template: LoadedTemplate, scale = 2): Promise<string> {
  const svg = await renderBadgeToSvgStringWithFonts(badge, template, {
    plateRenderMode: "vector",
  });
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
    
    await downloadCDR(badge, template, filename);
    
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
      
      // Generate SVG for this badge with font embedding
      const badgeSvg = await renderBadgeToSvgStringWithFonts(badge, template, {
        ...resolvePrintRenderOpts(badge, template, "badge"),
      });
      
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
    
    await downloadTIFF(badge, template, filename, 4);
    
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
    
    await downloadPNG(badge, template, filename, 2);
    
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

/**
 * Generate SVG as a Blob (for upload, not download).
 * Badge designs embed the product photo + icons when plate photography is available.
 */
export async function generateSVGAsBlob(
  badge: Badge,
  template: LoadedTemplate,
  variant: DesignerVariant = "badge",
  options?: SvgBlobExportOptions,
): Promise<Blob> {
  const badgeForSvg = await badgeForSvgExport(badge, template, variant, options);
  const renderOpts = {
    ...resolveProductionRenderOpts(badgeForSvg, template, variant),
    ...(options?.forRemoteStorage
      ? { embedFonts: false, inlineRemoteImages: false }
      : {}),
  };
  const svg = await renderBadgeToSvgStringWithFonts(
    badgeForSvg,
    template,
    renderOpts,
  );
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

/**
 * Print-ready SVG for CorelDRAW: plate color and/or custom bleed background,
 * text, icon, registration outline, sized to die + 0.1″ overhang.
 * Plaques: metal plate only (no wood) with brushed fill + 0.05″ bleed per side.
 */
export async function generatePrintSVGAsBlob(
  badge: Badge,
  template: LoadedTemplate,
  variant: DesignerVariant = "badge",
  options?: SvgBlobExportOptions,
): Promise<Blob> {
  const badgeForSvg = await badgeForSvgExport(badge, template, variant, options);
  const renderOpts = {
    ...resolvePrintRenderOpts(badgeForSvg, template, variant),
    // Print still embeds fonts once; skip only remote image inlining when storing.
    ...(options?.forRemoteStorage ? { inlineRemoteImages: false } : {}),
  };
  const svg = await renderBadgeToSvgStringWithFonts(
    badgeForSvg,
    template,
    renderOpts,
  );
  return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
}

/** Full proof SVG string (backgrounds/photo + text + icon). */
export async function generateSVGAsString(
  badge: Badge,
  template: LoadedTemplate,
  variant: DesignerVariant = "badge",
): Promise<string> {
  const badgeForSvg = await badgeForSvgExport(badge, template, variant);
  return renderBadgeToSvgStringWithFonts(
    badgeForSvg,
    template,
    resolveProductionRenderOpts(badgeForSvg, template, variant),
  );
}

/** CorelDRAW / print SVG string (color/image + text + icon + bleed). */
export async function generatePrintSVGAsString(
  badge: Badge,
  template: LoadedTemplate,
  variant: DesignerVariant = "badge",
): Promise<string> {
  const badgeForSvg = await badgeForSvgExport(badge, template, variant);
  return renderBadgeToSvgStringWithFonts(
    badgeForSvg,
    template,
    resolvePrintRenderOpts(badgeForSvg, template, variant),
  );
}

/**
 * Composite preview: proof + print stacked (same crop viewBox / layout coords).
 * Magenta box marks the calibrated badge face for reference.
 */
export function buildProofPrintAlignmentOverlaySvg(
  proofSvg: string,
  printSvg: string,
  proofViewBox: { width: number; height: number },
  faceInProof: { x: number; y: number; width: number; height: number },
): string {
  /** Root width/height attributes so nested SVGs paint reliably inside <image>. */
  const withExplicitSize = (svg: string, w: number, h: number) => {
    let out = svg.replace(
      /\s(?:width|height)\s*=\s*("[^"]*"|'[^']*')/gi,
      "",
    );
    if (/\<svg\b/i.test(out)) {
      out = out.replace(
        /\<svg\b/i,
        `<svg width="${w}" height="${h}"`,
      );
    }
    return out;
  };

  const toDataUrl = (svg: string) =>
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

  const W = proofViewBox.width;
  const H = proofViewBox.height;
  const { x, y, width, height } = faceInProof;
  const proofHref = toDataUrl(withExplicitSize(proofSvg, W, H));
  const printHref = toDataUrl(withExplicitSize(printSvg, W, H));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     viewBox="0 0 ${W} ${H}"
     preserveAspectRatio="xMidYMid meet">
  <title>Proof + print registration overlay</title>
  <image href="${proofHref}" xlink:href="${proofHref}"
         x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" />
  <image href="${printHref}" xlink:href="${printHref}"
         x="0" y="0" width="${W}" height="${H}"
         preserveAspectRatio="none" opacity="0.55" />
  <rect x="${x}" y="${y}" width="${width}" height="${height}"
        fill="none" stroke="#FF00AA" stroke-width="${Math.max(2, width * 0.004)}"
        stroke-dasharray="${Math.max(4, width * 0.01)} ${Math.max(3, width * 0.006)}" />
</svg>`;
}

/**
 * Generate PNG as a Blob (for upload, not download)
 */
export async function generatePNGAsBlob(badge: Badge, template: LoadedTemplate, scale = 2): Promise<Blob> {
  const dataUrl = await rasterizeToPNGDataUrl(badge, template, scale);
  const res = await fetch(dataUrl);
  return await res.blob();
}
