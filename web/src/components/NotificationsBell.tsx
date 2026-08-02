"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type NotificationType =
  | "INVOICE_DUE"
  | "SYSTEM"
  | "EVENT_CREATED"
  | "EVENT_ASSIGNED"
  | "CHAT_MESSAGE";

type N = {
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
};

function quoteHref(n: N) {
  if (!n.quote) return null;
  if (n.type === "EVENT_ASSIGNED" || n.type === "CHAT_MESSAGE") {
    return `/calendar?quote=${n.quote.id}`;
  }
  return `/quotes/${n.quote.id}`;
}

function quoteLinkLabel(n: N) {
  if (!n.quote) return "Открыть";
  if (n.type === "EVENT_ASSIGNED" || n.type === "CHAT_MESSAGE") {
    return n.quote.eventName?.trim()
      ? `Открыть «${n.quote.eventName.trim()}»`
      : "Открыть мероприятие";
  }
  return `Открыть КП №${n.quote.proposalNumber}`;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

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
    return () => clearInterval(t);
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

  async function markAll() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    void load();
  }

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, read: true }),
    });
    void load();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={
          unread > 0 ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"
        }
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-white/10 hover:text-[var(--ink)]"
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
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white shadow-sm">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
            <span className="text-sm font-medium text-[var(--ink)]">Уведомления</span>
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
            {items.map((n) => {
              const href = quoteHref(n);
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
                      {quoteLinkLabel(n)}
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
          <div className="border-t border-[var(--line)] px-3 py-2">
            <Link
              href="/unpaid"
              className="text-xs text-[var(--accent-deep)] hover:underline"
              onClick={() => setOpen(false)}
            >
              Неоплаченные проекты →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
