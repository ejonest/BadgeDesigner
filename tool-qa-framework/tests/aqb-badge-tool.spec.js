// @ts-check
const { test, expect } = require('@playwright/test');
const testCases = require('../profiles/aqb-badge-tool/test-cases.json');
const scenarios = require('../profiles/aqb-badge-tool/scenarios');
const profile = require('../profiles/aqb-badge-tool/config');
const { expandTextFields } = require('../profiles/aqb-badge-tool/sample-data');
const { findLeakedFields } = require('../core/checks');
const { runFullFlow } = require('../core/flow-runner');

const deps = { test, expect, findLeakedFields };

test.describe('[aqb-badge-tool] Pairwise regression suite (broad coverage)', () => {
  for (const rawCase of testCases) {
    const testCase = expandTextFields(rawCase);
    test(`${testCase.id}: ${JSON.stringify(rawCase)}`, async ({ page }) => {
      await runFullFlow(page, profile, testCase, deps);
    });
  }
});

test.describe('[aqb-badge-tool] Named real-order scenarios (exact combinations)', () => {
  for (const rawScenario of scenarios) {
    const scenario = expandTextFields(rawScenario);
    test(`${scenario.id}: ${scenario.description}`, async ({ page }) => {
      await runFullFlow(page, profile, scenario, deps);
    });
  }
});
