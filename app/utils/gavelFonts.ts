import {
  GAVEL_DEFAULT_FONT,
  getGavelFontOption,
  type GavelFontOption,
} from "~/constants/gavelStyles";

type StyledLine = {
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
};

/** Times falls back to Tinos (same metrics, real bold and italic) when the system face is missing. */
export function gavelFontFamilyStack(family: string | null | undefined): string {
  const name = family?.trim() || GAVEL_DEFAULT_FONT;
  if (name === "Times New Roman") {
    return '"Times New Roman", Tinos, Georgia, serif';
  }
  return `"${name}", Georgia, serif`;
}

export function gavelPaintWeight(line: StyledLine): 400 | 700 {
  const support = getGavelFontOption(line.fontFamily);
  return line.bold && support.bold ? 700 : 400;
}

export function gavelPaintStyle(line: StyledLine): "italic" | "normal" {
  const support = getGavelFontOption(line.fontFamily);
  if (!line.italic || !support.italic) return "normal";
  if (line.bold && support.bold && !support.boldItalic) return "normal";
  return "italic";
}

/** Canvas/SVG font shorthand. Regular is 400 so a 700 bold face cannot collapse into the same glyph. */
export function gavelCanvasFont(line: StyledLine, sizePx: number): string {
  return `${gavelPaintStyle(line)} ${gavelPaintWeight(line)} ${sizePx}px ${gavelFontFamilyStack(line.fontFamily)}`;
}

export function gavelLineFieldStyle(line: StyledLine): {
  fontFamily: string;
  fontWeight: 400 | 700;
  fontStyle: "italic" | "normal";
} {
  return {
    fontFamily: gavelFontFamilyStack(line.fontFamily),
    fontWeight: gavelPaintWeight(line),
    fontStyle: gavelPaintStyle(line),
  };
}

function loadSpecsFor(support: GavelFontOption): string[] {
  const quoted = `"${support.value}"`;
  const specs = [`400 48px ${quoted}`];
  if (support.bold) specs.push(`700 48px ${quoted}`);
  if (support.italic) specs.push(`italic 400 48px ${quoted}`);
  if (support.boldItalic) specs.push(`italic 700 48px ${quoted}`);
  if (support.value === "Times New Roman") {
    specs.push(
      '400 48px "Tinos"',
      '700 48px "Tinos"',
      'italic 400 48px "Tinos"',
      'italic 700 48px "Tinos"',
    );
  }
  return specs;
}

/** Download the faces the preview will actually request, so canvas does not synthesize them. */
export async function preloadGavelFonts(
  families: Iterable<string>,
): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  const specs = [...families].flatMap((family) =>
    loadSpecsFor(getGavelFontOption(family)),
  );
  await Promise.all(
    specs.map((spec) => document.fonts.load(spec).catch(() => [])),
  );
  await document.fonts.ready;
}
