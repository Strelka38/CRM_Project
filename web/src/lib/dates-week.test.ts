import assert from "node:assert/strict";
import { isoWeekNumber } from "./dates";

// 2026-09-21 — понедельник 39-й ISO-недели
assert.equal(isoWeekNumber(new Date(2026, 8, 21)), 39);
// 2026-09-01 — вторник 36-й
assert.equal(isoWeekNumber(new Date(2026, 8, 1)), 36);
// 2026-12-28 — понедельник 53-й
assert.equal(isoWeekNumber(new Date(2026, 11, 28)), 53);
