/**
 * AQB badge designer — configurable options.
 *
 * Read off the running dev DOM (`/badge-designer-redesign`), not inferred
 * from screenshots. `textColor` lists only the quick swatches the tool
 * actually exposes on a text line; "same as background" is rendered but
 * permanently disabled, so it is not a testable option.
 */

module.exports = {
  template: [
    'rounded-corners-1x3',
    'rounded-corners-1.5x3',
    'oval-1.5x3',
    'house-1.5x3',
  ],

  badgeStyle: [
    'plain-color',
    'pre-designed',
  ],

  backgroundColor: [
    'white',
    'brushed-gold',
    'brushed-silver',
    'black',
    'red',
    'blue',
  ],

  icon: [
    'none',
    'cross',
    'praying-hands',
    'stethoscope',
    'house-key',
    'coffee-cup',
    'storefront',
    'tooth',
    'chef-hat',
    'fork-knife',
    'grad-cap',
    'paw-print',
    'medical-cross',
    'footprints',
    'plane',
    'apple',
  ],

  textColor: [
    'navy',
    'gold',
    'red',
    'blue',
  ],

  font: [
    'montserrat',
    'oswald',
    'source-sans-3',
    'raleway',
    'pt-sans',
    'cabin',
    'nunito',
    'roboto-mono',
    'merriweather',
    'noto-sans',
  ],

  textLength: [
    'short',
    'typical',
    'long-3-line',
  ],

  backing: [
    'magnetic',
    'pin',
    'adhesive',
  ],

  orderType: [
    'single-badge',
    'multi-badge-csv',
  ],

  bulkQuantity: [2, 10, 50],
};
