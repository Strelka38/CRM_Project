"use client";

import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarCreateMenu,
  type CalendarCreateAction,
} from "@/components/CalendarCreateMenu";
import {
  CalendarEntryFormModal,
  type CalendarEntryKind,
} from "@/components/CalendarEntryFormModal";
import { CalendarEntryModal } from "@/components/CalendarEntryModal";
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
  ENTRY_KIND_COLORS,
  ENTRY_KIND_LABELS,
} from "@/lib/calendar-entries";
import {
  addDays,
  formatDateKey,
  formatRuDate,
  parseEventDate,
  startOfDay,
} from "@/lib/dates";
import { canOpenCalendarCreateMenu } from "@/lib/roles";

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

type CalendarEntryRow = {
  id: string;
  kind: CalendarEntryKind;
  date: string;
  title: string;
  note: string;
  startTime: string | null;
  endTime: string | null;
  responsibleUser: { id: string; name: string } | null;
  assignees: Array<{
    userId: string;
    user: { id: string; name: string; firstName: string; lastName: string };
  }>;
};

type CalItem =
  | {
      type: "quote";
      id: string;
      start: Date;
      end: Date;
      quote: Quote;
      label: string;
      color: string;
      subtitle: string;
    }
  | {
      type: "entry";
      id: string;
      start: Date;
      end: Date;
      entry: CalendarEntryRow;
      label: string;
      color: string;
      subtitle: string;
    };

type EventSeg = {
  item: CalItem;
  startCol: number;
  span: number;
  lane: number;
  continuesLeft: boolean;
  continuesRight: boolean;
};

type DayListState = {
  date: Date;
  items: CalItem[];
};

type CreateMenuState = {
  date: Date;
  x: number;
  y: number;
};

type FormState = {
  kind: CalendarEntryKind;
  dateKey: string;
  entryId?: string | null;
};

type CalendarDensity = {
  maxLanes: number;
  laneHeight: number;
  laneGap: number;
  dayNumHeight: number;
  overflowRow: number;
};

const DENSITY_COMPACT: CalendarDensity = {
  maxLanes: 3,
  laneHeight: 16,
  laneGap: 2,
  dayNumHeight: 18,
  overflowRow: 16,
};

const DENSITY_COMFORT: CalendarDensity = {
  maxLanes: 4,
  laneHeight: 18,
  laneGap: 2,
  dayNumHeight: 20,
  overflowRow: 16,
};

const DENSITY_ROOMY: CalendarDensity = {
  maxLanes: 5,
  laneHeight: 20,
  laneGap: 2,
  dayNumHeight: 22,
  overflowRow: 18,
};

function weekBodyHeight(d: CalendarDensity) {
  return d.maxLanes * (d.laneHeight + d.laneGap) + d.overflowRow;
}

function quoteLabel(q: Quote) {
  return `№${q.proposalNumber} ${q.eventName || q.client || "КП"}`;
}

function personName(u: {
  name: string;
  firstName?: string;
  lastName?: string;
}) {
  const fio = [u.lastName, u.firstName].filter(Boolean).join(" ").trim();
  return fio || u.name;
}

function entryLabel(e: CalendarEntryRow) {
  if (e.kind === "DAY_OFF") {
    const u = e.assignees[0]?.user;
    const name = u ? personName(u) : "Выходной";
    const time =
      e.startTime && e.endTime ? ` ${e.startTime}–${e.endTime}` : "";
    return `${name}${time}`;
  }
  if (e.kind === "TASK") return e.title || "Задача";
  const name = e.title?.trim();
  return name ? `Аренда · ${name}` : "Аренда";
}

/** Full weeks including leading/trailing days of adjacent months. */
function buildWeeks(year: number, month: number): Date[][] {
  const first = startOfDay(new Date(year, month, 1));
  const firstDow = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -firstDow);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const trailing = (7 - ((firstDow + daysInMonth) % 7)) % 7;
  const total = firstDow + daysInMonth + trailing;

  const cells: Date[] = [];
  for (let i = 0; i < total; i++) {
    cells.push(addDays(gridStart, i));
  }

  const weeks: Date[][] = [];
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
  const laneEnds: number[] = [];
  return sorted.map((seg) => {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane]! > seg.startCol) {
      lane += 1;
    }
    laneEnds[lane] = seg.startCol + seg.span;
    return { ...seg, lane };
  });
}

function segmentsForWeek(week: Date[], items: CalItem[]): EventSeg[] {
  const weekDates = week.map((d) => startOfDay(d));
  const first = weekDates[0]!;
  const last = weekDates[6]!;

  const raw: Omit<EventSeg, "lane">[] = [];

  for (const item of items) {
    if (item.end < first || item.start > last) continue;

    let startCol = -1;
    let endCol = -1;
    for (let c = 0; c < 7; c++) {
      const day = weekDates[c]!;
      if (day >= item.start && day <= item.end) {
        if (startCol < 0) startCol = c;
        endCol = c;
      }
    }
    if (startCol < 0 || endCol < 0) continue;

    raw.push({
      item,
      startCol,
      span: endCol - startCol + 1,
      continuesLeft: item.start < weekDates[startCol]!,
      continuesRight: item.end > weekDates[endCol]!,
    });
  }

  return assignLanes(raw);
}

function itemsOnDay(items: CalItem[], day: Date): CalItem[] {
  const d = startOfDay(day);
  return items
    .filter((ev) => d >= ev.start && d <= ev.end)
    .sort((a, b) => {
      const byStart = a.start.getTime() - b.start.getTime();
      if (byStart !== 0) return byStart;
      return a.label.localeCompare(b.label, "ru");
    });
}

export function CalendarView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canCreate = canOpenCalendarCreateMenu(role);

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [entries, setEntries] = useState<CalendarEntryRow[]>([]);
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(null);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [dayList, setDayList] = useState<DayListState | null>(null);
  const [createMenu, setCreateMenu] = useState<CreateMenuState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [hideDayOffs, setHideDayOffs] = useState(false);
  const [density, setDensity] = useState<CalendarDensity>(DENSITY_COMFORT);

  useEffect(() => {
    try {
      setHideDayOffs(
        localStorage.getItem("calendar.hideDayOffs") === "1",
      );
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    function apply() {
      const w = window.innerWidth;
      if (w < 640) setDensity(DENSITY_COMPACT);
      else if (w < 1100) setDensity(DENSITY_COMFORT);
      else setDensity(DENSITY_ROOMY);
    }
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  function toggleHideDayOffs() {
    setHideDayOffs((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("calendar.hideDayOffs", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  const from = formatDateKey(
    addDays(new Date(cursor.getFullYear(), cursor.getMonth(), 1), -14),
  );
  const to = formatDateKey(
    addDays(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0), 14),
  );

  function reload() {
    void fetch(`/api/quotes?calendar=1&from=${from}&to=${to}`).then(
      async (r) => {
        const data: unknown = await r.json().catch(() => []);
        setQuotes(Array.isArray(data) ? data : []);
      },
    );
    void fetch(`/api/calendar/entries?from=${from}&to=${to}`).then(
      async (r) => {
        const data: unknown = await r.json().catch(() => []);
        setEntries(Array.isArray(data) ? data : []);
      },
    );
  }

  useEffect(() => {
    const quoteFromUrl = searchParams.get("quote");
    if (quoteFromUrl) setOpenQuoteId(quoteFromUrl);
  }, [searchParams]);

  useEffect(() => {
    reload();
    setDayList(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when month window changes
  }, [from, to]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const weeks = useMemo(() => buildWeeks(year, month), [year, month]);

  const items = useMemo<CalItem[]>(() => {
    const list: CalItem[] = [];
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
      list.push({
        type: "quote",
        id: q.id,
        quote: q,
        start,
        end,
        label: quoteLabel(q),
        color: lifecycleColor(q.lifecycle),
        subtitle: LIFECYCLE_LABELS[q.lifecycle],
      });
    }
    for (const e of entries) {
      if (hideDayOffs && e.kind === "DAY_OFF") continue;
      const start = parseEventDate(e.date);
      if (!start) continue;
      const day = startOfDay(start);
      list.push({
        type: "entry",
        id: e.id,
        entry: e,
        start: day,
        end: day,
        label: entryLabel(e),
        color: ENTRY_KIND_COLORS[e.kind],
        subtitle: ENTRY_KIND_LABELS[e.kind],
      });
    }
    return list;
  }, [quotes, entries, hideDayOffs]);

  const weekLayouts = useMemo(() => {
    return weeks.map((week) => {
      const segs = segmentsForWeek(week, items);
      return { week, segs };
    });
  }, [weeks, items]);

  const monthLabel = cursor.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });

  const todayKey = formatDateKey(new Date());

  function openDayList(day: Date) {
    setDayList({
      date: startOfDay(day),
      items: itemsOnDay(items, day),
    });
  }

  function openItem(item: CalItem) {
    setDayList(null);
    setCreateMenu(null);
    if (item.type === "quote") setOpenQuoteId(item.id);
    else setOpenEntryId(item.id);
  }

  function onDayClick(day: Date, e: MouseEvent) {
    if (!canCreate) return;
    // Ignore clicks on event bars / overflow (they stopPropagation)
    setCreateMenu({
      date: startOfDay(day),
      x: e.clientX,
      y: e.clientY,
    });
  }

  async function createProject(date: Date) {
    setCreatingProject(true);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: formatDateKey(date) }),
      });
      const data = (await res.json().catch(() => null)) as {
        id?: string;
        error?: string;
      } | null;
      if (!res.ok || !data?.id) {
        alert(
          typeof data?.error === "string"
            ? data.error
            : "Не удалось создать проект",
        );
        return;
      }
      router.push(`/quotes/${data.id}`);
    } finally {
      setCreatingProject(false);
    }
  }

  function onCreateAction(action: CalendarCreateAction) {
    if (!createMenu) return;
    const dateKey = formatDateKey(createMenu.date);
    if (action === "project") {
      void createProject(createMenu.date);
      return;
    }
    const kindMap: Record<
      Exclude<CalendarCreateAction, "project">,
      CalendarEntryKind
    > = {
      rental: "RENTAL",
      task: "TASK",
      day_off: "DAY_OFF",
    };
    setForm({ kind: kindMap[action], dateKey, entryId: null });
  }

  const {
    maxLanes,
    laneHeight,
    laneGap,
    dayNumHeight,
    overflowRow,
  } = density;
  const bodyH = weekBodyHeight(density);
  const barFont = density === DENSITY_COMPACT ? 9 : 10;

  return (
    <div className="mx-auto w-full max-w-[100rem] px-2 py-4 sm:px-4 sm:py-6 md:px-6">
      <PageHeader
        title="Календарь"
        subtitle={
          canCreate
            ? "Нажмите на дату, чтобы добавить запись · откройте карточку события"
            : "Мероприятия по датам — откройте карточку"
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCursor(new Date(year, month - 1, 1))}
            >
              ←
            </Button>
            <span className="min-w-[8rem] text-center capitalize text-sm sm:min-w-[10rem]">
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

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[10px] sm:mb-4 sm:gap-x-4 sm:text-xs">
        {(Object.keys(LIFECYCLE_LABELS) as LifecycleStatus[]).map((k) => (
          <span
            key={k}
            className="inline-flex items-center gap-1.5 text-[var(--muted)]"
          >
            <span
              className="inline-block size-2 rounded-full sm:size-2.5"
              style={{ background: lifecycleColor(k) }}
            />
            {LIFECYCLE_LABELS[k]}
          </span>
        ))}
        {(Object.keys(ENTRY_KIND_LABELS) as CalendarEntryKind[]).map((k) => (
          <span
            key={k}
            className={`inline-flex items-center gap-1.5 text-[var(--muted)] ${
              hideDayOffs && k === "DAY_OFF" ? "opacity-40 line-through" : ""
            }`}
          >
            <span
              className="inline-block size-2 rounded-full sm:size-2.5"
              style={{ background: ENTRY_KIND_COLORS[k] }}
            />
            {ENTRY_KIND_LABELS[k]}
          </span>
        ))}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-[var(--ink)]">
          <input
            type="checkbox"
            checked={hideDayOffs}
            onChange={toggleHideDayOffs}
            className="size-3.5 accent-[var(--accent)]"
          />
          Скрывать выходные
        </label>
      </div>

      <Card className="overflow-x-auto overflow-y-hidden">
        <div className="min-w-[36rem] sm:min-w-0">
          <div className="grid grid-cols-7 border-b border-[var(--line)] bg-[var(--table-head)]">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
              <div
                key={d}
                className="px-1 py-1.5 text-center text-[10px] uppercase tracking-wider text-[var(--muted)] sm:px-2 sm:py-2 sm:text-[11px]"
              >
                {d}
              </div>
            ))}
          </div>

          {weekLayouts.map(({ week, segs }, weekIdx) => {
            const visibleSegs = segs.filter((s) => s.lane < maxLanes);

            return (
              <div
                key={weekIdx}
                className="relative grid grid-cols-7 border-b border-[var(--line)] last:border-b-0"
                style={{ height: dayNumHeight + bodyH + 6 }}
              >
                {week.map((day, col) => {
                  const key = formatDateKey(day);
                  const isToday = key === todayKey;
                  const outside = day.getMonth() !== month;
                  const hiddenOnDay = segs.filter(
                    (s) =>
                      s.lane >= maxLanes &&
                      col >= s.startCol &&
                      col < s.startCol + s.span,
                  ).length;

                  return (
                    <div
                      key={key}
                      className={`relative border-r border-[var(--line)] last:border-r-0 ${
                        outside
                          ? "bg-[var(--panel-muted)]"
                          : isToday
                            ? "bg-[color-mix(in_srgb,var(--accent)_10%,var(--panel))]"
                            : "bg-[var(--panel)]"
                      } ${canCreate ? "cursor-pointer" : ""}`}
                      onClick={(e) => onDayClick(day, e)}
                    >
                      {isToday && !outside && (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-0 z-[1]"
                          style={{
                            padding: 2,
                            background:
                              "linear-gradient(145deg, color-mix(in srgb, var(--accent) 55%, transparent), color-mix(in srgb, var(--accent-glow) 15%, transparent) 42%, color-mix(in srgb, var(--accent) 40%, transparent))",
                            WebkitMask:
                              "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
                            WebkitMaskComposite: "xor",
                            maskComposite: "exclude",
                          }}
                        />
                      )}
                      <div
                        className={`relative z-[1] px-1 pt-0.5 text-[11px] font-medium sm:px-1.5 sm:pt-1 sm:text-xs ${
                          outside
                            ? "text-[var(--muted)]/70"
                            : isToday
                              ? "font-semibold text-[var(--accent-deep)]"
                              : "text-[var(--muted)]"
                        }`}
                        style={{ height: dayNumHeight }}
                        title={isToday && !outside ? "Сегодня" : undefined}
                      >
                        {day.getDate()}
                      </div>
                      {hiddenOnDay > 0 && (
                        <button
                          type="button"
                          className="absolute bottom-0.5 left-1/2 z-[2] -translate-x-1/2 rounded-full bg-[var(--ink)]/85 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white shadow-sm hover:bg-[var(--ink)] sm:bottom-1 sm:text-[10px]"
                          style={{ height: overflowRow - 2 }}
                          title={`Ещё ${hiddenOnDay} — открыть список дня`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openDayList(day);
                          }}
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
                    top: dayNumHeight + 2,
                    height: maxLanes * (laneHeight + laneGap),
                  }}
                >
                  {visibleSegs.map((seg) => {
                    const left = `calc(${(seg.startCol / 7) * 100}% + 2px)`;
                    const width = `calc(${(seg.span / 7) * 100}% - 4px)`;
                    const top = seg.lane * (laneHeight + laneGap);
                    const radiusLeft = seg.continuesLeft ? "2px" : "6px";
                    const radiusRight = seg.continuesRight ? "2px" : "6px";
                    return (
                      <button
                        key={`${seg.item.type}-${seg.item.id}-${weekIdx}-${seg.startCol}`}
                        type="button"
                        className="pointer-events-auto absolute truncate px-1 text-left font-medium text-white shadow-sm transition-opacity hover:opacity-90 sm:px-1.5"
                        style={{
                          left,
                          width,
                          top,
                          height: laneHeight,
                          lineHeight: `${laneHeight}px`,
                          fontSize: barFont,
                          background: seg.item.color,
                          borderRadius: `${radiusLeft} ${radiusRight} ${radiusRight} ${radiusLeft}`,
                          opacity: (() => {
                            const startOutside =
                              week[seg.startCol]!.getMonth() !== month;
                            const endOutside =
                              week[seg.startCol + seg.span - 1]!.getMonth() !==
                              month;
                            return startOutside && endOutside ? 0.85 : 1;
                          })(),
                        }}
                        title={`${seg.item.subtitle} · ${seg.item.label}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openItem(seg.item);
                        }}
                      >
                        {seg.continuesLeft ? "‹ " : ""}
                        {seg.item.label}
                        {seg.continuesRight ? " ›" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
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
            aria-label="События за день"
          >
            <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
                  События
                </p>
                <h2 className="font-display text-xl text-[var(--ink)]">
                  {formatRuDate(dayList.date)}
                </h2>
                <p className="text-xs text-[var(--muted)]">
                  {dayList.items.length}{" "}
                  {dayList.items.length === 1
                    ? "запись"
                    : dayList.items.length < 5
                      ? "записи"
                      : "записей"}
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
              {dayList.items.map((item) => (
                <li key={`${item.type}-${item.id}`}>
                  <button
                    type="button"
                    onClick={() => openItem(item)}
                    className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--line)] px-3 py-2.5 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg)]"
                  >
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: item.color }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--ink)]">
                        {item.label}
                      </span>
                      <span className="text-[11px] text-[var(--muted)]">
                        {item.subtitle}
                        {item.start.getTime() !== item.end.getTime()
                          ? ` · ${formatRuDate(item.start)} — ${formatRuDate(item.end)}`
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

      <CalendarCreateMenu
        open={!!createMenu && !creatingProject}
        x={createMenu?.x ?? 0}
        y={createMenu?.y ?? 0}
        role={role}
        onClose={() => setCreateMenu(null)}
        onSelect={onCreateAction}
      />

      {form && (
        <CalendarEntryFormModal
          open
          kind={form.kind}
          dateKey={form.dateKey}
          entryId={form.entryId}
          onClose={() => setForm(null)}
          onSaved={reload}
        />
      )}

      {openEntryId && (
        <CalendarEntryModal
          entryId={openEntryId}
          onClose={() => setOpenEntryId(null)}
          onEdit={(entry) => {
            setOpenEntryId(null);
            setForm({
              kind: entry.kind,
              dateKey: entry.date,
              entryId: entry.id,
            });
          }}
          onDeleted={reload}
        />
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
