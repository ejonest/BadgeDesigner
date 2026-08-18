// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Tool QA Framework — Playwright config
 *
 * Runs against the LOCAL DEV designer (`/badge-designer-redesign`), not the
 * production storefront. The dev build has no Shopify/Gadget wiring, so a run
 * intentionally ends at the PDF proof — see core/flow-runner.js.
 *
 * Test files live in tests/, one spec file (or pair) per tool profile.
 * Adding a new tool profile does not require touching this file.
 */
const DEV_URL = process.env.QA_BASE_URL || 'http://localhost:5173';

module.exports = defineConfig({
  testDir: './tests',
  // A healthy dev run is ~25-55s: design steps are <1s each, PDF proof
  // generation is the long pole. The ceiling is set for the worst case
  // (Backtracking Betty generates the proof twice) rather than the norm.
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 2,
  retries: 0,
  reporter: [
    ['html', { outputFolder: 'report', open: 'never' }],
    ['json', { outputFile: 'report/results.json' }],
    ['list'],
  ],
  use: {
    baseURL: DEV_URL,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  // Boot the Remix dev server automatically unless one is already running.
  webServer: process.env.QA_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        cwd: '..',
        url: DEV_URL,
        // Locally reuse an already-running `npm run dev`. In CI always boot fresh.
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
        stdout: 'ignore',
        stderr: 'pipe',
      },
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'desktop-safari', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } },
  ],
});
