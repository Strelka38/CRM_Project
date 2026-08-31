import assert from "node:assert/strict";
import {
  allocateZonesToSlots,
  annotatePersonnelBlocks,
  classifyPersonnelBlock,
  collectPersonnelSlotRequests,
  findBestSpecialty,
  findSpecialtyByCatalogItemId,
  groupDesiredQty,
  isFilledSlot,
  montageBudgetFromBlocks,
  normalizeSpecialtyName,
  pickZoneForNewSlot,
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

assert.equal(
  classifyPersonnelBlock({
    type: "ITEM",
    name: "Работа на площадке",
    itemKind: "SERVICE",
    linkedSpecialtyId: "s1",
    linkedSpecialtyName: "Звукарь",
  }),
  "EVENT",
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
    name: "Zoom",
    itemKind: "SERVICE",
    linkedSpecialtyId: "s-zoom",
  }),
  "EVENT",
);
assert.equal(
  classifyPersonnelBlock({
    type: "ITEM",
    name: "Бригада",
    itemKind: "SERVICE",
    linkedSpecialtyId: "m1",
    linkedSpecialtyName: "Монтажник",
  }),
  "MOUNT",
);

assert.equal(
  classifyPersonnelBlock({
    type: "ITEM",
    name: "Сценический комплекс, 10х6м, фронтон сбоку, без монтажа",
  }),
  null,
);
assert.equal(
  classifyPersonnelBlock({
    type: "ITEM",
    name: "Сценический комплекс, 10х6м, фронтон сбоку, без монтажа",
    itemKind: "EQUIPMENT",
  }),
  null,
);
assert.equal(
  classifyPersonnelBlock({
    type: "ITEM",
    name: "Монтаж/демонтаж",
  }),
  null,
);
assert.equal(
  classifyPersonnelBlock({
    type: "ITEM",
    name: "Монтаж/демонтаж",
    itemKind: "SERVICE",
  }),
  "MOUNT",
);
assert.equal(
  classifyPersonnelBlock({
    type: "ITEM",
    name: "Водитель грузовика",
    itemKind: "PERSONNEL",
  }),
  "EVENT",
);

const specs = [
  { id: "s1", name: "Звукарь", catalogItemId: "cat-sound" },
  { id: "s2", name: "Световик" },
];
assert.equal(findBestSpecialty("ЗВУКАРЬ", specs)?.id, "s1");
assert.equal(findBestSpecialty("Звукорежиссер / звукарь", specs)?.id, "s1");
assert.equal(findBestSpecialty("Звукорежиссер", specs)?.id, "s1");
assert.equal(findBestSpecialty("Неизвестная роль", specs), null);
assert.equal(findSpecialtyByCatalogItemId("cat-sound", specs)?.id, "s1");
assert.equal(findSpecialtyByCatalogItemId("missing", specs), null);
assert.equal(
  findSpecialtyByCatalogItemId("cat-sound-alt", [
    { id: "s1", name: "Звукарь", catalogItemIds: ["cat-sound", "cat-sound-alt"] },
  ])?.id,
  "s1",
);

const linkedBlocks = annotatePersonnelBlocks(
  [
    {
      type: "ITEM",
      name: "Работа на площадке",
      itemKind: "SERVICE",
      catalogItemId: "cat-sound",
      qty: 2,
    },
  ],
  specs,
);
assert.equal(
  collectPersonnelSlotRequests([
    {
      type: "ITEM",
      name: "Работа на площадке",
      itemKind: "SERVICE",
      qty: 2,
    },
  ]).length,
  0,
);
assert.equal(linkedBlocks[0]?.linkedSpecialtyId, "s1");
assert.equal(
  collectPersonnelSlotRequests(linkedBlocks)[0]?.kind,
  "EVENT",
);
assert.equal(collectPersonnelSlotRequests(linkedBlocks)[0]?.qty, 2);

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

const zonedDesired = groupDesiredQty([
  { specialtyId: specSound, kind: "EVENT", qty: 1, zoneId: "z1" },
  { specialtyId: specSound, kind: "EVENT", qty: 1, zoneId: "z2" },
]);
assert.equal(zonedDesired.length, 2);
assert.equal(zonedDesired.find((d) => d.zoneId === "z2")?.qty, 1);

const stamped = allocateZonesToSlots(
  [
    {
      id: "a",
      specialtyId: specSound,
      kind: "EVENT",
      userId: null,
      isFreelancer: false,
      freelancerName: "",
      zoneId: null,
    },
    {
      id: "b",
      specialtyId: specSound,
      kind: "EVENT",
      userId: null,
      isFreelancer: false,
      freelancerName: "",
      zoneId: null,
    },
  ],
  zonedDesired,
);
assert.equal(stamped[0].zoneId, "z1");
assert.equal(stamped[1].zoneId, "z2");

const zonedPlan = planSlotSync([], zonedDesired);
assert.deepEqual(
  zonedPlan.create.map((c) => c.zoneId).sort(),
  ["z1", "z2"],
);

assert.equal(
  pickZoneForNewSlot({
    specialtyId: specSound,
    kind: "EVENT",
    desired: zonedDesired,
    existing: [],
  }),
  "z1",
);
assert.equal(
  pickZoneForNewSlot({
    specialtyId: specSound,
    kind: "EVENT",
    desired: zonedDesired,
    existing: [{ specialtyId: specSound, kind: "EVENT", zoneId: "z1" }],
  }),
  "z2",
);

const multiEmpty = planSlotSync(
  [],
  [{ specialtyId: specSound, kind: "EVENT", qty: 1 }],
  {},
  3,
);
assert.equal(multiEmpty.create.length, 1);
assert.equal(multiEmpty.create[0]?.dayIndex, null);

const multiMount = planSlotSync(
  [],
  [
    { specialtyId: specSound, kind: "EVENT", qty: 1 },
    { specialtyId: "mount", kind: "MOUNT", qty: 2 },
  ],
  {},
  3,
);
assert.equal(multiMount.create.filter((c) => c.kind === "EVENT").length, 1);
assert.equal(multiMount.create.filter((c) => c.kind === "MOUNT").length, 2);
assert.ok(
  multiMount.create
    .filter((c) => c.kind === "MOUNT")
    .every((c) => c.dayIndex == null),
);

const filledAllDays: SlotExisting[] = [
  {
    id: "all",
    specialtyId: specSound,
    kind: "EVENT",
    userId: "u1",
    isFreelancer: false,
    freelancerName: "",
    dayIndex: null,
  },
];
const keepAllDays = planSlotSync(
  filledAllDays,
  [{ specialtyId: specSound, kind: "EVENT", qty: 1 }],
  {},
  3,
);
assert.equal(keepAllDays.create.length, 0);
assert.equal(keepAllDays.deleteIds.length, 0);

const vacantAllDays: SlotExisting[] = [
  {
    id: "vac",
    specialtyId: specSound,
    kind: "EVENT",
    userId: null,
    isFreelancer: false,
    freelancerName: "",
    dayIndex: null,
  },
];
const expandVacant = planSlotSync(
  vacantAllDays,
  [{ specialtyId: specSound, kind: "EVENT", qty: 1 }],
  {},
  3,
);
assert.deepEqual(expandVacant.deleteIds, []);
assert.equal(expandVacant.create.length, 0);

const perDayExisting: SlotExisting[] = [1, 2, 3].map((d) => ({
  id: `d${d}`,
  specialtyId: specSound,
  kind: "EVENT",
  userId: null,
  isFreelancer: false,
  freelancerName: "",
  dayIndex: d,
}));
const collapsePerDay = planSlotSync(
  perDayExisting,
  [{ specialtyId: specSound, kind: "EVENT", qty: 1 }],
  {},
  3,
);
assert.equal(collapsePerDay.create.length, 1);
assert.equal(collapsePerDay.create[0]?.dayIndex, null);
assert.deepEqual(collapsePerDay.deleteIds.sort(), ["d1", "d2", "d3"]);

const shrinkDays = planSlotSync(
  perDayExisting,
  [{ specialtyId: specSound, kind: "EVENT", qty: 1 }],
  {},
  2,
);
assert.ok(shrinkDays.deleteIds.includes("d3"));
assert.ok(shrinkDays.deleteIds.includes("d1"));
assert.ok(shrinkDays.deleteIds.includes("d2"));
assert.equal(shrinkDays.create.length, 1);

const filledDay1Only: SlotExisting[] = [
  {
    id: "d1f",
    specialtyId: specSound,
    kind: "EVENT",
    userId: "u1",
    isFreelancer: false,
    freelancerName: "",
    dayIndex: 1,
  },
  {
    id: "d2v",
    specialtyId: specSound,
    kind: "EVENT",
    userId: null,
    isFreelancer: false,
    freelancerName: "",
    dayIndex: 2,
  },
];
const keepFilledDay = planSlotSync(
  filledDay1Only,
  [{ specialtyId: specSound, kind: "EVENT", qty: 1 }],
  {},
  3,
);
assert.equal(keepFilledDay.create.length, 0);
assert.deepEqual(keepFilledDay.deleteIds, ["d2v"]);

console.log("quote-assignment-slots.test.ts: ok");
