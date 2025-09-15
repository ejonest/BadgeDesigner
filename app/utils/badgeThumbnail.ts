import { Badge, BadgeLine } from '../types/badge';
import { renderBadgeToSvgString } from './renderSvg';
import { loadTemplateById, type LoadedTemplate } from './templates';
// import UTIF encoder
// @ts-ignore
import * as UTIF from 'utif';

export interface BadgeThumbnailOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/tiff';
}

// helper to convert RGBA → TIFF data URL
function rgbaToTiff(rgba: Uint8Array, w: number, h: number): string {
  try {
    const tiff = UTIF.encodeImage(rgba, w, h);
    const tiffArray = new Uint8Array(tiff);
    const binaryString = Array.from(tiffArray, byte => String.fromCharCode(byte)).join('');
    return `data:image/tiff;base64,${btoa(binaryString)}`;
  } catch (error) {
    console.error('Error in rgbaToTiff:', error);
    throw error;
  }
}

// Legacy function removed - now using unified renderer

/**
 * Generates a thumbnail image of a badge design using the unified renderer
 * @param badge The badge design data
 * @param options Thumbnail generation options
 * @returns Promise<string> Base64 encoded image data URL
 */
export async function generateBadgeThumbnail(
  badge: Badge, 
  options: BadgeThumbnailOptions = {}
): Promise<string> {
  const {
    width = 300,
    height = 100,
    quality = 0.9,
    format = 'image/png'
  } = options;

  try {
    // Load the template
    const template = await loadTemplateById(badge.templateId || 'rect-1x3');
    
    // Generate SVG using unified renderer
    const svgString = renderBadgeToSvgString(badge, template, { showOutline: false });
    
    // Convert SVG to canvas for rasterization
    return new Promise((resolve, reject) => {
      const img = new Image();
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          // Set canvas dimensions
          canvas.width = width;
          canvas.height = height;

          // Enable high-quality rendering
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Draw the SVG scaled to canvas size
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to data URL
          if (format === 'image/tiff') {
            // Obtain pixel data with ctx.getImageData(0,0,width,height).data
            const imageData = ctx.getImageData(0, 0, width, height);
            const dataUrl = rgbaToTiff(new Uint8Array(imageData.data), width, height);
            resolve(dataUrl);
          } else {
            const dataUrl = canvas.toDataURL(format, quality);
            resolve(dataUrl);
          }
          
          // Clean up
          URL.revokeObjectURL(svgUrl);
        } catch (error) {
          console.error('Error converting SVG to canvas:', error);
          reject(error);
        }
      };
      
      img.onerror = (error) => {
        console.error('Error loading SVG:', error);
        URL.revokeObjectURL(svgUrl);
        reject(error);
      };
      
      img.src = svgUrl;
    });
  } catch (error) {
    console.error('Error generating badge thumbnail:', error);
    // Return a fallback thumbnail instead of rejecting
    try {
      const fallbackThumbnail = generateFallbackThumbnail(badge);
      return fallbackThumbnail;
    } catch (fallbackError) {
      console.error('Fallback thumbnail also failed:', fallbackError);
      throw error;
    }
  }
}

/**
 * Generates a full-size badge image using the unified renderer
 * @param badge The badge design data
 * @returns Promise<string> Base64 encoded image data URL
 */
export async function generateFullBadgeImage(badge: Badge): Promise<string> {
  try {
    // Use the unified renderer for consistency
    console.log('Generating full badge image using unified renderer...');
    
    // Load the template
    const template = await loadTemplateById(badge.templateId || 'rect-1x3');
    
    // Generate SVG using unified renderer
    const svgString = renderBadgeToSvgString(badge, template, { showOutline: false });
    
    // Convert SVG to high-resolution PNG
    return new Promise((resolve, reject) => {
      const img = new Image();
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          // Set high-resolution canvas dimensions (3x for crisp text)
          const scale = 3;
          canvas.width = template.widthPx * scale;
          canvas.height = template.heightPx * scale;

          // Enable high-quality rendering
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // Draw the SVG scaled to high resolution
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Convert to PNG data URL
          const dataUrl = canvas.toDataURL('image/png', 1.0);
          console.log('Full badge image generated successfully');
          resolve(dataUrl);
          
          // Clean up
          URL.revokeObjectURL(svgUrl);
        } catch (error) {
          console.error('Error converting SVG to high-res canvas:', error);
          reject(error);
        }
      };
      
      img.onerror = (error) => {
        console.error('Error loading SVG for full image:', error);
        URL.revokeObjectURL(svgUrl);
        reject(error);
      };
      
      img.src = svgUrl;
    });
  } catch (error) {
    console.error('Error generating full badge image:', error);
    // Fallback to high-resolution canvas generation
    console.log('Falling back to canvas generation...');
    const fullImage = await generateBadgeThumbnail(badge, {
      width: 900,  // 3x preview width for crisp text
      height: 300, // 3x preview height for crisp text
      quality: 1.0, // Maximum quality
      format: 'image/png' // PNG for best quality
    });
    return fullImage;
  }
}

/**
 * Add a dedicated wrapper for high‑resolution badges using unified renderer
 * @param badge The badge design data
 * @returns Promise<string> Base64 encoded PNG data URL
 */
export async function generateBadgeTiff(badge: Badge): Promise<string> {
  return generateBadgeThumbnail(badge, {
    width: 900,   // 3" @300 dpi
    height: 300,  // 1" @300 dpi
    format: 'image/png' // Use PNG for now, TIFF conversion happens in export.ts
  });
}

/**
 * Generates a thumbnail from the full image (proportional scaling)
 * @param fullImageDataUrl The full-size image data URL
 * @param targetWidth The target thumbnail width
 * @param targetHeight The target thumbnail height
 * @returns Promise<string> Base64 encoded thumbnail data URL
 */
export async function generateThumbnailFromFullImage(
  fullImageDataUrl: string, 
  targetWidth: number = 100, 
  targetHeight: number = 50
): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        canvas.width = targetWidth;
        canvas.height = targetHeight;

        // Draw the full image scaled down to thumbnail size
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

        try {
          const thumbnailDataUrl = canvas.toDataURL('image/png', 0.8);
          resolve(thumbnailDataUrl);
        } catch (error) {
          console.error('Error converting thumbnail to data URL:', error);
          reject(error);
        }
      };

      img.onerror = () => {
        reject(new Error('Failed to load full image for thumbnail generation'));
      };

      img.src = fullImageDataUrl;
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Generates a thumbnail from the badge design (legacy method)
 * @param badge The badge design data
 * @returns Promise<string> Base64 encoded image data URL
 */
export async function generateCartThumbnail(badge: Badge): Promise<string> {
  try {
    // Create a properly sized thumbnail for cart display
    const thumbnail = await generateBadgeThumbnail(badge, {
      width: 100,  // Smaller width for cart properties
      height: 50,  // Smaller height for cart properties
      quality: 0.7, // Lower quality to reduce size
      format: 'image/png' // Use PNG for better text clarity
    });
    return thumbnail;
  } catch (error) {
    console.error('Error generating cart thumbnail:', error);
    // Return a fallback thumbnail
    const fallback = generateFallbackThumbnail(badge);
    return fallback;
  }
}

/**
 * Generates a fallback full-size image when the main generation fails
 * @param badge The badge design data
 * @returns string Base64 encoded fallback image
 */
function generateFallbackFullImage(badge: Badge): string {
  console.log('Generating fallback full badge image for badge:', {
    backgroundColor: badge.backgroundColor
  });
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    console.error('Could not get canvas context for fallback full image');
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  }

  canvas.width = 300;  // 1 inch at 300 DPI
  canvas.height = 900; // 3 inches at 300 DPI

  try {
    // Simple fallback design with proper background color
    const backgroundColor = badge.backgroundColor || '#FFFFFF';
    console.log('Fallback full image background color:', backgroundColor);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, 300, 900);
    
    // No border - clean image

    // Add text with contrasting color
    const textColor = backgroundColor === '#FFFFFF' || backgroundColor === '#F0E68C' ? '#000000' : '#FFFFFF';
    ctx.fillStyle = textColor;
    ctx.font = '48px Arial'; // Larger font for full image
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Custom Badge', 150, 450); // Center of the image

    const dataUrl = canvas.toDataURL('image/png', 0.9);
    console.log('Fallback full image generated successfully');
    return dataUrl;
  } catch (error) {
    console.error('Error generating fallback full image:', error);
    // Return a minimal 1x1 transparent pixel as last resort
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  }
}

/**
 * Generates a fallback thumbnail when the main generation fails
 * @param badge The badge design data
 * @returns string Base64 encoded fallback image
 */
function generateFallbackThumbnail(badge: Badge): string {
  console.log('Generating fallback thumbnail for badge:', {
    backgroundColor: badge.backgroundColor
  });
  
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    console.error('Could not get canvas context for fallback thumbnail');
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  }

  canvas.width = 150;  // Back to original size
  canvas.height = 50;  // Back to original size

  try {
    // Simple fallback design with proper background color
    const backgroundColor = badge.backgroundColor || '#FFFFFF';
    console.log('Fallback thumbnail background color:', backgroundColor);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, 150, 50);
    
    // No border - clean image

    // Add text with contrasting color
    const textColor = backgroundColor === '#FFFFFF' || backgroundColor === '#F0E68C' ? '#000000' : '#FFFFFF';
    ctx.fillStyle = textColor;
    ctx.font = '12px Arial'; // Back to readable font size
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Custom Badge', 75, 25); // Back to original position

    const dataUrl = canvas.toDataURL('image/png', 0.8); // Use PNG with good quality
    console.log('Fallback thumbnail generated successfully');
    return dataUrl;
  } catch (error) {
    console.error('Error generating fallback thumbnail:', error);
    // Return a minimal 1x1 transparent pixel as last resort
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  }
} 