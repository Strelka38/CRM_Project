import assert from "node:assert/strict";
import {
  applyAutoMountDemount,
  defaultDemountDate,
  defaultMountDate,
  quoteOccupanciesOverlap,
  quoteTimeOptions,
  sameCalendarDate,
} from "./quote-schedule";

assert.equal(defaultMountDate("15.02.2026"), "14.02.2026");
assert.equal(defaultDemountDate("15.02.2026", 1), "16.02.2026");
assert.equal(defaultDemountDate("15.02.2026", 3), "18.02.2026");
assert.ok(sameCalendarDate("15.02.2026", "2026-02-15"));

const first = applyAutoMountDemount({
  prevDate: "",
  prevDurationDays: 1,
  nextDate: "15.02.2026",
  nextDurationDays: 1,
  mountDate: "",
  demountDate: "",
});
assert.equal(first.mountDate, "14.02.2026");
assert.equal(first.demountDate, "16.02.2026");

const follow = applyAutoMountDemount({
  prevDate: "15.02.2026",
  prevDurationDays: 1,
  nextDate: "20.02.2026",
  nextDurationDays: 1,
  mountDate: "14.02.2026",
  demountDate: "16.02.2026",
});
assert.equal(follow.mountDate, "19.02.2026");
assert.equal(follow.demountDate, "21.02.2026");

const manual = applyAutoMountDemount({
  prevDate: "15.02.2026",
  prevDurationDays: 1,
  nextDate: "20.02.2026",
  nextDurationDays: 1,
  mountDate: "10.02.2026",
  demountDate: "22.02.2026",
});
assert.equal(manual.mountDate, "10.02.2026");
assert.equal(manual.demountDate, "22.02.2026");

const times = quoteTimeOptions("18:15");
assert.ok(times.includes("09:00"));
assert.ok(times.includes("18:30"));
assert.equal(times[0], "18:15");

assert.equal(
  quoteOccupanciesOverlap(
    {
      date: "16.02.2026",
      eventDate: null,
      durationDays: 1,
      mountDate: "15.02.2026",
      mountDurationDays: 1,
      demountDate: "17.02.2026",
      demountDurationDays: 1,
    },
    {
      date: "15.02.2026",
      eventDate: null,
      durationDays: 1,
    },
  ),
  true,
  "mount day of A overlaps event day of B",
);

assert.equal(
  quoteOccupanciesOverlap(
    {
      date: "20.02.2026",
      eventDate: null,
      durationDays: 1,
      mountDate: "19.02.2026",
      demountDate: "21.02.2026",
    },
    {
      date: "15.02.2026",
      eventDate: null,
      durationDays: 1,
    },
  ),
  false,
);

console.log("quote-schedule.test.ts ok");
