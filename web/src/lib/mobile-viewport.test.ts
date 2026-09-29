import assert from "node:assert/strict";
import { isTextEntry, mobileChromeActive } from "./mobile-viewport";

assert.equal(typeof mobileChromeActive, "function");
assert.equal(mobileChromeActive(), false);
assert.equal(isTextEntry(null), false);
