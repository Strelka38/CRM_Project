import assert from "node:assert/strict";
import { canMutateEntry } from "./calendar-entries";

assert.equal(canMutateEntry("ADMIN", "other", "me", "DAY_OFF"), true);
assert.equal(canMutateEntry("MANAGER", "other", "me", "DAY_OFF"), true);
assert.equal(canMutateEntry("BRIGADIER", "other", "me", "DAY_OFF"), true);
assert.equal(canMutateEntry("EMPLOYEE", "other", "me", "DAY_OFF"), false);
assert.equal(canMutateEntry("EMPLOYEE", "me", "me", "DAY_OFF"), false);

assert.equal(canMutateEntry("MANAGER", "other", "me", "TASK"), true);
assert.equal(canMutateEntry("BRIGADIER", "other", "me", "TASK"), false);
assert.equal(canMutateEntry("BRIGADIER", "me", "me", "TASK"), true);
assert.equal(canMutateEntry("EMPLOYEE", "me", "me", "TASK"), true);
assert.equal(canMutateEntry("EMPLOYEE", "other", "me", "TASK"), false);
