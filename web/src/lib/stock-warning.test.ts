import assert from "node:assert/strict";
import { peakReservedQty } from "./stock";

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

console.log("stock-warning.test.ts ok");
