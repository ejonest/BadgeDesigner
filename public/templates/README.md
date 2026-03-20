# Template SVGs

- **`badge/`** – SVG shape templates for the badge designer. Referenced in `app/data/templates.local.json` with paths like `/templates/badge/round-1x3.svg`.
- **`sign/`** – SVG shape templates for the sign designer. Add your sign SVGs here and reference them in `app/data/sign-templates.local.json` with paths like `/templates/sign/your-sign.svg`.

Each template SVG should include an **Inner** path (and optionally **Outline**) for the loader in `app/utils/templates.ts` to work. The loader also supports **circle**/ellipse elements and paths with **Design** / **Border** ids.

**Encoding:** Badge SVGs are UTF-8. Sign SVGs exported from CorelDRAW are often UTF-16; the loader supports both. To match the badge designer and avoid encoding quirks, re-save sign SVGs as **UTF-8** (e.g. in your editor “Save with encoding” or in CorelDRAW export options if available).
