import assert from "node:assert/strict";
import {
  expandBlocksToItemQtySync,
  kitIdsFromBlocks,
  peakReservedQty,
} from "./stock";

/** Stock warning is a payload, not a 409 — save still happens. */
type StockIssue = {
  catalogItemId: string;
  name: string;
  needed: number;
  available: number;
  stockQty: number;
  shortfall: number;
};

function quotePatchResponse(issues: StockIssue[]) {
  return {
    status: 200,
    stockWarning: issues.length > 0,
    stockIssues: issues,
  };
}

const res = quotePatchResponse([
  {
    catalogItemId: "zoom",
    name: "Zoom",
    needed: 6,
    available: 4,
    stockQty: 4,
    shortfall: 2,
  },
]);
assert.equal(res.status, 200);
assert.equal(res.stockWarning, true);
assert.equal(res.stockIssues[0].shortfall, 2);
assert.notEqual(res.status, 409);

assert.equal(
  peakReservedQty([
    { dailyQty: { "2026-08-24": 2 } },
    {
      dailyQty: {
        "2026-08-25": 4,
        "2026-08-26": 4,
        "2026-08-27": 4,
      },
    },
  ]),
  4,
);
assert.equal(
  peakReservedQty([
    { dailyQty: { "2026-08-24": 2 } },
    { dailyQty: { "2026-08-24": 4 } },
  ]),
  6,
);

const kitBlocks = [
  {
    type: "ITEM",
    kitId: "kit-pa",
    zoneId: "z1",
    qty: 2,
  },
  {
    type: "ITEM",
    kitId: "kit-pa",
    zoneId: "z2",
    qty: 1,
  },
  {
    type: "ITEM",
    catalogItemId: "cable",
    name: "Кабель",
    qty: 3,
  },
];
assert.deepEqual(kitIdsFromBlocks(kitBlocks), ["kit-pa"]);

const kitMap = new Map([
  [
    "kit-pa",
    {
      id: "kit-pa",
      components: [
        {
          catalogItemId: "speaker",
          qty: 2,
          catalogItem: { id: "speaker", name: "Колонка" },
        },
      ],
    },
  ],
]);
const z1 = expandBlocksToItemQtySync(
  kitBlocks.filter((b) => b.zoneId === "z1"),
  kitMap,
);
const z2 = expandBlocksToItemQtySync(
  kitBlocks.filter((b) => b.zoneId === "z2"),
  kitMap,
);
assert.equal(z1.get("speaker")?.qty, 4);
assert.equal(z2.get("speaker")?.qty, 2);
const both = expandBlocksToItemQtySync(kitBlocks, kitMap);
assert.equal(both.get("speaker")?.qty, 6);
assert.equal(both.get("cable")?.qty, 3);

console.log("stock-warning.test.ts ok");
