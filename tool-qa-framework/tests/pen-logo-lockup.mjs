/**
 * Screenshots the pen cap and case band previews with a logo uploaded, so the
 * lockup (mark to the left of the text) and the single-colour conversion can
 * be checked against the vendor photos.
 */
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.PEN_BASE_URL ?? "http://localhost:3000";
const LOGO = path.join(import.meta.dirname, "fixtures", "out", "pen-logo.png");
const OUT = path.join(import.meta.dirname, "..", "report", "pen-logo");

const shot = async (locator, name) => {
  await locator.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log("shot", name);
};

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1500, height: 1000 },
  deviceScaleFactor: 2,
});
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("[console]", msg.text());
});

await page.goto(`${BASE}/pen-designer`, { waitUntil: "networkidle" });
await page.evaluate(() => window.localStorage.clear());
await page.reload({ waitUntil: "networkidle" });

// Step 1 -> pen cap.
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForTimeout(400);

const capInput = page.locator(".pen-field input").first();
await capInput.fill("DAXMOOR");
await page.waitForTimeout(900);
await shot(page.locator(".pen-photo"), "cap-text-only");

await page.locator('.pen-upload input[type="file"]').setInputFiles(LOGO);
await page.waitForTimeout(1600);
await shot(page.locator(".pen-photo"), "cap-logo-and-text");
await shot(page.locator(".pen-controls"), "cap-controls");

// Cap with the logo alone.
await capInput.fill("");
await page.waitForTimeout(1200);
await shot(page.locator(".pen-photo"), "cap-logo-only");
await capInput.fill("DAXMOOR");
await page.waitForTimeout(1000);

// Step 2 -> case band.
await page.getByRole("button", { name: "Continue" }).click();
await page.waitForTimeout(500);
const bandInput = page.locator(".pen-field input").first();
await bandInput.fill("Anderson Quality Badges");
await page.waitForTimeout(600);
await shot(page.locator(".pen-photo"), "band-text-only");

await page.locator('.pen-upload input[type="file"]').setInputFiles(LOGO);
await page.waitForTimeout(1600);
await shot(page.locator(".pen-photo"), "band-logo-and-text");

// A single short line divides the stacked space very differently from three.
await bandInput.fill("DAXMOOR");
await page.waitForTimeout(900);
await shot(page.locator(".pen-photo"), "band-logo-one-line");

await bandInput.fill("");
await page.waitForTimeout(900);
await shot(page.locator(".pen-photo"), "band-logo-only");

await browser.close();
console.log("done ->", OUT);
