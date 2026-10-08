import type { BadgeLine } from "~/types/badge";
import { FontFamilySelect } from "~/components/FontFamilySelect";
import {
  GAVEL_DEFAULT_FONT,
  GAVEL_FONT_OPTIONS,
  GAVEL_TEXT_SIZE_PRESETS,
  getGavelFontOption,
  type GavelTextSizePreset,
} from "~/constants/gavelStyles";
import type { GavelBulkLineStyle } from "~/utils/gavelBulkCsv";

type Props = {
  line: BadgeLine;
  ariaLabel: string;
  onChange: (changes: Partial<BadgeLine>) => void;
};

/**
 * Font menu plus Bold / Italic. A toggle is omitted when that face does not
 * exist, so it can never look selected while the preview stays unchanged.
 */
export function GavelLineStyleControls({ line, ariaLabel, onChange }: Props) {
  const family = line.fontFamily || GAVEL_DEFAULT_FONT;
  const support = getGavelFontOption(family);

  return (
    <>
      <FontFamilySelect
        value={family}
        options={[...GAVEL_FONT_OPTIONS]}
        onChange={(fontFamily) => {
          const next = getGavelFontOption(fontFamily);
          const changes: Partial<BadgeLine> = { fontFamily };
          if (line.bold && !next.bold) changes.bold = false;
          if (
            line.italic &&
            (!next.italic || (Boolean(line.bold) && next.bold && !next.boldItalic))
          ) {
            changes.italic = false;
          }
          onChange(changes);
        }}
        ariaLabel={ariaLabel}
        variant="legacy"
      />
      {support.bold ? (
        <button
          type="button"
          className={`gf-chip ${line.bold ? "is-on" : ""}`}
          aria-pressed={Boolean(line.bold)}
          onClick={() => {
            const nextBold = !line.bold;
            const changes: Partial<BadgeLine> = { bold: nextBold };
            if (nextBold && line.italic && !support.boldItalic) {
              changes.italic = false;
            }
            onChange(changes);
          }}
        >
          Bold
        </button>
      ) : null}
      {support.italic ? (
        <button
          type="button"
          className={`gf-chip ${line.italic ? "is-on" : ""}`}
          aria-pressed={Boolean(line.italic)}
          onClick={() => onChange({ italic: !line.italic })}
        >
          Italic
        </button>
      ) : null}
    </>
  );
}

/** Size chips plus the font menu, for one engraved line. */
export function GavelLineSizeFontControls({
  style,
  size,
  ariaLabel,
  onChange,
}: {
  style: GavelBulkLineStyle;
  size: GavelTextSizePreset;
  ariaLabel: string;
  onChange: (changes: Partial<GavelBulkLineStyle>) => void;
}) {
  const line: BadgeLine = {
    id: "gavel-line-style",
    text: "",
    yNorm: 0.5,
    sizeNorm: 0.2,
    color: "",
    align: "center",
    fontFamily: style.fontFamily || GAVEL_DEFAULT_FONT,
    bold: Boolean(style.bold),
    italic: Boolean(style.italic),
    underline: false,
  };

  return (
    <div className="gf-bulk-line-style">
      <div className="gf-chip-row" role="group" aria-label={`${ariaLabel} size`}>
        {GAVEL_TEXT_SIZE_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className={`gf-chip ${size === preset ? "is-on" : ""}`}
            aria-pressed={size === preset}
            onClick={() => onChange({ textSize: preset })}
          >
            {preset}
          </button>
        ))}
      </div>
      <GavelLineStyleControls
        line={line}
        ariaLabel={ariaLabel}
        onChange={(changes) =>
          onChange({
            ...(changes.fontFamily !== undefined
              ? { fontFamily: changes.fontFamily }
              : {}),
            ...(changes.bold !== undefined ? { bold: changes.bold } : {}),
            ...(changes.italic !== undefined ? { italic: changes.italic } : {}),
          })
        }
      />
    </div>
  );
}

function lineStyleKey(line: BadgeLine): string {
  return `${line.fontFamily || GAVEL_DEFAULT_FONT}|${line.bold ? 1 : 0}|${line.italic ? 1 : 0}`;
}

/** True when every line uses the same font, weight and slant. */
export function linesShareStyle(lines: readonly BadgeLine[]): boolean {
  if (lines.length === 0) return true;
  const first = lineStyleKey(lines[0]);
  return lines.every((line) => lineStyleKey(line) === first);
}

/** Copies the first line's font, weight and slant onto every line. */
export function unifyLineStyles(lines: readonly BadgeLine[]): BadgeLine[] {
  const first = lines[0];
  if (!first) return [...lines];
  return lines.map((line) => ({
    ...line,
    fontFamily: first.fontFamily,
    bold: first.bold,
    italic: first.italic,
  }));
}

type SurfaceProps = {
  lines: readonly BadgeLine[];
  /** Names the surface in the font menu's accessible label. */
  surfaceLabel: string;
  individual: boolean;
  onChangeAll: (changes: Partial<BadgeLine>) => void;
  onIndividualChange: (individual: boolean) => void;
};

/**
 * One font / Bold / Italic row for a whole surface. Per-line controls only
 * appear once the shopper asks to style lines individually.
 */
export function GavelSurfaceStyleRow({
  lines,
  surfaceLabel,
  individual,
  onChangeAll,
  onIndividualChange,
}: SurfaceProps) {
  const first = lines[0];
  if (!first) return null;

  return (
    <div className="gf-line-tools gf-surface-style">
      {individual ? (
        <span className="gf-muted">Font set per line below</span>
      ) : (
        <GavelLineStyleControls
          line={first}
          ariaLabel={`Font for all ${surfaceLabel} lines`}
          onChange={onChangeAll}
        />
      )}
      <label className="gf-style-split">
        <input
          type="checkbox"
          checked={individual}
          onChange={(event) => onIndividualChange(event.target.checked)}
        />
        Style lines individually
      </label>
    </div>
  );
}
