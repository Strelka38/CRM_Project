import assert from "node:assert/strict";
import { laneHeightToFit, lanesThatFit } from "./calendar-lanes";

const desktop = {
  laneHeight: 16,
  laneGap: 3,
  dayNumHeight: 30,
  overflowRow: 18,
};

// TimeTree-референс: ~100% — 5 полос, ~67% — больше.
assert.equal(lanesThatFit(148, desktop), 5);
assert.equal(lanesThatFit(220, desktop), 9);
assert.equal(lanesThatFit(0, desktop), 1);
assert.equal(lanesThatFit(40, desktop), 1);
assert.equal(lanesThatFit(400, desktop, { max: 12 }), 12);

// 15 Pro Max, 5 недель: ~126px на ячейку → 6 полос по 16px (gap 1, дата 20).
assert.equal(
  laneHeightToFit(126, { laneGap: 1, dayNumHeight: 20, overflowRow: 0 }, 6, {
    min: 12,
    max: 18,
  }),
  16,
);
assert.equal(
  laneHeightToFit(0, { laneGap: 2, dayNumHeight: 22, overflowRow: 0 }, 6),
  12,
);

console.log("calendar-lanes.test.ts ok");
