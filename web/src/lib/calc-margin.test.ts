import assert from "node:assert/strict";
import { resolveLineEconomics, isCostAwareKind } from "./calc-line-cost";
import { emptyAmounts, computeQuoteCalculation } from "./quote-calculation";
import { buildFreelancerExpenseInputs, buildLaborAndMontageBreakdown } from "./calc-labor";
import type { AssignmentLike } from "./quote-assignments";

assert.equal(isCostAwareKind("SERVICE"), true);
assert.equal(isCostAwareKind("PERSONNEL"), true);
assert.equal(isCostAwareKind("EQUIPMENT", "Zoom"), true);
assert.equal(isCostAwareKind("EQUIPMENT", "Микшер"), false);

const serviceDefault = resolveLineEconomics({
  clientTotal: 10000,
  qty: 1,
  itemKind: "SERVICE",
  name: "Монтаж оборудования",
});
assert.equal(serviceDefault.cost, 0);
assert.equal(serviceDefault.margin, 10000);
assert.equal(serviceDefault.costSource, "none");

const shiftDefault = resolveLineEconomics({
  clientTotal: 8000,
  qty: 1,
  itemKind: "PERSONNEL",
  name: "Звукооператор",
});
assert.equal(shiftDefault.cost, 0);
assert.equal(shiftDefault.margin, 8000);
assert.equal(shiftDefault.costSource, "none");

const pass = resolveLineEconomics({
  clientTotal: 3000,
  qty: 1,
  itemKind: "EQUIPMENT",
  name: "Zoom",
});
assert.equal(pass.cost, 3000);
assert.equal(pass.margin, 0);
assert.equal(pass.costSource, "passthrough");

const zoom = resolveLineEconomics({
  clientTotal: 3000,
  qty: 1,
  itemKind: "SERVICE",
  name: "Zoom",
  costOverride: 1800,
});
assert.equal(zoom.cost, 1800);
assert.equal(zoom.margin, 1200);

const fromCatalog = resolveLineEconomics({
  clientTotal: 3000,
  qty: 1,
  itemKind: "SERVICE",
  catalogUnitCost: 1800,
});
assert.equal(fromCatalog.cost, 1800);
assert.equal(fromCatalog.margin, 1200);

const gear = resolveLineEconomics({
  clientTotal: 5000,
  qty: 1,
  itemKind: "EQUIPMENT",
  name: "Микшер",
});
assert.equal(gear.cost, 0);
assert.equal(gear.margin, 5000);

const zoomLine = {
  block: {
    id: "zoom",
    type: "ITEM" as const,
    sortOrder: 0,
    name: "Zoom",
    qty: 1,
    unitPrice: 3000,
    dayMode: "FIXED1",
    itemKind: "SERVICE",
  },
  catalogOwners: ["NE_EVENT" as const],
  unitCost: null,
  override: {
    mode: "SHARE" as const,
    ownersCustom: false,
    owners: ["NE_EVENT" as const],
    amounts: emptyAmounts(),
    costOverride: 1800,
  },
};

const calc = computeQuoteCalculation({
  durationDays: 1,
  discountPercent: 0,
  lines: [zoomLine],
  expenses: [],
  sharesCustom: false,
});

assert.equal(calc.payable, 3000);
assert.equal(calc.cogsTotal, 1800);
assert.equal(calc.marginTotal, 1200);
const ne = calc.breakdown.find((b) => b.company === "NE_EVENT");
assert.ok(ne);
assert.equal(ne.revenue, 1200);
assert.equal(ne.cogs, 1800);
assert.equal(ne.expenses, 0);
assert.equal(ne.net, 1200);

const noCost = computeQuoteCalculation({
  durationDays: 1,
  discountPercent: 0,
  lines: [
    {
      ...zoomLine,
      override: {
        ...zoomLine.override,
        costOverride: null,
      },
    },
  ],
  expenses: [],
  sharesCustom: false,
});
assert.equal(noCost.marginTotal, 3000);
assert.equal(noCost.cogsTotal, 0);
assert.equal(noCost.breakdown.find((b) => b.company === "NE_EVENT")?.revenue ?? 0, 3000);

const discounted = computeQuoteCalculation({
  durationDays: 1,
  discountPercent: 10,
  lines: [zoomLine],
  expenses: [],
  sharesCustom: false,
});
assert.equal(discounted.payable, 2700);
assert.equal(discounted.cogsTotal, 1800);
assert.equal(discounted.marginTotal, 900);
assert.equal(discounted.breakdown.find((b) => b.company === "NE_EVENT")?.revenue, 900);
assert.equal(discounted.breakdown.find((b) => b.company === "NE_EVENT")?.net, 900);

const freelancer: AssignmentLike = {
  id: "a1",
  userId: null,
  specialtyId: "sp",
  payMode: "SHIFT",
  hours: null,
  rateOverride: 4000,
  bonus: 0,
  montageAmount: 1500,
  isFreelancer: true,
  freelancerName: "Иванов",
  owners: ["NE_EVENT"],
  specialty: { id: "sp", name: "Звук" },
};

const autoExp = buildFreelancerExpenseInputs([freelancer]);
assert.equal(autoExp.length, 2);
assert.match(autoExp[0].name, /Фриланс: Иванов/);
assert.equal(autoExp[0].amount, 4000);
assert.match(autoExp[1].name, /Монтаж \(фриланс\): Иванов/);
assert.equal(autoExp[1].amount, 1500);

const withFreelance = computeQuoteCalculation({
  durationDays: 1,
  discountPercent: 0,
  lines: [zoomLine],
  expenses: autoExp,
  sharesCustom: false,
});
const ne2 = withFreelance.breakdown.find((b) => b.company === "NE_EVENT");
assert.ok(ne2);
assert.equal(ne2.revenue, 1200);
assert.equal(ne2.expenses, 5500);
assert.equal(ne2.net, 1200 - 5500);

const mountWorker: AssignmentLike = {
  id: "m1",
  userId: "u1",
  specialtyId: "sp",
  kind: "MOUNT",
  payMode: "SHIFT",
  hours: null,
  rateOverride: 12000,
  bonus: 0,
  montageAmount: 0,
  isFreelancer: false,
  freelancerName: "",
  owners: ["NE_EVENT"],
  specialty: { id: "sp", name: "Монтажник" },
  user: {
    id: "u1",
    name: "Петров",
    owners: ["NE_EVENT"],
    specialties: [{ specialtyId: "sp", hourlyRate: 0, shiftRate: 8000 }],
  },
};

const montageDelta = buildLaborAndMontageBreakdown({
  assignments: [mountWorker],
  revenueByCompany: { NE_EVENT: 1200 },
  expensesByCompany: { NE_EVENT: 0 },
  montageBudget: 10000,
});
assert.equal(montageDelta.montageBudget, 10000);
assert.equal(montageDelta.montageActual, 12000);
assert.equal(montageDelta.montageOverage, 2000);
assert.equal(montageDelta.laborTotal, 0);
assert.equal(montageDelta.montageTotal, 12000);
const neMount = montageDelta.breakdown.find((b) => b.company === "NE_EVENT");
assert.ok(neMount);
assert.equal(neMount.revenue, 1200);
assert.equal(neMount.montageCost, 12000);
assert.equal(neMount.net, 1200 - 12000);

const zoomWithOverage = computeQuoteCalculation({
  durationDays: 1,
  discountPercent: 0,
  lines: [zoomLine],
  expenses: [],
  sharesCustom: false,
});
assert.equal(zoomWithOverage.breakdown.find((b) => b.company === "NE_EVENT")?.revenue, 1200);

console.log("calc-margin.test.ts: ok");
