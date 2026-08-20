import assert from "node:assert/strict";
import { parseEquipmentQrValue } from "./equipment-qr";

assert.equal(
  parseEquipmentQrValue("https://crm.example/q/AbC123_-xyz9"),
  "AbC123_-xyz9",
);
assert.equal(parseEquipmentQrValue("http://localhost:3000/q/tokenValue01/"), "tokenValue01");
assert.equal(parseEquipmentQrValue("/q/tokenValue01"), "tokenValue01");
assert.equal(parseEquipmentQrValue("q/tokenValue01"), "tokenValue01");
assert.equal(parseEquipmentQrValue("tokenValue01"), "tokenValue01");
assert.equal(parseEquipmentQrValue("  /q/abcDEF12  "), "abcDEF12");
assert.equal(parseEquipmentQrValue(""), null);
assert.equal(parseEquipmentQrValue("not a qr"), null);
assert.equal(parseEquipmentQrValue("/catalog"), null);
assert.equal(parseEquipmentQrValue("https://crm.example/quotes/1"), null);
