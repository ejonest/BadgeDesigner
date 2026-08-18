/**
 * ============================================================
 * SELECTORS — AQB badge designer, DEV route
 * ============================================================
 * Target: `/badge-designer-redesign` on the local dev server.
 * There is NO iframe here — the designer is the page. (The production
 * storefront embeds the same app in #badge-designer-iframe; that is not
 * what this suite drives.)
 *
 * Every selector below was read off the running dev DOM, not inferred
 * from screenshots.
 *
 * Step order in the dev DOM, including the two steps that only appear
 * once an earlier choice is made:
 *   1   Pick a Shape
 *   1b  Pick a Style        (appears after a shape is chosen)
 *   2   Pick a Color
 *   2b  Add an Icon         (appears after a color is chosen; requires an
 *                            explicit No/Yes — there is no default, which is
 *                            the Issue 17 friction point in golden-path.md)
 *   3   Add Your Text
 *   4   Pick a Backing      -> opens the "Ready to checkout…?" modal
 * ============================================================
 */

/** Framework dimension id → shape card title (note the inch mark) */
const TEMPLATE_TITLES = {
  'rounded-corners-1x3': 'Rounded Corners 1 x 3"',
  'rounded-corners-1.5x3': 'Rounded Corners 1.5 x 3"',
  'oval-1.5x3': 'Oval 1.5 x 3"',
  'house-1.5x3': 'House 1.5 x 3"',
};

/** Framework color id → swatch label */
const BACKGROUND_TITLES = {
  white: 'White',
  'brushed-gold': 'Brushed Gold',
  'brushed-silver': 'Brushed Silver',
  black: 'Black',
  red: 'Red',
  blue: 'Blue',
};

/** Framework icon id → icon picker cell `title` */
const ICON_LABELS = {
  none: null,
  cross: 'Cross',
  'praying-hands': 'Praying hands',
  stethoscope: 'Stethoscope',
  'house-key': 'House & key',
  'coffee-cup': 'Coffee',
  coffee: 'Coffee',
  storefront: 'Storefront',
  tooth: 'Tooth',
  'chef-hat': 'Chef hat',
  'fork-knife': 'Knife & fork',
  'grad-cap': 'Graduation cap',
  'paw-print': 'Paw print',
  'medical-cross': 'Medical cross',
  footprints: 'Baby feet',
  plane: 'Airplane',
  apple: 'Apple',
};

/** Framework text-color id → swatch `title` (hex) in the dev DOM */
const TEXT_COLOR_HEX = {
  navy: '#0D1B2A',
  black: '#0D1B2A',
  gold: '#C8962A',
  red: '#C0392B',
  blue: '#1A5C8E',
};

/** Framework font slug → listbox option label */
const FONT_LABELS = {
  roboto: 'Roboto',
  inter: 'Inter',
  'open-sans': 'Open Sans',
  lato: 'Lato',
  montserrat: 'Montserrat',
  oswald: 'Oswald',
  'source-sans-3': 'Source Sans 3',
  raleway: 'Raleway',
  'pt-sans': 'PT Sans',
  cabin: 'Cabin',
  nunito: 'Nunito',
  'roboto-mono': 'Roboto Mono',
  merriweather: 'Merriweather',
  'noto-sans': 'Noto Sans',
};

/** Framework backing id → option label (menu shows "🧲 Magnetic — +$1.00") */
const BACKING_NAME = {
  magnetic: 'Magnetic',
  pin: 'Pin',
  adhesive: 'Adhesive',
};

/** Surcharge shown in the backing menu, used for the price check. */
const BACKING_SURCHARGE = {
  magnetic: 1.0,
  pin: 0.5,
  adhesive: 0.0,
};

function escapeAttr(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

module.exports = {
  /** Dev sandbox route — the designer renders directly, no iframe.
   *  `qaTest=1` marks every Supabase order-item row with is_qa_test=true. */
  productPageUrl: '/badge-designer-redesign?qaTest=1',

  dismissReminder: 'button[aria-label="Dismiss reminder"]',

  // --- Step 1: shape -------------------------------------------------
  templateOption: (id) => {
    const title = TEMPLATE_TITLES[id];
    if (!title) throw new Error(`Unknown template id: ${id}`);
    // Titles carry a trailing inch mark; prefix match keeps it robust.
    return `button[title^="${escapeAttr(title.replace(/"$/, ''))}"]`;
  },

  // --- Step 1b: style ------------------------------------------------
  plainStyleCard: 'button:has-text("Plain color badge")',
  /** Pre-designed cards are titled "Category · Name". */
  preDesignedStyleCard: 'button[title*="\u00b7"]',

  // --- Step 2: background color --------------------------------------
  backgroundColorOption: (id) => {
    const name = BACKGROUND_TITLES[id];
    if (!name) throw new Error(`Unknown backgroundColor id: ${id}`);
    return `button[title="${escapeAttr(name)}"]`;
  },

  // --- Step 2b: icon gate --------------------------------------------
  iconGateNo: 'button.aqb-badge-icon-gate__toggle-btn:has-text("No")',
  iconGateYes: 'button.aqb-badge-icon-gate__toggle-btn:has-text("Yes")',
  iconContinue: 'button.aqb-badge-icon-gate__continue',
  iconOption: (id) => {
    const label = ICON_LABELS[id];
    if (!label) return null;
    return `button.aqb-badge-icon-picker__cell[title="${escapeAttr(label)}"]`;
  },

  // --- Step 3: text ---------------------------------------------------
  textLine1Input: 'input[placeholder*="name or organization"]',
  textLine2Input: 'input[placeholder*="role or title"]',
  addLineButton: 'button:has-text("Add line")',

  fontTrigger: (line = 1) => `button[aria-label="Font for line ${line}"]`,
  fontListbox: '[role="listbox"]',
  fontOptionLabel: (id) => FONT_LABELS[id] || id,

  textColorSwatch: (id) => {
    const hex = TEXT_COLOR_HEX[id];
    if (!hex) throw new Error(`Unknown textColor id: ${id}`);
    return `button.aqb-badge-tc-sw[title="${escapeAttr(hex)}"]`;
  },

  // --- Step 4: backing ------------------------------------------------
  backingTrigger: 'button.aqb-backing-select-trigger',
  backingOption: (id) => {
    const name = BACKING_NAME[id];
    if (!name) throw new Error(`Unknown backing id: ${id}`);
    return `button:has-text("${escapeAttr(name)}")`;
  },

  // --- "Ready to checkout…?" modal (opens after a backing is picked) ---
  readyModal: '.fixed.inset-0:has-text("Ready to checkout")',
  readyModalCheckout: 'button:has-text("Checkout \u00b7")',
  readyModalAddMore: 'button:has-text("Add more")',
  readyModalBackToDesign: 'button:has-text("Go back to design")',

  // --- Bulk CSV path ---------------------------------------------------
  addMultipleButton: 'button[aria-label="Add Multiple"]',
  csvTextarea: 'textarea',
  addBadgesButton: 'button:has-text("Add Badges")',
  overrideCurrentButton: 'button:has-text("Override Current")',

  // --- Add to cart / proof --------------------------------------------
  // Two exist: a hidden mobile bar and the visible desktop panel button.
  addToCartButton: 'button.aqb-atc-btn--panel',
  addToCartInactive: 'button.aqb-atc-btn--panel.aqb-atc-btn--inactive',
  proofModal: '[role="dialog"][aria-label="Review your proof"]',
  /** PDF.js renders the proof to a canvas — its presence proves the PDF built. */
  proofCanvas: '[role="dialog"][aria-label="Review your proof"] canvas',
  reviewProofCheckbox:
    '[role="dialog"][aria-label="Review your proof"] input[type="checkbox"]',
  reviewProofLabel: 'Yes, all checked and good to go',
  confirmAddToCartButton: 'button:has-text("Confirm and Add to Cart")',
  backToEditButton: 'button:has-text("Back to Edit")',

  TEMPLATE_TITLES,
  BACKGROUND_TITLES,
  ICON_LABELS,
  TEXT_COLOR_HEX,
  FONT_LABELS,
  BACKING_NAME,
  BACKING_SURCHARGE,
};
