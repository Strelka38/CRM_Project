import assert from "node:assert/strict";
import {
  compareSortValues,
  dateSortValue,
  nextSortState,
  sortRows,
} from "./table-sort";

assert.deepEqual(nextSortState(null, "name"), { key: "name", dir: "asc" });
assert.deepEqual(nextSortState({ key: "name", dir: "asc" }, "name"), {
  key: "name",
  dir: "desc",
});
assert.equal(nextSortState({ key: "name", dir: "desc" }, "name"), null);
assert.deepEqual(nextSortState({ key: "name", dir: "asc" }, "date"), {
  key: "date",
  dir: "asc",
});

assert.ok(compareSortValues("Альфа", "Бета", "asc") < 0);
assert.ok(compareSortValues(6, 20, "asc") < 0);
assert.ok(compareSortValues("6", "20", "asc") < 0);
assert.equal(compareSortValues("", "x", "asc"), 1);
assert.equal(compareSortValues("x", "", "asc"), -1);
assert.ok(compareSortValues(1, 2, "desc") > 0);

const rows = [
  { id: "a", name: "Ббб", qty: 2 },
  { id: "b", name: "Ааа", qty: 10 },
  { id: "c", name: "", qty: 1 },
];
const byName = sortRows(rows, { key: "name", dir: "asc" }, (r, key) =>
  key === "name" ? r.name : r.qty,
);
assert.deepEqual(
  byName.map((r) => r.id),
  ["b", "a", "c"],
);
assert.equal(sortRows(rows, null, () => 0), rows);

const ru = dateSortValue("08.09.2026");
const iso = dateSortValue("2026-09-08");
assert.ok(ru != null && iso != null);
assert.equal(new Date(ru).getDate(), 8);
assert.equal(new Date(iso).getDate(), 8);
assert.equal(dateSortValue(""), null);
assert.equal(dateSortValue(null), null);
assert.ok((dateSortValue("09.09.2026") ?? 0) > (dateSortValue("08.09.2026") ?? 0));

console.log("table-sort.test.ts ok");
