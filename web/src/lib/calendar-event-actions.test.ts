import assert from "node:assert/strict";
import { unscheduleQuotePatch } from "./calendar-event-actions";

const patch = unscheduleQuotePatch();
assert.equal(patch.date, "");
assert.equal(patch.mountDate, "");
assert.equal(patch.demountDate, "");
assert.equal(patch.lifecycle, "CANCELLED");

console.log("calendar-event-actions.test.ts ok");
