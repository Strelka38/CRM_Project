import assert from "node:assert/strict";
import {
  isOpenLifecycle,
  isRosterLifecycle,
  isStatsLifecycle,
  lifecycleLabel,
  LIFECYCLE_LABELS,
  OPEN_LIFECYCLES,
  ROSTER_LIFECYCLES,
  STATS_LIFECYCLES,
} from "./lifecycle";

assert.equal(lifecycleLabel("CONFIRMED"), "Подтверждено");
assert.equal(lifecycleLabel("unknown"), "unknown");
assert.equal(LIFECYCLE_LABELS.CALCULATED, "Посчитано");

assert.equal(isStatsLifecycle("CONFIRMED"), true);
assert.equal(isStatsLifecycle("COMPLETED"), true);
assert.equal(isStatsLifecycle("CALCULATED"), false);
assert.equal(isStatsLifecycle("CANCELLED"), false);

assert.equal(isRosterLifecycle("CALCULATED"), true);
assert.equal(isRosterLifecycle("CANCELLED"), false);
assert.deepEqual([...ROSTER_LIFECYCLES], ["CALCULATED", "CONFIRMED", "COMPLETED"]);
assert.deepEqual([...STATS_LIFECYCLES], ["CONFIRMED", "COMPLETED"]);
assert.deepEqual([...OPEN_LIFECYCLES], ["CALCULATED", "CONFIRMED"]);
assert.equal(isOpenLifecycle("COMPLETED"), false);
assert.equal(isOpenLifecycle("CONFIRMED"), true);

console.log("lifecycle.test.ts ok");
