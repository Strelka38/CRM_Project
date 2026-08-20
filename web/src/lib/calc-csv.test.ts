import assert from "node:assert/strict";
import { toCsv } from "./catalog-csv";
import {
  calcLineToCsvCells,
  parseCalcLineCsv,
  parseCalcStaffCsv,
  calcStaffToCsvCells,
} from "./calc-csv";

const lineCells = calcLineToCsvCells({
  id: "b1",
  zoneName: "Основное",
  type: "ITEM",
  name: "Микшер",
  qty: 2,
  unitPrice: 5000,
  dayMode: "HALF_EXTRA",
  dayCoef: 1,
  lineTotal: 10000,
  costOverride: 1800,
  costTotal: 0,
  owners: ["NE_EVENT"],
  mode: "SHARE",
  amounts: { SHOW_MASTER: 0, DIAKOM: 0, NE_EVENT: 10000 },
});
assert.equal(lineCells[0], "b1");
assert.equal(lineCells[9], "1800");
assert.equal(lineCells[10], "NE");
assert.equal(lineCells[11], "Доли");

const parsed = parseCalcLineCsv(
  toCsv([
    ["ID", "Закуп", "Владельцы", "Режим", "ШМ", "ДК", "NE"],
    ["b1", "1800", "ШМ;NE", "Суммы", "1000", "0", "800"],
    ["", "1", "", "", "", "", ""],
  ]),
);
assert.equal(parsed.rows.length, 1);
assert.equal(parsed.errors.length, 1);
assert.equal(parsed.rows[0].blockId, "b1");
assert.equal(parsed.rows[0].costOverride, 1800);
assert.deepEqual(parsed.rows[0].owners, ["SHOW_MASTER", "NE_EVENT"]);
assert.equal(parsed.rows[0].mode, "AMOUNT");
assert.equal(parsed.rows[0].amounts?.SHOW_MASTER, 1000);
assert.equal(parsed.rows[0].amounts?.NE_EVENT, 800);

const staffCells = calcStaffToCsvCells({
  id: "a1",
  userName: "Иванов",
  kind: "MOUNT",
  specialtyName: "Монтаж",
  owners: ["SHOW_MASTER"],
  payMode: "SHIFT",
  hours: null,
  basePay: 10000,
  bonus: 500,
  montageAmount: 13000,
});
assert.equal(staffCells[2], "монтаж");
assert.equal(staffCells[7], "500");

const staffParsed = parseCalcStaffCsv(
  toCsv([
    ["ID", "Премия", "Монтажные"],
    ["a1", "200", ""],
  ]),
);
assert.equal(staffParsed.rows[0].bonus, 200);
assert.equal(staffParsed.rows[0].montageAmount, null);

console.log("calc-csv tests ok");
