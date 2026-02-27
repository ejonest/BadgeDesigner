// @ts-check
/**
 * Cart/checkout validation: duplicate badge rules.
 * 1) Every line with "Duplicate Set" = "Yes" must have matching original (same Design ID, qty).
 * 2) Total quantity of "Duplicate Set" lines must not exceed 5.
 *
 * Use with run.graphql that requests cart.lines { id, quantity, designId: attribute(key: "Design ID") { value }, duplicateSet: attribute(key: "Duplicate Set") { value } }.
 * If your Functions API uses different field names (e.g. customAttributes), adjust the input shape below.
 *
 * @typedef {{ value?: string }} AttributeValue
 * @typedef {{ id: string; quantity: number; designId?: AttributeValue; duplicateSet?: AttributeValue }} CartLine
 * @typedef {{ lines?: CartLine[] }} Cart
 * @typedef {{ cart?: Cart }} CartValidationsGenerateRunInput
 * @typedef {{ operations: Array<{ validationAdd?: { errors: Array<{ message: string; target: string }> } }> }} CartValidationsGenerateRunResult
 */

const MAX_DUPLICATE_QUANTITY = 5;
const DUPLICATE_SET_VALUE = "Yes";

/**
 * @param {CartValidationsGenerateRunInput} input
 * @returns {CartValidationsGenerateRunResult}
 */
export function cartValidationsGenerateRun(input) {
  const errors = [];
  const cart = input.cart;
  const lines = cart?.lines ?? [];

  // Build map: designId -> { originalQty, duplicateQty }
  const byDesignId = new Map();

  for (const line of lines) {
    const qty = Number(line.quantity) || 0;
    const designId = (line.designId?.value ?? "").trim();
    const isDuplicate = (line.duplicateSet?.value ?? "").trim() === DUPLICATE_SET_VALUE;

    if (!designId) continue;

    if (!byDesignId.has(designId)) {
      byDesignId.set(designId, { originalQty: 0, duplicateQty: 0 });
    }
    const entry = byDesignId.get(designId);
    if (isDuplicate) {
      entry.duplicateQty += qty;
    } else {
      entry.originalQty += qty;
    }
  }

  // Total duplicate quantity (across all designs)
  let totalDuplicateQty = 0;
  for (const entry of byDesignId.values()) {
    totalDuplicateQty += entry.duplicateQty;
  }

  if (totalDuplicateQty > MAX_DUPLICATE_QUANTITY) {
    errors.push({
      message: "Maximum 5 reduced-price duplicate badges per order.",
      target: "$.cart",
    });
  }

  for (const [designId, { originalQty, duplicateQty }] of byDesignId) {
    if (duplicateQty === 0) continue;
    if (originalQty < duplicateQty) {
      errors.push({
        message: "Duplicate set must be purchased with the original set.",
        target: "$.cart",
      });
      break;
    }
  }

  const operations = errors.length
    ? [{ validationAdd: { errors } }]
    : [];

  return { operations };
}
