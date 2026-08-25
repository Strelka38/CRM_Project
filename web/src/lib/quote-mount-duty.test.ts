import assert from "node:assert/strict";
import {
  planMountDutyAssign,
  planMountDutyUnassign,
} from "./quote-mount-duty";

const vacantBoth = {
  id: "t1",
  userId: null,
  onMount: true,
  onDemount: true,
};

const opsMount = planMountDutyAssign({
  duty: "mount",
  target: vacantBoth,
  incomingUserId: "u1",
  existingSameUser: null,
});
assert.deepEqual(opsMount, [
  { op: "fill", id: "t1", flags: { onMount: true, onDemount: false } },
  {
    op: "createVacant",
    fromId: "t1",
    flags: { onMount: false, onDemount: true },
  },
]);

const leftoverDemount = {
  id: "t2",
  userId: null,
  onMount: false,
  onDemount: true,
};
const alreadyMount = {
  id: "t1",
  userId: "u1",
  onMount: true,
  onDemount: false,
};
const opsMerge = planMountDutyAssign({
  duty: "demount",
  target: leftoverDemount,
  incomingUserId: "u1",
  existingSameUser: alreadyMount,
});
assert.deepEqual(opsMerge, [
  { op: "fill", id: "t1", flags: { onMount: true, onDemount: true } },
  { op: "delete", id: "t2" },
]);

const bothFilled = {
  id: "t1",
  userId: "u1",
  onMount: true,
  onDemount: true,
};
assert.deepEqual(
  planMountDutyUnassign({ duty: "mount", target: bothFilled }),
  [
    {
      op: "createFromPerson",
      fromId: "t1",
      flags: { onMount: false, onDemount: true },
    },
    { op: "vacate", id: "t1", flags: { onMount: true, onDemount: false } },
  ],
);

assert.deepEqual(
  planMountDutyUnassign({
    duty: "mount",
    target: alreadyMount,
  }),
  [{ op: "vacate", id: "t1", flags: { onMount: true, onDemount: false } }],
);

const otherOnBoth = {
  id: "t1",
  userId: "u2",
  onMount: true,
  onDemount: true,
};
assert.deepEqual(
  planMountDutyAssign({
    duty: "mount",
    target: otherOnBoth,
    incomingUserId: "u1",
    existingSameUser: null,
  }),
  [
    { op: "keepPerson", id: "t1", flags: { onMount: false, onDemount: true } },
    {
      op: "createFilled",
      fromId: "t1",
      flags: { onMount: true, onDemount: false },
    },
  ],
);

console.log("quote-mount-duty.test.ts: ok");
