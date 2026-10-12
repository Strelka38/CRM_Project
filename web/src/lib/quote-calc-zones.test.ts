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

const priced = calcByZones(
  [
    {
      id: "z1",
      name: "Зал",
      sortOrder: 0,
      active: true,
      pricing: {
        coefEquipment: 2,
        coefConsumable: 1,
        coefService: 1.5,
        discountEquipment: 10,
        discountConsumable: 0,
        discountService: 0,
        tax1Label: "Налоги, банк",
        tax1Rate: 10,
        tax1Mode: "IN_TOTAL",
        tax1Visible: true,
        tax2Label: "",
        tax2Rate: 0,
        tax2Mode: "IN_TOTAL",
        tax2Visible: false,
        legalEntityId: null,
      },
    },
  ],
  [
    {
      type: "ITEM" as const,
      sortOrder: 0,
      name: "Пар",
      qty: 1,
      unitPrice: 1000,
      dayMode: "FIXED1",
      zoneId: "z1",
      itemKind: "EQUIPMENT",
    },
    {
      type: "ITEM" as const,
      sortOrder: 1,
      name: "Техник",
      qty: 1,
      unitPrice: 1000,
      dayMode: "FIXED1",
      zoneId: "z1",
      itemKind: "SERVICE",
    },
  ],
  false,
  1,
  0,
  10,
);
// аренда 1000×2×0.9 = 1800, услуги 1000×1.5 = 1500, налог 10% от 3300
assert.equal(priced.zones[0].equipmentTotal, 1800);
assert.equal(priced.zones[0].servicesTotal, 1500);
assert.equal(priced.zones[0].tax, 330);
assert.equal(priced.payable, 3630);

console.log("quote-calc-zones.test.ts ok");
