"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { formatLocalTime, greetingFor, timezoneOffsetLabel } from "@/lib/timezone";
import { parseEventDate, formatRuDate } from "@/lib/dates";
import { cn } from "@/lib/cn";

type DashQuote = {
  id: string;
  title: string;
  date: string;
  client?: string;
  staffVacant?: string;
  staffVacantCount?: number;
  place?: string;
  time?: string;
};

type DashRental = {
  id: string;
  title: string;
  date: string;
};

type DashTask = {
  id: string;
  title: string;
  date: string;
  completed: boolean;
  canComplete: boolean;
  assignees: string;
};

type DashWeather = {
  placeLabel: string;
  tempC: number;
  description: string;
} | null;

type DashboardData = {
  greeting: string;
  greetingName: string;
  timezone: string;
  weather: DashWeather;
  showUnpaid: boolean;
  showVacant: boolean;
  showRentals: boolean;
  showTasks: boolean;
  showMyEvents: boolean;
  unpaid: DashQuote[];
  vacantStaff: DashQuote[];
  rentals: DashRental[];
  tasks: DashTask[];
  myEvents: DashQuote[];
};

function dateLabel(raw: string) {
  if (!raw) return "без даты";
  const d = parseEventDate(raw);
  return d ? formatRuDate(d) : raw;
}

export function CalendarDashboard({
  onOpenQuote,
  onOpenEntry,
  onTasksChanged,
  onAlertsChange,
}: {
  onOpenQuote: (id: string) => void;
  onOpenEntry: (id: string) => void;
  onTasksChanged?: () => void;
  onAlertsChange?: (hasAlerts: boolean) => void;
}) {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/calendar/dashboard");
    if (!res.ok) return;
    const json = (await res.json().catch(() => null)) as DashboardData | null;
    if (!json || !Array.isArray(json.tasks)) return;
    setData(json);
  }

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 30_000);
    const tick = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, []);

  async function toggleTask(task: DashTask) {
    if (!task.canComplete || busyId) return;
    setBusyId(task.id);
    const res = await fetch(`/api/calendar/entries/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: !task.completed }),
    });
    setBusyId(null);
    if (!res.ok) return;
    void load();
    onTasksChanged?.();
  }

  useEffect(() => {
    if (!data) {
      onAlertsChange?.(false);
      return;
    }
    const alertCount =
      data.unpaid.length +
      data.vacantStaff.length +
      data.tasks.filter((t) => !t.completed).length;
    onAlertsChange?.(alertCount > 0);
  }, [data, onAlertsChange]);

  if (!data) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-5 text-sm text-[var(--muted)]">
        Загрузка…
      </div>
    );
  }

  const hello = greetingFor(now, data.timezone, data.greetingName);
  const clock = formatLocalTime(now, data.timezone);
  const offset = timezoneOffsetLabel(data.timezone);
  const w = data.weather;
  const temp =
    w && typeof w.tempC === "number"
      ? `${w.tempC > 0 ? "+" : ""}${w.tempC}°`
      : null;
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3.5">
      <header className="px-1 pt-0.5 pr-12">
        <div className="min-w-0">
          <p className="font-display text-xl leading-tight text-[var(--ink)]">
            {hello}
          </p>
          <p className="mt-1 text-[13px] tabular-nums text-[var(--muted)]">
            {clock}
            <span className="ml-1.5 text-[11px]">{offset}</span>
          </p>
          {temp && w ? (
            <p className="mt-0.5 text-[13px] text-[var(--ink)]">
              {temp} · {w.description} · {w.placeLabel}
            </p>
          ) : (
            <p className="mt-0.5 text-[12px] text-[var(--muted)]">
              Погода недоступна
            </p>
          )}
        </div>
      </header>

      {data.showUnpaid ? (
        <Section title="Неоплаченные счета" count={data.unpaid.length}>
          {data.unpaid.length === 0 ? (
            <Empty>Все счета закрыты</Empty>
          ) : (
            <ul className="space-y-1">
              {data.unpaid.map((q) => (
                <li key={q.id}>
                  <Row
                    title={q.title}
                    meta={[dateLabel(q.date), q.client].filter(Boolean).join(" · ")}
                    onClick={() => router.push(`/quotes/${q.id}?tab=main`)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      {data.showVacant ? (
        <Section title="Не назначены" count={data.vacantStaff.length}>
          {data.vacantStaff.length === 0 ? (
            <Empty>Слоты заполнены</Empty>
          ) : (
            <ul className="space-y-1">
              {data.vacantStaff.map((q) => (
                <li key={q.id}>
                  <Row
                    title={q.title}
                    meta={[dateLabel(q.date), q.staffVacant]
                      .filter(Boolean)
                      .join(" · ")}
                    onClick={() => onOpenQuote(q.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      {data.showTasks ? (
        <Section
          title="Задачи"
          count={data.tasks.filter((t) => !t.completed).length}
        >
          {data.tasks.length === 0 ? (
            <Empty>Нет открытых задач</Empty>
          ) : (
            <ul className="space-y-0.5">
              {data.tasks.map((t) => (
                <li key={t.id}>
                  <div
                    className={cn(
                      "flex items-start gap-2.5 rounded-xl px-2 py-2 hover:bg-[var(--bg)]",
                      t.completed && "opacity-55",
                    )}
                  >
                    {t.canComplete ? (
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-[var(--accent)]"
                        checked={t.completed}
                        disabled={busyId === t.id}
                        onChange={() => void toggleTask(t)}
                        aria-label={t.completed ? "Снять выполнение" : "Отметить выполненной"}
                      />
                    ) : null}
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => onOpenEntry(t.id)}
                    >
                      <span className="block truncate text-[13px] font-medium text-[var(--ink)]">
                        {t.title || "Задача"}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">
                        {[dateLabel(t.date), t.assignees].filter(Boolean).join(" · ")}
                      </span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      {data.showRentals ? (
        <Section title="Аренды" count={data.rentals.length}>
          {data.rentals.length === 0 ? (
            <Empty>Ближайших аренд нет</Empty>
          ) : (
            <ul className="space-y-1">
              {data.rentals.map((e) => (
                <li key={e.id}>
                  <Row
                    title={e.title || "Аренда"}
                    meta={dateLabel(e.date)}
                    onClick={() => onOpenEntry(e.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      {data.showMyEvents ? (
        <Section title="Мои мероприятия" count={data.myEvents.length}>
          {data.myEvents.length === 0 ? (
            <Empty>Нет назначений</Empty>
          ) : (
            <ul className="space-y-1">
              {data.myEvents.map((q) => (
                <li key={q.id}>
                  <Row
                    title={q.title}
                    meta={[dateLabel(q.date), q.time, q.place]
                      .filter(Boolean)
                      .join(" · ")}
                    onClick={() => onOpenQuote(q.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}
    </div>
  );
}

export function CalendarDashToggle({
  collapsed,
  hasAlerts,
  onClick,
}: {
  collapsed: boolean;
  hasAlerts: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={collapsed ? "Открыть сводку" : "Свернуть сводку"}
      title={collapsed ? "Открыть сводку" : "Свернуть сводку"}
      onClick={onClick}
      className={cn(
        "relative flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-[var(--ink)] shadow-md",
      )}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4"
        aria-hidden
      >
        {collapsed ? (
          <path d="M15 6 9 12l6 6" />
        ) : (
          <path d="M9 6l6 6-6 6" />
        )}
      </svg>
      {hasAlerts ? (
        <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-red-600 ring-2 ring-[var(--panel)]" />
      ) : null}
    </button>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted)]">
          {title}
          {count ? (
            <span className="ml-1.5 tabular-nums text-[var(--ink)]">{count}</span>
          ) : null}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-1 py-2 text-[13px] text-[var(--muted)]">{children}</p>;
}

function Row({
  title,
  meta,
  onClick,
}: {
  title: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg)]"
    >
      <span className="block truncate text-[13px] font-medium text-[var(--ink)]">
        {title}
      </span>
      {meta ? (
        <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">
          {meta}
        </span>
      ) : null}
    </button>
  );
}
