import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const CHROME =
  "/Users/ethanjones/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";
const ROOT = path.dirname(new URL(import.meta.url).pathname);
const AUDIO_SECONDS = 12.25;

const mode = process.argv[2] === "9x16" ? "9x16" : "16x9";
const viewport = mode === "9x16" ? { width: 810, height: 1440 } : { width: 1440, height: 810 };
const outDir = path.join(ROOT, "raw", mode);
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const context = await browser.newContext({
  viewport,
  recordVideo: { dir: outDir, size: viewport },
  isMobile: mode === "9x16",
  hasTouch: mode === "9x16",
  deviceScaleFactor: 1,
});
const page = await context.newPage();
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));

await page.addInitScript(() => {
  const add = () => {
    if (document.getElementById("demo-cursor")) return;
    const cursor = document.createElement("div");
    cursor.id = "demo-cursor";
    cursor.innerHTML =
      '<svg width="28" height="28" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 2.5l13.2 11.1h-6.3L9.2 21z" fill="#111" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    cursor.style.cssText = [
      "position:fixed",
      "z-index:2147483647",
      "width:28px",
      "height:28px",
      "pointer-events:none",
      "left:0",
      "top:0",
      "transition:left .26s ease, top .26s ease",
    ].join(";");
    document.body.appendChild(cursor);
  };
  if (document.body) add();
  else document.addEventListener("DOMContentLoaded", add);
});

const boot = Date.now();
await page.goto("http://127.0.0.1:5173/plaque-designer", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.evaluate(() => localStorage.removeItem("plaque-designer-wizard-v2"));
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(".gf-toggle-card", { timeout: 20000 });
await page.addStyleTag({
  content: ".md-quantity-card, .md-group-order, .md-bulk-total { display: none !important; }",
});
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const portrait = await page.locator(".gf-toggle-card", { hasText: "portrait" }).first().boundingBox();
const startPoint = portrait
  ? { x: Math.round(portrait.x + portrait.width / 2), y: Math.round(portrait.y + 70) }
  : { x: 400, y: 360 };
await page.evaluate((point) => {
  const cursor = document.getElementById("demo-cursor");
  if (!cursor) return;
  cursor.style.transition = "none";
  cursor.style.left = point.x + "px";
  cursor.style.top = point.y + "px";
  cursor.getBoundingClientRect();
  cursor.style.transition = "left .26s ease, top .26s ease";
}, startPoint);

const demoStart = Date.now();
console.log("SETUP_MS", demoStart - boot);

const until = async (seconds) => {
  const wait = seconds * 1000 - (Date.now() - demoStart);
  if (wait > 40) await page.waitForTimeout(wait);
};

const glide = async (locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("missing box for " + locator);
  const x = Math.round(box.x + Math.min(box.width / 2, 140));
  const y = Math.round(box.y + Math.min(box.height / 2, 48));
  await page.evaluate(({ x, y }) => {
    const cursor = document.getElementById("demo-cursor");
    if (!cursor) return;
    cursor.style.left = x + "px";
    cursor.style.top = y + "px";
  }, { x, y });
  await page.waitForTimeout(280);
};

const click = async (locator) => {
  await locator.scrollIntoViewIfNeeded();
  await glide(locator);
  await locator.click();
};

const title = async () => page.locator(".gf-panel-title").innerText();

try {
  await until(1.55);
  await glide(page.locator(".gf-toggle-card", { hasText: "landscape" }).first());
  await until(2.62);
  await click(page.locator(".gf-toggle-card", { hasText: "landscape" }).first());
  console.log("AFTER_LAYOUT", await title(), ((Date.now() - demoStart) / 1000).toFixed(2));

  await until(3.72);
  await click(page.getByRole("button", { name: "Continue", exact: true }));
  console.log("AFTER_SIZE_NAV", await title(), ((Date.now() - demoStart) / 1000).toFixed(2));

  await until(4.12);
  await click(page.locator(".pd-size-card", { hasText: "Large" }).first());
  console.log("AFTER_LARGE", ((Date.now() - demoStart) / 1000).toFixed(2));

  await until(4.72);
  await click(page.getByRole("button", { name: "Continue", exact: true }));
  console.log("AFTER_FINISH_NAV", await title(), ((Date.now() - demoStart) / 1000).toFixed(2));

  await until(5.25);
  await click(page.locator(".gf-toggle-card", { hasText: "Brushed Silver" }).first());
  console.log("AFTER_SILVER", ((Date.now() - demoStart) / 1000).toFixed(2));

  await until(6.18);
  await click(page.getByRole("button", { name: "Continue", exact: true }));
  console.log("AFTER_DESIGN_NAV", await title(), ((Date.now() - demoStart) / 1000).toFixed(2));

  await until(6.48);
  const wording = page.locator("#pd-wording");
  await wording.scrollIntoViewIfNeeded();
  await glide(wording);
  await wording.click();
  await page.keyboard.type("Presented to\nAlex Morgan\nEmployee of the Year", { delay: 38 });
  console.log("AFTER_TYPE", ((Date.now() - demoStart) / 1000).toFixed(2));

  await until(AUDIO_SECONDS + 0.35);
  console.log("DONE", ((Date.now() - demoStart) / 1000).toFixed(2));
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  if (video) {
    const saved = await video.path();
    const target = path.join(outDir, "take.webm");
    fs.copyFileSync(saved, target);
    fs.writeFileSync(path.join(outDir, "setup-ms.txt"), String(demoStart - boot));
    console.log("VIDEO", target);
  }
}
