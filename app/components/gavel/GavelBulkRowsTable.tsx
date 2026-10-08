import { useEffect, useRef, useState } from "react";
import {
  GAVEL_MAX_CHARS_PER_LINE,
  GAVEL_TEXT_SIZE_PRESETS,
  SOUND_BLOCK_MAX_CHARS,
  type GavelTextSizePreset,
} from "~/constants/gavelStyles";
import { GavelLineSizeFontControls } from "~/components/gavel/GavelLineStyleControls";
import {
  gavelBulkLineTextSize,
  type GavelBulkLineStyle,
  type GavelBulkRow,
  type GavelBulkRowIssues,
} from "~/utils/gavelBulkCsv";

export type GavelBulkSortKey =
  | "line1"
  | "line2"
  | "line3"
  | "line4"
  | "secondary1"
  | "secondary2"
  | "secondary3"
  | "secondary4"
  | "quantity";

type Props = {
  entries: readonly {
    row: GavelBulkRow;
    index: number;
    issues: GavelBulkRowIssues;
  }[];
  selectedIndex: number;
  /** Order-wide size; a row without its own override uses this. */
  textSize: GavelTextSizePreset;
  /** Secondary-surface columns to show; 0 when both surfaces share the text. */
  secondaryCount: number;
  /** Column names, from the customer's CSV header where it had one. */
  bandLabels: readonly string[];
  secondaryLabels: readonly string[];
  /** Plate lines share the band's per-size limit; sound-block lines share a total. */
  secondaryUsesBandLimit: boolean;
  sortKey: GavelBulkSortKey | null;
  sortAscending: boolean;
  searchQuery: string;
  onSort: (key: GavelBulkSortKey) => void;
  onSelect: (index: number) => void;
  onEditBand: (index: number, lineIndex: number, value: string) => void;
  onEditSecondary: (index: number, lineIndex: number, value: string) => void;
  onEditQuantity: (index: number, value: string) => void;
  onEditTextSize: (index: number, value: string) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
};

function sortMark(active: boolean, ascending: boolean) {
  return active ? (ascending ? " ↑" : " ↓") : "";
}

/**
 * A column is as wide as its longest entry. Proportional capitals run wider
 * than `ch` (the width of "0"), hence the margin.
 */
function cellMinWidth(value: string, placeholder: string): string {
  const chars = Math.max(value.length, placeholder.length, 4);
  return `${Math.ceil(chars * 1.12) + 2}ch`;
}

/** Holds the typed text so the field can be cleared mid-edit; valid numbers commit. */
function QuantityCell({
  quantity,
  label,
  className = "gf-bulk-cell gf-bulk-qty",
  onChange,
}: {
  quantity: number;
  label: string;
  className?: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(String(quantity));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(String(quantity));
  }, [quantity]);

  return (
    <input
      className={className}
      type="number"
      inputMode="numeric"
      min={1}
      max={999}
      value={draft}
      aria-label={label}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        setDraft(String(quantity));
      }}
      onChange={(event) => {
        setDraft(event.target.value);
        if (Number.parseInt(event.target.value, 10) >= 1) {
          onChange(event.target.value);
        }
      }}
    />
  );
}

/** One sentence per problem, in the customer's own column names. */
function describeIssues(
  row: GavelBulkRow,
  issues: GavelBulkRowIssues,
  options: {
    textSize: GavelTextSizePreset;
    bandLabels: readonly string[];
    secondaryLabels: readonly string[];
    secondaryUsesBandLimit: boolean;
  },
): string[] {
  const messages: string[] = [];
  if (issues.missingRequired) {
    messages.push(`${options.bandLabels[0]} is required.`);
  }
  let blockTotalReported = false;
  for (const key of issues.overCells) {
    const [surface, rawIndex] = key.split("-");
    const lineIndex = Number(rawIndex);
    const size = gavelBulkLineTextSize(
      row,
      lineIndex,
      options.textSize,
      surface === "secondary" ? "secondary" : "band",
    );
    const limit = GAVEL_MAX_CHARS_PER_LINE[size];
    if (surface === "band") {
      messages.push(
        `${options.bandLabels[lineIndex]} is ${row.texts[lineIndex].length} characters; ${limit} fit at ${size} size.`,
      );
    } else if (options.secondaryUsesBandLimit) {
      messages.push(
        `${options.secondaryLabels[lineIndex]} is ${row.secondaryTexts[lineIndex].length} characters; ${limit} fit at ${size} size.`,
      );
    } else if (!blockTotalReported) {
      blockTotalReported = true;
      const total = row.secondaryTexts.reduce((sum, text) => sum + text.length, 0);
      messages.push(
        `The sound block lines total ${total} characters; ${SOUND_BLOCK_MAX_CHARS} fit.`,
      );
    }
  }
  if (issues.duplicateOf !== null) {
    messages.push(`Same wording as row ${issues.duplicateOf}.`);
  }
  return messages;
}

type EditorProps = {
  row: GavelBulkRow | undefined;
  index: number;
  total: number;
  textSize: GavelTextSizePreset;
  secondaryCount: number;
  bandLabels: readonly string[];
  secondaryLabels: readonly string[];
  issues: GavelBulkRowIssues | undefined;
  /** Null when the product has no second engraved surface. */
  secondaryTitle: string | null;
  secondaryUsesBandLimit: boolean;
  onSelect: (index: number) => void;
  onEditBand: (index: number, lineIndex: number, value: string) => void;
  onEditSecondary: (index: number, lineIndex: number, value: string) => void;
  onEditQuantity: (index: number, value: string) => void;
  onEditBandStyle: (
    index: number,
    lineIndex: number,
    changes: Partial<GavelBulkLineStyle>,
  ) => void;
  onEditSecondaryStyle: (
    index: number,
    lineIndex: number,
    changes: Partial<GavelBulkLineStyle>,
  ) => void;
};

/** The design step's view of one bulk row, editable in place. */
export function GavelBulkRowEditor({
  row,
  index,
  total,
  textSize,
  secondaryCount,
  bandLabels,
  secondaryLabels,
  issues,
  secondaryTitle,
  secondaryUsesBandLimit,
  onSelect,
  onEditBand,
  onEditSecondary,
  onEditQuantity,
  onEditBandStyle,
  onEditSecondaryStyle,
}: EditorProps) {
  if (!row) return null;
  const lineLimit = (lineIndex: number, surface: "band" | "secondary" = "band") =>
    GAVEL_MAX_CHARS_PER_LINE[
      gavelBulkLineTextSize(row, lineIndex, textSize, surface)
    ];
  const lineStyle = (
    lineIndex: number,
    surface: "band" | "secondary",
  ): GavelBulkLineStyle => {
    const styles = surface === "band" ? row.bandStyles : row.secondaryStyles;
    return styles?.[lineIndex] ?? {};
  };
  const duplicateOf = issues?.duplicateOf ?? null;

  const field = (
    key: string,
    label: string,
    value: string,
    max: number | undefined,
    flagged: boolean,
    placeholder: string,
    style: GavelBulkLineStyle,
    size: GavelTextSizePreset,
    onChange: (value: string) => void,
    onStyle: (changes: Partial<GavelBulkLineStyle>) => void,
  ) => {
    const over = max !== undefined && value.length > max;
    return (
      <div key={key} className="gf-bulk-edit-line">
        <span>{label}</span>
        <input
          className={`gf-input${over || flagged ? " is-over" : ""}`}
          value={value}
          maxLength={over ? undefined : max}
          placeholder={placeholder}
          aria-invalid={over || flagged || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        {max !== undefined ? (
          <small className={over ? "is-warn" : undefined}>
            {value.length}/{max}
          </small>
        ) : (
          <span />
        )}
        <GavelLineSizeFontControls
          style={style}
          size={size}
          ariaLabel={label}
          onChange={onStyle}
        />
      </div>
    );
  };

  return (
    <div
      className="gf-bulk-text-preview is-editable"
      data-preview-focus="band"
      data-bulk-editor-row={row.id}
    >
      <div className="gf-bulk-row-nav">
        <button
          type="button"
          className="gf-bulk-icon"
          aria-label="Previous row"
          disabled={index <= 0}
          onClick={() => onSelect(index - 1)}
        >
          ‹
        </button>
        <p className="gf-sub-title">
          Row {index + 1} of {total} · gavel band
        </p>
        <button
          type="button"
          className="gf-bulk-icon"
          aria-label="Next row"
          disabled={index >= total - 1}
          onClick={() => onSelect(index + 1)}
        >
          ›
        </button>
      </div>
      {row.texts.map((text, lineIndex) =>
        field(
          `band-${lineIndex}`,
          bandLabels[lineIndex],
          text,
          lineLimit(lineIndex),
          lineIndex === 0 && Boolean(issues?.missingRequired),
          lineIndex === 0 ? "Required" : "Optional",
          lineStyle(lineIndex, "band"),
          gavelBulkLineTextSize(row, lineIndex, textSize),
          (value) => onEditBand(index, lineIndex, value),
          (changes) => onEditBandStyle(index, lineIndex, changes),
        ),
      )}
      {secondaryTitle && secondaryCount > 0 ? (
        <>
          <p className="gf-sub-title">{secondaryTitle}</p>
          {row.secondaryTexts.slice(0, secondaryCount).map((text, lineIndex) =>
            field(
              `secondary-${lineIndex}`,
              secondaryLabels[lineIndex],
              text,
              secondaryUsesBandLimit ? lineLimit(lineIndex, "secondary") : undefined,
              Boolean(issues?.overCells.has(`secondary-${lineIndex}`)),
              "Optional",
              lineStyle(lineIndex, "secondary"),
              gavelBulkLineTextSize(row, lineIndex, textSize, "secondary"),
              (value) => onEditSecondary(index, lineIndex, value),
              (changes) => onEditSecondaryStyle(index, lineIndex, changes),
            ),
          )}
        </>
      ) : secondaryTitle ? (
        <p className="gf-note">
          The {secondaryTitle.toLowerCase()} repeats the band text of this row.
        </p>
      ) : null}
      {duplicateOf !== null ? (
        <p className="gf-bulk-row-warning">
          Same wording as row {duplicateOf}. Raise that row&apos;s Qty instead
          if you need more than one.
        </p>
      ) : null}
      <div className="gf-bulk-row-settings">
        <div className="gf-bulk-row-qty">
          <span aria-hidden="true">Qty</span>
          <QuantityCell
            quantity={row.quantity}
            label={`Row ${index + 1} quantity`}
            className="gf-input"
            onChange={(value) => onEditQuantity(index, value)}
          />
        </div>
      </div>
      <p className="gf-note">Changes apply to this gavel only.</p>
    </div>
  );
}

/**
 * The bulk name list as a real table, so every column takes the width its
 * longest entry needs. Cells are inputs styled to read as plain text until
 * clicked, and focusing a row previews it.
 */
export function GavelBulkRowsTable({
  entries,
  selectedIndex,
  textSize,
  secondaryCount,
  bandLabels,
  secondaryLabels,
  secondaryUsesBandLimit,
  sortKey,
  sortAscending,
  searchQuery,
  onSort,
  onSelect,
  onEditBand,
  onEditSecondary,
  onEditQuantity,
  onEditTextSize,
  onDuplicate,
  onDelete,
}: Props) {
  /** Everything after the # column: band, secondary, size, qty, actions. */
  const columnCount = 4 + secondaryCount + 3;

  const sortHeader = (key: GavelBulkSortKey, label: string) => (
    <th
      key={key}
      scope="col"
      aria-sort={
        sortKey === key ? (sortAscending ? "ascending" : "descending") : undefined
      }
    >
      <button type="button" onClick={() => onSort(key)}>
        {label}
        {sortMark(sortKey === key, sortAscending)}
      </button>
    </th>
  );

  return (
    <div className="gf-bulk-table-wrap">
      <table className="gf-bulk-table" aria-label="Name list">
        <thead>
          <tr>
            <th scope="col" className="gf-bulk-num">
              #
            </th>
            {(["line1", "line2", "line3", "line4"] as const).map((key, index) =>
              sortHeader(key, bandLabels[index]),
            )}
            {Array.from({ length: secondaryCount }, (_, index) =>
              sortHeader(
                `secondary${index + 1}` as GavelBulkSortKey,
                secondaryLabels[index],
              ),
            )}
            <th scope="col">Size</th>
            {sortHeader("quantity", "Qty")}
            <th scope="col">
              <span className="gf-visually-hidden">Row actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map(({ row, index, issues }) => {
            const rowNumber = index + 1;
            const lineLimit = (
              lineIndex: number,
              surface: "band" | "secondary" = "band",
            ) =>
              GAVEL_MAX_CHARS_PER_LINE[
                gavelBulkLineTextSize(row, lineIndex, textSize, surface)
              ];
            const hasError = issues.overCells.size > 0 || issues.missingRequired;
            const messages = describeIssues(row, issues, {
              textSize,
              bandLabels,
              secondaryLabels,
              secondaryUsesBandLimit,
            });

            const cell = (
              key: string,
              value: string,
              label: string,
              max: number | undefined,
              placeholder: string,
              onChange: (value: string) => void,
            ) => {
              const flagged =
                issues.overCells.has(key) ||
                (key === "band-0" && issues.missingRequired);
              const over = max !== undefined && value.length > max;
              return (
                <td key={key} className={flagged ? "is-flagged" : undefined}>
                  <input
                    className="gf-bulk-cell"
                    value={value}
                    style={{ minWidth: cellMinWidth(value, placeholder) }}
                    maxLength={over ? undefined : max}
                    placeholder={placeholder}
                    aria-label={`Row ${rowNumber}, ${label}`}
                    aria-invalid={flagged || undefined}
                    spellCheck={false}
                    onChange={(event) => onChange(event.target.value)}
                  />
                </td>
              );
            };

            return [
              <tr
                key={row.id}
                data-bulk-row={row.id}
                className={[
                  selectedIndex === index ? "is-selected" : "",
                  hasError ? "is-error" : "",
                  !hasError && issues.duplicateOf !== null ? "is-duplicate" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onFocus={() => {
                  if (selectedIndex !== index) onSelect(index);
                }}
              >
                <td className="gf-bulk-num">{rowNumber}</td>
                {row.texts.map((text, lineIndex) =>
                  cell(
                    `band-${lineIndex}`,
                    text,
                    bandLabels[lineIndex],
                    lineLimit(lineIndex),
                    lineIndex === 0 ? "Required" : "—",
                    (value) => onEditBand(index, lineIndex, value),
                  ),
                )}
                {row.secondaryTexts.slice(0, secondaryCount).map((text, lineIndex) =>
                  cell(
                    `secondary-${lineIndex}`,
                    text,
                    secondaryLabels[lineIndex],
                    secondaryUsesBandLimit
                      ? lineLimit(lineIndex, "secondary")
                      : undefined,
                    "—",
                    (value) => onEditSecondary(index, lineIndex, value),
                  ),
                )}
                <td>
                  <select
                    className={`gf-bulk-cell gf-bulk-size${row.textSize ? " is-override" : ""}`}
                    value={row.textSize ?? ""}
                    aria-label={`Row ${rowNumber} text size`}
                    onChange={(event) => onEditTextSize(index, event.target.value)}
                  >
                    <option value="">Same ({textSize})</option>
                    {GAVEL_TEXT_SIZE_PRESETS.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <QuantityCell
                    quantity={row.quantity}
                    label={`Row ${rowNumber} quantity`}
                    onChange={(value) => onEditQuantity(index, value)}
                  />
                </td>
                <td className="gf-bulk-row-actions">
                  <button
                    type="button"
                    className="gf-bulk-icon"
                    aria-label={`Duplicate row ${rowNumber}`}
                    title="Duplicate row"
                    onClick={() => onDuplicate(index)}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" />
                      <path d="M3 10.5V3.5A1 1 0 0 1 4 2.5h6.5" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="gf-bulk-icon is-danger"
                    aria-label={`Delete row ${rowNumber}`}
                    title="Delete row"
                    onClick={() => onDelete(index)}
                  >
                    <svg viewBox="0 0 16 16" aria-hidden="true">
                      <path d="M4 4l8 8M12 4l-8 8" />
                    </svg>
                  </button>
                </td>
              </tr>,
              messages.length > 0 ? (
                <tr
                  key={`${row.id}-issues`}
                  className={`gf-bulk-issue ${hasError ? "is-error" : "is-duplicate"}`}
                >
                  <td />
                  <td colSpan={columnCount}>
                    {messages.join(" ")}
                    {issues.overCells.size > 0 ? " Pick a smaller Size for this row, or shorten it." : ""}
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
      {entries.length === 0 ? (
        <p className="gf-bulk-grid-empty">
          {searchQuery ? `No rows match “${searchQuery}”.` : "No rows to show."}
        </p>
      ) : null}
    </div>
  );
}
