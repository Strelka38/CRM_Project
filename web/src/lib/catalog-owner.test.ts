import assert from "node:assert/strict";
import {
  formatOwnersCsv,
  parseOwnerCsv,
  parseOwnersCsv,
  parseOwnerToken,
} from "./catalog-owner";

assert.equal(parseOwnerToken("ШМ"), "SHOW_MASTER");
assert.equal(parseOwnerToken("шоу-мастер"), "SHOW_MASTER");
assert.equal(parseOwnerToken("Шоу Мастер"), "SHOW_MASTER");
assert.equal(parseOwnerToken("неivent"), null);
assert.equal(parseOwnerToken("НеИвент"), "NE_EVENT");
assert.equal(parseOwnerToken("ДК"), "DIAKOM");
assert.equal(parseOwnerCsv("диаком"), "DIAKOM");

assert.deepEqual(parseOwnersCsv("ШМ;NE"), ["SHOW_MASTER", "NE_EVENT"]);
assert.deepEqual(parseOwnersCsv("ДК+|SHOW_MASTER"), ["DIAKOM", "SHOW_MASTER"]);
assert.equal(formatOwnersCsv(["SHOW_MASTER", "DIAKOM"]), "ШМ;ДК");

console.log("catalog-owner.test.ts ok");
