import assert from "node:assert/strict";
import {
  formatNotificationTime,
  notificationDayGroup,
  notificationHref,
  notificationLinkLabel,
  type AppNotification,
} from "./notification-ui";

function n(partial: Partial<AppNotification>): AppNotification {
  return {
    id: "1",
    type: "SYSTEM",
    title: "t",
    body: "b",
    read: false,
    createdAt: "2026-09-08T10:00:00.000Z",
    ...partial,
  };
}

const quote = {
  id: "q1",
  eventName: "Панель_интурист",
  proposalNumber: "24",
};

assert.equal(
  notificationHref(n({ type: "TASK_OPEN", calendarEntry: { id: "e1", title: "Задача" } })),
  "/calendar?entry=e1",
);
assert.equal(notificationLinkLabel(n({ type: "TASK_OPEN" })), "Открыть задачу");

assert.equal(
  notificationHref(n({ type: "EVENT_ASSIGNED", quote })),
  "/calendar?quote=q1",
);
assert.equal(
  notificationLinkLabel(n({ type: "EVENT_ASSIGNED", quote })),
  "Открыть «Панель_интурист»",
);

assert.equal(
  notificationHref(n({ type: "EVENT_CREATED", quote })),
  "/quotes/q1?tab=main",
);
assert.equal(
  notificationLinkLabel(n({ type: "EVENT_CREATED", quote })),
  "Открыть КП №24",
);

assert.equal(notificationHref(n({ type: "SYSTEM" })), null);

const now = new Date(2026, 8, 8, 18, 0, 0);
assert.equal(notificationDayGroup(new Date(2026, 8, 8, 9, 30).toISOString(), now), "today");
assert.equal(notificationDayGroup(new Date(2026, 8, 7, 9, 30).toISOString(), now), "yesterday");
assert.equal(notificationDayGroup(new Date(2026, 8, 1, 9, 30).toISOString(), now), "earlier");

const earlier = formatNotificationTime(new Date(2026, 8, 1, 14, 5).toISOString(), now);
assert.match(earlier, /^01\.09\.2026, /);
