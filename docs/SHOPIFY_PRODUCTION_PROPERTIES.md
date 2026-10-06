# Shopify production line-item properties

Designer orders keep their existing customer-facing text properties. The
properties below are additional production fields. Their names start with `_`,
so Shopify stores them on the order but does not show them in the standard
cart, checkout, or order summary.

The Shopify-to-Trello integration must copy private line-item properties; it
must not discard names beginning with `_`.

## Shared line fields

For each non-empty text line, the designer writes:

- `_<Surface> Line <N> Font`
- `_<Surface> Line <N> Font Size`
- `_<Surface> Line <N> Color` (when the designer supplies a color)
- `_<Surface> Line <N> Alignment` (when supplied)
- `_<Surface> Line <N> Bold`
- `_<Surface> Line <N> Italic`
- `_<Surface> Line <N> Underline`

Bold, italic, and underline are `Yes` or `No`. Numeric designer sizes are
stored as pixels when available; normalized sizes are stored as a percentage
of the design height. Designers that use named presets store the preset name.

## Gavels Fast surfaces

### Gavel

- Existing visible text: `Gavel Text Line 1` through `Gavel Text Line 4`
- Shared line prefix: `Gavel`
- Existing product fields remain: `_Product Type`, `_Gavel Style`,
  `_Band Finish`, `_Text Size`, `_Velour Bag`

For a stand:

- Existing visible text: `Stand Plate Line <N>`
- Shared line prefix: `Stand Plate`
- Existing fields remain: `_Plate Finish`, `_Production Method`

For an engraved sound block:

- Existing visible combined text: `Sound Block Text`
- Shared line prefix: `Sound Block`
- The individual text is also stored as `_Sound Block Line <N> Text`
- Existing fields remain: `_Sound Block`, `_Sound Block Shape`

### Pen

The single-line surfaces omit `Line 1` from their property names:

- `_Case Band Font`, `_Case Band Font Size`, `_Case Band Color`,
  `_Case Band Alignment`, `_Case Band Bold`, `_Case Band Italic`,
  `_Case Band Underline`
- `_Pen Cap Font`, `_Pen Cap Font Size`, `_Pen Cap Color`,
  `_Pen Cap Alignment`, `_Pen Cap Bold`, `_Pen Cap Italic`,
  `_Pen Cap Underline`

Existing text and product fields remain: `Case Band Text`, `Pen Cap Text`,
`_Case Band Artwork`, `_Pen Cap Artwork`, `_Case Band Mode`, `_Pen Cap Mode`,
and `_Pen Style`.

### Trophy

- Existing visible text: `Trophy Text Line 1` through `Trophy Text Line 4`
- Shared line prefix: `Trophy`
- Font size is `Small`, `Medium`, or `Large`
- Existing fields remain: `_Trophy Award`, `_Plate Finish`

### Plaque

- Existing visible text: `Badge Text Line 1` through `Badge Text Line 4`
- Shared line prefix: `Plaque`
- New product fields: `_Plaque Layout`, `_Plaque Size`, `_Plate Finish`

### Desk sign

- Existing visible text: `Badge Text Line 1` through `Badge Text Line 4`
- Shared line prefix: `Desk Sign`
- Existing product fields remain: `_Material`, `_Size`, `_Acrylic Finish`,
  `_Mount Type`, `_Aluminum Frame`
