import assert from "node:assert/strict";
import { calcAssignmentPay } from "./payroll";

assert.equal(
  calcAssignmentPay({
    payMode: "SHIFT",
    shiftRate: 12000,
    hourlyRate: 1500,
  }),
  12000,
);

assert.equal(
  calcAssignmentPay({
    payMode: "HOURLY",
    hours: 8,
    shiftRate: 12000,
    hourlyRate: 1500,
  }),
  12000,
);

assert.equal(
  calcAssignmentPay({
    payMode: "SHIFT",
    shiftRate: 12000,
    hourlyRate: 1500,
    rateOverride: 20000,
  }),
  20000,
);

console.log("payroll tests ok");
