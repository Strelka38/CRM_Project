import assert from "node:assert/strict";
import { lockSwipeAxis, swipeMonthDelta } from "./calendar-swipe";

assert.equal(lockSwipeAxis(0, 0), null);
assert.equal(lockSwipeAxis(7, 3), null);
assert.equal(lockSwipeAxis(20, 8), "x");
assert.equal(lockSwipeAxis(-20, 8), "x");
assert.equal(lockSwipeAxis(8, 20), "y");
assert.equal(lockSwipeAxis(8, -20), "y");
assert.equal(lockSwipeAxis(12, 12), "y");
assert.equal(lockSwipeAxis(20, 8, 12), "x");
assert.equal(lockSwipeAxis(10, 8, 12), null);

assert.equal(swipeMonthDelta(-80, 400, 0), 0);
assert.equal(swipeMonthDelta(-90, 400, 0), 1);
assert.equal(swipeMonthDelta(90, 400, 0), -1);
assert.equal(swipeMonthDelta(-20, 400, -0.5), 1);
assert.equal(swipeMonthDelta(20, 400, 0.5), -1);
assert.equal(swipeMonthDelta(0, 0, -1), 0);
