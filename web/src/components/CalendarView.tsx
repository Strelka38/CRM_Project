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

const MAX_VISIBLE_LANES = 3;
const LANE_HEIGHT = 22;
const LANE_GAP = 3;
const DAY_NUM_HEIGHT = 22;

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

    // Find first/last columns within this week that the event covers
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

export function CalendarView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(null);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<number>>(
    () => new Set(),
  );

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
    setExpandedWeeks(new Set());
  }, [from, to]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const weeks = useMemo(() => buildWeeks(year, month), [year, month]);

  const events = useMemo<CalendarEvent[]>(() => {
    const list: CalendarEvent[] = [];
    for (const q of quotes) {
      if (!q.eventDate) continue;
      const start = startOfDay(new Date(q.eventDate));
      const days = Math.max(1, q.durationDays);
      const end = addDays(start, days - 1);
      list.push({ quote: q, start, end });
    }
    return list;
  }, [quotes]);

  const weekLayouts = useMemo(() => {
    return weeks.map((week) => {
      const segs = segmentsForWeek(week, events);
      const maxLane = segs.reduce((m, s) => Math.max(m, s.lane), -1);
      return { week, segs, maxLane };
    });
  }, [weeks, events]);

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

        {weekLayouts.map(({ week, segs, maxLane }, weekIdx) => {
          const expanded = expandedWeeks.has(weekIdx);
          const visibleSegs = expanded
            ? segs
            : segs.filter((s) => s.lane < MAX_VISIBLE_LANES);
          const hiddenCount = expanded
            ? 0
            : segs.filter((s) => s.lane >= MAX_VISIBLE_LANES).length;
          const visibleMaxLane = visibleSegs.reduce(
            (m, s) => Math.max(m, s.lane),
            -1,
          );
          const lanesUsed = visibleMaxLane + 1;
          const eventsHeight =
            Math.max(1, lanesUsed) * (LANE_HEIGHT + LANE_GAP) +
            (hiddenCount > 0 ? LANE_HEIGHT : 0) +
            6;

          return (
            <div
              key={weekIdx}
              className="relative grid grid-cols-7 border-b border-[var(--line)] last:border-b-0"
              style={{ minHeight: DAY_NUM_HEIGHT + eventsHeight + 8 }}
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
                return (
                  <div
                    key={key}
                    className={`border-r border-[var(--line)] bg-[var(--panel)] last:border-r-0 ${
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
                  </div>
                );
              })}

              <div
                className="pointer-events-none absolute inset-x-0"
                style={{ top: DAY_NUM_HEIGHT + 2, bottom: 4 }}
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
                      title={`${LIFECYCLE_LABELS[seg.quote.lifecycle]} · ${eventLabel(seg.quote)}${
                        Math.max(1, seg.quote.durationDays) > 1
                          ? ` · ${Math.max(1, seg.quote.durationDays)} дн.`
                          : ""
                      }`}
                      onClick={() => setOpenQuoteId(seg.quote.id)}
                    >
                      {seg.continuesLeft ? "‹ " : ""}
                      {eventLabel(seg.quote)}
                      {seg.continuesRight ? " ›" : ""}
                    </button>
                  );
                })}

                {hiddenCount > 0 && (
                  <button
                    type="button"
                    className="pointer-events-auto absolute text-[10px] text-[var(--accent-deep)] hover:underline"
                    style={{
                      left: 6,
                      top: MAX_VISIBLE_LANES * (LANE_HEIGHT + LANE_GAP),
                    }}
                    onClick={() =>
                      setExpandedWeeks((prev) => {
                        const next = new Set(prev);
                        next.add(weekIdx);
                        return next;
                      })
                    }
                  >
                    +{hiddenCount} ещё
                  </button>
                )}
                {expanded && maxLane >= MAX_VISIBLE_LANES && (
                  <button
                    type="button"
                    className="pointer-events-auto absolute text-[10px] text-[var(--muted)] hover:underline"
                    style={{
                      left: 6,
                      top: (maxLane + 1) * (LANE_HEIGHT + LANE_GAP),
                    }}
                    onClick={() =>
                      setExpandedWeeks((prev) => {
                        const next = new Set(prev);
                        next.delete(weekIdx);
                        return next;
                      })
                    }
                  >
                    свернуть
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
