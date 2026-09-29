import assert from "node:assert/strict";
import { formatDateKey } from "./dates";
import { CALENDAR_WEEK_ROWS, buildWeeks } from "./calendar-weeks";

assert.equal(CALENDAR_WEEK_ROWS, 5);

const sep = buildWeeks(2026, 8);
assert.equal(sep.length, 5);
assert.equal(formatDateKey(sep[0]![0]!), "2026-08-31");
assert.equal(formatDateKey(sep[4]![6]!), "2026-10-04");

const feb = buildWeeks(2021, 1);
assert.equal(feb.length, 5);
assert.equal(formatDateKey(feb[0]![0]!), "2021-02-01");
assert.equal(formatDateKey(feb[4]![6]!), "2021-03-07");

console.log("calendar-weeks.test.ts ok");
