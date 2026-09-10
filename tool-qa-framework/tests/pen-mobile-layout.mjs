/**
 * Full-viewport screenshots of the pen designer at phone sizes, so the mobile
 * app shell can be checked: step labels readable, the preview and the
 * Back/Continue row visible together, and nothing clipped by the shell.
 */
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.PEN_BASE_URL ?? "http://localhost:5173";
const LOGO = path.join(import.meta.dirname, "fixtures", "out", "pen-logo.png");
const OUT = path.join(import.meta.dirname, "..", "report", "pen-mobile");

const DEVICES = [
  { name: "iphone-se", width: 375, height: 667 },
  { name: "iphone-14", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1024 },
];

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();

for (const device of DEVICES) {
  const page = await browser.newPage({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log("[console]", msg.text());
  });

  const shot = async (name) => {
    await page.screenshot({ path: path.join(OUT, `${device.name}-${name}.png`) });
    console.log("shot", device.name, name);
  };

  await page.goto(`${BASE}/pen-designer`, { waitUntil: "networkidle" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // Nothing outside the shell should be reachable by scrolling.
  const overflow = await page.evaluate(() => ({
    docScroll: document.documentElement.scrollHeight - window.innerHeight,
    navVisible: (() => {
      const nav = document.querySelector(".pen-navigation");
      if (!nav) return false;
      const box = nav.getBoundingClientRect();
      return box.bottom <= window.innerHeight + 1 && box.top >= 0;
    })(),
    photoVisible: (() => {
      const photo = document.querySelector(".pen-photo");
      if (!photo) return false;
      const box = photo.getBoundingClientRect();
      return box.bottom <= window.innerHeight + 1 && box.top >= 0;
    })(),
  }));
  console.log(device.name, JSON.stringify(overflow));

  await shot("1-product");

  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForTimeout(500);
  await page.locator(".pen-field input").first().fill("DAXMOOR");
  await page.waitForTimeout(900);
  await shot("2-cap");

  await page.locator('.pen-upload input[type="file"]').setInputFiles(LOGO);
  await page.waitForTimeout(1600);
  await shot("2-cap-logo");

  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForTimeout(500);
  await page.locator(".pen-field input").first().fill("Anderson Quality Badges");
  await page.locator('.pen-upload input[type="file"]').setInputFiles(LOGO);
  await page.waitForTimeout(1600);
  await shot("3-band");

  // Scrolled to the foot of the panel: the pinned row must not cover fields.
  await page.locator(".pen-controls").evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await page.waitForTimeout(400);
  await shot("3-band-scrolled");

  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForTimeout(500);
  await shot("4-quantity");

  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForTimeout(500);
  await shot("5-review");

  await page.close();
}

await browser.close();
console.log("done ->", OUT);
