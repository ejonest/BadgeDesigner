# Tool QA Framework

Automated QA for LITA's custom Shopify design tools, built using
[Playwright](https://playwright.dev). **All Quality Badges' badge
designer is the first tool profile** — this framework is structured so
adding a second tool (Vivid Stamp, Signs ByLITA, Gavels Fast, etc.)
means writing a new profile folder, not rebuilding the engine.

## Why it's structured this way

Everything genuinely common across any Shopify-based custom design
tool — combinatorial test-case generation, metadata-leak detection, the
design→review→proof flow, human-behavior patterns like "customer
backtracks after reaching the review step" — lives in `core/` and
doesn't know anything about badges, stamps, or signs.

**Where a run stops:** this suite drives the local dev designer, which
has no Shopify wiring, so every test ends at the PDF proof and asserts
that add-to-cart is blocked. Reaching a real cart is a failure, not a
pass. See `SETUP.md` for the full explanation.

Everything specific to ONE tool — its actual design steps, its real
selectors, its option lists, its pricing — lives in its own
`profiles/<tool-name>/` folder.

This split was written deliberately **after** building the first
version tool-specifically for AQB, not before — abstracting before you
have a second real case tends to guess wrong about where the seams
actually are. AQB's profile is the proof the split works; a second
profile is what will actually test whether the abstraction holds.

## Structure

```
tool-qa-framework/
├── core/                              # tool-agnostic engine
│   ├── pairwise.js                    # combinatorial test-case generator
│   ├── checks.js                      # leak detection + price-check factory
│   ├── flow-runner.js                 # declarative step executor + proof tail
│   ├── interactions.js                # click/fill helpers; reports covered controls
│   └── persona-behaviors.js           # generic human-behavior patterns
├── profiles/
│   └── aqb-badge-tool/                # everything specific to AQB's tool
│       ├── selectors.js               # read off the live dev DOM
│       ├── dimensions.js              # this tool's configurable options
│       ├── config.js                  # ties selectors + steps + pricing together
│       ├── sample-data.js             # AQB-specific text/CSV generators
│       ├── scenarios.js               # named real-order test cases
│       ├── personas.js                # persona descriptions
│       ├── generate-cases.js          # run to produce test-cases.json
│       ├── test-cases.json            # generated pairwise cases
│       └── golden-path.md / .pdf      # ideal customer journey for THIS tool
├── tests/
│   ├── aqb-badge-tool.spec.js         # pairwise + named-scenario suites
│   └── aqb-badge-tool.personas.spec.js
├── docs/
│   └── how-to-add-a-new-tool-profile.md   # start here when adding tool #2
├── playwright.config.js
└── package.json
```

## Before running for real

Selectors in `profiles/aqb-badge-tool/selectors.js` are placeholders —
built from screenshots and video review, not a live inspection of the
site's markup. Run `npm run codegen:aqb`, click through one full
design by hand, and copy the real selectors Playwright's recorder
shows you.

## Setup

```bash
npm install
npx playwright install
```

## Generate test cases

```bash
npm run generate-cases:aqb-badge-tool
```

## Run

```bash
npm test              # everything, all profiles, all 5 browser targets
npm run test:aqb      # just the AQB profile
npm run test:chrome   # desktop Chrome only, fastest for quick checks
npm run test:mobile   # mobile Chrome + mobile Safari only
npm run report        # view the HTML report after a run
```

## Adding a second tool

Read `docs/how-to-add-a-new-tool-profile.md` first. It walks through
building a new profile step by step, and flags the parts worth
genuinely reconsidering rather than copy-pasting blind.

## A note on Mobile Safari

The `mobile-safari` project emulates iOS Safari via the WebKit engine
plus an iPhone viewport — a strong approximation, not the literal
Safari build on a real device. Use this suite as the fast, everyday
check; periodically verify the riskiest flows (checkout especially) on
a real-device cloud service like BrowserStack or LambdaTest before
anything ships.
