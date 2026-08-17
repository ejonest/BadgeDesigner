// @ts-check

/**
 * ============================================================
 * CORE FLOW RUNNER — tool-agnostic
 * ============================================================
 * The engine. It knows how to walk a profile's design steps and then run
 * the shared "review the proof" tail. It knows nothing about badges,
 * shapes, or icons — that lives in a profile (profiles/aqb-badge-tool/).
 *
 * ------------------------------------------------------------
 * WHERE A RUN ENDS, AND WHY
 * ------------------------------------------------------------
 * This suite drives the DEV build, which has no Shopify/Gadget credentials
 * (the dev server logs `GADGET_API_KEY: 'NOT SET'`). A test therefore
 * finishes at the PDF proof:
 *
 *   design steps -> "Ready to checkout?" -> PDF proof renders
 *   -> tick acknowledgement -> Confirm and Add to Cart -> BLOCKED
 *
 * Reaching a real cart or checkout is treated as a FAILURE, not a pass:
 * it would mean the dev build is writing into the live store. Everything
 * a customer actually experiences up to and including the proof is
 * verified; nothing past it is pretended.
 *
 * ------------------------------------------------------------
 * STEP TYPE REFERENCE (used in a profile's steps array)
 * ------------------------------------------------------------
 * { type: 'click', field: 'template', selector: (value) => string }
 * { type: 'clickOptional', field: 'icon', selector: (value) => string, skipWhen: 'none' }
 * { type: 'fill', field: 'textLine1', selector: string }
 * { type: 'fillOptional', field: 'textLine2', selector: string }
 * { type: 'selectDropdown', field: 'font', selector: string }
 * { type: 'custom', field: 'icon' }  — handled via profile.applyCustomStep
 * ============================================================
 */

const { safeClick, clickIfPresent } = require('./interactions');

/** URLs that mean we escaped the dev sandbox into real commerce. */
const LIVE_COMMERCE_URL = /\/cart(\/|$|\?)|\/checkouts?\/|checkout\.shopify\.com/i;

function designRoot(page, profile) {
  return typeof profile.getRoot === 'function' ? profile.getRoot(page) : page;
}

async function applyStep(page, step, caseData, profile = {}, ctx = {}) {
  const value = caseData[step.field];
  const root = designRoot(page, profile);

  if (typeof profile.applyCustomStep === 'function') {
    const handled = await profile.applyCustomStep(root, page, step, caseData, ctx);
    if (handled) return;
  }

  switch (step.type) {
    case 'click':
      await safeClick(root.locator(step.selector(value)), {
        label: `${step.field}=${value}`,
        obscured: ctx.obscured,
      });
      break;

    case 'clickOptional':
      if (!value || value === step.skipWhen) return;
      await safeClick(root.locator(step.selector(value)), {
        label: `${step.field}=${value}`,
        obscured: ctx.obscured,
      });
      break;

    case 'fill':
      await root.locator(step.selector).first().fill(String(value ?? ''));
      break;

    case 'fillOptional':
      if (!value) return;
      await root.locator(step.selector).first().fill(String(value));
      break;

    case 'selectDropdown':
      if (!value) return;
      await root.locator(step.selector).first().selectOption(value);
      break;

    case 'custom':
      throw new Error(
        `Step field "${step.field}" is type=custom but profile.applyCustomStep did not handle it`,
      );

    default:
      throw new Error(`Unknown step type: ${step.type}`);
  }
}

/** Runs every step in a profile's `steps` array, in order, for one test case. */
async function applyAllSteps(page, profile, caseData, ctx = {}) {
  for (const step of profile.steps) {
    await applyStep(page, step, caseData, profile, ctx);
  }
}

/** Bulk CSV path: paste N rows at once instead of designing N badges. */
async function runBulkUpload(page, profile, caseData, ctx = {}) {
  const bulk = profile.bulkUpload;
  const obscured = ctx.obscured;

  // The "Ready to checkout…?" modal offers "Add more", which opens the CSV
  // dialog directly; otherwise go back to the design and use Add Multiple.
  const viaModal = await clickIfPresent(page.getByRole('button', { name: /^Add more$/i }), {
    label: 'Ready-to-checkout modal: Add more',
    obscured,
    timeout: 4_000,
  });
  if (!viaModal) {
    await clickIfPresent(page.getByRole('button', { name: /Go back to design/i }), {
      label: 'Go back to design',
      obscured,
      timeout: 3_000,
    });
    await safeClick(page.locator(bulk.addMultipleButton), {
      label: 'Add Multiple',
      obscured,
    });
  }

  const csv = bulk.csvBuilder(caseData.bulkQuantity);
  const textarea = page.locator(bulk.csvTextarea).first();
  await textarea.waitFor({ state: 'visible', timeout: 10_000 });
  await textarea.fill(csv);

  // Preview rows confirm React state accepted the paste.
  await page
    .getByText(/Preview \(\d+ rows?\)/)
    .waitFor({ state: 'visible', timeout: 10_000 })
    .catch(() => {});

  await safeClick(page.locator(bulk.addBadgesButton), { label: 'Add Badges', obscured });

  // When a design already exists, a second dialog asks Override vs Add.
  await clickIfPresent(page.getByRole('button', { name: /Override Current/i }), {
    label: 'Override Current',
    obscured,
    timeout: 4_000,
  });
}

/**
 * The shared tail: reach the PDF proof, verify it, then confirm that
 * add-to-cart is blocked in this environment.
 */
async function runProofTail(page, profile, caseData, { test, expect, findLeakedFields }, ctx = {}) {
  const p = profile.proof;
  const obscured = ctx.obscured;

  const useBulk =
    profile.bulkUpload && caseData.bulkQuantity && caseData.orderType !== 'single-badge';

  if (useBulk) {
    await runBulkUpload(page, profile, caseData, ctx);
  }

  // Price as the customer sees it, before any proof is generated.
  const priceText = await page
    .locator('body')
    .innerText()
    .then((t) => (t.match(/\$\s?\d+(?:\.\d{2})?/g) || [])[0] || '')
    .catch(() => '');

  // --- reach the proof ------------------------------------------------
  await profile.openProof(page, caseData, ctx);

  const proof = page.locator(p.modal).first();
  await proof.waitFor({ state: 'visible', timeout: 90_000 }).catch(() => {
    throw new Error(
      'PDF proof never appeared. Design steps completed but the proof modal ' +
        `did not open. Alerts seen: ${JSON.stringify(ctx.alerts || [])}`,
    );
  });

  // The proof is rendered by PDF.js into a canvas — its presence is the
  // real evidence that a valid PDF was produced, not just a modal opening.
  const canvas = page.locator(p.canvas).first();
  await canvas.waitFor({ state: 'visible', timeout: 30_000 });
  const canvasBox = await canvas.boundingBox();
  expect(
    canvasBox && canvasBox.width > 0 && canvasBox.height > 0,
    'Proof modal opened but the PDF canvas never rendered — proof generation failed',
  ).toBeTruthy();

  // Issue 14 guard: internal field names must not surface to the customer.
  const proofText = await proof.innerText();
  const leaks = findLeakedFields(proofText, profile.extraLeakPatterns || []);
  expect(leaks, `Internal fields leaked into the proof: ${leaks.join(', ')}`).toEqual([]);

  if (priceText) {
    const amount = parseFloat(priceText.replace(/[^0-9.]/g, ''));
    expect(amount, `Price shown to customer was not a positive amount (${priceText})`).toBeGreaterThan(0);
    test.info().annotations.push({
      type: 'price-shown',
      description: `${priceText} (backing=${caseData[profile.pricingField]})`,
    });
  }

  // --- acknowledge and confirm ----------------------------------------
  const checkbox = page.locator(p.checkbox).first();
  if (!(await checkbox.isChecked().catch(() => false))) {
    // The input itself is a 13px box; clicking its label is what a customer does.
    await page
      .getByText(p.checkboxLabel)
      .first()
      .click({ timeout: 5_000 })
      .catch(async () => {
        await checkbox.evaluate((el) => el.click());
      });
  }
  expect(
    await checkbox.isChecked().catch(() => false),
    'Could not tick "Yes, all checked and good to go" — the proof acknowledgement was unreachable',
  ).toBe(true);

  const confirm = page.locator(p.confirmButton).first();
  expect(
    await confirm.isEnabled(),
    'Confirm and Add to Cart stayed disabled after acknowledging the proof',
  ).toBe(true);

  await safeClick(confirm, { label: 'Confirm and Add to Cart', obscured });

  // --- the expected dev block -----------------------------------------
  // Dev has no Shopify wiring, so this must NOT complete. Give it a real
  // window to try, then assert we never left the sandbox.
  await page.waitForTimeout(8_000);
  const endedAt = page.url();
  expect(
    LIVE_COMMERCE_URL.test(endedAt),
    `Dev build reached live commerce at ${endedAt}. The dev designer must not ` +
      'be able to write to the real store — add-to-cart should stop at the proof.',
  ).toBe(false);

  test.info().annotations.push({
    type: 'stopped-at',
    description: `Proof verified; add-to-cart blocked as expected (still at ${endedAt})`,
  });
}

/**
 * Full run for a straightforward "no mistakes" test case — used by both
 * the pairwise suite and the named-scenario suite.
 */
async function runFullFlow(page, profile, caseData, deps) {
  const { test, expect, findLeakedFields } = deps;
  const consoleErrors = [];
  const failedRequests = [];
  const ctx = { obscured: [], notes: [], alerts: [] };

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
  });

  await page.goto(profile.productPageUrl, { waitUntil: 'domcontentloaded' });

  const root = designRoot(page, profile);
  if (typeof profile.afterGoto === 'function') {
    await profile.afterGoto(page, root, ctx);
  }

  await applyAllSteps(page, profile, caseData, ctx);
  await runProofTail(page, profile, caseData, { test, expect, findLeakedFields }, ctx);

  const annotate = (type, items) => {
    if (items.length > 0) {
      test.info().annotations.push({
        type,
        description: [...new Set(items)].join(' | ').slice(0, 2000),
      });
    }
  };
  annotate('obscured-control', ctx.obscured);
  annotate('behavior-note', ctx.notes);
  annotate('blocking-alert', ctx.alerts);
  annotate('console-errors', consoleErrors);
  annotate('failed-requests', failedRequests);
}

module.exports = {
  applyStep,
  applyAllSteps,
  runBulkUpload,
  runProofTail,
  runFullFlow,
  designRoot,
};
