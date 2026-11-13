import assert from "node:assert/strict";
import test from "node:test";

import { normalizePlate, parseVariant } from "./buildManifest.mjs";

test("plate tokens collapse brushed finishes", () => {
  assert.equal(normalizePlate("brushed-gold"), "gold");
  assert.equal(normalizePlate("brushed-silver"), "silver");
  assert.equal(normalizePlate("full-color"), "full-color");
  assert.equal(normalizePlate("nope"), null);
});

test("black frame is the frame even when the product name says wood-frame", () => {
  assert.deepEqual(
    parseVariant(
      "Custom-Insert-Your-Logo-Award-Plaque-wood-frame-(black-white)-Black-Frame-main-400x400-preview.jpg",
      "logo",
    ),
    { plate: "black-white", frame: "black" },
  );
});

test("award bundles use the finish next to the file size", () => {
  assert.deepEqual(
    parseVariant("_Your-Award_-Plaque-Bundles-(1st,-2nd,-3rd)-wooden-(brushed-gold)-main-400x400.jpg", "your-award"),
    { plate: "gold", frame: "wood" },
  );
});

test("the memorial pair is a photo plaque, not an attached finish set", () => {
  assert.deepEqual(parseVariant("In-Loving-Memory-photo-wooden-plaque-main-400x400.jpg", "in-loving-memory"), {
    plate: "gold",
    frame: "wood",
  });
  assert.deepEqual(parseVariant("In-Loving-Memory-photo-black-plaque-main-400x400.jpg", "in-loving-memory"), {
    plate: "black-white",
    frame: "black",
  });
});
