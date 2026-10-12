import assert from "node:assert/strict";
import { STANDARD_PRINT_OPTIONS } from "./export/print-options";
import {
  isShareToken,
  parseShareFilters,
  publicQuotePath,
  readShareFilters,
  shareClearedByLifecycle,
} from "./quote-share";

assert.equal(shareClearedByLifecycle("COMPLETED"), true);
assert.equal(shareClearedByLifecycle("CONFIRMED"), false);
assert.equal(shareClearedByLifecycle("CANCELLED"), false);
assert.equal(shareClearedByLifecycle("CALCULATED"), false);

assert.equal(publicQuotePath("abc"), "/kp/abc");
assert.equal(isShareToken("a".repeat(20)), true);
assert.equal(isShareToken("short"), false);
assert.equal(isShareToken("bad token value here!!"), false);

const filters = parseShareFilters(
  {
    includeSummary: true,
    allTabsOneSheet: false,
    showEquipmentPrice: false,
    showConsumablePrice: true,
    showServicePrice: false,
    zoneIds: ["a", "missing"],
    print: { ...STANDARD_PRINT_OPTIONS, showClient: true },
  },
  ["a", "b"],
);
assert.deepEqual(filters.zoneIds, ["a"]);
assert.equal(filters.includeSummary, true);
assert.equal(filters.allTabsOneSheet, false);
assert.equal(filters.showEquipmentPrice, false);
assert.equal(filters.showServicePrice, false);
assert.equal(filters.print?.showClient, true);
assert.equal(filters.print?.showFormedAt, true);

const fallback = parseShareFilters(null, ["a", "b"]);
assert.deepEqual(fallback.zoneIds, ["a", "b"]);
assert.equal(fallback.showEquipmentPrice, true);

assert.equal(readShareFilters({ zoneIds: [] }, ["a"]), null);
assert.equal(readShareFilters({ zoneIds: ["other"] }, ["a"]), null);
assert.deepEqual(readShareFilters({ zoneIds: ["a"] }, ["a", "b"])?.zoneIds, [
  "a",
]);

console.log("quote-share.test.ts ok");
