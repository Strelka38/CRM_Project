import assert from "node:assert/strict";
import {
  buildQuoteSnapshotPayload,
  snapshotIdsToPrune,
  summarizeQuotePatch,
  changedQuoteMetaKeys,
  MAX_QUOTE_SNAPSHOTS,
  MAX_SPEC_SNAPSHOTS,
  snapshotToQuotePatch,
  isQuoteSnapshotPayload,
} from "./quote-history";

assert.equal(MAX_QUOTE_SNAPSHOTS, 10);
assert.equal(MAX_SPEC_SNAPSHOTS, 10);
assert.deepEqual(snapshotIdsToPrune(["a", "b", "c", "d", "e"], 3), ["d", "e"]);
assert.deepEqual(snapshotIdsToPrune(["a", "b", "c"]), []);
assert.deepEqual(
  snapshotIdsToPrune(Array.from({ length: 12 }, (_, i) => String(i))),
  ["10", "11"],
);

const payload = buildQuoteSnapshotPayload({
  proposalNumber: "91",
  eventName: "Тест",
  date: "20.08.2026",
  mountDate: "19.08.2026",
  mountDurationDays: 1,
  demountDate: "21.08.2026",
  demountDurationDays: 1,
  time: "10:00",
  place: "Зал",
  venueId: "v1",
  client: "Клиент",
  clientId: "c1",
  managerName: "Менеджер",
  ownerId: "u1",
  cashless: true,
  cashlessPercent: 10,
  durationDays: 1,
  notes: [],
  brief: "",
  discountPercent: 0,
  lifecycle: "CALCULATED",
  zones: [
    { id: "z1", name: "Звук", sortOrder: 0, active: true },
    { id: "z2", name: "Свет", sortOrder: 1 },
  ],
  blocks: [
    {
      id: "b1",
      type: "ITEM",
      sortOrder: 0,
      name: "Zoom",
      qty: 2,
      unitPrice: 3000,
      zoneId: "z1",
    },
  ],
});
assert.equal(payload.zones[1].active, true);
assert.equal(payload.blocks[0].qty, 2);
assert.equal(payload.meta.proposalNumber, "91");

const audit = summarizeQuotePatch({
  prevLifecycle: "CALCULATED",
  nextLifecycle: "CONFIRMED",
  changedMetaKeys: ["date"],
  zonesChanged: false,
  zoneCount: null,
  blocksChanged: true,
  blockCount: 12,
});
assert.equal(audit.action, "LIFECYCLE");
assert.equal(audit.summary.includes("CALCULATED → CONFIRMED"), true);
assert.equal(audit.summary.includes("блоки (12)"), true);

assert.deepEqual(
  changedQuoteMetaKeys(
    { eventName: "A", date: "1", lifecycle: "CALCULATED" },
    { eventName: "B", date: "1", lifecycle: "CONFIRMED" },
  ),
  ["eventName"],
);

assert.equal(isQuoteSnapshotPayload(payload), true);
assert.equal(isQuoteSnapshotPayload({}), false);

const patch = snapshotToQuotePatch(payload);
assert.equal(patch.zones.length, 2);
assert.equal(patch.blocks[0].zoneId, "z1");
assert.equal(patch.eventName, "Тест");

console.log("quote-history.test.ts: ok");
