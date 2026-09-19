import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = dirname(fileURLToPath(import.meta.url));
const quotePatch = readFileSync(
  join(srcDir, "../app/api/quotes/[id]/route.ts"),
  "utf8",
);
const assignments = readFileSync(
  join(srcDir, "../app/api/quotes/[id]/assignments/route.ts"),
  "utf8",
);
const assignmentOne = readFileSync(
  join(srcDir, "../app/api/quotes/[id]/assignments/[assignmentId]/route.ts"),
  "utf8",
);

assert.match(quotePatch, /stockWarning/);
assert.match(quotePatch, /stockIssues/);
assert.equal(quotePatch.includes("status: 409"), false);
assert.equal(quotePatch.includes("buildSpecLines"), false);
assert.equal(quotePatch.includes("writeSpecRevision"), false);

assert.match(assignments, /status: 409/);
assert.match(assignmentOne, /status: 409/);

console.log("quote-patch-invariants.test.ts ok");
