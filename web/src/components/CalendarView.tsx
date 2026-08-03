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
  formatRuDate,
  parseEventDate,
  startOfDay,
} from "@/lib/dates";

type Quote = {
  id: string;
  proposalNumber: string;
  eventName: string;
  client: string;
  date: string;
  eventDate: string | null;
  mountDate: string;
  mountDurationDays: number;
  demountDate: string;
  demountDurationDays: number;
  durationDays: number;
  lifecycle: LifecycleStatus;
  invoiceRequired: boolean;
  paid: boolean;
};

type CalendarEvent = {
  quote: Quote;
  start: Date;
  end: Date; // inclusive
};

type EventSeg = {
  quote: Quote;
  startCol: number;
  span: number;
  lane: number;
  continuesLeft: boolean;
  continuesRight: boolean;
};

type DayListState = {
  date: Date;
  events: CalendarEvent[];
};

/** Visible event rows per day (TimeTree-style). */
const MAX_VISIBLE_LANES = 5;
const LANE_HEIGHT = 20;
const LANE_GAP = 2;
const DAY_NUM_HEIGHT = 22;
const OVERFLOW_ROW = 18;
const WEEK_BODY_HEIGHT =
  MAX_VISIBLE_LANES * (LANE_HEIGHT + LANE_GAP) + OVERFLOW_ROW;

function eventLabel(q: Quote) {
  return `№${q.proposalNumber} ${q.eventName || q.client || "КП"}`;
}

function buildWeeks(year: number, month: number): Array<Array<Date | null>> {
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<Date | null> = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: Array<Array<Date | null>> = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function assignLanes(segs: Omit<EventSeg, "lane">[]): EventSeg[] {
  const sorted = [...segs].sort((a, b) => {
    if (a.startCol !== b.startCol) return a.startCol - b.startCol;
    return b.span - a.span;
  });
  const laneEnds: number[] = []; // exclusive end col per lane
  return sorted.map((seg) => {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane]! > seg.startCol) {
      lane += 1;
    }
    laneEnds[lane] = seg.startCol + seg.span;
    return { ...seg, lane };
  });
}

function segmentsForWeek(
  week: Array<Date | null>,
  events: CalendarEvent[],
): EventSeg[] {
  const weekDates = week.map((d) => (d ? startOfDay(d) : null));
  const firstReal = weekDates.find((d) => d !== null) ?? null;
  const lastReal =
    [...weekDates].reverse().find((d) => d !== null) ?? null;
  if (!firstReal || !lastReal) return [];

  const raw: Omit<EventSeg, "lane">[] = [];

  for (const ev of events) {
    if (ev.end < firstReal || ev.start > lastReal) continue;

    let startCol = -1;
    let endCol = -1;
    for (let c = 0; c < 7; c++) {
      const day = weekDates[c];
      if (!day) continue;
      if (day >= ev.start && day <= ev.end) {
        if (startCol < 0) startCol = c;
        endCol = c;
      }
    }
    if (startCol < 0 || endCol < 0) continue;

    raw.push({
      quote: ev.quote,
      startCol,
      span: endCol - startCol + 1,
      continuesLeft: ev.start < (weekDates[startCol] as Date),
      continuesRight: ev.end > (weekDates[endCol] as Date),
    });
  }

  return assignLanes(raw);
}

function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const d = startOfDay(day);
  return events
    .filter((ev) => d >= ev.start && d <= ev.end)
    .sort((a, b) => {
      const byStart = a.start.getTime() - b.start.getTime();
      if (byStart !== 0) return byStart;
      return a.quote.proposalNumber.localeCompare(b.quote.proposalNumber, "ru");
    });
}

export function CalendarView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(null);
  const [dayList, setDayList] = useState<DayListState | null>(null);

  const from = formatDateKey(
    addDays(new Date(cursor.getFullYear(), cursor.getMonth(), 1), -14),
  );
  const to = formatDateKey(
    addDays(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), 14),
  );

  useEffect(() => {
    const quoteFromUrl = searchParams.get("quote");
    if (quoteFromUrl) setOpenQuoteId(quoteFromUrl);
  }, [searchParams]);

  useEffect(() => {
    void fetch(`/api/quotes?calendar=1&from=${from}&to=${to}`).then(
      async (r) => {
        const data: unknown = await r.json().catch(() => []);
        setQuotes(Array.isArray(data) ? data : []);
      },
    );
    setDayList(null);
  }, [from, to]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const weeks = useMemo(() => buildWeeks(year, month), [year, month]);

  const events = useMemo<CalendarEvent[]>(() => {
    const list: CalendarEvent[] = [];
    for (const q of quotes) {
      const eventStart = q.eventDate
        ? startOfDay(new Date(q.eventDate))
        : parseEventDate(q.date);
      if (!eventStart) continue;

      const days = Math.max(1, q.durationDays || 1);
      const eventEnd = addDays(eventStart, days - 1);
      const mount = parseEventDate(q.mountDate);
      const demount = parseEventDate(q.demountDate);
      const mountDays = Math.max(1, q.mountDurationDays || 1);
      const demountDays = Math.max(1, q.demountDurationDays || 1);

      const bounds = [eventStart, eventEnd];
      if (mount) {
        const m0 = startOfDay(mount);
        bounds.push(m0, addDays(m0, mountDays - 1));
      }
      if (demount) {
        const d0 = startOfDay(demount);
        bounds.push(d0, addDays(d0, demountDays - 1));
      }

      const start = bounds.reduce((a, b) => (a <= b ? a : b));
      const end = bounds.reduce((a, b) => (a >= b ? a : b));
      list.push({ quote: q, start, end });
    }
    return list;
  }, [quotes]);

  const weekLayouts = useMemo(() => {
    return weeks.map((week) => {
      const segs = segmentsForWeek(week, events);
      return { week, segs };
    });
  }, [weeks, events]);

  const monthLabel = cursor.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });

  const todayKey = formatDateKey(new Date());

  function openDayList(day: Date) {
    setDayList({
      date: startOfDay(day),
      events: eventsOnDay(events, day),
    });
  }

  function openQuote(id: string) {
    setDayList(null);
    setOpenQuoteId(id);
  }

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
          <span
            key={k}
            className="inline-flex items-center gap-1.5 text-[var(--muted)]"
          >
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ background: lifecycleColor(k) }}
            />
            {LIFECYCLE_LABELS[k]}
          </span>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-[var(--line)] bg-[var(--table-head)]">
          {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
            <div
              key={d}
              className="px-2 py-2 text-center text-[11px] uppercase tracking-wider text-[var(--muted)]"
            >
              {d}
            </div>
          ))}
        </div>

        {weekLayouts.map(({ week, segs }, weekIdx) => {
          const visibleSegs = segs.filter((s) => s.lane < MAX_VISIBLE_LANES);

          return (
            <div
              key={weekIdx}
              className="relative grid grid-cols-7 border-b border-[var(--line)] last:border-b-0"
              style={{ height: DAY_NUM_HEIGHT + WEEK_BODY_HEIGHT + 8 }}
            >
              {week.map((day, col) => {
                if (!day) {
                  return (
                    <div
                      key={`e-${weekIdx}-${col}`}
                      className="border-r border-[var(--line)] bg-[var(--panel-muted)] last:border-r-0"
                    />
                  );
                }
                const key = formatDateKey(day);
                const isToday = key === todayKey;
                const hiddenOnDay = segs.filter(
                  (s) =>
                    s.lane >= MAX_VISIBLE_LANES &&
                    col >= s.startCol &&
                    col < s.startCol + s.span,
                ).length;

                return (
                  <div
                    key={key}
                    className={`relative border-r border-[var(--line)] bg-[var(--panel)] last:border-r-0 ${
                      isToday ? "bg-[var(--accent-soft)]/40" : ""
                    }`}
                  >
                    <div
                      className={`px-1.5 pt-1 text-xs font-medium ${
                        isToday
                          ? "text-[var(--accent-deep)]"
                          : "text-[var(--muted)]"
                      }`}
                      style={{ height: DAY_NUM_HEIGHT }}
                    >
                      {day.getDate()}
                    </div>
                    {hiddenOnDay > 0 && (
                      <button
                        type="button"
                        className="absolute bottom-1 left-1/2 z-[2] -translate-x-1/2 rounded-full bg-[var(--ink)]/85 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white shadow-sm hover:bg-[var(--ink)]"
                        style={{ height: OVERFLOW_ROW - 2 }}
                        title={`Ещё ${hiddenOnDay} — открыть список дня`}
                        onClick={() => openDayList(day)}
                      >
                        +{hiddenOnDay}
                      </button>
                    )}
                  </div>
                );
              })}

              <div
                className="pointer-events-none absolute inset-x-0"
                style={{
                  top: DAY_NUM_HEIGHT + 2,
                  height: MAX_VISIBLE_LANES * (LANE_HEIGHT + LANE_GAP),
                }}
              >
                {visibleSegs.map((seg) => {
                  const left = `calc(${(seg.startCol / 7) * 100}% + 3px)`;
                  const width = `calc(${(seg.span / 7) * 100}% - 6px)`;
                  const top = seg.lane * (LANE_HEIGHT + LANE_GAP);
                  const radiusLeft = seg.continuesLeft ? "2px" : "6px";
                  const radiusRight = seg.continuesRight ? "2px" : "6px";
                  return (
                    <button
                      key={`${seg.quote.id}-${weekIdx}-${seg.startCol}`}
                      type="button"
                      className="pointer-events-auto absolute truncate px-1.5 text-left text-[10px] font-medium text-white shadow-sm transition-opacity hover:opacity-90"
                      style={{
                        left,
                        width,
                        top,
                        height: LANE_HEIGHT,
                        lineHeight: `${LANE_HEIGHT}px`,
                        background: lifecycleColor(seg.quote.lifecycle),
                        borderRadius: `${radiusLeft} ${radiusRight} ${radiusRight} ${radiusLeft}`,
                      }}
                      title={`${LIFECYCLE_LABELS[seg.quote.lifecycle]} · ${eventLabel(seg.quote)}`}
                      onClick={() => openQuote(seg.quote.id)}
                    >
                      {seg.continuesLeft ? "‹ " : ""}
                      {eventLabel(seg.quote)}
                      {seg.continuesRight ? " ›" : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Card>

      {dayList && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center"
          onClick={() => setDayList(null)}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Мероприятия за день"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                  Мероприятия
                </p>
                <h2 className="font-display text-xl text-[var(--ink)]">
                  {formatRuDate(dayList.date)}
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  {dayList.events.length}{" "}
                  {dayList.events.length === 1
                    ? "мероприятие"
                    : dayList.events.length < 5
                      ? "мероприятия"
                      : "мероприятий"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDayList(null)}
                className="shrink-0 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
              >
                Закрыть
              </button>
            </div>
            <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
              {dayList.events.map((ev) => (
                <li key={ev.quote.id}>
                  <button
                    type="button"
                    onClick={() => openQuote(ev.quote.id)}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--line)] px-3 py-2.5 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg)]"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{
                        background: lifecycleColor(ev.quote.lifecycle),
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--ink)]">
                        {eventLabel(ev.quote)}
                      </span>
                      <span className="text-[11px] text-[var(--muted)]">
                        {LIFECYCLE_LABELS[ev.quote.lifecycle]}
                        {ev.start.getTime() !== ev.end.getTime()
                          ? ` · ${formatRuDate(ev.start)} — ${formatRuDate(ev.end)}`
                          : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
