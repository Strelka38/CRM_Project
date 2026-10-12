import assert from "node:assert/strict";
import { calcBlock } from "../quote-calc";
import { buildPrintGroups } from "./print-layout";
import { STANDARD_PRINT_OPTIONS } from "./print-options";

const block = {
  id: "1",
  type: "ITEM" as const,
  sortOrder: 1,
  name: "Дибокс",
  qty: 1,
  unitPrice: 1000,
  dayMode: "fixed1",
  zoneId: "z",
  itemKind: "EQUIPMENT",
};
const calc = calcBlock(block, true, 1, 10);

function lineSum(showTaxSeparate: boolean, cashless: boolean) {
  const priced = cashless ? calc : calcBlock(block, false, 1, 10);
  const groups = buildPrintGroups({
    docSections: [{ title: "Звук", items: [priced] }],
    blocks: [block],
    cashless,
    durationDays: 1,
    cashlessPercent: 10,
    discountPercent: 0,
    options: { ...STANDARD_PRINT_OPTIONS, showTaxSeparate },
  });
  const row = groups[0]?.rows.find((item) => item.kind === "item");
  assert.ok(row && row.kind === "item");
  return row.sum;
}

assert.equal(STANDARD_PRINT_OPTIONS.showTaxSeparate, true);
assert.equal(lineSum(true, true), calc.lineTotalCash);
assert.equal(lineSum(false, true), calc.lineTotal);
assert.ok(calc.lineTotal > calc.lineTotalCash);

const cash = calcBlock(block, false, 1, 10);
assert.equal(lineSum(true, false), cash.lineTotal);
assert.equal(lineSum(false, false), cash.lineTotal);

console.log("print-tax.test.ts ok");
