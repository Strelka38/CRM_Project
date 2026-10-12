import assert from "node:assert/strict";
import { quoteSheetShowsIdentity } from "./quote-sheet-chrome";

assert.equal(quoteSheetShowsIdentity(0), false);
assert.equal(quoteSheetShowsIdentity(1), false);
assert.equal(quoteSheetShowsIdentity(2), true);
assert.equal(quoteSheetShowsIdentity(4), true);

console.log("quote-sheet-chrome.test.ts ok");
