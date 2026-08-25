import assert from "node:assert/strict";
import {
  filterDeactivateIds,
  filterRoleChangeIds,
  lastAdminSkipIds,
  uniqueBulkIds,
} from "./user-bulk";

assert.deepEqual(uniqueBulkIds(["a", "b", "a", "me"], "me"), ["a", "b"]);
assert.deepEqual(uniqueBulkIds(["me"], "me"), []);

const admin = { id: "a1", role: "ADMIN" as const, active: true };
const admin2 = { id: "a2", role: "ADMIN" as const, active: true };
const manager = { id: "m1", role: "MANAGER" as const, active: true };
const employee = { id: "e1", role: "EMPLOYEE" as const, active: true };

assert.deepEqual(
  [...lastAdminSkipIds([admin, employee], 1)],
  ["a1"],
);
assert.deepEqual([...lastAdminSkipIds([admin, admin2], 2)], ["a1"]);
assert.deepEqual([...lastAdminSkipIds([admin], 3)], []);
assert.deepEqual(
  [...lastAdminSkipIds([{ ...admin, active: false }, employee], 1)],
  [],
);

const deact = filterDeactivateIds(
  [admin, employee],
  ["a1", "e1"],
  1,
);
assert.deepEqual(deact.apply, ["e1"]);
assert.equal(deact.skipped, 1);

const deactManyAdmins = filterDeactivateIds(
  [admin, admin2],
  ["a1", "a2"],
  5,
);
assert.deepEqual(deactManyAdmins.apply, ["a1", "a2"]);
assert.equal(deactManyAdmins.skipped, 0);

assert.deepEqual(
  filterRoleChangeIds([employee, manager], "ADMIN", "BRIGADIER", 1).apply,
  ["e1", "m1"],
);

const managerCannotTouchAdmin = filterRoleChangeIds(
  [admin, employee],
  "MANAGER",
  "BRIGADIER",
  2,
);
assert.deepEqual(managerCannotTouchAdmin.apply, ["e1"]);
assert.equal(managerCannotTouchAdmin.skipped, 1);

assert.deepEqual(
  filterRoleChangeIds([employee], "MANAGER", "ADMIN", 1),
  { apply: [], skipped: 1 },
);

const keepLastAdmin = filterRoleChangeIds(
  [admin, employee],
  "ADMIN",
  "EMPLOYEE",
  1,
);
assert.deepEqual(keepLastAdmin.apply, ["e1"]);
assert.equal(keepLastAdmin.skipped, 1);

const promoteOk = filterRoleChangeIds(
  [employee],
  "ADMIN",
  "ADMIN",
  1,
);
assert.deepEqual(promoteOk.apply, ["e1"]);
