import assert from "node:assert/strict";
import {
  completedMonthsBack,
  freelancerAssignmentSourceKey,
  mergePayouts,
  parseFreelancerSourceKey,
  parseStaffMonthSourceKey,
  previousYearMonth,
  staffMonthAmount,
  staffMonthSourceKey,
  userExistedInMonth,
  type LivePayable,
  type PayoutMark,
} from "./payouts";
import { toYearMonthParam } from "./period";

assert.equal(staffMonthSourceKey("u1", "2026-08"), "staff:u1:2026-08");
assert.deepEqual(parseStaffMonthSourceKey("staff:u1:2026-08"), {
  userId: "u1",
  periodYm: "2026-08",
});
assert.equal(parseStaffMonthSourceKey("freelancer:a1"), null);

assert.equal(freelancerAssignmentSourceKey("a1"), "freelancer:a1");
assert.deepEqual(parseFreelancerSourceKey("freelancer:a1"), {
  assignmentId: "a1",
});

const prev = previousYearMonth(new Date(2026, 8, 1));
assert.deepEqual(prev, { year: 2026, month: 7 });
assert.equal(toYearMonthParam(prev), "2026-08");

const months = completedMonthsBack(3, new Date(2026, 8, 15));
assert.deepEqual(
  months.map((m) => toYearMonthParam(m)),
  ["2026-08", "2026-07", "2026-06"],
);
assert.equal(
  months.some((m) => toYearMonthParam(m) === "2026-09"),
  false,
);

assert.equal(
  staffMonthAmount({
    monthlySalary: 40000,
    assignmentPay: 15000,
    montage: 3000,
    agency: 2000,
  }),
  60000,
);

assert.equal(
  userExistedInMonth(new Date(2026, 7, 31), { year: 2026, month: 7 }),
  true,
);
assert.equal(
  userExistedInMonth(new Date(2026, 8, 1), { year: 2026, month: 7 }),
  false,
);

const live: LivePayable[] = [
  {
    sourceKey: "staff:u1:2026-08",
    kind: "STAFF_MONTH",
    periodYm: "2026-08",
    payeeName: "Иванов",
    userId: "u1",
    assignmentId: null,
    quoteId: null,
    quoteName: "",
    quoteDate: "",
    specialtyName: "",
    amount: 50000,
    breakdown: {
      monthlySalary: 50000,
      assignmentPay: 0,
      montage: 0,
      agency: 0,
    },
  },
  {
    sourceKey: "freelancer:a1",
    kind: "FREELANCER_EVENT",
    periodYm: "2026-08",
    payeeName: "Петров",
    userId: null,
    assignmentId: "a1",
    quoteId: "q1",
    quoteName: "Фестиваль",
    quoteDate: "01.08.2026",
    specialtyName: "Звук",
    amount: 12000,
    breakdown: null,
  },
  {
    sourceKey: "staff:u2:2026-08",
    kind: "STAFF_MONTH",
    periodYm: "2026-08",
    payeeName: "Ноль",
    userId: "u2",
    assignmentId: null,
    quoteId: null,
    quoteName: "",
    quoteDate: "",
    specialtyName: "",
    amount: 0,
    breakdown: {
      monthlySalary: 0,
      assignmentPay: 0,
      montage: 0,
      agency: 0,
    },
  },
];

const marks: PayoutMark[] = [
  {
    id: "p1",
    sourceKey: "staff:u1:2026-08",
    kind: "STAFF_MONTH",
    periodYm: "2026-08",
    payeeName: "Иванов",
    userId: "u1",
    assignmentId: null,
    quoteId: null,
    amount: 48000,
    breakdown: null,
    paid: true,
    paidAt: "2026-09-01T00:00:00.000Z",
    paidByName: "Админ",
  },
];

const merged = mergePayouts(live, marks);
assert.equal(merged.queue.length, 1);
assert.equal(merged.queue[0].sourceKey, "freelancer:a1");
assert.equal(merged.history.length, 1);
assert.equal(merged.history[0].amount, 48000);
assert.equal(merged.history[0].liveAmount, 50000);

console.log("payouts tests ok");
