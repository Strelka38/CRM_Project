import assert from "node:assert/strict";

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

console.log("stock-warning.test.ts ok");
