import assert from "node:assert/strict";
import {
  MIN_ZONE_BLOCK_MM,
  partitionByKind,
  remainingPageMm,
  shouldStartNewPage,
} from "./estimate-layout";

assert.equal(remainingPageMm(210, 160, 12), 38);
assert.equal(shouldStartNewPage(38), true);
assert.equal(shouldStartNewPage(80), false);
assert.equal(shouldStartNewPage(MIN_ZONE_BLOCK_MM), false);
assert.equal(shouldStartNewPage(MIN_ZONE_BLOCK_MM - 0.1), true);

const parts = partitionByKind(
  [
    { name: "Микрофон", kind: "equipment" as const },
    { name: "Кабель", kind: "consumable" as const },
    { name: "Звукорежиссёр", kind: "service" as const },
  ],
  (i) => i.kind,
);
assert.deepEqual(
  parts.rental.map((i) => i.name),
  ["Микрофон", "Кабель"],
);
assert.deepEqual(
  parts.services.map((i) => i.name),
  ["Звукорежиссёр"],
);

console.log("estimate-layout.test.ts: ok");
