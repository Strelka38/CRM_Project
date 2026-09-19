import assert from "node:assert/strict";
import {
  DATABASE_BACKUP_KIND,
  DATABASE_BACKUP_VERSION,
  QUOTE_PACK_KIND,
  QUOTE_PACK_VERSION,
  countBackupTables,
  emptyBackupCounts,
} from "./database-backup-format";
import { parseDatabaseBackup } from "./database-backup";
import {
  isDatabaseBackupKind,
  isQuotePack,
  parseQuotePack,
} from "./quote-backup";

const v3 = {
  kind: DATABASE_BACKUP_KIND,
  version: 3,
  exportedAt: "2026-09-20T00:00:00.000Z",
  tables: {
    users: [{ id: "u1", email: "a@b.c" }],
    quoteSnapshots: [{ id: "s1", quoteId: "q1" }],
  },
};
const parsed = parseDatabaseBackup(v3);
assert.equal(parsed.version, 3);
assert.equal(parsed.tables.quotes.length, 0);
assert.equal(parsed.tables.quoteBlocks.length, 0);
assert.equal(parsed.tables.quoteAssignments.length, 0);
assert.equal(parsed.tables.quoteSnapshots.length, 1);

const counts = countBackupTables(parsed.tables);
assert.equal(counts.quotes, 0);
assert.equal(counts.users, 1);
assert.ok("quotes" in emptyBackupCounts());
assert.equal(DATABASE_BACKUP_VERSION >= 4, true);

const pack = {
  kind: QUOTE_PACK_KIND,
  version: QUOTE_PACK_VERSION,
  exportedAt: "2026-09-20T00:00:00.000Z",
  tables: {
    quotes: [
      {
        id: "q1",
        proposalNumber: "17",
        eventName: "Директор Года",
        lifecycle: "CONFIRMED",
      },
    ],
    quoteBlocks: [
      { id: "b1", quoteId: "q1", type: "SECTION", title: "Звук", sortOrder: 0 },
      { id: "b2", quoteId: "q1", type: "ITEM", name: "Микшер", qty: 1, sortOrder: 1 },
    ],
    quoteAssignments: [
      { id: "a1", quoteId: "q1", specialtyId: "sp1", kind: "EVENT" },
    ],
  },
};
assert.equal(isQuotePack(pack), true);
assert.equal(isDatabaseBackupKind(v3), true);
assert.equal(isQuotePack(v3), false);

const parsedPack = parseQuotePack(pack);
assert.equal(parsedPack.tables.quotes.length, 1);
assert.equal(parsedPack.tables.quoteBlocks.length, 2);
assert.equal(parsedPack.tables.quoteAssignments.length, 1);
assert.equal(parsedPack.tables.quoteZones.length, 0);

let threw = false;
try {
  parseQuotePack({ kind: DATABASE_BACKUP_KIND, version: 1, tables: {} });
} catch {
  threw = true;
}
assert.equal(threw, true);

console.log("quote-backup.test.ts ok");
