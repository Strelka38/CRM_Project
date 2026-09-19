import assert from "node:assert/strict";
import { swipeMonthDelta } from "./calendar-swipe";

assert.equal(swipeMonthDelta(-80, 400, 0), 0);
assert.equal(swipeMonthDelta(-90, 400, 0), 1);
assert.equal(swipeMonthDelta(90, 400, 0), -1);
assert.equal(swipeMonthDelta(-20, 400, -0.5), 1);
assert.equal(swipeMonthDelta(20, 400, 0.5), -1);
assert.equal(swipeMonthDelta(0, 0, -1), 0);
