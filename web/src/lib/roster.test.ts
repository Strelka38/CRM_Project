import assert from "node:assert/strict";
import {
  buildEntryRosterItems,
  buildQuoteRosterItems,
  eventDayIndexForDate,
  dateForEventDay,
  eventStartDate,
  groupRosterByKind,
  mergeRosterItems,
  planAssignmentMove,
  planAssignmentSpan,
  collectBusyDates,
  collectFreelancerBusyDates,
  packRosterGroupOffsets,
  packRosterLanes,
  compareRosterLaneItems,
  eachDateKey,
  personMatchesRosterOwners,
  rankRosterPeople,
  rosterBarLabel,
  rosterPeopleQueryForSlot,
  rosterPersonMatchesQuery,
  rosterSpecialtyFilterForSlot,
  personMatchesSpecialtyFilter,
  sameRosterSpecialtyFilter,
  rosterItemMatchesFirms,
  isVacantInstallerSlot,
  isOpenMountDropSlot,
  isRosterDutyMark,
  collapseRosterDutyMarks,
  dateInRosterResizeWindow,
  ROSTER_MOUNT_COLOR,
  ROSTER_MOUNT_SPECIALTY_QUERY,
} from "./roster";

const eventStart = eventStartDate({
  eventDate: "2026-08-10",
  date: "10.08.2026",
});
assert.ok(eventStart);
assert.equal(eventStart.getDate(), 10);
assert.equal(eventDayIndexForDate(eventStart, 3, dateForEventDay(eventStart, 2)), 2);
assert.equal(eventDayIndexForDate(eventStart, 3, dateForEventDay(eventStart, 4)), null);

const quote = {
  id: "q1",
  proposalNumber: "104",
  eventName: "Свадьба",
  date: "10.08.2026",
  eventDate: "2026-08-10",
  durationDays: 2,
  mountDate: "09.08.2026",
  mountDurationDays: 1,
  demountDate: "12.08.2026",
  demountDurationDays: 1,
  assignments: [
    {
      id: "a-all",
      kind: "EVENT",
      dayIndex: null,
      userId: "u1",
      specialtyId: "s1",
      specialty: { id: "s1", name: "Звук" },
      user: { id: "u1", name: "Иванов", firstName: "Иван", lastName: "Иванов" },
    },
    {
      id: "a-vac",
      kind: "EVENT",
      dayIndex: 1,
      userId: null,
      specialtyId: "s2",
      specialty: { id: "s2", name: "Свет" },
    },
    {
      id: "a-d1",
      kind: "EVENT",
      dayIndex: 1,
      userId: "u2",
      specialtyId: "s3",
      specialty: { id: "s3", name: "Видео" },
      user: { id: "u2", firstName: "Пётр", lastName: "Петров" },
    },
    {
      id: "a-d2",
      kind: "EVENT",
      dayIndex: 2,
      userId: "u2",
      specialtyId: "s3",
      specialty: { id: "s3", name: "Видео" },
      user: { id: "u2", firstName: "Пётр", lastName: "Петров" },
    },
    {
      id: "a-m",
      kind: "MOUNT",
      dayIndex: null,
      userId: "u3",
      specialtyId: "sm",
      specialty: { id: "sm", name: "Монтажник" },
      user: { id: "u3", firstName: "Олег", lastName: "Орлов" },
    },
  ],
};

const quoteItems = buildQuoteRosterItems(quote);
assert.equal(quoteItems.length, 8);
const openMount = quoteItems.find((i) => i.id.endsWith(":open:mount"));
const openDemount = quoteItems.find((i) => i.id.endsWith(":open:demount"));
assert.ok(openMount);
assert.ok(openDemount);
assert.equal(openMount.vacant, true);
assert.equal(openMount.assignmentIds.length, 0);
assert.equal(openMount.start, "2026-08-09");
assert.equal(openDemount.start, "2026-08-12");
assert.equal(isOpenMountDropSlot(openMount), true);
assert.equal(isRosterDutyMark(openMount), true);
assert.equal(isVacantInstallerSlot(openMount), false);
const collapsedDuty = collapseRosterDutyMarks([
  {
    ...openMount,
    id: "qa:sold:mount",
    assignmentIds: ["sold-m"],
  },
  openMount,
  openDemount,
]);
assert.equal(
  collapsedDuty.filter((i) => i.vacant && i.mountDuty === "mount").length,
  1,
);
assert.equal(collapsedDuty.some((i) => i.id === openMount.id), true);
const allDays = quoteItems.find((i) => i.assignmentIds[0] === "a-all");
assert.ok(allDays);
assert.equal(allDays.start, "2026-08-10");
assert.equal(allDays.end, "2026-08-11");
assert.equal(allDays.vacant, false);
assert.equal(allDays.resizable, true);

const zoneDated = buildQuoteRosterItems({
  ...quote,
  durationDays: 4,
  zones: [{ id: "z-main", workingDayIndexes: [1, 2] }],
  assignments: [
    {
      id: "a-zone",
      kind: "EVENT",
      dayIndex: null,
      zoneId: "z-main",
      userId: "u1",
      specialtyId: "s1",
      specialty: { id: "s1", name: "Звук" },
      user: { id: "u1", name: "Иванов", firstName: "Иван", lastName: "Иванов" },
    },
  ],
});
const zoneDatedEvent = zoneDated.find((i) => i.assignmentIds[0] === "a-zone");
assert.ok(zoneDatedEvent);
assert.equal(zoneDatedEvent.start, "2026-08-10");
assert.equal(zoneDatedEvent.end, "2026-08-11");
assert.equal(zoneDatedEvent.dayIndexStart, 1);
assert.equal(zoneDatedEvent.dayIndexEnd, 2);

const vacant = quoteItems.find((i) => i.assignmentIds[0] === "a-vac");
assert.ok(vacant);
assert.equal(vacant.vacant, true);
assert.equal(vacant.resizable, false);
assert.equal(vacant.start, "2026-08-10");
assert.equal(vacant.end, "2026-08-10");
assert.equal(rosterBarLabel(vacant), "Свет");

const mountWindows = quoteItems.filter((i) => i.assignmentIds[0] === "a-m");
assert.equal(mountWindows.length, 2);
const mount = mountWindows.find((i) => i.role === "монтаж");
const demount = mountWindows.find((i) => i.role === "демонтаж");
assert.ok(mount);
assert.ok(demount);
assert.equal(mount.role, "монтаж");
assert.equal(mount.mountDuty, "mount");
assert.equal(mount.start, "2026-08-09");
assert.equal(mount.end, "2026-08-09");
assert.equal(mount.resizable, false);
assert.equal(mount.kind, "EVENT");
assert.equal(mount.color, ROSTER_MOUNT_COLOR);
assert.equal(demount.color, ROSTER_MOUNT_COLOR);
assert.equal(demount.start, "2026-08-12");
assert.equal(demount.end, "2026-08-12");
assert.equal(demount.mountDuty, "demount");
assert.equal(rosterBarLabel(mount), "Орлов Олег · монтаж");
assert.equal(rosterBarLabel(demount), "Орлов Олег · демонтаж");

const onlyMount = buildQuoteRosterItems({
  ...quote,
  assignments: [
    {
      ...quote.assignments.find((a) => a.id === "a-m")!,
      onMount: true,
      onDemount: false,
    },
  ],
});
assert.equal(
  onlyMount.filter((i) => i.assignmentIds[0] === "a-m").length,
  1,
);
assert.equal(onlyMount.filter((i) => i.id.endsWith(":open:mount")).length, 1);
assert.equal(onlyMount.filter((i) => i.id.endsWith(":open:demount")).length, 1);
const onlyMountFilled = onlyMount.find((i) => i.assignmentIds[0] === "a-m");
assert.equal(onlyMountFilled?.role, "монтаж");
assert.equal(onlyMountFilled?.start, "2026-08-09");

const onlyDemount = buildQuoteRosterItems({
  ...quote,
  assignments: [
    {
      ...quote.assignments.find((a) => a.id === "a-m")!,
      onMount: false,
      onDemount: true,
    },
  ],
});
assert.equal(
  onlyDemount.filter((i) => i.assignmentIds[0] === "a-m").length,
  1,
);
const onlyDemountFilled = onlyDemount.find((i) => i.assignmentIds[0] === "a-m");
assert.equal(onlyDemountFilled?.role, "демонтаж");
assert.equal(onlyDemountFilled?.start, "2026-08-12");

const merged = mergeRosterItems(quoteItems);
const video = merged.find((i) => i.role === "Видео" && !i.vacant);
assert.ok(video);
assert.equal(video.assignmentIds.length, 2);
assert.equal(video.start, "2026-08-10");
assert.equal(video.end, "2026-08-11");

const taskVacant = buildEntryRosterItems({
  id: "e1",
  kind: "TASK",
  date: "2026-08-12",
  title: "Погрузить камеры",
  assignees: [],
});
assert.equal(taskVacant.length, 1);
assert.equal(taskVacant[0].vacant, true);
assert.equal(taskVacant[0].kind, "TASK");

const rental = buildEntryRosterItems({
  id: "e2",
  kind: "RENTAL",
  date: "2026-08-12",
  title: "Выдача",
  client: { companyName: "ООО Ромашка" },
  responsibleUser: {
    id: "u9",
    name: "Смирнов",
    firstName: "Саша",
    lastName: "Смирнов",
  },
  assignees: [],
});
assert.equal(rental.length, 1);
assert.equal(rental[0].vacant, false);
assert.equal(rental[0].role, "ответственный");

const groups = groupRosterByKind([...merged, ...taskVacant, ...rental]);
assert.deepEqual(
  groups.map((g) => g.kind),
  ["EVENT", "RENTAL", "TASK"],
);

const vacantPair = mergeRosterItems(
  buildQuoteRosterItems({
    ...quote,
    assignments: [
      {
        id: "v1",
        kind: "EVENT",
        dayIndex: 1,
        userId: null,
        specialtyId: "s2",
        specialty: { id: "s2", name: "Свет" },
      },
      {
        id: "v2",
        kind: "EVENT",
        dayIndex: 2,
        userId: null,
        specialtyId: "s2",
        specialty: { id: "s2", name: "Свет" },
      },
    ],
  }),
);
const vacantMerged = vacantPair.filter((i) => i.role === "Свет");
assert.equal(vacantMerged.length, 1);
assert.equal(vacantMerged[0]?.start, "2026-08-10");
assert.equal(vacantMerged[0]?.end, "2026-08-11");
assert.match(rosterBarLabel(vacantMerged[0]!), /Свет/);
assert.equal(vacantMerged[0]?.resizable, false);

const shrinkAll = planAssignmentSpan({
  quoteId: "q1",
  assignmentIds: ["a-all"],
  dayIndexes: [null],
  eventDays: 3,
  fromDay: 1,
  toDay: 2,
});
assert.ok(shrinkAll);
assert.equal(shrinkAll.firstDayIndex, 1);
assert.deepEqual(shrinkAll.createDayIndexes, [2]);
assert.deepEqual(shrinkAll.createVacantDayIndexes, [3]);
assert.equal(shrinkAll.convertToAllDays, false);

const expandDays = planAssignmentSpan({
  quoteId: "q1",
  assignmentIds: ["a-d1"],
  dayIndexes: [1],
  eventDays: 3,
  fromDay: 1,
  toDay: 3,
});
assert.ok(expandDays);
assert.deepEqual(expandDays.createDayIndexes, []);
assert.equal(expandDays.convertToAllDays, true);
assert.equal(expandDays.firstDayIndex, null);
assert.deepEqual(expandDays.keepIds, ["a-d1"]);

const shrinkDays = planAssignmentSpan({
  quoteId: "q1",
  assignmentIds: ["a-d1", "a-d2"],
  dayIndexes: [1, 2],
  eventDays: 3,
  fromDay: 2,
  toDay: 2,
});
assert.ok(shrinkDays);
assert.deepEqual(shrinkDays.vacateIds, ["a-d1"]);
assert.deepEqual(shrinkDays.deleteIds, []);
assert.deepEqual(shrinkDays.keepIds, ["a-d2"]);
assert.deepEqual(shrinkDays.createDayIndexes, []);

const moved = planAssignmentMove({
  dayIndexes: [2],
  eventDays: 3,
  destFrom: 1,
  destTo: 1,
});
assert.ok(moved);
assert.deepEqual(moved.destDays, [1]);
assert.deepEqual(moved.vacateDays, [2]);
assert.equal(moved.allDays, false);

const movedAll = planAssignmentMove({
  dayIndexes: [null],
  eventDays: 3,
  destFrom: 1,
  destTo: 1,
});
assert.ok(movedAll);
assert.deepEqual(movedAll.destDays, [1]);
assert.deepEqual(movedAll.vacateDays, [2, 3]);
assert.equal(movedAll.allDays, true);

assert.equal(
  planAssignmentSpan({
    quoteId: "q1",
    assignmentIds: ["a-d1"],
    dayIndexes: [1],
    eventDays: 2,
    fromDay: 1,
    toDay: 5,
  }),
  null,
);

const person = {
  name: "Петров Иван",
  firstName: "Иван",
  lastName: "Петров",
  specialties: [{ name: "Видеоинженер" }, { name: "Звукооператор" }],
};
assert.equal(rosterPersonMatchesQuery(person, ""), true);
assert.equal(rosterPersonMatchesQuery(person, "петров"), true);
assert.equal(rosterPersonMatchesQuery(person, "видео"), false);
assert.equal(rosterPersonMatchesQuery(person, "видео инженер"), false);
assert.equal(rosterPersonMatchesQuery(person, "ЗВУК"), false);
assert.equal(rosterPersonMatchesQuery(person, "монтаж"), false);
assert.equal(
  personMatchesSpecialtyFilter(person, { id: null, name: "Видеоинженер" }),
  true,
);
assert.equal(
  personMatchesSpecialtyFilter(person, { id: null, name: "видео" }),
  true,
);
assert.equal(
  personMatchesSpecialtyFilter(person, { id: null, name: "монтажник" }),
  false,
);
assert.equal(
  sameRosterSpecialtyFilter(
    { id: "s1", name: "Видеоинженер" },
    { id: "s1", name: "другое" },
  ),
  true,
);
assert.equal(
  rosterSpecialtyFilterForSlot({
    assignmentKind: "EVENT",
    mountDuty: null,
    specialtyId: "s-v",
    role: "Видеоинженер",
  })?.name,
  "Видеоинженер",
);
assert.equal(
  rosterSpecialtyFilterForSlot({
    assignmentKind: "MOUNT",
    mountDuty: "mount",
    specialtyId: null,
    role: "монтаж",
  })?.name,
  ROSTER_MOUNT_SPECIALTY_QUERY,
);
assert.equal(
  rosterPeopleQueryForSlot({
    assignmentKind: "MOUNT",
    mountDuty: "demount",
    role: "демонтаж",
  }),
  ROSTER_MOUNT_SPECIALTY_QUERY,
);
assert.equal(
  rosterPeopleQueryForSlot({
    assignmentKind: "MOUNT",
    mountDuty: "mount",
    role: "монтаж",
  }),
  "монтажник",
);
assert.equal(
  rosterPeopleQueryForSlot({
    assignmentKind: "EVENT",
    mountDuty: null,
    role: "Светооператор",
  }),
  "Светооператор",
);
assert.equal(
  personMatchesRosterOwners(
    { owners: ["SHOW_MASTER"] },
    { SHOW_MASTER: false, DIAKOM: true, NE_EVENT: true },
  ),
  false,
);
assert.equal(
  personMatchesRosterOwners(
    { owners: ["SHOW_MASTER", "DIAKOM"] },
    { SHOW_MASTER: false, DIAKOM: true, NE_EVENT: true },
  ),
  true,
);
assert.equal(
  personMatchesRosterOwners(
    { owners: [] },
    { SHOW_MASTER: false, DIAKOM: false, NE_EVENT: false },
  ),
  true,
);
assert.equal(
  rosterItemMatchesFirms(
    { firmOwners: ["SHOW_MASTER"] },
    { SHOW_MASTER: true, DIAKOM: false, NE_EVENT: false },
  ),
  true,
);
assert.equal(
  rosterItemMatchesFirms(
    { firmOwners: ["SHOW_MASTER"] },
    { SHOW_MASTER: false, DIAKOM: true, NE_EVENT: true },
  ),
  false,
);
assert.equal(
  rosterItemMatchesFirms(
    { firmOwners: [] },
    { SHOW_MASTER: false, DIAKOM: true, NE_EVENT: true },
  ),
  false,
);
assert.equal(
  rosterItemMatchesFirms(
    { firmOwners: [] },
    { SHOW_MASTER: true, DIAKOM: true, NE_EVENT: true },
  ),
  true,
);
assert.equal(
  isVacantInstallerSlot({
    vacant: true,
    assignmentKind: "MOUNT",
    mountDuty: "mount",
    assignmentIds: ["vac-1"],
  }),
  true,
);
assert.equal(
  isVacantInstallerSlot({
    vacant: false,
    assignmentKind: "MOUNT",
    mountDuty: "mount",
    assignmentIds: ["a-m"],
  }),
  false,
);
assert.equal(
  isVacantInstallerSlot({
    vacant: true,
    assignmentKind: "EVENT",
    mountDuty: null,
    assignmentIds: ["vac-2"],
  }),
  false,
);
assert.equal(
  dateInRosterResizeWindow(
    {
      eventStart: "2026-08-10",
      eventDays: 2,
    },
    "2026-08-09",
  ),
  false,
);
assert.equal(
  dateInRosterResizeWindow(
    {
      eventStart: "2026-08-10",
      eventDays: 2,
    },
    "2026-08-08",
  ),
  false,
);
assert.equal(
  dateInRosterResizeWindow(
    {
      eventStart: "2026-08-10",
      eventDays: 2,
    },
    "2026-08-10",
  ),
  true,
);
assert.equal(
  dateInRosterResizeWindow(
    {
      eventStart: "2026-08-10",
      eventDays: 2,
    },
    "2026-08-12",
  ),
  false,
);

const shmQuote = buildQuoteRosterItems({
  ...quote,
  firmOwners: ["SHOW_MASTER"],
});
assert.deepEqual(shmQuote[0]?.firmOwners, ["SHOW_MASTER"]);

assert.deepEqual(eachDateKey("2026-08-10", "2026-08-12"), [
  "2026-08-10",
  "2026-08-11",
  "2026-08-12",
]);
const busy = collectBusyDates(quoteItems);
assert.ok(busy.u1.includes("2026-08-10"));
assert.ok(busy.u1.includes("2026-08-11"));
assert.equal(busy.u1.includes("2026-08-09"), false);
const withOff = collectBusyDates(quoteItems, [
  { userId: "u1", date: "2026-08-13" },
]);
assert.ok(withOff.u1.includes("2026-08-13"));

function stubPerson(partial: {
  id: string;
  name: string;
  monthEarned: number;
  busyDates: string[];
}) {
  return {
    firstName: "",
    lastName: "",
    active: true,
    specialties: [],
    ...partial,
  };
}
const ranked = rankRosterPeople(
  [
    stubPerson({ id: "rich", name: "Богатый", monthEarned: 80_000, busyDates: ["2026-08-11"] }),
    stubPerson({
      id: "free-rich",
      name: "Свободный богатый",
      monthEarned: 90_000,
      busyDates: [],
    }),
    stubPerson({
      id: "free-poor",
      name: "Свободный бедный",
      monthEarned: 10_000,
      busyDates: [],
    }),
    stubPerson({
      id: "busy-poor",
      name: "Занятый бедный",
      monthEarned: 5_000,
      busyDates: ["2026-08-11"],
    }),
  ],
  ["2026-08-11"],
);
assert.deepEqual(
  ranked.map((row) => row.person.id),
  ["free-poor", "free-rich", "busy-poor", "rich"],
);
assert.equal(ranked[0]!.free, true);
assert.equal(ranked[2]!.free, false);
assert.equal(ranked[0]!.earnRatio, 10_000 / 90_000);

const flBusy = collectFreelancerBusyDates(
  [
    {
      freelancer: true,
      vacant: false,
      name: "Иванов Пётр",
      start: "2026-08-11",
      end: "2026-08-12",
    },
    {
      freelancer: false,
      vacant: false,
      name: "Штатный",
      start: "2026-08-11",
      end: "2026-08-11",
    },
  ],
  [
    { id: "fl1", name: "Иванов Пётр" },
    { id: "fl2", name: "Другой" },
  ],
);
assert.deepEqual(flBusy.fl1, ["2026-08-11", "2026-08-12"]);
assert.equal(flBusy.fl2, undefined);

assert.deepEqual(
  packRosterGroupOffsets([
    { startCol: 0, endExclusive: 1, height: 20 },
    { startCol: 1, endExclusive: 2, height: 3 },
  ]),
  [0, 0],
);
assert.deepEqual(
  packRosterGroupOffsets([
    { startCol: 0, endExclusive: 1, height: 10 },
    { startCol: 0, endExclusive: 1, height: 4 },
  ]),
  [0, 10],
);
assert.deepEqual(
  packRosterGroupOffsets([
    { startCol: 0, endExclusive: 2, height: 5 },
    { startCol: 1, endExclusive: 2, height: 2 },
  ]),
  [0, 5],
);
const seeded = [0, 8];
assert.deepEqual(
  packRosterGroupOffsets(
    [{ startCol: 1, endExclusive: 2, height: 2 }],
    seeded,
  ),
  [8],
);
assert.equal(seeded[1], 10);

const vacantDemount = {
  vacant: true,
  name: "",
  role: "демонтаж",
  assignmentIds: [] as string[],
  mountDuty: "demount" as const,
};
const filledAfterD = {
  vacant: false,
  name: "Копняев Юрий",
  role: "демонтаж",
  assignmentIds: ["a1"],
  mountDuty: "demount" as const,
};
assert.ok(
  compareRosterLaneItems(filledAfterD, vacantDemount) < 0,
  "ФИО после «д» всё равно выше пустого демонтажа",
);
const packedDuty = packRosterLanes([
  { startCol: 0, span: 1, item: { ...vacantDemount, role: "монтаж", mountDuty: "mount" as const } },
  { startCol: 2, span: 1, item: vacantDemount },
  { startCol: 2, span: 1, item: filledAfterD },
]);
const filledLane = packedDuty.find((s) => s.item.name === "Копняев Юрий")?.lane;
const emptyLane = packedDuty.find(
  (s) => s.item.vacant && s.item.role === "демонтаж",
)?.lane;
assert.ok(filledLane != null && emptyLane != null && filledLane < emptyLane);

console.log("roster.test.ts: ok");
