import assert from "node:assert/strict";
import { collapseKitBlocks } from "./kit-blocks";
import type { QuoteBlockInput } from "./quote-calc";

const collapsed = collapseKitBlocks<QuoteBlockInput>([
  { type: "SECTION", sortOrder: 0, title: "Комплекты" },
  {
    type: "KIT_HEADER",
    sortOrder: 1,
    title: "Комплект: Свет",
    kitId: "k1",
  },
  {
    type: "ITEM",
    sortOrder: 2,
    name: "Прибор A",
    qty: 2,
    unitPrice: 1000,
    kitId: "k1",
    catalogItemId: "c1",
  },
  {
    type: "ITEM",
    sortOrder: 3,
    name: "Прибор B",
    qty: 1,
    unitPrice: 500,
    kitId: "k1",
    catalogItemId: "c2",
  },
  {
    type: "ITEM",
    sortOrder: 4,
    name: "Обычная позиция",
    qty: 1,
    unitPrice: 100,
    catalogItemId: "c3",
  },
]);

assert.equal(collapsed.length, 3);
assert.equal(collapsed[1].type, "ITEM");
assert.equal(collapsed[1].kitId, "k1");
assert.equal(collapsed[1].catalogItemId, null);
assert.equal(collapsed[1].qty, 1);
assert.equal(collapsed[1].unitPrice, 2500);
assert.equal(collapsed[1].name, "Свет");
assert.equal(collapsed[2].name, "Обычная позиция");

console.log("kit-blocks tests ok");
