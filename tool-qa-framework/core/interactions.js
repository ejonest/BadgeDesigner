// @ts-check

/**
 * ============================================================
 * INTERACTIONS — tool-agnostic click/fill helpers
 * ============================================================
 * The designer is a tall single-column form with several sticky panels
 * ("Your order", the mobile checkout bar). Those panels genuinely cover
 * controls further down the page, which is a real layout finding — but
 * it should not silently hang a whole suite for 30s per click.
 *
 * `safeClick` therefore does three things in order:
 *   1. scroll the target to the middle of the viewport and click normally
 *      (this is what a real customer does, and it exercises real hit-testing)
 *   2. if the click is intercepted, record WHICH element covered it
 *   3. fall back to a direct DOM click so the flow can continue
 *
 * Anything recorded in step 2 is surfaced as an `obscured-control`
 * annotation on the test, so a covered control shows up in the report
 * as a finding rather than disappearing into a workaround.
 * ============================================================
 */

/** Per-run record of controls that had to fall back to a DOM click. */
function createObscuredLog() {
  return [];
}

/**
 * Scroll to, then click, a locator — reporting rather than hiding overlap.
 *
 * @param {import('@playwright/test').Locator} locator
 * @param {{ label: string, obscured?: string[], timeout?: number }} opts
 */
async function safeClick(locator, { label, obscured, timeout = 10_000 }) {
  const el = locator.first();
  await el.waitFor({ state: 'visible', timeout });
  await el.evaluate((node) =>
    node.scrollIntoView({ block: 'center', behavior: 'instant' }),
  );
  // Let sticky panels settle after the scroll before hit-testing.
  await el.page().waitForTimeout(150);

  try {
    await el.click({ timeout: 3_000 });
    return;
  } catch {
    const cover = await el
      .evaluate((node) => {
        const r = node.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        if (!top || node.contains(top)) return null;
        const cls = (top.className || '').toString().trim().split(/\s+/).slice(0, 3).join('.');
        return cls || top.tagName;
      })
      .catch(() => null);

    if (cover && obscured) {
      obscured.push(`"${label}" was covered by <${cover}>`);
    }
    // Keep the flow alive; the overlap is already recorded above.
    await el.evaluate((node) => node.click());
  }
}

/**
 * Click a control only if it is present within a short window.
 * Returns true when the click happened.
 */
async function clickIfPresent(locator, { label, obscured, timeout = 2_500 }) {
  const el = locator.first();
  const there = await el.isVisible({ timeout }).catch(() => false);
  if (!there) return false;
  await safeClick(el, { label, obscured, timeout });
  return true;
}

/** Fill a controlled React input so its onChange state actually updates. */
async function fillInput(locator, value, { timeout = 10_000 } = {}) {
  const el = locator.first();
  await el.waitFor({ state: 'visible', timeout });
  await el.fill(String(value ?? ''));
}

module.exports = { safeClick, clickIfPresent, fillInput, createObscuredLog };
