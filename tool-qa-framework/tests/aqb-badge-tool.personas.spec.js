// @ts-check
const { test, expect } = require('@playwright/test');
const profile = require('../profiles/aqb-badge-tool/config');
const selectors = require('../profiles/aqb-badge-tool/selectors');
const { expandTextFields } = require('../profiles/aqb-badge-tool/sample-data');
const { findLeakedFields } = require('../core/checks');
const { runFullFlow } = require('../core/flow-runner');
const {
  runChangeEarlierChoiceAfterFact,
  runEditAfterReview,
  runCloseAndReopenMidDesign,
  reachProof,
} = require('../core/persona-behaviors');

const deps = { test, expect, findLeakedFields };

/**
 * Persona tests are behavioral, not combinatorial: pairwise finds "these
 * two options break together", personas find "a real person doing
 * something reasonable but imperfect breaks the tool".
 *
 * All of them end at the PDF proof, because the dev build has no Shopify
 * wiring. Personas that are purely post-purchase are documented at the
 * bottom rather than faked.
 */
test.describe('[aqb-badge-tool] Customer personas — behavioral scenarios', () => {
  test('persona-efficient-emma: follows the golden path with no mistakes', async ({ page }) => {
    const caseData = expandTextFields({
      template: 'rounded-corners-1x3',
      badgeStyle: 'plain-color',
      backgroundColor: 'blue',
      icon: 'none',
      textLength: 'typical',
      font: 'montserrat',
      textColor: 'gold',
      backing: 'magnetic',
      orderType: 'multi-badge-csv',
      bulkQuantity: 10,
    });

    // The benchmark: if even Emma hits a snag, it's a tool problem.
    await runFullFlow(page, profile, caseData, deps);
  });

  test('persona-clumsy-carl: changes background color after already picking icon and text', async ({ page }) => {
    const caseData = expandTextFields({
      template: 'rounded-corners-1x3',
      badgeStyle: 'plain-color',
      backgroundColor: 'white', // Carl's first (wrong) instinct
      icon: 'none',
      textLength: 'typical',
      textColor: 'gold',
      backing: 'pin',
    });

    const ctx = await runChangeEarlierChoiceAfterFact(
      page,
      profile,
      caseData,
      'backgroundColor',
      'black',
    );

    // Stale-state check: correcting an early choice must not wipe the
    // text that was already entered downstream.
    await expect(page.locator(selectors.textLine1Input).first()).toHaveValue(caseData.textLine1);

    // Carl's real risk: the icon/text vanishing against the new dark
    // background. The proof is the last place he could catch it.
    await reachProof(page, profile, { ...caseData, backgroundColor: 'black' }, ctx);
    await expect(page.locator(selectors.proofCanvas).first()).toBeVisible();
  });

  test('persona-backtracking-betty: edits text after reaching the proof, then re-confirms', async ({ page }) => {
    const caseData = expandTextFields({
      template: 'oval-1.5x3',
      badgeStyle: 'plain-color',
      backgroundColor: 'brushed-gold',
      icon: 'none',
      textLength: 'typical', // original line 2: "Dentist"
      font: 'raleway',
      textColor: 'navy',
      backing: 'magnetic',
    });

    await runEditAfterReview(page, profile, caseData, 'textLine2', 'Orthodontist');

    // Issue 15 probe: after the round trip back to editing, the corrected
    // value must be what survives — and the design must not have reset.
    await expect(page.locator(selectors.textLine1Input).first()).toHaveValue(caseData.textLine1);
    await expect(page.locator(selectors.textLine2Input).first()).toHaveValue('Orthodontist');
    await expect(page.locator(selectors.proofCanvas).first()).toBeVisible();
  });

  test('persona-interrupted-ian: closes the tab mid-design, reopens later', async ({ page, context }) => {
    const partialCase = {
      template: 'house-1.5x3',
      badgeStyle: 'plain-color',
      backgroundColor: 'red',
      textLine1: 'Ian Torres',
    };

    const newPage = await runCloseAndReopenMidDesign(page, context, profile, partialCase, [
      'template',
      'badgeStyle',
      'backgroundColor',
      'textLine1',
    ]);

    const restoredValue = await newPage
      .locator(selectors.textLine1Input)
      .first()
      .inputValue()
      .catch(() => null);

    // Documents actual behavior rather than asserting an assumed answer —
    // either outcome is defensible, but a stale partial restore is worse
    // than a clean start.
    test.info().annotations.push({
      type: 'interrupted-design-recovery',
      description:
        restoredValue === 'Ian Torres'
          ? 'Partial design WAS restored after closing/reopening — confirm this is intentional and always correct, not a stale mix.'
          : 'Partial design was NOT restored after closing/reopening — confirm this is acceptable, or consider a "resume your design" prompt.',
    });

    await newPage.close();
  });

  // These two personas are entirely post-purchase. The dev build has no
  // Shopify wiring, so simulating them here would only prove that a stub
  // is a stub. They need a staging store with real checkout to be
  // meaningful, and are left explicitly pending rather than faked.
  test.skip('persona-interrupted-ian: cart survives a closed tab', async () => {});
  test.skip('persona-returning-rachel: guest finds her order days later', async () => {});
});
