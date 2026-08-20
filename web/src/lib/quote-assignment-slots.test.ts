import assert from "node:assert/strict";
import {
  classifyPersonnelBlock,
  findBestSpecialty,
  groupDesiredQty,
  isFilledSlot,
  montageBudgetFromBlocks,
  normalizeSpecialtyName,
  planSlotSync,
  recommendedMountQty,
  type SlotExisting,
} from "./quote-assignment-slots";

assert.equal(normalizeSpecialtyName("  Звукарёв  "), "звукарев");
assert.equal(normalizeSpecialtyName("Ёлка"), "елка");

assert.equal(
  classifyPersonnelBlock({
    type: "ITEM",
    name: "Звукарь",
    itemKind: "PERSONNEL",
  }),
  "EVENT",
);
assert.equal(
  classifyPersonnelBlock({
    type: "ITEM",
    name: "Монтажник",
    itemKind: "PERSONNEL",
  }),
  "MOUNT",
);
assert.equal(
  classifyPersonnelBlock({
    type: "ITEM",
    name: "Zoom",
    itemKind: "SERVICE",
  }),
  null,
);
assert.equal(
  classifyPersonnelBlock({
    type: "ITEM",
    name: "Световик",
    itemKind: "SERVICE",
  }),
  "EVENT",
);

const specs = [
  { id: "s1", name: "Звукарь" },
  { id: "s2", name: "Световик" },
];
assert.equal(findBestSpecialty("ЗВУКАРЬ", specs)?.id, "s1");
assert.equal(findBestSpecialty("Звукорежиссер / звукарь", specs)?.id, "s1");
assert.equal(findBestSpecialty("Звукорежиссер", specs)?.id, "s1");
assert.equal(findBestSpecialty("Неизвестная роль", specs), null);

assert.equal(isFilledSlot({ userId: "u1" }), true);
assert.equal(
  isFilledSlot({ userId: null, isFreelancer: true, freelancerName: "Иванов" }),
  true,
);
assert.equal(
  isFilledSlot({ userId: null, isFreelancer: false, freelancerName: "" }),
  false,
);

const specSound = "sound";
const empty2 = planSlotSync(
  [],
  [{ specialtyId: specSound, kind: "EVENT", qty: 2 }],
);
assert.equal(empty2.create.length, 2);
assert.equal(empty2.deleteIds.length, 0);
assert.ok(empty2.create.every((c) => c.kind === "EVENT" && c.specialtyId === specSound));

const existingTwo: SlotExisting[] = [
  {
    id: "filled",
    specialtyId: specSound,
    kind: "EVENT",
    userId: "u1",
    isFreelancer: false,
    freelancerName: "",
  },
  {
    id: "empty",
    specialtyId: specSound,
    kind: "EVENT",
    userId: null,
    isFreelancer: false,
    freelancerName: "",
  },
];
const shrink = planSlotSync(existingTwo, [
  { specialtyId: specSound, kind: "EVENT", qty: 1 },
]);
assert.deepEqual(shrink.create, []);
assert.deepEqual(shrink.deleteIds, ["empty"]);

const twoFilled: SlotExisting[] = [
  { ...existingTwo[0], id: "a" },
  { ...existingTwo[0], id: "b", userId: "u2" },
];
const shrinkFilled = planSlotSync(twoFilled, [
  { specialtyId: specSound, kind: "EVENT", qty: 1 },
]);
assert.equal(shrinkFilled.deleteIds.length, 1);
assert.equal(shrinkFilled.deleteIds[0], "b");

const mountExtra: SlotExisting[] = [
  {
    id: "m1",
    specialtyId: "mount",
    kind: "MOUNT",
    userId: null,
    isFreelancer: false,
    freelancerName: "",
  },
  {
    id: "m2",
    specialtyId: "mount",
    kind: "MOUNT",
    userId: "u3",
    isFreelancer: false,
    freelancerName: "",
  },
  {
    id: "m3",
    specialtyId: "mount",
    kind: "MOUNT",
    userId: null,
    isFreelancer: false,
    freelancerName: "",
  },
];
const mountKeep = planSlotSync(mountExtra, [
  { specialtyId: "mount", kind: "MOUNT", qty: 2 },
]);
assert.equal(mountKeep.deleteIds.length, 0);
assert.equal(mountKeep.create.length, 0);

const mountGrow = planSlotSync(
  mountExtra,
  [{ specialtyId: "mount", kind: "MOUNT", qty: 5 }],
  { "MOUNT:mount": 3 },
);
assert.equal(mountGrow.create.length, 2);
assert.ok(mountGrow.create.every((c) => c.kind === "MOUNT"));
assert.equal(mountGrow.watermarks["MOUNT:mount"], 5);

const mountFirst = planSlotSync(
  [],
  [{ specialtyId: "mount", kind: "MOUNT", qty: 2 }],
);
assert.equal(mountFirst.create.length, 2);
assert.equal(mountFirst.watermarks["MOUNT:mount"], 2);

const mountAfterDelete = planSlotSync(
  [mountExtra[0]],
  [{ specialtyId: "mount", kind: "MOUNT", qty: 2 }],
  { "MOUNT:mount": 2 },
);
assert.equal(mountAfterDelete.create.length, 0);
assert.equal(mountAfterDelete.deleteIds.length, 0);

const mountAfterDeleteAll = planSlotSync(
  [],
  [{ specialtyId: "mount", kind: "MOUNT", qty: 2 }],
  { "MOUNT:mount": 2 },
);
assert.equal(mountAfterDeleteAll.create.length, 0);

const mountLegacyDeleted = planSlotSync(
  [mountExtra[0]],
  [{ specialtyId: "mount", kind: "MOUNT", qty: 2 }],
);
assert.equal(mountLegacyDeleted.create.length, 0);
assert.equal(mountLegacyDeleted.watermarks["MOUNT:mount"], 2);

const grouped = groupDesiredQty([
  { specialtyId: specSound, kind: "EVENT", qty: 1 },
  { specialtyId: specSound, kind: "EVENT", qty: 1 },
]);
assert.equal(grouped[0].qty, 2);

const samePersonKeys = planSlotSync(
  [
    {
      id: "e",
      specialtyId: specSound,
      kind: "EVENT",
      userId: "u1",
      isFreelancer: false,
      freelancerName: "",
    },
  ],
  [
    { specialtyId: specSound, kind: "EVENT", qty: 1 },
    { specialtyId: specSound, kind: "MOUNT", qty: 1 },
  ],
);
assert.equal(
  samePersonKeys.create.filter((c) => c.kind === "MOUNT").length,
  1,
);

const blocks = [
  {
    type: "ITEM",
    name: "Монтажник",
    itemKind: "PERSONNEL",
    qty: 2,
    unitPrice: 5000,
    dayMode: "FIXED1",
  },
];
assert.equal(recommendedMountQty(blocks), 2);
assert.equal(montageBudgetFromBlocks(blocks, 1), 10000);

console.log("quote-assignment-slots.test.ts: ok");
