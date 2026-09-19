import assert from "node:assert/strict";
import { lanesThatFit } from "./calendar-lanes";

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

console.log("calendar-lanes.test.ts ok");
