import assert from "node:assert/strict";
import type { SpecLine } from "./spec-build";
import {
  itemDeriveKey,
  kitComponentDeriveKey,
  omitEmptyDerivedSections,
  sectionDeriveKey,
} from "./spec-build";

assert.equal(itemDeriveKey("b1"), "item:b1");
assert.equal(kitComponentDeriveKey("b1", "c1"), "kit:b1:c1");
assert.equal(sectionDeriveKey("s1"), "section:s1");

function line(partial: Partial<SpecLine> & { key: string }): SpecLine {
  return {
    deriveKey: partial.deriveKey ?? partial.key,
    source: partial.source ?? "derived",
    type: partial.type ?? "ITEM",
    title: partial.title ?? null,
    name: partial.name ?? partial.key,
    qty: partial.qty ?? 1,
    comment: partial.comment ?? "",
    kitName: partial.kitName ?? null,
    catalogItemId: partial.catalogItemId ?? null,
    extraId: partial.extraId ?? null,
    hidden: Boolean(partial.hidden),
    isKitHeader: partial.isKitHeader,
    key: partial.key,
  };
}

const pruned = omitEmptyDerivedSections([
  line({ key: "section:sound", type: "SECTION", title: "Звук" }),
  line({ key: "item:speaker", name: "Колонка" }),
  line({ key: "section:support", type: "SECTION", title: "Сопровождение" }),
  line({ key: "section:misc", type: "SECTION", title: "Разное" }),
  line({ key: "item:cable", name: "Кабель" }),
  line({
    key: "extra:new",
    source: "extra",
    type: "SECTION",
    extraId: "new",
    deriveKey: null,
    title: "Новый раздел",
  }),
]);
assert.deepEqual(
  pruned.map((row) => row.key),
  ["section:sound", "item:speaker", "section:misc", "item:cable", "extra:new"],
);

console.log("spec-build.test.ts: ok");
