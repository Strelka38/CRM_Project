"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProjectModal } from "@/components/ProjectModal";
import {
  Button,
  Card,
  LIFECYCLE_LABELS,
  PageHeader,
  lifecycleColor,
  type LifecycleStatus,
} from "@/components/ui";
import {
  addDays,
  formatDateKey,
  startOfDay,
} from "@/lib/dates";

type Quote = {
  id: string;
  proposalNumber: string;
  eventName: string;
  client: string;
  date: string;
  eventDate: string | null;
  durationDays: number;
  lifecycle: LifecycleStatus;
  invoiceRequired: boolean;
  paid: boolean;
};

export function CalendarView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(null);
  const [expandedDay, setExpandedDay] = useState<string | null>(null);

  const from = formatDateKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const to = formatDateKey(
    new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59),
  );

  useEffect(() => {
    const quoteFromUrl = searchParams.get("quote");
    if (quoteFromUrl) setOpenQuoteId(quoteFromUrl);
  }, [searchParams]);

  useEffect(() => {
    void fetch(`/api/quotes?calendar=1&from=${from}&to=${to}`)
      .then(async (r) => {
        const data: unknown = await r.json().catch(() => []);
        setQuotes(Array.isArray(data) ? data : []);
      });
  }, [from, to]);

  const byDay = useMemo(() => {
    const map = new Map<string, Quote[]>();
    for (const q of quotes) {
      if (!q.eventDate) continue;
      const start = startOfDay(new Date(q.eventDate));
      for (let i = 0; i < Math.max(1, q.durationDays); i++) {
        const key = formatDateKey(addDays(start, i));
        const list = map.get(key) || [];
        list.push(q);
        map.set(key, list);
      }
    }
    return map;
  }, [quotes]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const monthLabel = cursor.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });

  const todayKey = formatDateKey(new Date());

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      <PageHeader
        title="Календарь"
        subtitle="Мероприятия по датам — откройте карточку проекта"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursor(new Date(year, month - 1, 1))}
            >
              ←
            </Button>
            <span className="min-w-[10rem] text-center capitalize text-sm">
              {monthLabel}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursor(new Date(year, month + 1, 1))}
            >
              →
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3 text-xs">
        {(Object.keys(LIFECYCLE_LABELS) as LifecycleStatus[]).map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-[var(--muted)]">
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ background: lifecycleColor(k) }}
            />
            {LIFECYCLE_LABELS[k]}
          </span>
        ))}
      </div>

      <Card className="grid grid-cols-7 gap-px bg-[var(--line)]">
        {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
          <div
            key={d}
            className="bg-[var(--table-head)] px-2 py-2 text-center text-[11px] uppercase tracking-wider text-[var(--muted)]"
          >
            {d}
          </div>
        ))}
        {cells.map((day, idx) => {
          if (!day) {
            return <div key={`e-${idx}`} className="min-h-24 bg-[var(--panel-muted)]" />;
          }
          const key = formatDateKey(day);
          const list = byDay.get(key) || [];
          const expanded = expandedDay === key;
          const visible = expanded ? list : list.slice(0, 3);
          const isToday = key === todayKey;
          return (
            <div
              key={key}
              className={`min-h-24 bg-[var(--panel)] p-1.5 transition-shadow ${
                expanded ? "relative z-10 shadow-md ring-1 ring-[var(--accent-glow)]" : ""
              } ${isToday ? "ring-1 ring-inset ring-[var(--accent)]" : ""}`}
            >
              <div
                className={`text-xs font-medium ${
                  isToday ? "text-[var(--accent-deep)]" : "text-[var(--muted)]"
                }`}
              >
                {day.getDate()}
              </div>
              <div className="mt-1 space-y-1">
                {visible.map((q) => (
                  <button
                    key={`${q.id}-${key}`}
                    type="button"
                    onClick={() => setOpenQuoteId(q.id)}
                    className="block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[10px] text-white transition-opacity hover:opacity-90"
                    style={{ background: lifecycleColor(q.lifecycle) }}
                    title={`${LIFECYCLE_LABELS[q.lifecycle]} · №${q.proposalNumber} ${q.eventName}`}
                  >
                    №{q.proposalNumber} {q.eventName || q.client || "КП"}
                  </button>
                ))}
                {list.length > 3 && (
                  <button
                    type="button"
                    className="text-[10px] text-[var(--accent-deep)] hover:underline"
                    onClick={() =>
                      setExpandedDay(expanded ? null : key)
                    }
                  >
                    {expanded ? "свернуть" : `+${list.length - 3}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </Card>

      {openQuoteId && (
        <ProjectModal
          quoteId={openQuoteId}
          onClose={() => {
            setOpenQuoteId(null);
            if (searchParams.get("quote")) {
              router.replace("/calendar", { scroll: false });
            }
          }}
        />
      )}
    </div>
  );
}
