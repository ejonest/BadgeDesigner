export const BADGE_LINE_QTY_MIN = 1;
export const BADGE_LINE_QTY_MAX = 999_999;

export function clampBadgeLineQty(n: number): number {
  if (!Number.isFinite(n)) return BADGE_LINE_QTY_MIN;
  return Math.max(
    BADGE_LINE_QTY_MIN,
    Math.min(BADGE_LINE_QTY_MAX, Math.floor(n)),
  );
}

/** Keep per-line qty array aligned when badge design count changes. */
export function syncBadgeLineQuantities(
  designCount: number,
  prev: number[] | undefined,
): number[] {
  const n = Math.max(0, Math.floor(designCount));
  const prior = prev ?? [];
  if (n === 0) return [];
  if (prior.length === n) return prior.map(clampBadgeLineQty);
  if (prior.length < n) {
    return [
      ...prior.map(clampBadgeLineQty),
      ...Array.from({ length: n - prior.length }, () => BADGE_LINE_QTY_MIN),
    ];
  }
  return prior.slice(0, n).map(clampBadgeLineQty);
}

export function sumBadgeLineQuantities(qtys: number[]): number {
  return qtys.reduce((s, q) => s + clampBadgeLineQty(q), 0);
}

/** True when every line has the same qty (and at least one line). */
export function allBadgeLineQuantitiesEqual(qtys: number[]): boolean {
  if (qtys.length === 0) return true;
  const first = clampBadgeLineQty(qtys[0]);
  return qtys.every((q) => clampBadgeLineQty(q) === first);
}

export function uniformBadgeLineQty(qtys: number[]): number | null {
  if (qtys.length === 0 || !allBadgeLineQuantitiesEqual(qtys)) return null;
  return clampBadgeLineQty(qtys[0]);
}

export function setAllBadgeLineQuantities(count: number, each: number): number[] {
  const n = Math.max(0, Math.floor(count));
  const q = clampBadgeLineQty(each);
  return Array.from({ length: n }, () => q);
}

export function bumpAllBadgeLineQuantities(
  qtys: number[],
  delta: number,
): number[] {
  if (delta === 0) return qtys.map(clampBadgeLineQty);
  return qtys.map((q) => {
    const next = clampBadgeLineQty(q) + delta;
    return clampBadgeLineQty(next);
  });
}

export function insertBadgeLineQtyAt(
  qtys: number[],
  index: number,
  value: number,
): number[] {
  const next = [...qtys];
  next.splice(index + 1, 0, clampBadgeLineQty(value));
  return next;
}

export function removeBadgeLineQtyAt(qtys: number[], index: number): number[] {
  return qtys.filter((_, i) => i !== index);
}
