const selectors = require('./selectors');
const { buildBulkCsv } = require('./sample-data');
const { safeClick, clickIfPresent, fillInput } = require('../../core/interactions');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * AQB badge designer profile — drives the DEV route.
 *
 * The step order below is the order the dev DOM actually mounts them in;
 * two steps (Style, Icon) do not exist until an earlier choice is made,
 * so they are waited for rather than assumed.
 */
module.exports = {
  productPageUrl: selectors.productPageUrl,

  async afterGoto(page, root, ctx = {}) {
    // The tool uses window.alert() for incomplete-design nags. Capture the
    // text (it is a genuine finding) and dismiss so the run can continue.
    page.on('dialog', async (dialog) => {
      if (ctx.alerts) ctx.alerts.push(dialog.message());
      await dialog.accept().catch(() => {});
    });

    await page
      .getByRole('button', { name: /Pick a Shape/i })
      .first()
      .waitFor({ state: 'visible', timeout: 45_000 });

    await clickIfPresent(page.locator(selectors.dismissReminder), {
      label: 'dismiss reminder banner',
      obscured: ctx.obscured,
    });
  },

  async applyCustomStep(root, page, step, caseData, ctx = {}) {
    const obscured = ctx.obscured;

    if (step.field === 'template') {
      const title = selectors.TEMPLATE_TITLES[caseData.template];
      const chosen = page
        .getByRole('button', { name: new RegExp(`Pick a Shape\\s+${escapeRegex(title)}`) })
        .first();

      // Everything downstream (the Style step in particular) only mounts once
      // this registers, so confirm it did rather than racing the next step.
      for (let attempt = 0; attempt < 2; attempt++) {
        await safeClick(page.locator(selectors.templateOption(caseData.template)), {
          label: `shape: ${caseData.template}`,
          obscured,
        });
        const ok = await chosen.isVisible({ timeout: 8_000 }).catch(() => false);
        if (ok) return true;
      }
      throw new Error(`Shape "${caseData.template}" never registered as selected`);
    }

    if (step.field === 'badgeStyle') {
      // "1b Pick a Style" mounts only after a shape is chosen, and only for
      // shapes that have pre-designed artwork (the 1x3 rounded plate). Oval
      // and House go straight to Pick a Color.
      // Mounts asynchronously, and slower when workers share the dev server —
      // too short a wait here silently skips the step and the tool then
      // refuses to add to cart.
      const plain = page.locator(selectors.plainStyleCard).first();
      const hasStyleStep = await plain.isVisible({ timeout: 10_000 }).catch(() => false);
      if (!hasStyleStep) {
        if (ctx.notes) ctx.notes.push(`shape "${caseData.template}" has no style step`);
        return true;
      }
      if (caseData.badgeStyle === 'plain-color') {
        await safeClick(plain, { label: 'style: plain color badge', obscured });
      } else {
        await safeClick(page.locator(selectors.preDesignedStyleCard), {
          label: 'style: pre-designed',
          obscured,
        });
        ctx.preDesignedApplied = true;
      }
      return true;
    }

    if (step.field === 'backgroundColor') {
      // Pre-designed artwork replaces the plate-colour step — but only when a
      // pre-designed style was actually applied. Shapes without a style step
      // still need a colour, or the tool never enables add-to-cart.
      if (ctx.preDesignedApplied) return true;

      // The icon step only mounts once a colour has registered, so it doubles
      // as confirmation that the click actually took effect.
      const iconGate = page.locator(selectors.iconGateNo).first();
      for (let attempt = 0; attempt < 2; attempt++) {
        await safeClick(page.locator(selectors.backgroundColorOption(caseData.backgroundColor)), {
          label: `background: ${caseData.backgroundColor}`,
          obscured,
        });
        if (await iconGate.isVisible({ timeout: 8_000 }).catch(() => false)) return true;
      }
      throw new Error(
        `Background colour "${caseData.backgroundColor}" never registered ` +
          '(the icon step never appeared)',
      );
    }

    if (step.field === 'icon') {
      // "2b Add an Icon" requires an explicit No/Yes — there is no default
      // (golden-path.md Issue 17). Skipping it blocks add-to-cart later.
      const wantsIcon = caseData.icon && caseData.icon !== 'none';
      const noGate = page.locator(selectors.iconGateNo).first();
      const present = await noGate.isVisible({ timeout: 8_000 }).catch(() => false);
      if (!present) return true;

      let chose = false;
      if (wantsIcon) {
        await safeClick(page.locator(selectors.iconGateYes), { label: 'icon gate: Yes', obscured });
        const optionSelector = selectors.iconOption(caseData.icon);
        const option = optionSelector ? page.locator(optionSelector).first() : null;
        if (option && (await option.isVisible({ timeout: 4_000 }).catch(() => false))) {
          await safeClick(option, { label: `icon: ${caseData.icon}`, obscured });
          chose = true;
        } else if (ctx.notes) {
          ctx.notes.push(`icon "${caseData.icon}" not offered — fell back to no icon`);
        }
      }

      // Answering "Yes" without actually picking an icon leaves the design
      // incomplete and silently blocks add-to-cart, so fall back to "No".
      if (!chose) {
        await safeClick(page.locator(selectors.iconGateNo), { label: 'icon gate: No', obscured });
      }

      await clickIfPresent(page.locator(selectors.iconContinue), {
        label: 'icon step: Continue',
        obscured,
      });
      return true;
    }

    if (step.field === 'textLine1') {
      await fillInput(page.locator(selectors.textLine1Input), caseData.textLine1 ?? '');
      return true;
    }

    if (step.field === 'textLine2') {
      if (!caseData.textLine2) return true;
      const input = page.locator(selectors.textLine2Input).first();
      if (!(await input.isVisible().catch(() => false))) return true;
      await fillInput(input, caseData.textLine2);
      return true;
    }

    if (step.field === 'textLine3') {
      if (!caseData.textLine3) return true;
      const addLine = page.locator(selectors.addLineButton).first();
      const canAdd =
        (await addLine.isVisible().catch(() => false)) &&
        (await addLine.isEnabled().catch(() => false));
      if (!canAdd) {
        // 1x3 plates cap at 2 lines — a real constraint, not a failure.
        if (ctx.notes) ctx.notes.push('third text line unavailable on this shape (2-line cap)');
        return true;
      }
      await safeClick(addLine, { label: 'add third text line', obscured });
      const third = page.locator('input[placeholder*="Enter"]').nth(2);
      if (await third.isVisible().catch(() => false)) {
        await fillInput(third, caseData.textLine3);
      }
      return true;
    }

    if (step.field === 'font') {
      if (!caseData.font) return true;
      const label = selectors.fontOptionLabel(caseData.font);
      const trigger = page.locator(selectors.fontTrigger(1)).first();
      if (!(await trigger.isVisible().catch(() => false))) return true;
      if ((await trigger.innerText().catch(() => '')).trim() === label) return true;

      await safeClick(trigger, { label: 'font selector', obscured });
      const option = page
        .locator(selectors.fontListbox)
        .getByRole('option', { name: label, exact: true })
        .first();
      const shown = await option.isVisible({ timeout: 3_000 }).catch(() => false);
      if (shown) {
        await safeClick(option, { label: `font: ${label}`, obscured });
      } else {
        await page.keyboard.press('Escape').catch(() => {});
        if (ctx.notes) ctx.notes.push(`font "${label}" not selectable`);
      }
      return true;
    }

    if (step.field === 'textColor') {
      if (!caseData.textColor) return true;
      if (!selectors.TEXT_COLOR_HEX[caseData.textColor]) {
        // e.g. "white" — only offered as the disabled "same as background".
        if (ctx.notes) ctx.notes.push(`text color "${caseData.textColor}" has no quick swatch`);
        return true;
      }
      const swatch = page.locator(selectors.textColorSwatch(caseData.textColor)).first();
      if (!(await swatch.isVisible({ timeout: 3_000 }).catch(() => false))) return true;
      if (!(await swatch.isEnabled().catch(() => false))) return true;
      await safeClick(swatch, { label: `text color: ${caseData.textColor}`, obscured });
      return true;
    }

    if (step.field === 'backing') {
      await safeClick(page.locator(selectors.backingTrigger), {
        label: 'backing selector',
        obscured,
      });
      const name = selectors.BACKING_NAME[caseData.backing];
      // Word boundaries matter here: a bare /Pin/i also matches the
      // "free shipping" nudge button that sits above the menu.
      await safeClick(page.getByRole('button', { name: new RegExp(`\\b${name}\\b`, 'i') }), {
        label: `backing: ${caseData.backing}`,
        obscured,
      });
      // Picking a backing completes the design and opens "Ready to checkout…?".
      await page
        .getByText(/Ready to checkout/i)
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
        .catch(() => {});
      return true;
    }

    return false;
  },

  /**
   * Get from "design complete" to the PDF proof. The dev tool routes this
   * through the "Ready to checkout…?" modal that opens on backing choice;
   * its Checkout button is what triggers proof generation.
   */
  async openProof(page, caseData, ctx = {}) {
    const obscured = ctx.obscured;
    const proof = page.locator(selectors.proofModal).first();
    const readyCheckout = page.locator(selectors.readyModalCheckout).first();

    // Depending on how the design was completed, the tool lands either on
    // the "Ready to checkout…?" modal or straight on the Add to cart button —
    // and coming back via "Back to Edit" can re-show the modal. Handle both
    // rather than assuming one route.
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await proof.isVisible().catch(() => false)) return;

      if (await readyCheckout.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await safeClick(readyCheckout, {
          label: 'Ready-to-checkout modal: Checkout',
          obscured,
        });
      } else {
        // Note an inactive button, but still press it: if the design really
        // is incomplete the tool raises an alert naming the missing step,
        // which is far better diagnostics than guessing from a CSS class.
        const inactive = await page
          .locator(selectors.addToCartInactive)
          .first()
          .isVisible()
          .catch(() => false);
        if (inactive && ctx.notes) {
          ctx.notes.push('add-to-cart appeared inactive when the design looked complete');
        }
        await safeClick(page.locator(selectors.addToCartButton), {
          label: 'Add to cart',
          obscured,
        });
      }

      await proof
        .or(readyCheckout)
        .first()
        .waitFor({ state: 'visible', timeout: 45_000 })
        .catch(() => {});
    }
  },

  steps: [
    { type: 'custom', field: 'template' },
    { type: 'custom', field: 'badgeStyle' },
    { type: 'custom', field: 'backgroundColor' },
    { type: 'custom', field: 'icon' },
    { type: 'custom', field: 'textLine1' },
    { type: 'custom', field: 'textLine2' },
    { type: 'custom', field: 'textLine3' },
    { type: 'custom', field: 'font' },
    { type: 'custom', field: 'textColor' },
    { type: 'custom', field: 'backing' },
  ],

  bulkUpload: {
    addMultipleButton: selectors.addMultipleButton,
    csvTextarea: selectors.csvTextarea,
    addBadgesButton: selectors.addBadgesButton,
    csvBuilder: buildBulkCsv,
  },

  proof: {
    modal: selectors.proofModal,
    canvas: selectors.proofCanvas,
    checkbox: selectors.reviewProofCheckbox,
    checkboxLabel: selectors.reviewProofLabel,
    confirmButton: selectors.confirmAddToCartButton,
    backToEditButton: selectors.backToEditButton,
  },

  pricingField: 'backing',
  backingSurcharge: selectors.BACKING_SURCHARGE,

  extraLeakPatterns: [
    /Background Color\s*:\s*#[0-9a-f]{6}/i,
    /Backing Type\s*:/i,
    /design_\d{10,}/i,
  ],
};
