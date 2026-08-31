import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  allocateAmountByOwners,
  allocateExpenseInputs,
  buildSummaryPeople,
  buildSummarySheet,
  emptyCompanyAmounts,
  eventTitle,
  parseSummaryDate,
  personExportKey,
  summaryEventFromCalcRow,
  type SummaryEvent,
} from "./calc-summary";
import { buildCalcSummaryWorkbook } from "./calc-summary-excel";

assert.equal(eventTitle("138", "Елочка"), "№138 Елочка");
assert.equal(personExportKey({
  userId: "u1",
  userName: "Иванов",
  isFreelancer: false,
  owners: ["NE_EVENT"],
  pay: 1000,
  montageAmount: 0,
}), "st:u1");
assert.equal(personExportKey({
  userId: "",
  userName: "Петров",
  isFreelancer: true,
  owners: ["NE_EVENT"],
  pay: 500,
  montageAmount: 0,
}), "fl:петров");
assert.equal(personExportKey({
  userId: "",
  userName: "",
  isFreelancer: false,
  vacant: true,
  owners: [],
  pay: 0,
  montageAmount: 0,
}), null);

const split = allocateAmountByOwners(1000, ["NE_EVENT"], {});
assert.equal(split.NE_EVENT, 1000);
assert.equal(split.SHOW_MASTER, 0);

const half = allocateAmountByOwners(1000, ["NE_EVENT", "SHOW_MASTER"], {});
assert.equal(half.NE_EVENT, 500);
assert.equal(half.SHOW_MASTER, 500);

const byRev = allocateAmountByOwners(1000, [], {
  NE_EVENT: 300,
  SHOW_MASTER: 700,
  DIAKOM: 0,
});
assert.equal(byRev.NE_EVENT, 300);
assert.equal(byRev.SHOW_MASTER, 700);

const extras = allocateExpenseInputs(
  [
    { name: "Такси", amount: 400, owners: ["NE_EVENT"], mode: "SHARE" },
    {
      name: "Фикс",
      amount: 0,
      mode: "AMOUNT",
      amounts: { SHOW_MASTER: 100, DIAKOM: 50, NE_EVENT: 0 },
    },
  ],
  emptyCompanyAmounts(),
);
assert.equal(extras.NE_EVENT, 400);
assert.equal(extras.SHOW_MASTER, 100);
assert.equal(extras.DIAKOM, 50);

const people = buildSummaryPeople(
  [
    {
      userId: "u1",
      userName: "Иванов",
      isFreelancer: false,
      owners: ["NE_EVENT"],
      pay: 8000,
      montageAmount: 2000,
    },
    {
      userId: "u1",
      userName: "Иванов",
      isFreelancer: false,
      owners: ["NE_EVENT"],
      pay: 0,
      montageAmount: 1500,
    },
    {
      userId: "",
      userName: "Сидоров",
      isFreelancer: true,
      owners: ["SHOW_MASTER"],
      pay: 12000,
      montageAmount: 0,
    },
    {
      userId: "u2",
      userName: "Петрова",
      isFreelancer: false,
      owners: ["DIAKOM"],
      pay: 3000,
      montageAmount: 0,
    },
  ],
  { NE_EVENT: 100, SHOW_MASTER: 100, DIAKOM: 100 },
);
assert.equal(people.length, 3);
const ivanov = people.find((p) => p.key === "st:u1");
assert.equal(ivanov?.amounts.NE_EVENT, 11500);
assert.equal(ivanov?.freelancer, false);
const sidorov = people.find((p) => p.key === "fl:сидоров");
assert.equal(sidorov?.amounts.SHOW_MASTER, 12000);
assert.equal(sidorov?.freelancer, true);

const d = parseSummaryDate("2026-08-14T00:00:00.000Z", "14.08.2026");
assert.ok(d);
assert.equal(d.getFullYear(), 2026);
assert.equal(d.getMonth(), 7);
assert.equal(d.getDate(), 14);

const events: SummaryEvent[] = [
  summaryEventFromCalcRow({
    id: "q1",
    proposalNumber: "138",
    eventName: "Елочка",
    date: "14.08.2026",
    eventDate: "2026-08-14",
    owner: { name: "Стрельченко" },
    breakdown: [
      {
        company: "SHOW_MASTER",
        revenue: 120000,
        cogs: 10000,
        agency: 2000,
        agencyCost: 2000,
      },
      {
        company: "DIAKOM",
        revenue: 80000,
        cogs: 0,
        agency: 1500,
        agencyCost: 0,
      },
      {
        company: "NE_EVENT",
        revenue: 85000,
        cogs: 5000,
        agency: 2040,
        agencyCost: 2040,
      },
    ],
    extraByCompany: { NE_EVENT: 400, SHOW_MASTER: 0, DIAKOM: 0 },
    people,
  }),
  summaryEventFromCalcRow({
    id: "q2",
    proposalNumber: "139",
    eventName: "Форум",
    date: "20.08.2026",
    eventDate: "2026-08-20",
    owner: { name: "Стрельченко" },
    breakdown: [
      {
        company: "NE_EVENT",
        revenue: 50000,
        cogs: 0,
        agency: 1000,
        agencyCost: 1000,
      },
    ],
    extraByCompany: {},
    people: [],
  }),
];

const ne = buildSummarySheet(events, "NE_EVENT");
assert.equal(ne.sheetName, "NE");
assert.equal(ne.titleFirm, "NeEvent");
assert.equal(ne.rows.length, 2);
assert.equal(ne.rows[0].title, "№138 Елочка");
assert.equal(ne.rows[0].firmRevenue.NE_EVENT, 82960);
assert.equal(ne.rows[0].firmRevenue.DIAKOM, 80000);
assert.equal(ne.rows[0].firmRevenue.SHOW_MASTER, 120000);
assert.equal(ne.rows[0].expenses, 5400);
assert.equal(ne.rows[0].agency.NE_EVENT, 2040);
assert.ok(ne.personColumns.some((p) => p.key === "st:u1"));
assert.ok(!ne.personColumns.some((p) => p.key === "fl:сидоров"));
assert.equal(ne.rows[0].personAmounts["st:u1"], 11500);
assert.equal(ne.rows[1].firmRevenue.NE_EVENT, 49000);

const shm = buildSummarySheet(events, "SHOW_MASTER");
assert.ok(shm.personColumns.some((p) => p.freelancer));
assert.equal(shm.rows[0].firmRevenue.SHOW_MASTER, 118000);
assert.equal(shm.rows[0].personAmounts[sidorov!.key], 12000);
assert.ok(!shm.personColumns.some((p) => p.key === "st:u1"));

async function main() {
  const wb = await buildCalcSummaryWorkbook(events);
  assert.deepEqual(wb.worksheets.map((s) => s.name), ["NE", "ДК", "ШМ"]);
  const neSheet = wb.getWorksheet("NE")!;
  assert.equal(
    String(neSheet.getCell("A1").value),
    "Сводная таблица доходность (NeEvent)",
  );
  assert.equal(neSheet.getCell("G1").value, "NE");
  assert.equal(neSheet.getCell("H1").value, "ДК");
  assert.equal(neSheet.getCell("I1").value, "ШМ");
  assert.equal(neSheet.getCell("A3").value, "Название мероприятия (аренда)");
  assert.equal(neSheet.getCell("A5").value, "№138 Елочка");
  assert.equal(neSheet.getCell("C5").value, "Стрельченко");
  assert.equal(neSheet.getCell("G5").value, 82960);
  assert.equal(neSheet.getCell("J3").value, "Иванов");
  assert.equal(neSheet.getCell("J5").value, 11500);
  assert.equal(neSheet.getCell("A7").value, "Итого");
  assert.equal(
    (neSheet.getCell("G7").value as ExcelJS.CellFormulaValue).formula,
    "SUM(G5:G6)",
  );

  const shmSheet = wb.getWorksheet("ШМ")!;
  assert.equal(
    String(shmSheet.getCell("A1").value),
    "Сводная таблица доходность (Шоу-Мастер)",
  );
  assert.equal(shmSheet.getCell("J3").value, "Сидоров");

  console.log("calc-summary tests ok");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});