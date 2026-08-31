import assert from "node:assert/strict";
import { defaultQuoteZones } from "./quote-defaults";

assert.deepEqual(defaultQuoteZones(), [{ name: "Зона 1", sortOrder: 0 }]);

console.log("quote-defaults.test.ts: ok");
