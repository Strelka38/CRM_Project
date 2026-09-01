import assert from "node:assert/strict";
import {
  categoryPathChain,
  shouldRepairHiddenCatalogTree,
} from "./catalog-path-logic";

assert.deepEqual(categoryPathChain("Звук/Радиосистемы"), [
  "Звук",
  "Звук/Радиосистемы",
]);
assert.deepEqual(categoryPathChain("  LED Экраны / indoor  "), [
  "LED Экраны",
  "LED Экраны/indoor",
]);
assert.deepEqual(categoryPathChain(""), []);

assert.equal(shouldRepairHiddenCatalogTree(0, 663), true);
assert.equal(shouldRepairHiddenCatalogTree(0, 0), false);
assert.equal(shouldRepairHiddenCatalogTree(5, 663), false);

console.log("catalog-path.test.ts ok");
