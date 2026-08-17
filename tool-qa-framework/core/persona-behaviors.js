// @ts-check

/**
 * ============================================================
 * CORE PERSONA BEHAVIORS — tool-agnostic
 * ============================================================
 * These implement the ACTIONS each persona takes (the "how a real person
 * moves through any design tool"), using only the generic step schema
 * from flow-runner.js. They deliberately do NOT hard-code assertions
 * about what the "correct" outcome looks like — that's profile-specific.
 * Each profile's persona spec calls these, then adds its own assertions.
 *
 * Because this suite runs against the dev build (no Shopify wiring), the
 * furthest any persona can travel is the PDF proof. Personas whose whole
 * point is post-purchase behavior are not simulated here — see the
 * profile's persona spec for how those are reported instead.
 * ============================================================
 */

const { applyStep, applyAllSteps, designRoot } = require('./flow-runner');
const { safeClick } = require('./interactions');

function newCtx() {
  return { obscured: [], notes: [], alerts: [] };
}

async function prepareDesigner(page, profile, ctx = newCtx()) {
  await page.goto(profile.productPageUrl, { waitUntil: 'domcontentloaded' });
  const root = designRoot(page, profile);
  if (typeof profile.afterGoto === 'function') {
    await profile.afterGoto(page, root, ctx);
  }
  return root;
}

/** Walk to the PDF proof and wait for it to actually render. */
async function reachProof(page, profile, caseData, ctx) {
  await profile.openProof(page, caseData, ctx);
  const proof = page.locator(profile.proof.modal).first();
  await proof.waitFor({ state: 'visible', timeout: 90_000 });
  await page
    .locator(profile.proof.canvas)
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => {});
  return proof;
}

/**
 * Clumsy Carl pattern: apply a full case, then go back and change ONE
 * earlier field after everything else is already filled in. Returns
 * control to the caller for profile-specific assertions (e.g. "did the
 * icon stay visible against the new background").
 */
async function runChangeEarlierChoiceAfterFact(
  page,
  profile,
  caseData,
  fieldToChangeLater,
  newValue,
  ctx = newCtx(),
) {
  await prepareDesigner(page, profile, ctx);
  await applyAllSteps(page, profile, caseData, ctx);

  const stepDef = profile.steps.find((s) => s.field === fieldToChangeLater);
  if (!stepDef) throw new Error(`No step found for field "${fieldToChangeLater}"`);

  await applyStep(page, stepDef, { ...caseData, [fieldToChangeLater]: newValue }, profile, ctx);
  return ctx;
}

/**
 * Backtracking Betty pattern: complete a design, reach the proof, use
 * "Back to Edit" to change ONE field, then return to the proof.
 *
 * This is the Issue 15 probe: the risk is that the trip back to editing
 * wipes or silently drops the design. The caller asserts that the FINAL
 * edited value is what survives.
 */
async function runEditAfterReview(page, profile, caseData, fieldToEdit, newValue, ctx = newCtx()) {
  await prepareDesigner(page, profile, ctx);
  await applyAllSteps(page, profile, caseData, ctx);
  await reachProof(page, profile, caseData, ctx);

  await safeClick(page.locator(profile.proof.backToEditButton), {
    label: 'Back to Edit',
    obscured: ctx.obscured,
  });
  await page
    .locator(profile.proof.modal)
    .waitFor({ state: 'hidden', timeout: 15_000 })
    .catch(() => {});

  const stepDef = profile.steps.find((s) => s.field === fieldToEdit);
  if (!stepDef) throw new Error(`No step found for field "${fieldToEdit}"`);
  const edited = { ...caseData, [fieldToEdit]: newValue };
  await applyStep(page, stepDef, edited, profile, ctx);

  await reachProof(page, profile, edited, ctx);
  return ctx;
}

/**
 * Interrupted Ian pattern (mid-design): apply a PARTIAL sequence of
 * steps, then close the tab and open a fresh one. Returns the new page
 * so the profile spec can check whatever "was progress restored" means
 * for that tool.
 */
async function runCloseAndReopenMidDesign(
  page,
  context,
  profile,
  partialCaseData,
  partialStepFields,
  ctx = newCtx(),
) {
  await prepareDesigner(page, profile, ctx);

  const partialSteps = profile.steps.filter((s) => partialStepFields.includes(s.field));
  for (const step of partialSteps) {
    await applyStep(page, step, partialCaseData, profile, ctx);
  }

  await page.close();
  const newPage = await context.newPage();
  await prepareDesigner(newPage, profile, ctx);
  return newPage;
}

module.exports = {
  prepareDesigner,
  reachProof,
  runChangeEarlierChoiceAfterFact,
  runEditAfterReview,
  runCloseAndReopenMidDesign,
};
