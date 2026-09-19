import assert from "node:assert/strict";
import { bottomBarShift, mobileChromeActive } from "./mobile-viewport";

assert.equal(typeof mobileChromeActive, "function");
assert.equal(mobileChromeActive(), false);

assert.equal(bottomBarShift(932, { height: 540, offsetTop: 0 }, false), 0);
assert.equal(bottomBarShift(932, { height: 540, offsetTop: 0 }, true), -392);
assert.equal(bottomBarShift(932, { height: 932, offsetTop: 0 }, true), 0);
assert.equal(bottomBarShift(932, { height: 800, offsetTop: 132 }, true), 0);
assert.equal(bottomBarShift(932, null, true), 0);
