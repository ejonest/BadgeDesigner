# Gadget.dev backup

Snapshot taken so the Gadget apps can be retired without losing source, actions, or (when API keys are present) model records.

## What is in this folder

| Path | Contents |
|------|----------|
| `apps/all-quality-badge-designer/` | Local Gadget app checkout (`ggt pull` / `ggt dev`) from this machine: models, `on_order_paid`, Shopify connection TOMLs, permissions, generated `.gadget` client/server. **Does not include `node_modules`.** |
| `actions-from-this-repo/` | Copies of the Gadget action/setup docs that live in this Remix repo (often newer than the March app checkout). |
| `data/` | JSON dumps of live Gadget records, produced by `scripts/backup-gadget-data.mjs`. Empty until that script is run with API keys. |

The generated API client used by this Remix app is also in the repo at `gadget-client/`.

## Live record dump

From the repo root, with Gadget API keys in `.env` or the shell:

```bash
node scripts/backup-gadget-data.mjs
```

The script talks to each configured Gadget app (`GADGET_API_URL` / `GADGET_API_KEY`, plus sign/plaque/gavel/etc. overrides), paginates the internal GraphQL lists, redacts token/secret-looking fields, and writes JSON under `data/`. Session records are not exported.

Local `.env` on this machine had an empty `GADGET_API_KEY`, so records were not dumped here. After keys are available (Vercel env or Gadget **Settings → API keys**), run the script once and commit `backups/gadget/data/*.json`.

## Apps we know about

- **all-quality-badge-designer** — badge (and fallback) app. Source snapshot is in `apps/`. Dev URL: `https://all-quality-badge-designer--development.gadget.app`. Prod: `https://all-quality-badge-designer.gadget.app`.
- **signs-by-lita-connection** — sign/plaque Gadget app. No local `ggt` checkout was found on this machine; dump it with `GADGET_SIGN_API_URL` / `GADGET_SIGN_API_KEY` (and plaque vars if they point at a different app).
- **gavels-fast-connection** — gavel app (see `GADGET_GAVEL_SETUP.md`). No local checkout found; dump with `GADGET_GAVEL_API_URL` / `GADGET_GAVEL_API_KEY`.

To refresh the **source** snapshot after logging into Gadget CLI:

```bash
ggt login
# in a Gadget app directory:
ggt pull
```

Then copy the app (excluding `node_modules`) back into `apps/`.
