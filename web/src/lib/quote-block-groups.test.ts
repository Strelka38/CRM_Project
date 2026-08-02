import assert from "node:assert/strict";
import {
  buildBlockGroups,
  moveBlockInGroups,
  reorderBlocksByDrop,
} from "./quote-block-groups";

type B = { key: string; type: string; zoneId: string; sortOrder: number };

function b(key: string, type: string, sortOrder: number): B {
  return { key, type, zoneId: "z1", sortOrder };
}

const sample: B[] = [
  b("s1", "SECTION", 0),
  b("i1", "ITEM", 1),
  b("i2", "ITEM", 2),
  b("s2", "SECTION", 3),
  b("i3", "ITEM", 4),
  b("s3", "SECTION", 5),
  b("i4", "ITEM", 6),
];

const g = buildBlockGroups(sample);
assert.equal(g.length, 3);
assert.deepEqual(
  g[0].blocks.map((x) => x.key),
  ["s1", "i1", "i2"],
);
assert.deepEqual(
  g[1].blocks.map((x) => x.key),
  ["s2", "i3"],
);

const movedSection = moveBlockInGroups(sample, "s2", 1);
assert.deepEqual(
  movedSection?.map((x) => x.key),
  ["s1", "i1", "i2", "s3", "i4", "s2", "i3"],
);

const dropped = reorderBlocksByDrop(sample, "s3", "s1");
assert.deepEqual(
  dropped?.map((x) => x.key),
  ["s3", "i4", "s1", "i1", "i2", "s2", "i3"],
);

const itemMoved = reorderBlocksByDrop(sample, "i3", "s1");
assert.deepEqual(
  itemMoved?.map((x) => x.key),
  ["s1", "i3", "i1", "i2", "s2", "s3", "i4"],
);

console.log("quote-block-groups.test.ts ok");
