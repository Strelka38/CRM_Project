import assert from "node:assert/strict";
import {
  allowedNavHrefs,
  compactPermissionOverrides,
  navPathBlocked,
  parsePermissionOverrides,
  permissionCell,
  roleHasDatabaseAccess,
  roleHasPermission,
  sectionNodeForPath,
} from "./permission-tree";
import {
  canAccessDatabase,
  canAccessRoster,
  canBackupDatabase,
  canCreateCalendarProject,
  canEditSpec,
  canManageQuotes,
  canSeeAssignmentPay,
} from "./roles";

assert.equal(canEditSpec("ADMIN"), true);
assert.equal(canEditSpec("MANAGER"), true);
assert.equal(canEditSpec("BRIGADIER"), true);
assert.equal(canEditSpec("EMPLOYEE"), false);
assert.equal(canManageQuotes("BRIGADIER"), false);
assert.equal(canSeeAssignmentPay("MANAGER"), true);
assert.equal(canAccessRoster("BRIGADIER"), true);
assert.equal(canAccessRoster("EMPLOYEE"), false);
assert.equal(canAccessDatabase("BRIGADIER"), true);
assert.equal(canAccessDatabase("EMPLOYEE"), false);
assert.equal(canBackupDatabase("ADMIN"), true);
assert.equal(canBackupDatabase("MANAGER"), false);
assert.equal(canCreateCalendarProject("MANAGER"), true);
assert.equal(canCreateCalendarProject("BRIGADIER"), false);

assert.equal(roleHasPermission("ADMIN", "section.settingsAccess"), true);
assert.equal(roleHasPermission("MANAGER", "section.settingsAccess"), false);
assert.equal(
  roleHasPermission("MANAGER", "section.settingsAccess", {
    "section.settingsAccess": { MANAGER: true },
  }),
  false,
);

assert.equal(
  canEditSpec("EMPLOYEE", { "fn.quotes.editSpec": { EMPLOYEE: true } }),
  true,
);
assert.equal(
  canAccessRoster("BRIGADIER", { "section.roster": { BRIGADIER: false } }),
  false,
);
assert.equal(
  roleHasDatabaseAccess("EMPLOYEE", { "section.catalog": { EMPLOYEE: true } }),
  true,
);
assert.equal(
  roleHasDatabaseAccess("BRIGADIER", {
    "section.catalog": { BRIGADIER: false },
    "section.repairs": { BRIGADIER: false },
    "section.kits": { BRIGADIER: false },
    "section.vehicles": { BRIGADIER: false },
    "section.equipment": { BRIGADIER: false },
    "section.clients": { BRIGADIER: false },
    "section.legalEntities": { BRIGADIER: false },
    "section.venues": { BRIGADIER: false },
    "section.freelancers": { BRIGADIER: false },
    "section.users": { BRIGADIER: false },
    "section.rates": { BRIGADIER: false },
  }),
  false,
);

const grantedCalc = { "section.calculations": { BRIGADIER: true } };
assert.equal(
  roleHasPermission("BRIGADIER", "section.calculations", grantedCalc),
  true,
);
assert.equal(
  allowedNavHrefs("BRIGADIER", grantedCalc).includes("/calculations"),
  true,
);
assert.equal(navPathBlocked("/calculations", "BRIGADIER", grantedCalc), false);
assert.equal(navPathBlocked("/calculations", "EMPLOYEE", {}), true);
assert.equal(navPathBlocked("/calculations", "MANAGER", {}), false);

assert.equal(sectionNodeForPath("/quotes")?.id, "section.quotes");
assert.equal(sectionNodeForPath("/quotes/abc"), null);
assert.equal(navPathBlocked("/quotes/abc", "EMPLOYEE", {
  "section.quotes": { EMPLOYEE: false },
}), false);
assert.equal(navPathBlocked("/quotes", "EMPLOYEE", {
  "section.quotes": { EMPLOYEE: false },
}), true);

assert.equal(sectionNodeForPath("/catalog/print-qr")?.href, "/catalog");
assert.equal(sectionNodeForPath("/settings/access")?.id, "section.settingsAccess");
assert.equal(sectionNodeForPath("/profile"), null);
assert.equal(sectionNodeForPath("/notifications"), null);

assert.equal(
  allowedNavHrefs("EMPLOYEE", {}, { payoutsAccess: false }).includes("/payouts"),
  false,
);
assert.equal(
  allowedNavHrefs("EMPLOYEE", {}, { payoutsAccess: true }).includes("/payouts"),
  true,
);
assert.equal(
  allowedNavHrefs("MANAGER", {}).includes("/settings/access"),
  false,
);
assert.equal(allowedNavHrefs("ADMIN", {}).includes("/settings/access"), true);

assert.equal(permissionCell("section.calendar", "EMPLOYEE").locked, true);
assert.equal(permissionCell("section.payouts", "MANAGER").reason, "per-user");
assert.equal(permissionCell("fn.users.assignManagers", "MANAGER").locked, true);
assert.equal(permissionCell("section.backup", "ADMIN").reason, "admin");

const compact = compactPermissionOverrides({
  "section.calculations": { BRIGADIER: true, MANAGER: true, ADMIN: false },
  "section.payouts": { MANAGER: true },
  "section.settingsAccess": { MANAGER: true },
});
assert.deepEqual(compact, {
  "section.calculations": { BRIGADIER: true },
});

assert.deepEqual(
  parsePermissionOverrides({
    "section.calculations": { BRIGADIER: true, UNKNOWN: true },
    "fn.nope": { MANAGER: false },
  }),
  { "section.calculations": { BRIGADIER: true } },
);

console.log("permission-tree.test.ts ok");
