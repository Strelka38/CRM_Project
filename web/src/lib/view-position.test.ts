import assert from "node:assert/strict";
import {
  parseCalendarViewPosition,
  parseRosterViewPosition,
  serializeCalendarViewPosition,
  serializeRosterViewPosition,
} from "./view-position";

const cal = parseCalendarViewPosition(
  serializeCalendarViewPosition({
    cursor: new Date(2026, 9, 18),
    selectedDay: new Date(2026, 9, 22),
  }),
);
assert.ok(cal);
assert.equal(cal.cursor.getFullYear(), 2026);
assert.equal(cal.cursor.getMonth(), 9);
assert.equal(cal.cursor.getDate(), 1);
assert.equal(cal.selectedDay.getFullYear(), 2026);
assert.equal(cal.selectedDay.getMonth(), 9);
assert.equal(cal.selectedDay.getDate(), 22);

const fromMonth = parseCalendarViewPosition(
  JSON.stringify({ month: "2026-11", selected: "2026-11-03" }),
);
assert.ok(fromMonth);
assert.equal(fromMonth.cursor.getMonth(), 10);
assert.equal(fromMonth.cursor.getDate(), 1);
assert.equal(fromMonth.selectedDay.getDate(), 3);

assert.equal(parseCalendarViewPosition(null), null);
assert.equal(parseCalendarViewPosition("{"), null);
assert.equal(parseCalendarViewPosition(JSON.stringify({ cursor: "nope" })), null);
assert.equal(parseCalendarViewPosition(JSON.stringify({ selected: "2026-10-01" })), null);

const calNoSelected = parseCalendarViewPosition(
  JSON.stringify({ cursor: "2026-12-15" }),
);
assert.ok(calNoSelected);
assert.equal(calNoSelected.cursor.getMonth(), 11);
assert.equal(calNoSelected.selectedDay.getDate(), 1);

const roster = parseRosterViewPosition(
  serializeRosterViewPosition({
    viewStart: new Date(2026, 9, 12),
    selectedDay: new Date(2026, 9, 18),
  }),
);
assert.ok(roster);
assert.equal(roster.viewStart.getDate(), 12);
assert.equal(roster.selectedDay.getDate(), 18);

assert.equal(parseRosterViewPosition(null), null);
assert.equal(parseRosterViewPosition(JSON.stringify({ selected: "2026-10-01" })), null);

const rosterNoSelected = parseRosterViewPosition(
  JSON.stringify({ start: "2026-10-05" }),
);
assert.ok(rosterNoSelected);
assert.equal(rosterNoSelected.viewStart.getDate(), 5);
assert.equal(rosterNoSelected.selectedDay.getDate(), 5);
