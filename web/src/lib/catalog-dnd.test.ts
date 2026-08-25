import assert from "node:assert/strict";
import {
  beginCatalogDrag,
  endCatalogDrag,
  getCatalogDrag,
  nearestInsertGap,
  parseCatalogDragPayloadJson,
} from "./catalog-dnd";
import type { PickedCatalogItem } from "@/components/CatalogPicker";

const item = {
  id: "cam-1",
  name: "Камера",
  basePrice: 1200,
  stockQty: 4,
  itemKind: "EQUIPMENT",
  dayMode: "HALF_EXTRA",
  cashlessOverride: null,
  category: {
    id: "c1",
    name: "Видео",
    path: "Видеооборудование/Камеры",
    subtotalLabel: "",
  },
} as PickedCatalogItem;

const parsed = parseCatalogDragPayloadJson(
  JSON.stringify({ item, qty: 3 }),
);
assert.equal(parsed?.item.id, "cam-1");
assert.equal(parsed?.item.name, "Камера");
assert.equal(parsed?.qty, 3);

assert.equal(parseCatalogDragPayloadJson("not-json"), null);
assert.equal(parseCatalogDragPayloadJson(JSON.stringify({ qty: 1 })), null);
assert.equal(
  parseCatalogDragPayloadJson(JSON.stringify({ item: { name: "x" }, qty: 1 })),
  null,
);

const rounded = parseCatalogDragPayloadJson(
  JSON.stringify({ item, qty: 0 }),
);
assert.equal(rounded?.qty, 1);

beginCatalogDrag(item, 2.4);
assert.equal(getCatalogDrag()?.qty, 2);
endCatalogDrag();
assert.equal(getCatalogDrag(), null);

function row(top: number, height: number) {
  return {
    getBoundingClientRect: () => ({ top, bottom: top + height }),
  };
}

const rows = [row(100, 20), row(120, 20)];
assert.equal(nearestInsertGap(rows, 90, null), 0);
assert.equal(nearestInsertGap(rows, 108, null), 0);
assert.equal(nearestInsertGap(rows, 122, null), 1);
assert.equal(nearestInsertGap(rows, 160, null), 2);
assert.equal(nearestInsertGap([], 10, null), 0);
assert.equal(nearestInsertGap(rows, 120, 1), 1);
