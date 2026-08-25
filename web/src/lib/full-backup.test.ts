import assert from "node:assert/strict";
import {
  backupFilenameFromDate,
  backupsToDelete,
  databaseNameFromUrl,
  FULL_BACKUP_KIND,
  isBackupFilename,
  parseFullBackupManifest,
  pgDumpConnectionString,
} from "./full-backup";

assert.equal(isBackupFilename("crm-full-20260825-2210.tar.gz"), true);
assert.equal(isBackupFilename("crm-full-20260825-2210.tar"), false);
assert.equal(isBackupFilename("../crm-full-20260825-2210.tar.gz"), false);
assert.equal(isBackupFilename("crm-full-20260825-2210.tar.gz.bak"), false);
assert.equal(isBackupFilename("notes.txt"), false);

const named = backupFilenameFromDate(new Date(2026, 7, 25, 21, 5, 0));
assert.equal(named, "crm-full-20260825-2105.tar.gz");

assert.equal(
  pgDumpConnectionString(
    "postgresql://crm:secret@db:5432/crm_event?schema=public",
  ),
  "postgresql://crm:secret@db:5432/crm_event",
);
assert.equal(
  databaseNameFromUrl("postgresql://crm:secret@localhost:5432/crm_event"),
  "crm_event",
);

const manifest = parseFullBackupManifest({
  kind: FULL_BACKUP_KIND,
  version: 1,
  createdAt: "2026-08-25T12:00:00.000Z",
  database: "crm_event",
  postgres: "PostgreSQL 16",
});
assert.equal(manifest.kind, FULL_BACKUP_KIND);
assert.equal(manifest.database, "crm_event");

assert.throws(() => parseFullBackupManifest({ kind: "other", version: 1 }));
assert.throws(() => parseFullBackupManifest(null));

const files = [
  "crm-full-20260825-0300.tar.gz",
  "crm-full-20260824-0300.tar.gz",
  "crm-full-20260823-0300.tar.gz",
];
assert.deepEqual(backupsToDelete(files, 2), ["crm-full-20260823-0300.tar.gz"]);
assert.deepEqual(backupsToDelete(files, 14), []);
assert.deepEqual(backupsToDelete(files, 0), []);

console.log("full-backup.test.ts ok");
