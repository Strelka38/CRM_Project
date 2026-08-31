import assert from "node:assert/strict";
import {
  parseWarehouseUnitsCsv,
  toCsv,
  warehouseUnitToCsvCells,
  WAREHOUSE_UNIT_HEADERS,
} from "./warehouse-csv";

const csv = toCsv([
  [...WAREHOUSE_UNIT_HEADERS],
  [
    "u1",
    "item1",
    "1191",
    "SHURE SLXD24/SM58",
    "1",
    "стойка A",
    "ШМ",
    "token1",
    "1",
    "0",
    "",
    "",
    "",
  ],
  [
    "u2",
    "item1",
    "1191",
    "SHURE SLXD24/SM58",
    "2",
    "",
    "NE",
    "token2",
    "1",
    "0",
    "",
    "",
    "",
  ],
]);

const parsed = parseWarehouseUnitsCsv(csv);
assert.equal(parsed.errors.length, 0);
assert.equal(parsed.rows.length, 2);
assert.equal(parsed.rows[0].owner, "SHOW_MASTER");
assert.equal(parsed.rows[1].owner, "NE_EVENT");
assert.equal(parsed.rows[0].label, "стойка A");

const cells = warehouseUnitToCsvCells({
  id: "u3",
  catalogItemId: "item1",
  unitNumber: 3,
  label: null,
  owner: "DIAKOM",
  qrToken: "token3",
  active: true,
  inRepair: false,
  writeOffReason: null,
  writeOffComment: "",
  writeOffAt: null,
  catalogItem: { name: "Mic", equipmentCode: 1191 },
});
assert.equal(cells[6], "ДК");

const withoutOwner = parseWarehouseUnitsCsv(
  toCsv([
    ["ID", "ID позиции", "№", "Метка", "QR-токен"],
    ["u4", "item1", "4", "", "token4"],
  ]),
);
assert.equal(withoutOwner.errors.length, 0);
assert.equal(withoutOwner.rows[0].owner, null);
