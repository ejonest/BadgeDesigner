/**
 * Sign-only defaults and copy. Badge designer keeps using BADGE_CONSTANTS / inline badge copy.
 * Edit the arrays and strings below to tune the sign experience without affecting badges.
 */
import type { BadgeLine } from "../types/badge";
import {
  type DesignerVariant,
  isSignLikeVariant,
} from "./designerVariants";

/** Default text for new sign lines (line 1, line 2, …). Extra sign lines stay empty. */
export const SIGN_DEFAULT_LINE_TEXTS: readonly string[] = [
  "Your Name",
  "Title",
];

export type AddMultipleDesignerCopy = {
  csvModalSteps: readonly string[];
  csvExampleRows: readonly string[];
  csvTextareaPlaceholder: string;
  addMultipleHelpParagraph: string;
};

function badgeAddMultipleCopy(maxLines: number): AddMultipleDesignerCopy {
  return {
    csvModalSteps: [
      "1. You can upload a CSV file or paste CSV data below.",
      "2. Each row should represent one badge.",
      "3. Use a comma (,) between each line of text on the badge.",
      `4. Add up to ${maxLines} text lines per row.`,
      "5. Add as many rows as you want.",
    ],
    csvExampleRows: [
      "Names,Title,Company",
      "John Doe,Manager,Corporate",
      "Jane Smith,Developer,1st Division",
    ],
    csvTextareaPlaceholder: "Paste CSV data here...",
    addMultipleHelpParagraph:
      "You can upload a comma-separated CSV with up to {maxLines} entries per row, with each row becoming its own badge. Don't have a file? Use the dialog box to add badges directly in the same format.",
  };
}

function signAddMultipleCopy(maxLines: number): AddMultipleDesignerCopy {
  return {
    csvModalSteps: [
      "1. You can upload a CSV file or paste CSV data below.",
      "2. Each row should represent one sign.",
      "3. Use a comma (,) between each line of text on the sign.",
      `4. Add up to ${maxLines} text lines per row.`,
      "5. Add as many rows as you want.",
    ],
    csvExampleRows: [
      "Employees, Only",
      "Danger!, Do Not Enter",
      "Manager's, Office",
    ],
    csvTextareaPlaceholder: "Paste CSV data here...",
    addMultipleHelpParagraph:
      "You can upload a comma-separated CSV with up to {maxLines} entries per row, with each row becoming its own sign. Don't have a file? Use the dialog box to add signs directly in the same format.",
  };
}

/** Copy for the CSV modal and the Help → “Add Multiple” card. */
export function getAddMultipleDesignerCopy(
  variant: DesignerVariant,
  maxLines: number,
): AddMultipleDesignerCopy {
  const base = isSignLikeVariant(variant)
      ? signAddMultipleCopy(maxLines)
      : badgeAddMultipleCopy(maxLines);
  return {
    ...base,
    addMultipleHelpParagraph: base.addMultipleHelpParagraph.replace(
      "{maxLines}",
      String(maxLines),
    ),
  };
}

/**
 * Initial text lines for the designer (before / beside template pick).
 * Badge: same geometry as BADGE_CONSTANTS.INITIAL_BADGE, padded to maxLines.
 * Sign: same, but line text comes from SIGN_DEFAULT_LINE_TEXTS where provided.
 */
export function buildPaddedInitialLines(
  variant: DesignerVariant,
  maxLines: number,
  initialBadgeLines: readonly BadgeLine[],
  defaultLineShape: BadgeLine,
): BadgeLine[] {
  return Array.from({ length: maxLines }, (_, i) => {
    const base: BadgeLine =
      i < initialBadgeLines.length
        ? { ...initialBadgeLines[i] }
        : {
            ...defaultLineShape,
            id: `line-${i + 1}`,
            text: "",
          };
    if (isSignLikeVariant(variant)) {
      const text =
        i < SIGN_DEFAULT_LINE_TEXTS.length ? SIGN_DEFAULT_LINE_TEXTS[i] : "";
      return { ...base, id: `line-${i + 1}`, text };
    }
    return { ...base, id: `line-${i + 1}` };
  });
}
