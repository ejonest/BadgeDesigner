/**
 * Customer personas — behavioral test scenarios, not just parameter
 * combinations. Each one simulates a realistic pattern of human
 * behavior (going back, closing the tab, waiting, making a mistake)
 * rather than a single clean pass through the tool.
 *
 * The actual step-by-step logic for each lives in
 * tests/customer-personas.spec.js — this file is just the description/
 * metadata, kept separate so the "what and why" is easy to read without
 * wading through Playwright code.
 */

module.exports = [
  {
    id: 'persona-efficient-emma',
    name: 'Efficient Emma',
    description:
      'Follows the golden path exactly, no mistakes: shape → style → skip icon → ' +
      'name+title → magnetic backing → bulk CSV for multiple badges → checkout. ' +
      'This is the baseline the tool should make effortless — if this persona ' +
      'struggles, the "ideal" path itself has friction.',
  },
  {
    id: 'persona-clumsy-carl',
    name: 'Clumsy Carl',
    description:
      'Picks the wrong background color first, notices, goes back and changes it ' +
      'AFTER already picking an icon and typing text. Validates that earlier ' +
      'corrections properly update everything downstream (icon contrast, preview) ' +
      'rather than leaving stale state from the first choice.',
  },
  {
    id: 'persona-backtracking-betty',
    name: 'Backtracking Betty',
    description:
      'Completes a full design, reaches the "Review your proof" step, decides ' +
      'something needs changing, goes back to edit, changes the text, and ' +
      're-confirms. Validates that the FINAL edited version is what actually ' +
      'reaches the cart — not the original pre-edit version (directly probes ' +
      'the Issue 15 flash-to-blank-template regression risk).',
  },
  {
    id: 'persona-interrupted-ian',
    name: 'Interrupted Ian',
    description:
      'Starts a design, gets partway through, then "closes the laptop" ' +
      '(simulated by closing the page and opening a fresh one after a delay) ' +
      'before finishing. Separately, adds a badge fully to cart, then closes ' +
      'and reopens to confirm the CART survives even though in-progress design ' +
      'state may not. Documents current behavior rather than assuming a pass/fail ' +
      '— the point is to know what actually happens, since this is a common real ' +
      'customer pattern (walk away mid-order, come back later).',
  },
  {
    id: 'persona-returning-rachel',
    name: 'Returning Rachel',
    description:
      'Completes and pays for an order, closes the tab, then comes back days ' +
      'later wanting to check her order or reorder the same badge for a new ' +
      'hire. Tests whether a guest (non-account) customer has any real path ' +
      'back to her order history, since the tool\'s own "Sign in to save and ' +
      'reorder in one click" messaging implies guests may not.',
  },
];
