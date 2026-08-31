import assert from "node:assert/strict";
import {
  formatVacantRoles,
  isInstallerStaff,
  vacantStaffLabels,
} from "./staff-slots";

assert.equal(isInstallerStaff({ kind: "MOUNT" }), true);
assert.equal(isInstallerStaff({ kind: "EVENT", specialtyName: "Монтажник" }), true);
assert.equal(isInstallerStaff({ kind: "EVENT", specialtyName: "Свет" }), false);

assert.deepEqual(
  vacantStaffLabels([
    { userId: null, isFreelancer: false, kind: "MOUNT" },
    { userId: null, isFreelancer: false, kind: "MOUNT", specialtyName: "риггинг" },
  ]),
  [],
);

assert.deepEqual(
  vacantStaffLabels([
    { userId: null, isFreelancer: false, kind: "EVENT", specialtyName: "Свет" },
    { userId: null, isFreelancer: false, kind: "MOUNT" },
    {
      userId: null,
      isFreelancer: false,
      kind: "EVENT",
      specialty: { name: "Монтажник" },
    },
  ]),
  ["Свет"],
);

assert.equal(
  formatVacantRoles(
    vacantStaffLabels([
      { userId: null, isFreelancer: false, kind: "EVENT", specialtyName: "Свет" },
      { userId: "u1", isFreelancer: false, kind: "EVENT", specialtyName: "Звук" },
      { userId: null, isFreelancer: false, kind: "MOUNT" },
    ]),
  ),
  "Свет",
);

assert.deepEqual(
  vacantStaffLabels([
    {
      userId: null,
      isFreelancer: false,
      kind: "EVENT",
      specialtyName: "Видео",
      dayIndex: 1,
    },
    {
      userId: null,
      isFreelancer: false,
      kind: "EVENT",
      specialtyName: "Видео",
      dayIndex: 2,
    },
  ]),
  ["Видео"],
);
