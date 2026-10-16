import { chromium } from "playwright";
import { join } from "node:path";
import sharp from "sharp";

const outDir = "tmp-sbl-shots";
const SCALE = 2;
const url =
  "https://all-quality-design-tool.vercel.app/badge-designer-redesign?embedded=1" +
  "&shop=allqualityservices.myshopify.com&storeUrl=allqualityservices.myshopify.com" +
  "&product=15420982264058&variantIdPin=67682177089786&variantIdMagnetic=67682177122554&variantIdAdhesive=67682177155322";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: SCALE,
});
await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(4000);
await page.getByRole("button", { name: /close/i }).first().click({ timeout: 2000 }).catch(() => {});

async function clickText(pattern, label) {
  const hit = await page.evaluate((src) => {
    const re = new RegExp(src, "i");
    const el = [...document.querySelectorAll("button, [role='button'], label")].find((node) =>
      re.test((node.innerText || node.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()),
    );
    if (el) el.click();
    return Boolean(el);
  }, pattern);
  console.log(`${label}: ${hit ? "clicked" : "missing"}`);
  await page.waitForTimeout(900);
  return hit;
}

await clickText("Rounded Corners 1 x 3", "shape");
await clickText("^Pick a Color$", "color step");
await clickText("Navy|Dark Blue|Black", "color");
await clickText("^Add Your Text$", "text step");

const values = ["ALEX MORGAN", "FRONT DESK"];
const inputs = page.locator('input[type="text"]:visible, textarea:visible');
const count = await inputs.count();
for (let i = 0; i < Math.min(count, values.length); i++) {
  await inputs.nth(i).fill(values[i]).catch(() => {});
  await page.waitForTimeout(400);
}
console.log(`filled ${Math.min(count, values.length)} of ${count}`);
await page.locator("body").click({ position: { x: 8, y: 8 } }).catch(() => {});
await page.waitForTimeout(2500);

const raw = join(outDir, "badge-raw-full.png");
const out = join(outDir, "sbl-badge-designer-shot.jpg");
await page.screenshot({ path: raw, fullPage: false });
const meta = await sharp(raw).metadata();
await sharp(raw)
  .resize({ width: 1600, withoutEnlargement: true })
  .jpeg({ quality: 86, mozjpeg: true })
  .toFile(out);
const done = await sharp(out).metadata();
console.log(`${out} ${done.width}x${done.height} from ${meta.width}x${meta.height}`);
await browser.close();
