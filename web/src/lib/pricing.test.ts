import assert from "node:assert/strict";
import { cashlessUnitPrice, dayCoefficient } from "./pricing";

assert.equal(cashlessUnitPrice(4000, true, null), 4450);
assert.equal(cashlessUnitPrice(250, true, null), 280);
assert.equal(cashlessUnitPrice(10000, true, null), 11120);
assert.equal(cashlessUnitPrice(750, true, null), 840);
assert.equal(cashlessUnitPrice(6000, true, null), 6670);
assert.equal(cashlessUnitPrice(3500, true, 20000), 20000);
assert.equal(cashlessUnitPrice(3500, false, 20000), 3500);
assert.equal(dayCoefficient("half_extra", 1), 1);
assert.equal(dayCoefficient("half_extra", 2), 1.5);
assert.equal(dayCoefficient("half_extra", 3), 2);
assert.equal(dayCoefficient("full_days", 3), 3);
assert.equal(dayCoefficient("fixed1", 5), 1);

console.log("pricing tests ok");
