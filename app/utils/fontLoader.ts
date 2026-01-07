// Font loading utility for consistent font rendering across all export formats

export interface FontData {
  name: string;
  regular: string; // Base64 encoded font data
  bold?: string;
  italic?: string;
  boldItalic?: string;
}

// Font file paths mapping
const FONT_PATHS: { [key: string]: string } = {
  'Roboto': '/Fonts/Roboto/static/Roboto-Regular.ttf',
  'Open Sans': '/Fonts/Open_Sans/static/OpenSans-Regular.ttf',
  'Lato': '/Fonts/Lato/Lato-Regular.ttf', // FIXED: No static/ folder
  'Montserrat': '/Fonts/Montserrat/static/Montserrat-Regular.ttf',
  'Oswald': '/Fonts/Oswald/static/Oswald-Regular.ttf',
  'Source Sans 3': '/Fonts/Source_Sans_3/static/SourceSans3-Regular.ttf',
  'Raleway': '/Fonts/Raleway/static/Raleway-Regular.ttf',
  'PT Sans': '/Fonts/PT_Sans/PTSans-Regular.ttf',
  'Merriweather': '/Fonts/Merriweather/static/Merriweather-Regular.ttf',
  'Noto Sans': '/Fonts/Noto_Sans/static/NotoSans-Regular.ttf',
  'Noto Serif': '/Fonts/Noto_Serif/static/NotoSerif-Regular.ttf',
  'Georgia': 'system', // Georgia is a system font
  // New fonts
  'Inter': '/Fonts/Inter/static/Inter_24pt-Regular.ttf',
  'Cabin': '/Fonts/Cabin/static/Cabin-Regular.ttf',
  'Nunito': '/Fonts/Nunito/static/Nunito-Regular.ttf',
  'Roboto Mono': '/Fonts/Roboto_Mono/static/RobotoMono-Regular.ttf',
  'Roboto Serif': '/Fonts/Roboto_Serif/static/RobotoSerif-Regular.ttf',
  'Roboto Slab': '/Fonts/Roboto_Slab/static/RobotoSlab-Regular.ttf'
};

// Cache for loaded fonts
const fontCache = new Map<string, FontData>();

export async function loadFont(fontFamily: string): Promise<FontData | null> {
  if (fontCache.has(fontFamily)) {
    return fontCache.get(fontFamily)!;
  }

  const fontPath = FONT_PATHS[fontFamily];
  if (!fontPath || fontPath === 'system') {
    return null; // Use system font fallback
  }

  try {
    // Fetch font file
    const response = await fetch(fontPath);
    if (!response.ok) {
      console.warn(`Failed to load font ${fontFamily}: ${response.statusText}`);
      return null;
    }

    const fontBuffer = await response.arrayBuffer();
    const base64Font = btoa(String.fromCharCode(...new Uint8Array(fontBuffer)));

    const fontData: FontData = {
      name: fontFamily,
      regular: base64Font
    };

    fontCache.set(fontFamily, fontData);
    return fontData;
  } catch (error) {
    console.error(`Error loading font ${fontFamily}:`, error);
    return null;
  }
}

export function getFontDataUrl(fontData: FontData, style: 'regular' | 'bold' | 'italic' | 'boldItalic' = 'regular'): string {
  const fontContent = fontData[style] || fontData.regular;
  return `data:font/ttf;base64,${fontContent}`;
}

// Test function to verify font loading works
export async function testFontLoading(): Promise<void> {
  console.log('Testing font loading...');
  
  try {
    const robotoFont = await loadFont('Roboto');
    if (robotoFont) {
      console.log('✅ Roboto font loaded successfully');
      console.log('Font data length:', robotoFont.regular.length);
    } else {
      console.log('❌ Failed to load Roboto font');
    }

    const openSansFont = await loadFont('Open Sans');
    if (openSansFont) {
      console.log('✅ Open Sans font loaded successfully');
      console.log('Font data length:', openSansFont.regular.length);
    } else {
      console.log('❌ Failed to load Open Sans font');
    }

    const georgiaFont = await loadFont('Georgia');
    if (georgiaFont === null) {
      console.log('✅ Georgia font correctly identified as system font');
    } else {
      console.log('❌ Georgia should be system font');
    }

  } catch (error) {
    console.error('Font loading test failed:', error);
  }
}
