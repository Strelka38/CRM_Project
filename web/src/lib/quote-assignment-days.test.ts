import assert from "node:assert/strict";
import {
  dayHeading,
  dayRosterFingerprint,
  effectiveEventAssignments,
  eventAssignments,
  formatDaysWithDates,
  mountAssignments,
  normDayIndex,
  specialistDaysDiffer,
  staffCoverageLines,
  whoWorksView,
  workingDayCount,
} from "./quote-assignment-days";

assert.equal(workingDayCount(3), 3);
assert.equal(workingDayCount(1), 1);
assert.equal(workingDayCount(0), 1);
assert.equal(workingDayCount(null), 1);
assert.equal(normDayIndex(2), 2);
assert.equal(normDayIndex(null), null);
assert.equal(normDayIndex(0), null);
assert.equal(dayHeading(1), "(1 день)");

const sound = { id: "spec-s", name: "Звукооператор" };
const video = { id: "spec-v", name: "Видеорежиссёр" };

function slot(partial: {
  id: string;
  kind?: "EVENT" | "MOUNT";
  dayIndex?: number | null;
  userId?: string | null;
  specialty?: { id: string; name: string };
  isFreelancer?: boolean;
  freelancerName?: string;
  user?: { name?: string; firstName?: string; lastName?: string };
}) {
  return {
    kind: "EVENT" as const,
    dayIndex: null as number | null,
    userId: null as string | null,
    isFreelancer: false,
    freelancerName: "",
    specialty: sound,
    specialtyId: (partial.specialty ?? sound).id,
    ...partial,
  };
}

const mount1 = slot({
  id: "m1",
  kind: "MOUNT",
  userId: "u-mount",
  specialty: { id: "spec-m", name: "Монтажник" },
});

assert.equal(eventAssignments([mount1]).length, 0);
assert.equal(mountAssignments([mount1]).length, 1);

const oneDay = [
  slot({ id: "e1", userId: "u1" }),
  slot({ id: "e2", specialty: video, userId: null }),
  mount1,
];
const single = whoWorksView(oneDay, 1);
assert.equal(single.split, false);
if (!single.split) {
  assert.equal(single.lines.length, 2);
  assert.equal(single.lines[0].vacant, false);
  assert.equal(single.lines[1].vacant, true);
  assert.equal(single.lines[1].role, "Видеорежиссёр");
}

const samePeople = [
  slot({ id: "d1s", dayIndex: 1, userId: "u1" }),
  slot({ id: "d1v", dayIndex: 1, specialty: video, userId: "u2" }),
  slot({ id: "d2s", dayIndex: 2, userId: "u1" }),
  slot({ id: "d2v", dayIndex: 2, specialty: video, userId: "u2" }),
  mount1,
];
assert.equal(specialistDaysDiffer(samePeople, 2), false);
const unified = whoWorksView(samePeople, 2);
assert.equal(unified.split, false);
if (!unified.split) {
  assert.equal(unified.lines.length, 2);
}

const sharedOnly = [
  slot({ id: "s1", userId: "u1" }),
  slot({ id: "s2", specialty: video, userId: "u2" }),
  mount1,
];
assert.equal(specialistDaysDiffer(sharedOnly, 3), false);
const sharedView = whoWorksView(sharedOnly, 3);
assert.equal(sharedView.split, false);

const different = [
  slot({ id: "d1s", dayIndex: 1, userId: "u1" }),
  slot({ id: "d1v", dayIndex: 1, specialty: video, userId: "u2" }),
  slot({ id: "d2s", dayIndex: 2, userId: "u3" }),
  slot({ id: "d2v", dayIndex: 2, specialty: video, userId: "u2" }),
  mount1,
];
assert.equal(specialistDaysDiffer(different, 2), true);
const split = whoWorksView(different, 2);
assert.equal(split.split, false);
if (!split.split) {
  assert.equal(split.lines.filter((l) => l.role === "Звукооператор").length, 2);
  assert.equal(split.lines.filter((l) => l.role === "Видеорежиссёр").length, 1);
  assert.ok(split.lines.some((l) => l.detail.includes("1 день")));
  assert.ok(split.lines.some((l) => l.detail.includes("2 день")));
}

const partial = staffCoverageLines(
  [
    slot({
      id: "s1",
      dayIndex: 1,
      userId: "u1",
      user: { name: "Сидоров Алексей" },
    }),
  ],
  3,
  "25.08.2026",
);
assert.equal(partial.length, 2);
assert.match(partial[0]!.text, /Сидоров/);
assert.match(partial[0]!.text, /1 день/);
assert.match(partial[1]!.text, /Нужно назначить/);
assert.match(partial[1]!.text, /2, 3 день/);
assert.match(partial[1]!.text, /26 авг/);
assert.match(partial[1]!.text, /27 авг/);

assert.equal(formatDaysWithDates([2, 3], "25.08.2026").includes("2, 3 день"), true);

const inherited = effectiveEventAssignments(
  [
    slot({ id: "shared", userId: "u1" }),
    slot({ id: "d2", dayIndex: 2, userId: "u3" }),
  ],
  1,
);
assert.equal(inherited.length, 1);
assert.equal(inherited[0].id, "shared");
const day2 = effectiveEventAssignments(
  [
    slot({ id: "shared", userId: "u1" }),
    slot({ id: "d2", dayIndex: 2, userId: "u3" }),
  ],
  2,
);
assert.equal(day2.length, 1);
assert.equal(day2[0].id, "d2");

assert.notEqual(
  dayRosterFingerprint([slot({ id: "a", userId: "u1" })]),
  dayRosterFingerprint([slot({ id: "b", userId: "u2" })]),
);

console.log("quote-assignment-days.test.ts: ok");
