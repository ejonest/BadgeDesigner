/**
 * Renders the production artwork and the proof board straight out of
 * penRender, so the engraving files can be checked independently of the
 * preview: the print file must be black art, the proof sheet light art, and
 * both must place the mark to the left of the text.
 */
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const BASE = process.env.PEN_BASE_URL ?? "http://localhost:5173";
const LOGO = path.join(import.meta.dirname, "fixtures", "out", "pen-logo.png");
const OUT = path.join(import.meta.dirname, "..", "report", "pen-logo");

await mkdir(OUT, { recursive: true });
const logoBase64 = (await readFile(LOGO)).toString("base64");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
page.on("console", (msg) => console.log(`[${msg.type()}]`, msg.text()));
await page.goto(`${BASE}/pen-designer`, { waitUntil: "networkidle" });

const result = await page.evaluate(async (logoDataUrl) => {
  const ink = await import("/app/utils/logoBlackInk.ts");
  const render = await import("/app/utils/penRender.ts");
  const art = await ink.blackInkLogoFromSrc(logoDataUrl);
  if (!art) return { error: "conversion returned null" };

  const base = {
    text: "DAXMOOR",
    fontFamily: "Roboto",
    bold: false,
    italic: false,
    logo: art,
  };
  const board = await render.penProofBoardToPng({
    band: { ...base, text: "Anderson Quality Badges" },
    cap: base,
  });
  return {
    aspect: art.aspect,
    capPrint: render.penCapToSvgString(base),
    bandPrint: render.penCaseBandToSvgString({
      ...base,
      text: "Anderson Quality Badges",
    }),
    board: board.dataUrl,
  };
}, `data:image/png;base64,${logoBase64}`);

if (result.error) {
  console.log("FAILED:", result.error);
} else {
  console.log("ink aspect:", result.aspect.toFixed(3));
  // Strip the embedded art so the geometry and the fill are readable.
  const summarize = (svg, name) => {
    const trimmed = svg.replace(/href="data:[^"]+"/g, 'href="<art>"');
    console.log(`\n--- ${name} ---\n${trimmed}`);
  };
  summarize(result.capPrint, "cap print file");
  summarize(result.bandPrint, "band print file");

  await page.setContent(
    `<body style="margin:0"><img src="${result.board}" style="width:1200px"></body>`,
  );
  await page.locator("img").screenshot({ path: path.join(OUT, "proof-board.png") });
  console.log("\nwrote proof-board.png");
}

await browser.close();
