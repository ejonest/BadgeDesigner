/**
 * Rebuild the manufacturing SVGs for a gavel order line from its saved design
 * JSON, for orders placed before the designer saved every engraved surface.
 *
 * Loads the real generators through Vite rather than reimplementing them, so a
 * regenerated file cannot drift from what the designer produces today.
 *
 * Usage:
 *   node scripts/regenerate-gavel-svgs.mjs --json order.json [--out dir]
 *   node scripts/regenerate-gavel-svgs.mjs < order.json
 *
 * Accepts the designer payload, a gavel_order_items.data_json value, or a row
 * with data_json / badge_json wrapped around it.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const ROOT = path.resolve(import.meta.dirname, "..");

function parseArgs(argv) {
  const args = { json: null, out: path.join(ROOT, "tmp-gavel-svgs") };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") args.json = argv[++i];
    else if (arg === "--out") args.out = path.resolve(argv[++i]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (!args.json && !arg.startsWith("-")) args.json = arg;
  }
  return args;
}

async function readInput(jsonPath) {
  const raw = jsonPath
    ? await readFile(path.resolve(jsonPath), "utf8")
    : await readFile(0, "utf8");
  if (!raw.trim()) {
    throw new Error("No design JSON given. Pass --json <file> or pipe it in.");
  }
  return JSON.parse(raw);
}

/** Unwrap a DB row or designer payload down to the object holding the gavel fields. */
function pickDesign(input) {
  const candidates = [
    input,
    input?.data_json,
    input?.badge_json,
    input?.badge,
    Array.isArray(input?.allBadges) ? input.allBadges[0] : null,
  ];
  const design = candidates.find(
    (c) => c && typeof c === "object" && (c.lines || c.gavelProductType),
  );
  if (!design) {
    throw new Error(
      "Could not find gavel design fields (lines / gavelProductType) in the JSON.",
    );
  }
  return design;
}

/** Lines the band is engraved with: blanks are dropped by the generators. */
function bandLines(design) {
  return Array.isArray(design.lines) ? design.lines : [];
}

/**
 * The plate carries its own copy. Older drafts saved none, in which case the
 * designer fell back to the first two band lines — mirror that here.
 */
function plateLines(design, maxLines) {
  const saved = Array.isArray(design.gavelStandPlateLines)
    ? design.gavelStandPlateLines
    : [];
  const filled = saved.filter((l) => (l?.text ?? "").trim());
  if (filled.length > 0) return saved;
  return bandLines(design).slice(0, maxLines);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      "Usage: node scripts/regenerate-gavel-svgs.mjs --json <file> [--out <dir>]",
    );
    return;
  }

  const input = await readInput(args.json);
  const design = pickDesign(input);

  const server = await createServer({
    root: ROOT,
    configFile: false,
    logLevel: "warn",
    plugins: [tsconfigPaths()],
    server: { middlewareMode: true },
  });

  try {
    // Root-relative entry paths: the `~/` alias resolves inside the modules,
    // but ssrLoadModule's own argument bypasses plugin resolution.
    const texture = await server.ssrLoadModule(
      "/app/utils/gavelBandTexture.ts",
    );
    const styles = await server.ssrLoadModule("/app/constants/gavelStyles.ts");

    const preset = design.gavelTextSizePreset || "medium";
    const isStand = design.gavelProductType === "stand";
    const bandHex =
      styles.getGavelBandFinish(design.gavelBandFinish).color ||
      design.gavelBandColor ||
      design.backgroundColor;

    if (design.gavelLogoFileName) {
      console.warn(
        `! Design references logo "${design.gavelLogoFileName}". Logo art is not in ` +
          "the JSON, so these files carry text only — re-add the logo before cutting.",
      );
    }

    const files = [
      {
        name: "gavel-band.svg",
        what: `band (${design.gavelBandFinish || "gold"})`,
        svg: texture.gavelBandToSvgString(bandLines(design), preset, bandHex),
      },
    ];

    if (isStand) {
      files.push({
        name: "gavel-plate.svg",
        what: `stand plate (${design.gavelStandFinish || "gold"})`,
        svg: texture.gavelStandPlateToSvgString(
          plateLines(design, styles.STAND_PLATE_MAX_LINES),
          preset,
          styles.getGavelStandFinish(design.gavelStandFinish).plateHex,
        ),
      });
    } else if (design.gavelSoundBlock === "engraved") {
      const first = bandLines(design)[0] ?? {};
      const savedLines = Array.isArray(design.gavelSoundBlockLines)
        ? design.gavelSoundBlockLines
        : String(design.gavelSoundBlockText || "")
            .split("\n")
            .filter((text) => text.trim())
            .map((text, index) =>
              index === 0
                ? { ...first, text }
                : { text },
            );
      const lines =
        savedLines.length > 0
          ? savedLines
          : [
              {
                text: (first.text || "").trim(),
                fontFamily: first.fontFamily,
                bold: first.bold,
                italic: first.italic,
                underline: first.underline,
              },
            ];
      files.push({
        name: "gavel-sound-block.svg",
        what: "sound block top",
        svg: texture.soundBlockTopToSvgString(
          lines,
          styles.getSoundBlockTopTextColor(design.gavelStyle),
        ),
      });
    }

    await mkdir(args.out, { recursive: true });
    for (const file of files) {
      const dest = path.join(args.out, file.name);
      await writeFile(dest, file.svg, "utf8");
      console.log(`wrote ${file.what.padEnd(24)} ${dest}`);
    }
  } finally {
    await server.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
