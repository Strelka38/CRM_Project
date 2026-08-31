import assert from "node:assert/strict";
import {
  freelancerAssignmentPay,
  freelancerNameKey,
  freelancerNamesMatch,
  normalizeFreelancerName,
  quoteCountsForFreelancerStats,
} from "./freelancer-directory";

assert.equal(normalizeFreelancerName("  Иванов   А.  "), "Иванов А.");
assert.equal(freelancerNameKey("Иванов А."), "иванов а.");
assert.equal(freelancerNamesMatch("Иванов А.", "иванов  а."), true);
assert.equal(freelancerNamesMatch("Иванов", "Петров"), false);
assert.equal(freelancerNamesMatch("", ""), false);

assert.equal(
  freelancerAssignmentPay({
    payMode: "SHIFT",
    rateOverride: 15000,
    bonus: 1000,
    montageAmount: 2000,
  }),
  18000,
);
assert.equal(
  freelancerAssignmentPay({
    payMode: "SHIFT",
    rateOverride: null,
    bonus: 0,
    montageAmount: 0,
  }),
  0,
);

assert.equal(quoteCountsForFreelancerStats("CONFIRMED"), true);
assert.equal(quoteCountsForFreelancerStats("COMPLETED"), true);
assert.equal(quoteCountsForFreelancerStats("CALCULATED"), false);

console.log("freelancer-directory.test.ts ok");
