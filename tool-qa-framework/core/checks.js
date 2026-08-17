/**
 * Generic checks any tool profile can use. Profiles supply the
 * specifics (their own price table, any extra leak patterns unique to
 * their setup) — this module supplies the sensible defaults and the
 * comparison logic, so no profile has to reimplement "is this string
 * suspicious" or "does this price match" from scratch.
 */

// Patterns that indicate raw internal/developer fields leaking into a
// customer-facing page — these are generic enough to apply to any
// Shopify-based custom design tool, not just AQB's badge designer. Any
// profile can extend this list (see profiles/aqb-badge-tool/config.js)
// with fields specific to its own design tool's data model.
const DEFAULT_LEAKED_FIELD_PATTERNS = [
  /Design ID\s*:/i,
  /Gadget Design ID\s*:/i,
  /Sign Index\s*:/i,
  /Plaque Index\s*:/i,
  /Badge Index\s*:/i,
  /Item Index\s*:/i,
  /Custom (Badge|Design)\s*:\s*Yes/i,
  /Designer\s*:\s*\w+/i,
  /supabase\.co\/storage/i, // raw storage URL — generic red flag regardless of tool
  /vercel\.app/i,           // internal design-tool hostname leaking into customer text
];

/**
 * Scans visible page text for known "should be hidden" internal
 * fields. `extraPatterns` lets a profile add its own on top of the
 * generic defaults. Returns an array of matches (empty = clean).
 */
function findLeakedFields(pageText, extraPatterns = []) {
  const found = [];
  for (const pattern of [...DEFAULT_LEAKED_FIELD_PATTERNS, ...extraPatterns]) {
    const match = pageText.match(pattern);
    if (match) found.push(match[0]);
  }
  return found;
}

/**
 * Builds a price-checking function from a profile's own pricing model.
 * Profiles define `basePrice` and a `surcharges` map keyed by whatever
 * their "backing"/"finish"/"material" option is called — this function
 * doesn't need to know that vocabulary, just the numbers.
 *
 * Usage in a profile's config:
 *   const { makePriceChecker } = require('../../core/checks');
 *   const expectedPrice = makePriceChecker({ basePrice: 5.99, surcharges: { magnetic: 1.0, pin: 0.5, adhesive: 0 } });
 */
function makePriceChecker({ basePrice, surcharges = {} }) {
  return function expectedPrice(optionKey, quantity = 1) {
    const surcharge = surcharges[optionKey] ?? 0;
    return Math.round((basePrice + surcharge) * quantity * 100) / 100;
  };
}

module.exports = {
  DEFAULT_LEAKED_FIELD_PATTERNS,
  findLeakedFields,
  makePriceChecker,
};
