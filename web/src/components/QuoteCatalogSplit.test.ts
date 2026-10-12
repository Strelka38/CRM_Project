import assert from "node:assert/strict";
import { clampQuoteCatalogWidth } from "./QuoteCatalogSplit";

assert.equal(clampQuoteCatalogWidth(300, 1600), 300);
assert.equal(clampQuoteCatalogWidth(80, 1600), 200);
assert.equal(clampQuoteCatalogWidth(5000, 1600), 992);
assert.equal(clampQuoteCatalogWidth(400, 500), 200);

console.log("quote catalog split ok");
