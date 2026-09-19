"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  EmptyState,
  PageHeader,
  TableSkeleton,
} from "@/components/ui";
import {
  NOTIFICATIONS_CHANGED,
  NOTIFICATION_TYPE_LABELS,
  emitNotificationsChanged,
  formatNotificationTime,
  notificationHref,
  notificationLinkLabel,
  type AppNotification,
} from "@/lib/notification-ui";

export function NotificationsPage() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  async function load() {
    const res = await fetch("/api/notifications?limit=200");
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.notifications)) {
      setLoading(false);
      return;
    }
    setItems(data.notifications);
    setUnread(Number(data.unread) || 0);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    function onChanged() {
      void load();
    }
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    return () => {
      clearInterval(t);
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged);
    };
  }, []);

  async function markAll() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    emitNotificationsChanged();
    void load();
  }

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
    emitNotificationsChanged();
    void load();
  }

  const visible = useMemo(
    () => (filter === "unread" ? items.filter((n) => !n.read) : items),
    [filter, items],
  );

  return (
    <div className="w-full px-3 py-4 md:px-6 md:py-6">
      <PageHeader
        title="Уведомления"
        subtitle={
          unread > 0
            ? `Непрочитанных: ${unread}`
            : "Назначения, счета, задачи и новые мероприятия"
        }
      />

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex w-full items-center gap-2 border-b border-[var(--line)] px-4 py-3">
          <div className="flex shrink-0 rounded-lg border border-[var(--line)] p-0.5">
            <FilterTab
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label="Все"
              count={items.length}
            />
            <FilterTab
              active={filter === "unread"}
              onClick={() => setFilter("unread")}
              label="Непрочитанные"
              count={unread}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto shrink-0"
            disabled={unread === 0}
            onClick={() => void markAll()}
          >
            Прочитать все
          </Button>
        </div>

        {loading ? (
          <TableSkeleton rows={6} cols={4} />
        ) : visible.length === 0 ? (
          <EmptyState
            title={filter === "unread" ? "Нет непрочитанных" : "Пока пусто"}
            description={
              filter === "unread"
                ? "Все уведомления уже прочитаны"
                : "Когда появится новое мероприятие, назначение или задача — оно будет здесь"
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-[var(--line)] md:hidden">
              {visible.map((item) => (
                <NotificationMobileRow
                  key={item.id}
                  item={item}
                  onOpen={() => {
                    if (!item.read) void markRead(item.id);
                  }}
                />
              ))}
            </ul>
            <div className="data-table-shell hidden overflow-x-auto md:block">
              <table className="data-table w-full text-left text-sm">
                <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="w-px whitespace-nowrap px-4 py-3">Тип</th>
                    <th className="px-4 py-3">Уведомление</th>
                    <th className="w-px whitespace-nowrap px-4 py-3">Дата</th>
                    <th className="w-12 px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((item) => (
                    <NotificationTableRow
                      key={item.id}
                      item={item}
                      onOpen={() => {
                        if (!item.read) void markRead(item.id);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm md:px-3 ${
        active
          ? "bg-[var(--selected)] text-[var(--ink)]"
          : "text-[var(--muted)] hover:text-[var(--ink)]"
      }`}
    >
      {label}
      {count ? <span className="hidden md:inline"> · {count}</span> : null}
    </button>
  );
}

function NotificationMobileRow({
  item,
  onOpen,
}: {
  item: AppNotification;
  onOpen: () => void;
}) {
  const href = notificationHref(item);
  const time = formatNotificationTime(item.createdAt);
  const typeLabel = NOTIFICATION_TYPE_LABELS[item.type] ?? item.type;

  return (
    <li className={item.read ? "px-3 py-3" : "bg-[var(--selected)]/40 px-3 py-3"}>
      <p className={item.read ? "text-[var(--muted)]" : "font-medium text-[var(--ink)]"}>
        {item.title}
      </p>
      <p className="mt-0.5 text-xs text-[var(--muted)]">{item.body}</p>
      <p className="mt-1 text-caption text-[var(--muted)]">
        {typeLabel}
        {time ? ` · ${time}` : ""}
      </p>
      {href ? (
        <Link
          href={href}
          className="mt-1.5 inline-block text-sm text-[var(--accent-deep)] hover:underline"
          onClick={onOpen}
        >
          {notificationLinkLabel(item)}
        </Link>
      ) : null}
    </li>
  );
}

function NotificationTableRow({
  item,
  onOpen,
}: {
  item: AppNotification;
  onOpen: () => void;
}) {
  const href = notificationHref(item);
  const time = formatNotificationTime(item.createdAt);
  const typeLabel = NOTIFICATION_TYPE_LABELS[item.type] ?? item.type;

  return (
    <tr className={item.read ? undefined : "bg-[var(--selected)]/40"}>
      <td className="whitespace-nowrap px-4 py-3 text-[var(--muted)]">
        {typeLabel}
      </td>
      <td className="px-4 py-3">
        <p className={item.read ? "text-[var(--ink)]" : "font-medium text-[var(--ink)]"}>
          {item.title}
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">{item.body}</p>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-[var(--muted)]">
        {time ? <time dateTime={item.createdAt}>{time}</time> : "—"}
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        {href ? (
          <Link
            href={href}
            className="text-[var(--accent-deep)] hover:underline"
            onClick={onOpen}
          >
            Открыть
          </Link>
        ) : null}
      </td>
    </tr>
  );
}
