import assert from "node:assert/strict";
import { blocksInActiveZones, calcBlock, calcByZones } from "./quote-calc";

const zones = [
  { id: "z1", name: "Звук", sortOrder: 0, active: true },
  { id: "z2", name: "Свет", sortOrder: 1, active: false },
];

const blocks = [
  {
    type: "ITEM" as const,
    sortOrder: 0,
    name: "Микшер",
    qty: 1,
    unitPrice: 1000,
    dayMode: "FIXED1",
    zoneId: "z1",
  },
  {
    type: "ITEM" as const,
    sortOrder: 1,
    name: "Пар",
    qty: 2,
    unitPrice: 500,
    dayMode: "FIXED1",
    zoneId: "z2",
  },
];

const calc = calcByZones(zones, blocks, false, 1, 0, 10);
assert.equal(calc.zones[0].payable, 1000);
assert.equal(calc.zones[1].payable, 0);
assert.equal(calc.zones[1].active, false);
assert.equal(calc.payable, 1000);
assert.equal(calc.itemCount, 1);

const stockBlocks = blocksInActiveZones(zones, blocks);
assert.equal(stockBlocks.length, 1);
assert.equal(stockBlocks[0].name, "Микшер");

const ownCashless = calcBlock(
  {
    type: "ITEM",
    sortOrder: 0,
    qty: 1,
    unitPrice: 4000,
    cashlessOverride: 20000,
    dayMode: "FIXED1",
  },
  true,
  1,
  10,
);
assert.equal(ownCashless.lineTotal, 20000);

const formulaCashless = calcBlock(
  {
    type: "ITEM",
    sortOrder: 0,
    qty: 1,
    unitPrice: 4000,
    cashlessOverride: null,
    dayMode: "FIXED1",
  },
  true,
  1,
  10,
);
assert.equal(formulaCashless.displayUnitPrice, 4450);

const splitZones = [
  { id: "za", name: "A", sortOrder: 0, active: true, workingDayIndexes: [1, 2] },
  { id: "zb", name: "B", sortOrder: 1, active: true, workingDayIndexes: [3, 4] },
];
const splitBlocks = [
  {
    type: "ITEM" as const,
    sortOrder: 0,
    name: "Пульт",
    qty: 1,
    unitPrice: 1000,
    dayMode: "HALF_EXTRA",
    zoneId: "za",
  },
  {
    type: "ITEM" as const,
    sortOrder: 1,
    name: "Кабинет",
    qty: 1,
    unitPrice: 1000,
    dayMode: "HALF_EXTRA",
    zoneId: "zb",
  },
];
const split = calcByZones(splitZones, splitBlocks, false, 4, 0, 10);
assert.equal(split.zones[0].payable, 1500);
assert.equal(split.zones[1].payable, 1500);
assert.equal(split.payable, 3000);

console.log("quote-calc-zones.test.ts ok");
