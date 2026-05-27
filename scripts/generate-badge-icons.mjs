#!/usr/bin/env node
/** @deprecated Use scripts/import-badge-icons-from-preview.mjs */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "import-badge-icons-from-preview.mjs",
);
const r = spawnSync(process.execPath, [script], { stdio: "inherit" });
process.exit(r.status ?? 1);
