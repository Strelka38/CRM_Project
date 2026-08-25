import assert from "node:assert/strict";
import {
  BRIGADIER_QUOTE_PATCH_KEYS,
  canAccessRoster,
  canEditBrief,
  canEditQuoteSchedule,
  canManageEventAttachments,
  canManageQuotes,
  canViewQuote,
  forbiddenBrigadierQuotePatchKeys,
  isBrigadierQuotePatchKey,
  isManager,
} from "./roles";

assert.equal(canAccessRoster("MANAGER"), true);
assert.equal(canAccessRoster("BRIGADIER"), true);
assert.equal(canAccessRoster("EMPLOYEE"), false);
assert.equal(isManager("BRIGADIER"), false);
assert.equal(canManageQuotes("BRIGADIER"), false);
assert.equal(canViewQuote("BRIGADIER"), true);
assert.equal(canViewQuote("MANAGER"), true);
assert.equal(canViewQuote("EMPLOYEE"), false);
assert.equal(canEditBrief("BRIGADIER"), true);
assert.equal(canManageEventAttachments("BRIGADIER"), true);
assert.equal(canManageEventAttachments("MANAGER"), true);
assert.equal(canManageEventAttachments("EMPLOYEE"), false);
assert.equal(canEditQuoteSchedule("BRIGADIER"), true);
assert.equal(canEditQuoteSchedule("EMPLOYEE"), false);

assert.equal(isBrigadierQuotePatchKey("brief"), true);
assert.equal(isBrigadierQuotePatchKey("time"), true);
assert.equal(isBrigadierQuotePatchKey("lifecycle"), false);
assert.equal(isBrigadierQuotePatchKey("blocks"), false);

assert.deepEqual(
  forbiddenBrigadierQuotePatchKeys([
    "brief",
    "time",
    "lifecycle",
    "client",
    "forceStock",
  ]),
  ["lifecycle", "client"],
);
assert.deepEqual(
  forbiddenBrigadierQuotePatchKeys([...BRIGADIER_QUOTE_PATCH_KEYS]),
  [],
);
