import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const outDir = "tmp-pen-signs-explore";
mkdirSync(outDir, { recursive: true });
const ORIGIN = "https://all-quality-design-tool.vercel.app";
const SHOP = "shop=gavelsfast.myshopify.com&storeUrl=gavelsfast.myshopify.com";

const browser = await chromium.launch();

async function look(name, url) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: join(outDir, `${name}.png`), fullPage: true });
  const buttons = await page.evaluate(() =>
    [...document.querySelectorAll("button")]
      .map((b) => (b.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 60),
  );
  console.log(`=== ${name} buttons ===`);
  console.log(buttons.join(" | "));
  await page.close();
}

await look("pen", `${ORIGIN}/pen-designer?embedded=1&${SHOP}&product=8255848480830`);
await look(
  "sign",
  `${ORIGIN}/desk-sign-designer?embedded=1&${SHOP}&product=8268717064254&deskSignProductHandle=custom-desk-sign`,
);

await browser.close();
