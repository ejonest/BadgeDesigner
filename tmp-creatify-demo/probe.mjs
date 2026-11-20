import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "/Users/ethanjones/Library/Caches/ms-playwright/chromium-1234/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } });
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));
await page.goto("http://127.0.0.1:5173/plaque-designer", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.evaluate(() => localStorage.removeItem("plaque-designer-wizard-v2"));
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector(".gf-toggle-card", { timeout: 20000 });
await page.waitForTimeout(800);
const info = await page.evaluate(() => {
  const cards = [...document.querySelectorAll(".gf-toggle-card")].map((el) => ({
    label: el.querySelector(".gf-toggle-label")?.textContent?.trim() ?? "",
    sub: el.querySelector(".gf-toggle-sub")?.textContent?.trim() ?? "",
  }));
  return {
    title: document.querySelector("h1")?.textContent?.trim() ?? "",
    panel: document.querySelector(".gf-panel-title")?.textContent?.trim() ?? "",
    cards,
  };
});
console.log("LAYOUT", JSON.stringify(info, null, 2));
await page.getByRole("button", { name: /Attached plate/ }).click();
await page.waitForTimeout(900);
const designs = await page.evaluate(() => ({
  panel: document.querySelector(".gf-panel-title")?.textContent?.trim() ?? "",
  cards: [...document.querySelectorAll(".gf-toggle-card")].map((el) => ({
    label: el.querySelector(".gf-toggle-label")?.textContent?.trim() ?? "",
    sub: el.querySelector(".gf-toggle-sub")?.textContent?.trim() ?? "",
  })),
}));
console.log("DESIGNS", JSON.stringify(designs, null, 2));
await page.screenshot({ path: "probe-designs.png" });
await browser.close();
