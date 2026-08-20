import assert from "node:assert/strict";
import {
  DESKTOP_VIEWPORT,
  LAYOUT_COOKIE,
  LAYOUT_STORAGE_KEY,
  MOBILE_VIEWPORT,
  isLayoutDensity,
} from "./layout-density";

assert.equal(isLayoutDensity("auto"), true);
assert.equal(isLayoutDensity("desktop"), true);
assert.equal(isLayoutDensity("mobile"), true);
assert.equal(isLayoutDensity("tablet"), false);
assert.equal(isLayoutDensity(""), false);
assert.equal(LAYOUT_STORAGE_KEY, "bs-crm-layout");
assert.equal(LAYOUT_COOKIE, "bs-crm-layout");
assert.equal(DESKTOP_VIEWPORT, "width=1280");
assert.match(MOBILE_VIEWPORT, /device-width/);
