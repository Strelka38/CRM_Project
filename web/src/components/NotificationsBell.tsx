"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  NOTIFICATIONS_CHANGED,
  emitNotificationsChanged,
  notificationHref,
  notificationLinkLabel,
  type AppNotification,
} from "@/lib/notification-ui";

const PREVIEW_LIMIT = 8;

/**
 * Только число непрочитанных, без списка и поповера: нижнему меню на телефоне
 * нужен лишь бейдж на иконке, а колокольчика в шапке там больше нет.
 */
export function useUnreadNotifications() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      const res = await fetch("/api/notifications");
      if (!res.ok || !alive) return;
      const data = await res.json().catch(() => null);
      if (!data || !alive) return;
      setUnread(Number(data.unread) || 0);
    }
    void load();
    const timer = setInterval(() => void load(), 30_000);
    function onChanged() {
      void load();
    }
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged);
    };
  }, []);

  return unread;
}

export function NotificationsBell({
  placement = "header",
}: {
  placement?: "header" | "sidebar";
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const onPage = pathname === "/notifications";

  async function load() {
    const res = await fetch("/api/notifications");
    if (!res.ok) return;
    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.notifications)) return;
    setItems(data.notifications);
    setUnread(Number(data.unread) || 0);
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

  useEffect(() => {
    if (!open) return;
    void load();
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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

  const preview = items.slice(0, PREVIEW_LIMIT);
  const rest = Math.max(0, items.length - preview.length);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={
          unread > 0 ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"
        }
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-[var(--header-hover)] hover:text-[var(--header-ink)] ${
          onPage || open
            ? "bg-[var(--header-hover)] text-[var(--header-ink)]"
            : "text-[var(--header-muted)]"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden
        >
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-caption font-bold leading-none text-white shadow-sm">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          className={
            placement === "sidebar"
              ? "absolute bottom-full left-0 z-50 mb-2 w-[min(20rem,calc(100vw-4rem))] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-xl"
              : "absolute right-0 z-50 mt-2 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-xl"
          }
        >
          <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
            <Link
              href="/notifications"
              className="text-sm font-medium text-[var(--ink)] hover:text-[var(--accent-deep)]"
              onClick={() => setOpen(false)}
            >
              Уведомления
            </Link>
            <button
              type="button"
              className="text-xs text-[var(--muted)] hover:text-[var(--accent)]"
              onClick={markAll}
            >
              Прочитать все
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && (
              <p className="p-3 text-sm text-[var(--muted)]">Пока пусто</p>
            )}
            {preview.map((n) => {
              const href = notificationHref(n);
              return (
                <div
                  key={n.id}
                  className={`border-b border-[var(--line)] px-3 py-2 text-sm text-[var(--ink)] ${n.read ? "opacity-60" : ""}`}
                >
                  <p className="font-medium">{n.title}</p>
                  <p className="text-xs text-[var(--muted)]">{n.body}</p>
                  {href && (
                    <Link
                      href={href}
                      className="mt-1 inline-block text-xs text-[var(--accent-deep)] hover:underline"
                      onClick={() => {
                        if (!n.read) void markRead(n.id);
                        setOpen(false);
                      }}
                    >
                      {notificationLinkLabel(n)}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
          <div className="border-t border-[var(--line)] px-3 py-2">
            <Link
              href="/notifications"
              className="text-xs text-[var(--accent-deep)] hover:underline"
              onClick={() => setOpen(false)}
            >
              {rest > 0 ? `Все уведомления (${items.length}) →` : "Все уведомления →"}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
