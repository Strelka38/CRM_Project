import assert from "node:assert/strict";
import {
  allowsNavGate,
  isNavItemActive,
  navGateForPath,
  navGroupIsActive,
  navMenuItems,
} from "./nav-sections";

assert.equal(navGateForPath("/payouts"), "payments");
assert.equal(navGateForPath("/calculations/abc"), "manager");
assert.equal(navGateForPath("/backup"), "admin");
assert.equal(navGateForPath("/quotes"), "auth");
assert.equal(navGateForPath("/quotes/abc"), "auth");
assert.equal(navGateForPath("/catalog/print-qr"), "database");
assert.equal(navGateForPath("/equipment/x"), "database");
assert.equal(navGateForPath("/statistics"), "stats");
assert.equal(navGateForPath("/roster"), "roster");
assert.equal(navGateForPath("/unpaid"), "manager");
assert.equal(navGateForPath("/settings/access"), "admin");
assert.equal(navGateForPath("/login"), null);
assert.equal(navGateForPath("/api/payouts"), null);

assert.equal(isNavItemActive("/quotes", "/quotes", true), true);
assert.equal(isNavItemActive("/quotes/abc", "/quotes", true), false);
assert.equal(isNavItemActive("/quotes/abc", "/quotes", false), true);

const warehouse = navMenuItems("warehouse");
assert.equal(
  warehouse.some((s) => s.href === "/equipment"),
  false,
);
assert.deepEqual(
  warehouse.map((s) => s.href),
  ["/catalog", "/repairs", "/kits", "/vehicles"],
);

const dbNoBackup = navMenuItems("database");
assert.equal(
  dbNoBackup.some((s) => s.href === "/backup"),
  false,
);
const dbBackup = navMenuItems("database", { showBackup: true });
assert.equal(dbBackup.at(-1)?.href, "/backup");

const accounting = navMenuItems("accounting", { showPayouts: true });
assert.equal(
  accounting.some((s) => s.href === "/payouts"),
  true,
);
assert.equal(
  accounting.some((s) => s.href === "/roster"),
  true,
);
assert.equal(
  accounting.some((s) => s.href === "/calculations"),
  true,
);
const accountingMobile = navMenuItems("accounting", {
  showPayouts: true,
  mobile: true,
});
assert.equal(
  accountingMobile.some((s) => s.href === "/roster"),
  false,
);
assert.equal(
  accountingMobile.some((s) => s.href === "/calculations"),
  false,
);
assert.equal(
  navMenuItems("database", { showBackup: true }).some((s) => s.href === "/backup"),
  true,
);
assert.equal(
  navMenuItems("database", { showBackup: true, mobile: true }).some(
    (s) => s.href === "/backup",
  ),
  false,
);
assert.equal(
  navMenuItems("accounting").some((s) => s.href === "/payouts"),
  false,
);

assert.equal(allowsNavGate("payments", "EMPLOYEE"), true);
assert.equal(allowsNavGate("manager", "EMPLOYEE"), false);
assert.equal(allowsNavGate("admin", "BRIGADIER"), false);
assert.equal(allowsNavGate("admin", "ADMIN"), true);
assert.equal(allowsNavGate("database", "BRIGADIER"), true);

assert.equal(navGroupIsActive("/equipment/x", "warehouse"), true);
assert.equal(navGroupIsActive("/quotes/abc", "accounting"), false);
assert.equal(navGroupIsActive("/quotes", "accounting"), true);
assert.deepEqual(
  navMenuItems("settings", { showBackup: true }).map((s) => s.href),
  ["/settings/access"],
);
assert.equal(
  navMenuItems("settings", {
    showBackup: true,
    allowedHrefs: ["/backup"],
  }).length,
  0,
);

console.log("nav-sections.test.ts ok");
