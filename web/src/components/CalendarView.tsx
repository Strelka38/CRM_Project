"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarDashboard,
  CalendarDashToggle,
} from "@/components/CalendarDashboard";
import {
  CalendarCreateMenu,
  type CalendarCreateAction,
} from "@/components/CalendarCreateMenu";
import {
  CalendarEntryFormModal,
  type CalendarEntryKind,
} from "@/components/CalendarEntryFormModal";
import { CalendarEntryModal } from "@/components/CalendarEntryModal";
import { useLayoutDensity } from "@/components/LayoutDensityProvider";
import { ProjectModal } from "@/components/ProjectModal";
import { Button, SideDrawer } from "@/components/ui";
import {
  LIFECYCLE_LABELS,
  LIFECYCLE_STATUSES,
  lifecycleColor,
  type LifecycleStatus,
} from "@/components/ui/Badge";
import { cn } from "@/lib/cn";
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
import { canCreateCalendarProject, canOpenCalendarCreateMenu } from "@/lib/roles";

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
  staffVacantCount?: number;
  staffVacant?: string;
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
  client: { id: string; companyName: string } | null;
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

const DENSITY_TIMETREE: CalendarDensity = {
  maxLanes: 4,
  laneHeight: 16,
  laneGap: 3,
  dayNumHeight: 34,
  overflowRow: 12,
};

const DENSITY_TIMETREE_DESKTOP: CalendarDensity = {
  maxLanes: 5,
  laneHeight: 18,
  laneGap: 4,
  dayNumHeight: 40,
  overflowRow: 14,
};

const LIFE_FILTERS = LIFECYCLE_STATUSES;

const KIND_FILTERS = ["RENTAL", "TASK", "DAY_OFF"] as const satisfies readonly CalendarEntryKind[];

const KIND_FILTER_LABELS: Record<CalendarEntryKind, string> = {
  RENTAL: "Аренда",
  TASK: "Задача",
  DAY_OFF: "Выходной",
};

const FILTERS_STORAGE_KEY = "calendar.filters";

type CalendarFilters = {
  lifecycles: Record<LifecycleStatus, boolean>;
  kinds: Record<CalendarEntryKind, boolean>;
};

function defaultFilters(hideDayOffs = false): CalendarFilters {
  return {
    lifecycles: {
      CALCULATED: true,
      CONFIRMED: true,
      CANCELLED: true,
      COMPLETED: true,
    },
    kinds: {
      RENTAL: true,
      TASK: true,
      DAY_OFF: !hideDayOffs,
    },
  };
}

function readStoredFilters(): CalendarFilters {
  try {
    const hideDayOffs = localStorage.getItem("calendar.hideDayOffs") === "1";
    const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!raw) return defaultFilters(hideDayOffs);
    const data = JSON.parse(raw) as Partial<CalendarFilters>;
    const base = defaultFilters(hideDayOffs);
    const lifecycles = { ...base.lifecycles };
    const kinds = { ...base.kinds };
    if (data.lifecycles && typeof data.lifecycles === "object") {
      for (const k of LIFE_FILTERS) {
        if (typeof data.lifecycles[k] === "boolean") lifecycles[k] = data.lifecycles[k];
      }
    }
    if (data.kinds && typeof data.kinds === "object") {
      for (const k of KIND_FILTERS) {
        if (typeof data.kinds[k] === "boolean") kinds[k] = data.kinds[k];
      }
    }
    return { lifecycles, kinds };
  } catch {
    return defaultFilters();
  }
}

function persistFilters(next: CalendarFilters) {
  try {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(next));
    localStorage.setItem(
      "calendar.hideDayOffs",
      next.kinds.DAY_OFF ? "0" : "1",
    );
  } catch {
    /* ignore */
  }
}

function FilterChip({
  label,
  color,
  active,
  onToggle,
}: {
  label: string;
  color: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-1 py-0.5 text-caption transition-opacity hover:text-[var(--ink)]",
        active ? "text-[var(--muted)]" : "text-[var(--muted)]/40 opacity-50",
      )}
    >
      <span
        className="inline-block size-2.5 shrink-0 rounded-full"
        style={{ background: color }}
      />
      {label}
    </button>
  );
}

function weekRowHeight(d: CalendarDensity, segs: EventSeg[]) {
  let maxLane = -1;
  let overflow = false;
  for (const s of segs) {
    if (s.lane > maxLane) maxLane = s.lane;
    if (s.lane >= d.maxLanes) overflow = true;
  }
  const shown = Math.min(d.maxLanes, Math.max(2, maxLane + 1));
  return d.dayNumHeight + shown * (d.laneHeight + d.laneGap) + (overflow ? d.overflowRow : 6);
}

function quoteLabel(q: Quote) {
  return `№${q.proposalNumber} ${q.eventName || q.client || "КП"}`;
}

function quoteStaffHint(q: Quote) {
  if (!q.staffVacantCount) return "";
  return q.staffVacant
    ? `Нужно назначить: ${q.staffVacant}`
    : `Не назначено: ${q.staffVacantCount}`;
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
  const bits = [e.title?.trim(), e.client?.companyName].filter(Boolean);
  return bits.length ? `Аренда · ${bits.join(" · ")}` : "Аренда";
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

function ruRecords(n: number) {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return "запись";
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return "записи";
  return "записей";
}

function itemTimeLabel(item: CalItem): string {
  if (item.type === "entry") {
    const { startTime, endTime } = item.entry;
    if (startTime && endTime) return `${startTime}–${endTime}`;
    if (startTime) return startTime;
  }
  if (item.start.getTime() !== item.end.getTime()) {
    return `${formatRuDate(item.start)} — ${formatRuDate(item.end)}`;
  }
  return "Весь день";
}


function DayAgenda({
  date,
  items,
  canCreate,
  onOpen,
  onAdd,
  headingId,
}: {
  date: Date;
  items: CalItem[];
  canCreate: boolean;
  onOpen: (item: CalItem) => void;
  onAdd?: (e: MouseEvent<HTMLButtonElement>) => void;
  headingId?: string;
}) {
  const heading = date.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-1">
        <div className="min-w-0">
          <h2
            id={headingId}
            className="font-display capitalize text-lg leading-tight text-[var(--ink)] sm:text-xl"
          >
            {heading}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {items.length} {ruRecords(items.length)}
          </p>
        </div>
        {canCreate && onAdd ? (
          <Button type="button" size="sm" variant="outline" onClick={onAdd}>
            Добавить
          </Button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="px-4 text-sm text-[var(--muted)]">
          Нет событий. {canCreate ? "Нажмите «Добавить», чтобы создать запись." : ""}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 pb-4">
          {items.map((item) => (
            <li key={`${item.type}-${item.id}`}>
              <button
                type="button"
                onClick={() => onOpen(item)}
                className="flex w-full items-stretch gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)]/40 px-3 py-2.5 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--bg)]"
              >
                <span
                  className="w-1 shrink-0 self-stretch rounded-full"
                  style={{ background: item.color }}
                />
                <span className="w-16 shrink-0 pt-0.5 text-caption leading-tight text-[var(--muted)]">
                  {itemTimeLabel(item)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-[var(--ink)]">
                    {item.label}
                  </span>
                  <span className="text-caption text-[var(--muted)]">
                    {item.subtitle}
                  </span>
                  {item.type === "quote" && item.quote.staffVacantCount ? (
                    <span className="mt-0.5 block text-caption font-medium text-amber-700 dark:text-amber-300">
                      {quoteStaffHint(item.quote)}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CalendarView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canCreate = canOpenCalendarCreateMenu(role);
  const canCreateQuote = canCreateCalendarProject(role);
  const { showingDesktop } = useLayoutDensity();

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [entries, setEntries] = useState<CalendarEntryRow[]>([]);
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(null);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [dayPanelOpen, setDayPanelOpen] = useState(false);
  const [createMenu, setCreateMenu] = useState<CreateMenuState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [filters, setFilters] = useState<CalendarFilters>(() => defaultFilters());
  const [dashOpen, setDashOpen] = useState(true);
  const [dashMotion, setDashMotion] = useState(false);
  const [dashAlerts, setDashAlerts] = useState(false);

  useLayoutEffect(() => {
    try {
      setFilters(readStoredFilters());
      setDashOpen(localStorage.getItem("calendar.dashCollapsed") !== "1");
    } catch {
      /* ignore */
    }
  }, []);

  function toggleLifecycle(status: LifecycleStatus) {
    setFilters((prev) => {
      const next = {
        ...prev,
        lifecycles: { ...prev.lifecycles, [status]: !prev.lifecycles[status] },
      };
      persistFilters(next);
      return next;
    });
  }

  function toggleKind(kind: CalendarEntryKind) {
    setFilters((prev) => {
      const next = {
        ...prev,
        kinds: { ...prev.kinds, [kind]: !prev.kinds[kind] },
      };
      persistFilters(next);
      return next;
    });
  }

  function toggleDash() {
    setDashMotion(true);
    setDashOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("calendar.dashCollapsed", next ? "0" : "1");
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
    const entryFromUrl = searchParams.get("entry");
    if (entryFromUrl) setOpenEntryId(entryFromUrl);
  }, [searchParams]);

  useEffect(() => {
    function openCreateFromChrome() {
      if (!canCreate) return;
      const cx =
        typeof window !== "undefined" ? Math.round(window.innerWidth / 2) : 160;
      const cy =
        typeof window !== "undefined"
          ? Math.round(window.innerHeight * 0.35)
          : 200;
      setCreateMenu({
        date: startOfDay(new Date()),
        x: cx,
        y: cy,
      });
      if (searchParams.get("create")) {
        router.replace("/calendar", { scroll: false });
      }
    }

    if (searchParams.get("create") === "1") {
      openCreateFromChrome();
    }

    function onChromeCreate() {
      openCreateFromChrome();
    }
    window.addEventListener("crm:calendar-create", onChromeCreate);
    return () => {
      window.removeEventListener("crm:calendar-create", onChromeCreate);
    };
  }, [searchParams, canCreate, router]);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when month window changes
  }, [from, to]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const weeks = useMemo(() => buildWeeks(year, month), [year, month]);

  const items = useMemo<CalItem[]>(() => {
    const list: CalItem[] = [];
    for (const q of quotes) {
      if (!filters.lifecycles[q.lifecycle]) continue;
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
        subtitle: [LIFECYCLE_LABELS[q.lifecycle], quoteStaffHint(q)]
          .filter(Boolean)
          .join(" · "),
      });
    }
    for (const e of entries) {
      if (!filters.kinds[e.kind]) continue;
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
  }, [quotes, entries, filters]);

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
  const selectedKey = formatDateKey(selectedDay);
  const selectedItems = useMemo(
    () => itemsOnDay(items, selectedDay),
    [items, selectedDay],
  );

  function shiftMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setCursor(next);
    const t = startOfDay(new Date());
    if (t.getFullYear() === next.getFullYear() && t.getMonth() === next.getMonth()) {
      setSelectedDay(t);
    } else {
      setSelectedDay(next);
    }
  }

  function goToday() {
    const t = startOfDay(new Date());
    setCursor(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedDay(t);
    if (showingDesktop) setDayPanelOpen(true);
  }

  function openItem(item: CalItem) {
    setCreateMenu(null);
    if (item.type === "quote") setOpenQuoteId(item.id);
    else setOpenEntryId(item.id);
  }

  function onDayClick(e: MouseEvent<HTMLButtonElement>, day: Date) {
    const start = startOfDay(day);
    setSelectedDay(start);
    const empty = itemsOnDay(items, start).length === 0;
    if (empty && canCreate) {
      setDayPanelOpen(false);
      setCreateMenu({
        date: start,
        x: e.clientX,
        y: e.clientY,
      });
      return;
    }
    setCreateMenu(null);
    setDayPanelOpen(true);
  }

  function openCreate(e: MouseEvent<HTMLButtonElement>, date = selectedDay) {
    if (!canCreate) return;
    setCreateMenu({
      date: startOfDay(date),
      x: e.clientX,
      y: e.clientY,
    });
  }

  async function createProject(date?: Date | null) {
    setCreatingProject(true);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(date ? { date: formatDateKey(date) } : {}),
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
      router.push(`/quotes/${data.id}?tab=main`);
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

  const tt = showingDesktop ? DENSITY_TIMETREE_DESKTOP : DENSITY_TIMETREE;
  const barFont = showingDesktop ? 11 : 10;
  const weekdayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

  const monthNav = (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button type="button" variant="ghost" size="sm" onClick={goToday}>
        Сегодня
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="size-8 rounded-full !px-0"
        onClick={() => shiftMonth(-1)}
        aria-label="Предыдущий месяц"
      >
        ←
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="size-8 rounded-full !px-0"
        onClick={() => shiftMonth(1)}
        aria-label="Следующий месяц"
      >
        →
      </Button>
    </div>
  );

  return (
    <div
      className={cn(
        "mx-auto w-full",
        showingDesktop ? "px-4 py-5 md:px-6" : "px-0 pb-20 pt-1",
      )}
    >
      <div className={showingDesktop ? "relative" : "flex flex-col"}>
        <div className="relative min-w-0 pb-16">
      <header
        className={cn(
          "flex items-center justify-between gap-2 py-2",
          showingDesktop ? "px-1" : "px-4",
        )}
      >
          <h1 className="font-display capitalize text-2xl tracking-tight text-[var(--ink)]">
          {monthLabel}
        </h1>
        {monthNav}
      </header>

      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1 pb-1.5",
          showingDesktop ? "px-1" : "px-3",
        )}
        role="group"
        aria-label="Фильтры календаря"
      >
        {LIFE_FILTERS.map((status) => (
          <FilterChip
            key={status}
            label={LIFECYCLE_LABELS[status]}
            color={lifecycleColor(status)}
            active={filters.lifecycles[status]}
            onToggle={() => toggleLifecycle(status)}
          />
        ))}
        {KIND_FILTERS.map((kind) => (
          <FilterChip
            key={kind}
            label={KIND_FILTER_LABELS[kind]}
            color={ENTRY_KIND_COLORS[kind]}
            active={filters.kinds[kind]}
            onToggle={() => toggleKind(kind)}
          />
        ))}
      </div>

      <div className={cn("relative", showingDesktop && "px-1")}>
        {showingDesktop ? (
          <div className="pointer-events-none absolute inset-0 z-20">
            <div className="sticky top-[calc(var(--app-topbar-height)+0.75rem)] ml-auto w-[19.5rem]">
              <aside
                className={cn(
                  "cal-dash-overlay",
                  !dashOpen && "is-closed",
                  dashMotion && "is-motion",
                )}
                onTransitionEnd={(e) => {
                  if (e.propertyName === "transform") setDashMotion(false);
                }}
              >
                <CalendarDashboard
                  onOpenQuote={(id) => {
                    setOpenEntryId(null);
                    setOpenQuoteId(id);
                  }}
                  onOpenEntry={(id) => {
                    setOpenQuoteId(null);
                    setOpenEntryId(id);
                  }}
                  onTasksChanged={reload}
                  onAlertsChange={setDashAlerts}
                />
              </aside>
              <div className="cal-dash-fab-float">
                <CalendarDashToggle
                  collapsed={!dashOpen}
                  hasAlerts={dashAlerts}
                  onClick={toggleDash}
                />
              </div>
            </div>
          </div>
        ) : null}
        <div className="grid grid-cols-7 px-0.5">
          {weekdayLabels.map((d, i) => (
            <div
              key={d}
              className={cn(
                "py-1.5 text-center text-caption font-medium uppercase tracking-wider",
                i >= 5 ? "text-rose-400" : "text-[var(--muted)]",
              )}
            >
              {d}
            </div>
          ))}
        </div>

        {weekLayouts.map(({ week, segs }, weekIdx) => {
          const visibleSegs = segs.filter((s) => s.lane < tt.maxLanes);
          const rowH = weekRowHeight(tt, segs);
          return (
            <div
              key={weekIdx}
              className="relative grid grid-cols-7"
              style={{ height: rowH }}
            >
              {week.map((day, col) => {
                const key = formatDateKey(day);
                const isToday = key === todayKey;
                const isSelected = key === selectedKey;
                const outside = day.getMonth() !== month;
                const weekend = day.getDay() === 0 || day.getDay() === 6;
                const hiddenOnDay = segs.filter(
                  (s) =>
                    s.lane >= tt.maxLanes &&
                    col >= s.startCol &&
                    col < s.startCol + s.span,
                ).length;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={(e) => onDayClick(e, day)}
                    className="relative flex flex-col items-center pt-0.5"
                  >
                    <span
                      className={cn(
                        "relative z-10 flex items-center justify-center rounded-full tabular-nums",
                        showingDesktop
                          ? "size-[1.85rem] text-sm"
                          : "size-[1.55rem] text-xs",
                        isSelected &&
                          "bg-[var(--ink)] font-semibold text-[var(--panel)]",
                        !isSelected &&
                          isToday &&
                          "font-semibold text-[var(--ink)] ring-1 ring-[var(--ink)]",
                        !isSelected &&
                          !isToday &&
                          outside &&
                          "text-[var(--muted)]/40",
                        !isSelected &&
                          !isToday &&
                          !outside &&
                          weekend &&
                          "text-rose-400",
                        !isSelected &&
                          !isToday &&
                          !outside &&
                          !weekend &&
                          "text-[var(--ink)]",
                      )}
                    >
                      {day.getDate()}
                    </span>
                    {hiddenOnDay > 0 ? (
                      <span className="absolute bottom-0.5 text-caption font-medium text-[var(--muted)]">
                        +{hiddenOnDay}
                      </span>
                    ) : null}
                  </button>
                );
              })}

              <div
                className="pointer-events-none absolute inset-x-0"
                style={{
                  top: tt.dayNumHeight,
                  height: tt.maxLanes * (tt.laneHeight + tt.laneGap),
                }}
              >
                {visibleSegs.map((seg) => {
                  const left = `calc(${(seg.startCol / 7) * 100}% + 2px)`;
                  const width = `calc(${(seg.span / 7) * 100}% - 4px)`;
                  const top = seg.lane * (tt.laneHeight + tt.laneGap);
                  const radiusLeft = seg.continuesLeft ? "4px" : "6px";
                  const radiusRight = seg.continuesRight ? "4px" : "6px";
                  const vacant =
                    seg.item.type === "quote" &&
                    (seg.item.quote.staffVacantCount ?? 0) > 0;
                  const staffHint =
                    seg.item.type === "quote"
                      ? quoteStaffHint(seg.item.quote)
                      : "";
                  const startOutside =
                    week[seg.startCol]!.getMonth() !== month;
                  const endOutside =
                    week[seg.startCol + seg.span - 1]!.getMonth() !== month;
                  return (
                    <button
                      key={`${seg.item.type}-${seg.item.id}-${weekIdx}-${seg.startCol}`}
                      type="button"
                      className={`pointer-events-auto absolute truncate px-1.5 text-left font-medium text-white${vacant ? " cal-event-vacant" : ""}`}
                      style={{
                        left,
                        width,
                        top,
                        height: tt.laneHeight,
                        lineHeight: `${tt.laneHeight}px`,
                        fontSize: barFont,
                        background: seg.item.color,
                        borderRadius: `${radiusLeft} ${radiusRight} ${radiusRight} ${radiusLeft}`,
                        opacity: startOutside && endOutside ? 0.45 : 1,
                      }}
                      title={`${seg.item.subtitle} · ${seg.item.label}${staffHint ? ` · ${staffHint}` : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openItem(seg.item);
                      }}
                    >
                      {seg.item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

          {showingDesktop && canCreateQuote ? (
            <button
              type="button"
              className="cal-plus-fab"
              aria-label="Новая смета без даты"
              title="Новая смета без даты"
              disabled={creatingProject}
              onClick={() => void createProject()}
            >
              +
            </button>
          ) : null}
        </div>
      </div>

      <SideDrawer
        open={dayPanelOpen}
        onClose={() => setDayPanelOpen(false)}
        labelledBy="cal-day-title"
        closeOnEscape={!openQuoteId && !openEntryId}
      >
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-end px-4 pt-1">
            <button
              type="button"
              onClick={() => setDayPanelOpen(false)}
              className="shrink-0 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Закрыть
            </button>
          </div>
          <DayAgenda
            date={selectedDay}
            items={selectedItems}
            canCreate={canCreate}
            onOpen={openItem}
            onAdd={openCreate}
            headingId="cal-day-title"
          />
        </div>
      </SideDrawer>

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

      <CalendarEntryModal
        open={!!openEntryId}
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
        onChanged={reload}
      />

      <ProjectModal
        open={!!openQuoteId}
        quoteId={openQuoteId}
        onClose={() => {
          setOpenQuoteId(null);
          if (searchParams.get("quote")) {
            router.replace("/calendar", { scroll: false });
          }
        }}
      />
    </div>
  );
}
