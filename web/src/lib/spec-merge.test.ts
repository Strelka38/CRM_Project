import assert from "node:assert/strict";
import type { SpecLine } from "./spec-build";
import {
  diffSpecImport,
  mergeSpecImport,
  parseSpecLines,
  specLinesFromRevisionOrDerived,
} from "./spec-merge";

function line(partial: Partial<SpecLine> & { key: string }): SpecLine {
  return {
    deriveKey: partial.deriveKey ?? partial.key,
    source: partial.source ?? "derived",
    zoneId: partial.zoneId ?? null,
    zoneName: partial.zoneName ?? null,
    zoneSortOrder: partial.zoneSortOrder ?? null,
    zoneActive: partial.zoneActive !== false,
    type: partial.type ?? "ITEM",
    title: partial.title ?? null,
    name: partial.name ?? partial.key,
    qty: partial.qty ?? 1,
    comment: partial.comment ?? "",
    kitName: partial.kitName ?? null,
    catalogItemId: partial.catalogItemId ?? "cat-1",
    extraId: partial.extraId ?? null,
    hidden: Boolean(partial.hidden),
    isKitHeader: partial.isKitHeader,
    key: partial.key,
  };
}

const current: SpecLine[] = [
  line({
    key: "item:a",
    deriveKey: "item:a",
    name: "Zoom (переименован)",
    qty: 2,
    hidden: true,
    zoneId: "zone-old",
    zoneName: "Старая зона",
    zoneSortOrder: 5,
  }),
  line({ key: "item:gone", deriveKey: "item:gone", name: "Старый прибор" }),
  line({
    key: "extra:1",
    deriveKey: null,
    source: "extra",
    extraId: "1",
    name: "Кабель вручную",
    catalogItemId: null,
  }),
];

const incoming: SpecLine[] = [
  line({
    key: "item:a",
    deriveKey: "item:a",
    name: "Zoom",
    qty: 6,
    zoneId: "zone-main",
    zoneName: "Сцена",
    zoneSortOrder: 0,
  }),
  line({ key: "item:new", deriveKey: "item:new", name: "Новый свет" }),
];

const diff = diffSpecImport(current, incoming);
assert.equal(diff.added.length, 1);
assert.equal(diff.added[0].key, "item:new");
assert.equal(diff.removed.length, 1);
assert.equal(diff.removed[0].key, "item:gone");
assert.equal(diff.kept.length, 1);
assert.equal(diff.kept[0].hidden, true);
assert.equal(diff.extras.length, 1);

const merged = mergeSpecImport(current, incoming);
assert.deepEqual(
  merged.map((l) => l.key),
  ["item:a", "item:new", "extra:1"],
);
const zoom = merged.find((l) => l.key === "item:a")!;
assert.equal(zoom.hidden, true);
assert.equal(zoom.name, "Zoom (переименован)");
assert.equal(zoom.qty, 2);
assert.equal(zoom.zoneId, "zone-main");
assert.equal(zoom.zoneName, "Сцена");
assert.ok(merged.some((l) => l.key === "extra:1"));
assert.ok(!merged.some((l) => l.key === "item:gone"));

const parsed = parseSpecLines(JSON.parse(JSON.stringify(merged)));
assert.equal(parsed.length, 3);
assert.equal(parsed[0].hidden, true);
assert.equal(parsed[0].zoneId, "zone-main");
assert.equal(parsed[0].zoneName, "Сцена");

const snapshot = specLinesFromRevisionOrDerived(
  {
    lines: [
      {
        key: "item:a",
        deriveKey: "item:a",
        source: "derived",
        type: "ITEM",
        name: "Zoom (снимок)",
        qty: 9,
        extraId: null,
      },
      {
        key: "extra:1",
        source: "extra",
        type: "ITEM",
        extraId: "1",
        name: "Кабель вручную",
        qty: 3,
      },
    ],
  },
  current,
);
assert.equal(snapshot.hasSnapshot, true);
assert.equal(snapshot.lines.find((l) => l.key === "item:a")?.qty, 9);
assert.equal(snapshot.lines.find((l) => l.key === "item:a")?.name, "Zoom (снимок)");
assert.equal(snapshot.lines.find((l) => l.key === "extra:1")?.qty, 3);
assert.equal(
  specLinesFromRevisionOrDerived(null, current).hasSnapshot,
  false,
);

console.log("spec-merge.test.ts ok");
