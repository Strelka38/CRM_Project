import assert from "node:assert/strict";
import {
  itemDeriveKey,
  kitComponentDeriveKey,
  sectionDeriveKey,
} from "./spec-build";

assert.equal(itemDeriveKey("b1"), "item:b1");
assert.equal(kitComponentDeriveKey("b1", "c1"), "kit:b1:c1");
assert.equal(sectionDeriveKey("s1"), "section:s1");

console.log("spec-build.test.ts: ok");
