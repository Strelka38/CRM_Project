import { formatRuDate, startOfDay } from "@/lib/dates";

export type NotificationType =
  | "INVOICE_DUE"
  | "SYSTEM"
  | "EVENT_CREATED"
  | "EVENT_ASSIGNED"
  | "CHAT_MESSAGE"
  | "MOUNT_CONFIRMED"
  | "TASK_OPEN";

export type AppNotification = {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  quote?: {
    id: string;
    eventName: string;
    proposalNumber: string;
  } | null;
  calendarEntry?: { id: string; title: string } | null;
};

export const NOTIFICATIONS_CHANGED = "crm:notifications-changed";

export function emitNotificationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

export function notificationHref(n: AppNotification): string | null {
  if (n.type === "TASK_OPEN" && n.calendarEntry) {
    return `/calendar?entry=${n.calendarEntry.id}`;
  }
  if (!n.quote) return null;
  if (
    n.type === "EVENT_ASSIGNED" ||
    n.type === "CHAT_MESSAGE" ||
    n.type === "MOUNT_CONFIRMED"
  ) {
    return `/calendar?quote=${n.quote.id}`;
  }
  return `/quotes/${n.quote.id}?tab=main`;
}

export function notificationLinkLabel(n: AppNotification): string {
  if (n.type === "TASK_OPEN") return "Открыть задачу";
  if (!n.quote) return "Открыть";
  if (
    n.type === "EVENT_ASSIGNED" ||
    n.type === "CHAT_MESSAGE" ||
    n.type === "MOUNT_CONFIRMED"
  ) {
    return n.quote.eventName?.trim()
      ? `Открыть «${n.quote.eventName.trim()}»`
      : "Открыть мероприятие";
  }
  return `Открыть КП №${n.quote.proposalNumber}`;
}

export type NotificationDayGroup = "today" | "yesterday" | "earlier";

export function notificationDayGroup(
  iso: string,
  now = new Date(),
): NotificationDayGroup {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "earlier";
  const diffDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(d).getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";
  return "earlier";
}

export function formatNotificationTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const time = d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const group = notificationDayGroup(iso, now);
  if (group === "today") return `сегодня, ${time}`;
  if (group === "yesterday") return `вчера, ${time}`;
  return `${formatRuDate(d)}, ${time}`;
}

export const NOTIFICATION_GROUP_LABELS: Record<NotificationDayGroup, string> = {
  today: "Сегодня",
  yesterday: "Вчера",
  earlier: "Ранее",
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  INVOICE_DUE: "Счёт",
  SYSTEM: "Система",
  EVENT_CREATED: "Мероприятие",
  EVENT_ASSIGNED: "Назначение",
  CHAT_MESSAGE: "Чат",
  MOUNT_CONFIRMED: "Монтаж",
  TASK_OPEN: "Задача",
};
