import assert from "node:assert/strict";
import {
  DEFAULT_QUOTE_NOTES,
  ESTIMATE_DISCLAIMER,
  ESTIMATE_VALIDITY_DAYS,
  QUOTE_DAY_RATE_NOTE,
  QUOTE_OFFER_NOTE,
  resolveEstimateDisclaimer,
} from "./commercial-terms";

assert.equal(ESTIMATE_VALIDITY_DAYS, 7);
assert.equal(DEFAULT_QUOTE_NOTES.length, 2);
assert.equal(DEFAULT_QUOTE_NOTES[0], QUOTE_OFFER_NOTE);
assert.equal(DEFAULT_QUOTE_NOTES[1], QUOTE_DAY_RATE_NOTE);
assert.match(ESTIMATE_DISCLAIMER, /7 дней/);
assert.match(ESTIMATE_DISCLAIMER, /50%/);
assert.match(ESTIMATE_DISCLAIMER, /не является офертой/);
assert.equal(resolveEstimateDisclaimer("  Своё  ", "Шаблон"), "Своё");
assert.equal(resolveEstimateDisclaimer("  ", "Шаблон"), "Шаблон");
assert.equal(resolveEstimateDisclaimer("", ""), ESTIMATE_DISCLAIMER);

console.log("commercial-terms.test.ts ok");
