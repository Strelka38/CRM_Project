"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type Ref,
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
import { Button, DrawerCloseButton, SideDrawer } from "@/components/ui";
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
  isoWeekNumber,
  parseEventDate,
  startOfDay,
} from "@/lib/dates";
import { laneHeightToFit, lanesThatFit } from "@/lib/calendar-lanes";
import { lockSwipeAxis, swipeMonthDelta } from "@/lib/calendar-swipe";
import { CALENDAR_WEEK_ROWS, buildWeeks } from "@/lib/calendar-weeks";
import { usePermissions } from "@/components/PermissionProvider";
import { canOpenCalendarCreateMenu } from "@/lib/roles";
import {
  persistCalendarView,
  readStoredCalendarView,
} from "@/lib/view-position";

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
  brief?: string;
};

type CalendarEntryRow = {
  id: string;
  kind: CalendarEntryKind;
  date: string;
  durationDays?: number;
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
  maxLanes: 6,
  laneHeight: 14,
  laneGap: 1,
  dayNumHeight: 20,
  overflowRow: 0,
};

const MOBILE_LANE_MIN = 12;
const MOBILE_LANE_MAX = 18;

const DENSITY_TIMETREE_DESKTOP: CalendarDensity = {
  maxLanes: 6,
  laneHeight: 20,
  laneGap: 3,
  dayNumHeight: 30,
  overflowRow: 18,
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
  showLabel,
  outlined,
}: {
  label: string;
  color: string;
  active: boolean;
  onToggle: () => void;
  showLabel: boolean;
  outlined?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={showLabel ? undefined : label}
      title={label}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-opacity hover:text-[var(--ink)]",
        showLabel ? "gap-1.5 px-1 py-0.5 text-caption" : "size-7",
        active ? "text-[var(--muted)]" : "text-[var(--muted)]/40 opacity-50",
      )}
    >
      <span
        className={cn(
          "inline-block shrink-0 rounded-full",
          showLabel ? "size-2.5" : "size-3",
        )}
        // Без подписи заливка/обводка — единственный признак включённого фильтра.
        style={
          outlined
            ? showLabel || active
              ? {
                  background: "var(--panel)",
                  boxShadow: "inset 0 0 0 1px var(--bg), 0 0 0 1px var(--ink)",
                }
              : { boxShadow: "inset 0 0 0 1.5px var(--ink)" }
            : showLabel || active
              ? { background: color }
              : { boxShadow: `inset 0 0 0 1.5px ${color}` }
        }
      />
      {showLabel ? label : null}
    </button>
  );
}

function weekLaneStats(d: CalendarDensity, segs: EventSeg[]) {
  let maxLane = -1;
  let overflow = false;
  for (const s of segs) {
    if (s.lane > maxLane) maxLane = s.lane;
    if (s.lane >= d.maxLanes) overflow = true;
  }
  const shown = Math.min(d.maxLanes, Math.max(1, maxLane + 1));
  return {
    shown,
    overflow,
    height:
      d.dayNumHeight +
      shown * (d.laneHeight + d.laneGap) +
      (overflow ? d.overflowRow : 6),
  };
}

/** Оплаченный счёт = завершённый проект. Отмена важнее оплаты. */
function calendarQuoteStatus(q: Pick<Quote, "lifecycle" | "paid">): LifecycleStatus {
  if (q.lifecycle === "CANCELLED") return "CANCELLED";
  if (q.paid || q.lifecycle === "COMPLETED") return "COMPLETED";
  return q.lifecycle;
}

function calendarStatusColor(status: LifecycleStatus): string {
  if (status === "CONFIRMED") return "var(--accent)";
  if (status === "CALCULATED") return "var(--ink)";
  if (status === "COMPLETED") return "var(--cal-completed)";
  return lifecycleColor(status);
}

function calendarBarKind(
  status: LifecycleStatus,
): "is-confirmed" | "is-calculated" | "is-completed" | "" {
  if (status === "CONFIRMED") return "is-confirmed";
  if (status === "CALCULATED") return "is-calculated";
  if (status === "COMPLETED") return "is-completed";
  return "";
}

function calendarItemBarKind(item: CalItem): string {
  if (item.type === "entry" && item.entry.kind === "RENTAL") return "is-rental";
  if (item.type === "quote") {
    return calendarBarKind(calendarQuoteStatus(item.quote));
  }
  return "";
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
    return name;
  }
  if (e.kind === "TASK") return e.title || "Задача";
  const bits = [e.title?.trim(), e.client?.companyName].filter(Boolean);
  return bits.length ? `Аренда · ${bits.join(" · ")}` : "Аренда";
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

const RU_MONTHS = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
] as const;

function CalendarMonthYearJump({
  year,
  month,
  onJump,
}: {
  year: number;
  month: number;
  onJump: (year: number, month: number) => void;
}) {
  const [open, setOpen] = useState<null | "month" | "year">(null);
  const [yearFrom, setYearFrom] = useState(year - 4);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: Event) {
      if (boxRef.current?.contains(e.target as Node)) return;
      setOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const monthName = RU_MONTHS[month] ?? "";
  const years = Array.from({ length: 12 }, (_, i) => yearFrom + i);

  return (
    <div ref={boxRef} className="relative flex flex-wrap items-baseline gap-x-2">
      <h1 className="font-display flex flex-wrap items-baseline gap-x-2 text-lg tracking-tight text-[var(--ink)] md:text-2xl">
        <button
          type="button"
          className="capitalize underline-offset-4 hover:underline"
          aria-expanded={open === "month"}
          aria-haspopup="listbox"
          onClick={() => setOpen((v) => (v === "month" ? null : "month"))}
        >
          {monthName}
        </button>
        <button
          type="button"
          className="underline-offset-4 hover:underline"
          aria-expanded={open === "year"}
          aria-haspopup="listbox"
          onClick={() => {
            setYearFrom(year - 4);
            setOpen((v) => (v === "year" ? null : "year"));
          }}
        >
          {year} г.
        </button>
      </h1>

      {open === "month" ? (
        <div
          role="listbox"
          aria-label="Месяц"
          className="absolute left-0 top-full z-40 mt-1.5 grid w-[17.5rem] grid-cols-3 gap-1 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-2 shadow-xl"
        >
          {RU_MONTHS.map((label, i) => (
            <button
              key={label}
              type="button"
              role="option"
              aria-selected={i === month}
              className={cn(
                "rounded-lg px-2 py-1.5 text-left text-sm capitalize hover:bg-[var(--ink)]/10",
                i === month && "bg-[var(--ink)]/10 font-medium text-[var(--ink)]",
              )}
              onClick={() => {
                onJump(year, i);
                setOpen(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {open === "year" ? (
        <div
          role="listbox"
          aria-label="Год"
          className="absolute left-0 top-full z-40 mt-1.5 w-[17.5rem] rounded-xl border border-[var(--line)] bg-[var(--panel)] p-2 shadow-xl"
        >
          <div className="mb-1 flex items-center justify-between px-1">
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--ink)]/10 hover:text-[var(--ink)]"
              aria-label="Предыдущие годы"
              onClick={() => setYearFrom((v) => v - 12)}
            >
              ←
            </button>
            <span className="text-xs text-[var(--muted)]">
              {years[0]}–{years[years.length - 1]}
            </span>
            <button
              type="button"
              className="flex size-7 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--ink)]/10 hover:text-[var(--ink)]"
              aria-label="Следующие годы"
              onClick={() => setYearFrom((v) => v + 12)}
            >
              →
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                role="option"
                aria-selected={y === year}
                className={cn(
                  "rounded-lg px-2 py-1.5 text-sm tabular-nums hover:bg-[var(--ink)]/10",
                  y === year && "bg-[var(--ink)]/10 font-medium text-[var(--ink)]",
                )}
                onClick={() => {
                  onJump(y, month);
                  setOpen(null);
                }}
              >
                {y}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function dayAgendaHeading(date: Date) {
  return date.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function quoteBriefPreview(brief: string | undefined): string {
  return brief?.replace(/\s+/g, " ").trim() ?? "";
}

function DayAgendaPage({
  date,
  items,
  canCreate,
  onOpen,
  onAdd,
  onClose,
  headingId,
}: {
  date: Date;
  items: CalItem[];
  canCreate: boolean;
  onOpen: (item: CalItem) => void;
  onAdd?: (e: MouseEvent<HTMLButtonElement>) => void;
  onClose?: () => void;
  headingId?: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-1 px-2 py-1.5">
        {onClose ? <DrawerCloseButton onClick={onClose} /> : null}
        <h2
          id={headingId}
          className="min-w-0 flex-1 truncate text-xs font-medium uppercase tracking-wider text-[var(--muted)]"
        >
          {dayAgendaHeading(date)}
        </h2>
        {canCreate && onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-xl leading-none text-[var(--ink)] hover:bg-[var(--ink)]/10"
            aria-label="Добавить"
            title="Добавить"
          >
            +
          </button>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="px-2 text-sm text-[var(--muted)]">
          Нет событий.{" "}
          {canCreate ? "Нажмите «+», чтобы создать запись." : ""}
        </p>
      ) : (
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2 pb-4">
          {items.map((item) => {
            const quoteStatus =
              item.type === "quote" ? calendarQuoteStatus(item.quote) : null;
            const stripeKind = calendarItemBarKind(item);
            const statusLabel =
              item.type === "quote"
                ? LIFECYCLE_LABELS[quoteStatus ?? item.quote.lifecycle]
                : ENTRY_KIND_LABELS[item.entry.kind];
            const gray =
              item.type === "quote"
                ? quoteBriefPreview(item.quote.brief)
                : item.entry.note?.trim() || "";
            return (
              <li key={`${item.type}-${item.id}`}>
                <button
                  type="button"
                  onClick={() => onOpen(item)}
                  className="flex w-full items-stretch gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5"
                >
                  <span
                    className={cn(
                      "w-1.5 shrink-0 self-stretch rounded-full",
                      stripeKind === "is-calculated" &&
                        "border border-[var(--ink)] bg-[var(--panel)] shadow-[inset_0_0_0_1px_var(--bg)]",
                      stripeKind === "is-confirmed" && "bg-[var(--accent)]",
                      stripeKind === "is-completed" &&
                        "bg-[var(--cal-completed)]",
                      stripeKind === "is-rental" && "bg-[var(--cal-rental)]",
                    )}
                    style={stripeKind ? undefined : { background: item.color }}
                  />
                  <span className="w-[4.5rem] shrink-0 pt-0.5 text-[11px] leading-tight text-[var(--muted)]">
                    {itemTimeLabel(item)}
                    {statusLabel ? (
                      <span className="mt-0.5 block">{statusLabel}</span>
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--ink)]">
                      {item.label}
                    </span>
                    {gray ? (
                      <span className="mt-0.5 line-clamp-2 text-[11px] text-[var(--muted)]">
                        {gray}
                      </span>
                    ) : null}
                    {item.type === "quote" && item.quote.staffVacantCount ? (
                      <span className="mt-0.5 block text-[11px] font-medium text-amber-700 dark:text-amber-300">
                        {quoteStaffHint(item.quote)}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DayAgenda({
  date,
  items,
  allItems,
  canCreate,
  onOpen,
  onAdd,
  onClose,
  onShiftDay,
  headingId,
}: {
  date: Date;
  items: CalItem[];
  /** Все события окна — для соседних дней в карусели свайпа. */
  allItems?: CalItem[];
  canCreate: boolean;
  onOpen: (item: CalItem) => void;
  onAdd?: (e: MouseEvent<HTMLButtonElement>) => void;
  onClose?: () => void;
  /** Свайп влево/вправо — соседний день (мобильный шит), как у месяцев. */
  onShiftDay?: (delta: -1 | 1) => void;
  headingId?: string;
}) {
  const swipeRef = useRef<HTMLDivElement>(null);
  const swipeTxRef = useRef(0);
  const [swipeTx, setSwipeTx] = useState(0);
  const [swipeSettle, setSwipeSettle] = useState(false);
  const shiftRef = useRef(onShiftDay);
  shiftRef.current = onShiftDay;

  const pages = useMemo(() => {
    const pool = allItems ?? items;
    return [-1, 0, 1].map((offset) => {
      const d = addDays(date, offset);
      return {
        key: formatDateKey(d),
        date: d,
        items: offset === 0 ? items : itemsOnDay(pool, d),
      };
    });
  }, [date, items, allItems]);

  useEffect(() => {
    const el = swipeRef.current;
    if (!el || !shiftRef.current) return;
    const pane: HTMLDivElement = el;

    const start = { x: 0, y: 0, t: 0, id: 0 };
    let axis: "x" | "y" | null = null;
    let dragging = false;
    let pending = 0;
    let ignoreClick = false;

    function setTx(next: number) {
      swipeTxRef.current = next;
      setSwipeTx(next);
    }

    function onDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (pending) return;
      start.x = e.clientX;
      start.y = e.clientY;
      start.t = e.timeStamp;
      start.id = e.pointerId;
      axis = null;
      dragging = true;
      ignoreClick = false;
      releaseHorizontal();
      setSwipeSettle(false);
    }

    function claimHorizontal() {
      pane.dataset.swipeAxis = "x";
      pane.classList.add("is-h-swipe");
      const drawer = pane.closest(".side-drawer");
      if (drawer instanceof HTMLElement) {
        drawer.dataset.swipeAxis = "x";
        drawer.classList.add("is-h-swipe");
      }
    }

    function releaseHorizontal() {
      delete pane.dataset.swipeAxis;
      pane.classList.remove("is-h-swipe");
      const drawer = pane.closest(".side-drawer");
      if (drawer instanceof HTMLElement) {
        delete drawer.dataset.swipeAxis;
        drawer.classList.remove("is-h-swipe");
      }
    }

    function onMove(e: PointerEvent) {
      if (!dragging || e.pointerId !== start.id) return;
      // Sheet already claimed this pointer for vertical dismiss.
      if (axis !== "x" && pane.closest(".is-sheet-drag")) {
        axis = "y";
        releaseHorizontal();
        return;
      }
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!axis) {
        axis = lockSwipeAxis(dx, dy);
        if (!axis) return;
        if (axis === "x") {
          ignoreClick = true;
          claimHorizontal();
          try {
            pane!.setPointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
        }
      }
      if (axis !== "x") return;
      e.preventDefault();
      e.stopPropagation();
      setTx(dx);
    }

    function finish(e: PointerEvent) {
      if (!dragging || e.pointerId !== start.id) return;
      dragging = false;
      releaseHorizontal();
      if (pane.hasPointerCapture(e.pointerId)) {
        try {
          pane.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }
      if (axis !== "x") {
        axis = null;
        return;
      }
      const dx = e.clientX - start.x;
      const dt = Math.max(1, e.timeStamp - start.t);
      const width = pane!.clientWidth || 1;
      const delta = swipeMonthDelta(dx, width, dx / dt);
      axis = null;
      if (delta === 0) {
        setSwipeSettle(true);
        setTx(0);
        return;
      }
      pending = delta;
      setSwipeSettle(true);
      setTx(-delta * width);
    }

    function onEnd(e: PointerEvent) {
      finish(e);
    }

    function onTransitionEnd(e: TransitionEvent) {
      if (e.propertyName !== "transform") return;
      if (!pending) {
        setSwipeSettle(false);
        return;
      }
      const dir = pending as -1 | 1;
      pending = 0;
      setSwipeSettle(false);
      setTx(0);
      shiftRef.current?.(dir);
    }

    function onClick(e: Event) {
      if (!ignoreClick) return;
      ignoreClick = false;
      e.preventDefault();
      e.stopPropagation();
    }

    pane.addEventListener("pointerdown", onDown);
    pane.addEventListener("pointermove", onMove, { passive: false });
    pane.addEventListener("pointerup", onEnd);
    pane.addEventListener("pointercancel", onEnd);
    pane.addEventListener("transitionend", onTransitionEnd);
    pane.addEventListener("click", onClick, true);
    return () => {
      releaseHorizontal();
      pane.removeEventListener("pointerdown", onDown);
      pane.removeEventListener("pointermove", onMove);
      pane.removeEventListener("pointerup", onEnd);
      pane.removeEventListener("pointercancel", onEnd);
      pane.removeEventListener("transitionend", onTransitionEnd);
      pane.removeEventListener("click", onClick, true);
    };
  }, []);

  if (!onShiftDay) {
    return (
      <DayAgendaPage
        date={date}
        items={items}
        canCreate={canCreate}
        onOpen={onOpen}
        onAdd={onAdd}
        onClose={onClose}
        headingId={headingId}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={swipeRef} className="cal-tt-swipe">
        <div
          className={cn("cal-tt-swipe-track", swipeSettle && "is-settle")}
          style={{
            transform: `translate3d(calc(-33.333333% + ${swipeTx}px), 0, 0)`,
          }}
        >
          {pages.map((page, i) => (
            <div key={page.key} className="cal-tt-swipe-page">
              <DayAgendaPage
                date={page.date}
                items={page.items}
                canCreate={canCreate}
                onOpen={onOpen}
                onAdd={onAdd}
                onClose={onClose}
                headingId={i === 1 ? headingId : undefined}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthWeeks({
  layouts,
  month,
  density,
  showingDesktop,
  todayKey,
  selectedKey,
  barFont,
  weeksRef,
  onDayClick,
  onOpenItem,
}: {
  layouts: { week: Date[]; segs: EventSeg[] }[];
  month: number;
  density: CalendarDensity;
  showingDesktop: boolean;
  todayKey: string;
  selectedKey: string;
  barFont: number;
  weeksRef?: Ref<HTMLDivElement>;
  onDayClick: (day: Date) => void;
  onOpenItem: (item: CalItem, day: Date) => void;
}) {
  return (
    <div ref={weeksRef} className="cal-tt-weeks">
      {layouts.map(({ week, segs }, weekIdx) => {
        const visibleSegs = segs.filter((s) => s.lane < density.maxLanes);
        const { shown } = weekLaneStats(density, segs);
        const weekNo = isoWeekNumber(week[0]!);
        return (
          <div key={weekIdx} className="cal-tt-week is-fill relative flex">
            <div
              className="cal-tt-weeknum"
              aria-label={`Неделя ${weekNo}`}
              title={`Неделя ${weekNo}`}
            >
              {weekNo}
            </div>
            <div className="cal-tt-week-grid relative min-h-0 min-w-0 flex-1 grid grid-cols-7">
            {week.map((day, col) => {
              const key = formatDateKey(day);
              const isToday = key === todayKey;
              const isSelected = key === selectedKey;
              const outside = day.getMonth() !== month;
              const weekend = day.getDay() === 0 || day.getDay() === 6;
              const hiddenOnDay = segs.filter(
                (s) =>
                  s.lane >= density.maxLanes &&
                  col >= s.startCol &&
                  col < s.startCol + s.span,
              ).length;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => onDayClick(day)}
                  className={cn(
                    "cal-tt-cell relative flex flex-col items-center pt-0.5",
                    isSelected && "is-selected",
                    outside && "is-outside",
                  )}
                >
                  <span
                    className={cn(
                      "relative z-10 flex items-center justify-center rounded-full tabular-nums",
                      showingDesktop
                        ? "size-[1.7rem] text-[13px]"
                        : "size-5 text-[11px]",
                      isToday &&
                        "bg-[var(--ink)] font-semibold text-[var(--panel)]",
                      !isToday &&
                        isSelected &&
                        "font-semibold text-[var(--ink)]",
                      !isToday &&
                        !isSelected &&
                        outside &&
                        "text-[var(--muted)]/40",
                      !isToday &&
                        !isSelected &&
                        !outside &&
                        weekend &&
                        "text-rose-400",
                      !isToday &&
                        !isSelected &&
                        !outside &&
                        !weekend &&
                        "text-[var(--ink)]",
                    )}
                  >
                    {day.getDate()}
                  </span>
                  {hiddenOnDay > 0 ? (
                    <span
                      className={cn(
                        "cal-tt-more",
                        !showingDesktop && "is-corner",
                      )}
                    >
                      +{hiddenOnDay}
                    </span>
                  ) : null}
                </button>
              );
            })}

            <div
              className="pointer-events-none absolute inset-x-0"
              style={{
                top: density.dayNumHeight,
                height: shown * (density.laneHeight + density.laneGap),
              }}
            >
              {visibleSegs.map((seg) => {
                const left = `calc(${(seg.startCol / 7) * 100}% + 2px)`;
                const width = `calc(${(seg.span / 7) * 100}% - 4px)`;
                const top = seg.lane * (density.laneHeight + density.laneGap);
                const radiusLeft = seg.continuesLeft ? "4px" : "6px";
                const radiusRight = seg.continuesRight ? "4px" : "6px";
                const vacant =
                  seg.item.type === "quote" &&
                  (seg.item.quote.staffVacantCount ?? 0) > 0;
                const staffHint =
                  seg.item.type === "quote"
                    ? quoteStaffHint(seg.item.quote)
                    : "";
                const barKind = calendarItemBarKind(seg.item);
                const startOutside = week[seg.startCol]!.getMonth() !== month;
                const endOutside =
                  week[seg.startCol + seg.span - 1]!.getMonth() !== month;
                const segKey = `${seg.item.type}-${seg.item.id}-${weekIdx}-${seg.startCol}`;
                const segClass = cn(
                  "cal-bar absolute truncate px-1.5 text-left font-medium",
                  barKind || "text-white",
                  vacant && "cal-event-vacant",
                );
                const segStyle = {
                  left,
                  width,
                  top,
                  height: density.laneHeight,
                  lineHeight: `${density.laneHeight}px`,
                  fontSize: barFont,
                  background: barKind ? undefined : seg.item.color,
                  borderRadius: `${radiusLeft} ${radiusRight} ${radiusRight} ${radiusLeft}`,
                  opacity: startOutside && endOutside ? 0.45 : 1,
                };
                const segTitle = `${seg.item.subtitle} · ${seg.item.label}${staffHint ? ` · ${staffHint}` : ""}`;
                if (!showingDesktop) {
                  return (
                    <span
                      key={segKey}
                      className={segClass}
                      style={segStyle}
                      title={segTitle}
                    >
                      {seg.item.label}
                    </span>
                  );
                }
                return (
                  <button
                    key={segKey}
                    type="button"
                    className={`pointer-events-auto ${segClass}`}
                    style={segStyle}
                    title={segTitle}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenItem(seg.item, startOfDay(week[seg.startCol]!));
                    }}
                  >
                    {seg.item.label}
                  </button>
                );
              })}
            </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CalendarView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const role = session?.user?.role;
  const { overrides } = usePermissions();
  const canCreate = canOpenCalendarCreateMenu(role, overrides);
  const { showingDesktop } = useLayoutDensity();
  const weeksRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef<HTMLDivElement>(null);
  const swipeTxRef = useRef(0);
  const [swipeTx, setSwipeTx] = useState(0);
  const [swipeSettle, setSwipeSettle] = useState(false);
  const [fitLanes, setFitLanes] = useState(DENSITY_TIMETREE_DESKTOP.maxLanes);
  const [mobileLaneHeight, setMobileLaneHeight] = useState(
    DENSITY_TIMETREE.laneHeight,
  );

  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [viewReady, setViewReady] = useState(false);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [entries, setEntries] = useState<CalendarEntryRow[]>([]);
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(null);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [dayPanelOpen, setDayPanelOpen] = useState(false);
  const [peekReturnToDay, setPeekReturnToDay] = useState(false);
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
      const stored = readStoredCalendarView();
      if (stored) {
        setCursor(stored.cursor);
        setSelectedDay(stored.selectedDay);
      }
    } catch {
      /* ignore */
    }
    setViewReady(true);
  }, []);

  useEffect(() => {
    if (!viewReady) return;
    persistCalendarView({ cursor, selectedDay });
  }, [viewReady, cursor, selectedDay]);

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
    addDays(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1), -7),
  );
  const to = formatDateKey(
    addDays(new Date(cursor.getFullYear(), cursor.getMonth() + 2, 0), 7),
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
    if (!viewReady) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when month window changes
  }, [from, to, viewReady]);

  useEffect(() => {
    document.documentElement.classList.add("cal-lock-x");
    return () => document.documentElement.classList.remove("cal-lock-x");
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (form || createMenu) return;
      if (openQuoteId || openEntryId) {
        closeEventPeek();
        return;
      }
      if (dayPanelOpen) closePeek();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // closePeek/closeEventPeek close over current flags
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, createMenu, openQuoteId, openEntryId, dayPanelOpen, peekReturnToDay, searchParams, router]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const items = useMemo<CalItem[]>(() => {
    const list: CalItem[] = [];
    for (const q of quotes) {
      const status = calendarQuoteStatus(q);
      if (!filters.lifecycles[status]) continue;
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
        color: calendarStatusColor(status),
        subtitle: quoteBriefPreview(q.brief),
      });
    }
    for (const e of entries) {
      if (!filters.kinds[e.kind]) continue;
      const start = parseEventDate(e.date);
      if (!start) continue;
      const day = startOfDay(start);
      const days = Math.max(1, e.durationDays || 1);
      list.push({
        type: "entry",
        id: e.id,
        entry: e,
        start: day,
        end: addDays(day, days - 1),
        label: entryLabel(e),
        color: ENTRY_KIND_COLORS[e.kind],
        subtitle: ENTRY_KIND_LABELS[e.kind],
      });
    }
    return list;
  }, [quotes, entries, filters]);

  const pages = useMemo(() => {
    return [-1, 0, 1].map((delta) => {
      const d = new Date(year, month + delta, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const monthWeeks = buildWeeks(y, m);
      return {
        key: `${y}-${m}`,
        year: y,
        month: m,
        layouts: monthWeeks.map((week) => ({
          week,
          segs: segmentsForWeek(week, items),
        })),
      };
    });
  }, [year, month, items]);
  const weeks = pages[1]?.layouts.map((p) => p.week) ?? [];

  const todayKey = formatDateKey(new Date());
  const selectedKey = formatDateKey(selectedDay);
  const selectedItems = useMemo(
    () => itemsOnDay(items, selectedDay),
    [items, selectedDay],
  );

  function jumpTo(nextYear: number, nextMonth: number) {
    const next = new Date(nextYear, nextMonth, 1);
    setCursor(next);
    const t = startOfDay(new Date());
    if (
      t.getFullYear() === next.getFullYear() &&
      t.getMonth() === next.getMonth()
    ) {
      setSelectedDay(t);
    } else {
      setSelectedDay(next);
    }
  }

  function shiftMonth(delta: number) {
    jumpTo(year, month + delta);
  }
  const shiftMonthRef = useRef(shiftMonth);
  shiftMonthRef.current = shiftMonth;

  function shiftSelectedDay(delta: -1 | 1) {
    const next = addDays(selectedDay, delta);
    setSelectedDay(next);
    if (
      next.getFullYear() !== cursor.getFullYear() ||
      next.getMonth() !== cursor.getMonth()
    ) {
      setCursor(new Date(next.getFullYear(), next.getMonth(), 1));
    }
  }

  function goToday() {
    const t = startOfDay(new Date());
    setCursor(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedDay(t);
    setOpenQuoteId(null);
    setOpenEntryId(null);
    setPeekReturnToDay(true);
    setDayPanelOpen(true);
  }

  function closePeek() {
    setDayPanelOpen(false);
    setOpenQuoteId(null);
    setOpenEntryId(null);
    setPeekReturnToDay(false);
    if (searchParams.get("quote")) {
      router.replace("/calendar", { scroll: false });
    }
  }

  function closeEventPeek() {
    setOpenQuoteId(null);
    setOpenEntryId(null);
    if (searchParams.get("quote")) {
      router.replace("/calendar", { scroll: false });
    }
    if (peekReturnToDay) setDayPanelOpen(true);
    else setDayPanelOpen(false);
  }

  function openItem(item: CalItem, fromDayList = false) {
    setCreateMenu(null);
    setPeekReturnToDay(fromDayList);
    if (item.type === "quote") {
      setOpenEntryId(null);
      setOpenQuoteId(item.id);
    } else {
      setOpenQuoteId(null);
      setOpenEntryId(item.id);
    }
  }

  function onDayClick(day: Date) {
    const start = startOfDay(day);
    setSelectedDay(start);
    setCreateMenu(null);
    setOpenQuoteId(null);
    setOpenEntryId(null);
    setPeekReturnToDay(true);
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
  const density: CalendarDensity = showingDesktop
    ? { ...tt, maxLanes: fitLanes }
    : { ...tt, maxLanes: 6, laneHeight: mobileLaneHeight };
  const barFont = showingDesktop ? 12 : mobileLaneHeight >= 16 ? 11 : 10;

  useLayoutEffect(() => {
    const grid = weeksRef.current;
    if (!grid) return;
    const weekCount = CALENDAR_WEEK_ROWS;
    const laneDensity = showingDesktop
      ? DENSITY_TIMETREE_DESKTOP
      : DENSITY_TIMETREE;
    function measure() {
      const h = grid!.clientHeight;
      if (weekCount <= 0 || h <= 0) return;
      const cell = h / weekCount;
      if (showingDesktop) {
        setFitLanes(lanesThatFit(cell, laneDensity));
        return;
      }
      setMobileLaneHeight(
        laneHeightToFit(cell, laneDensity, 6, {
          min: MOBILE_LANE_MIN,
          max: MOBILE_LANE_MAX,
        }),
      );
    }
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(grid);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", measure);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      vv?.removeEventListener("resize", measure);
      window.removeEventListener("resize", measure);
    };
  }, [showingDesktop]);

  useEffect(() => {
    const pane = swipeRef.current;
    if (!pane) return;
    const start = { x: 0, y: 0, t: 0, id: 0 };
    let axis: "x" | "y" | null = null;
    let dragging = false;
    let pending = 0;
    let ignoreClick = false;

    function setTx(next: number) {
      swipeTxRef.current = next;
      setSwipeTx(next);
    }

    function onDown(e: PointerEvent) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (pending) return;
      start.x = e.clientX;
      start.y = e.clientY;
      start.t = e.timeStamp;
      start.id = e.pointerId;
      axis = null;
      dragging = true;
      ignoreClick = false;
      setSwipeSettle(false);
    }

    function onMove(e: PointerEvent) {
      if (!dragging || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (!axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        if (axis === "x") {
          ignoreClick = true;
          pane!.setPointerCapture(e.pointerId);
        }
      }
      if (axis !== "x") return;
      e.preventDefault();
      setTx(dx);
    }

    function finish(e: PointerEvent) {
      if (!dragging || e.pointerId !== start.id) return;
      dragging = false;
      if (axis !== "x") {
        axis = null;
        return;
      }
      const dx = e.clientX - start.x;
      const dt = Math.max(1, e.timeStamp - start.t);
      const width = pane!.clientWidth || 1;
      const delta = swipeMonthDelta(dx, width, dx / dt);
      axis = null;
      if (delta === 0) {
        setSwipeSettle(true);
        setTx(0);
        return;
      }
      pending = delta;
      setSwipeSettle(true);
      setTx(-delta * width);
    }

    function onEnd(e: PointerEvent) {
      finish(e);
    }

    function onTransitionEnd(e: TransitionEvent) {
      if (e.propertyName !== "transform") return;
      if (!pending) {
        setSwipeSettle(false);
        return;
      }
      const dir = pending;
      pending = 0;
      setSwipeSettle(false);
      setTx(0);
      shiftMonthRef.current(dir);
    }

    function onClick(e: Event) {
      if (!ignoreClick) return;
      ignoreClick = false;
      e.preventDefault();
      e.stopPropagation();
    }

    pane.addEventListener("pointerdown", onDown);
    pane.addEventListener("pointermove", onMove, { passive: false });
    pane.addEventListener("pointerup", onEnd);
    pane.addEventListener("pointercancel", onEnd);
    pane.addEventListener("transitionend", onTransitionEnd);
    pane.addEventListener("click", onClick, true);
    return () => {
      pane.removeEventListener("pointerdown", onDown);
      pane.removeEventListener("pointermove", onMove);
      pane.removeEventListener("pointerup", onEnd);
      pane.removeEventListener("pointercancel", onEnd);
      pane.removeEventListener("transitionend", onTransitionEnd);
      pane.removeEventListener("click", onClick, true);
    };
  }, []);

  const weekdayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const desktopPeekOpen =
    showingDesktop && (dayPanelOpen || !!openQuoteId || !!openEntryId);
  const dashVisible = dashOpen;

  const monthNav = (
    <div className="flex shrink-0 items-center gap-1.5">
      <Button type="button" variant="ghost" size="sm" onClick={goToday}>
        Сегодня
      </Button>
      {showingDesktop ? (
        <>
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
        </>
      ) : null}
    </div>
  );

  const peekEvent = (
    <>
      {openQuoteId ? (
        <ProjectModal
          open
          quoteId={openQuoteId}
          embedded
          onClose={closeEventPeek}
          onChanged={reload}
          onCopied={(id) => {
            setOpenQuoteId(id);
            reload();
          }}
        />
      ) : openEntryId ? (
        <CalendarEntryModal
          open
          entryId={openEntryId}
          embedded
          onClose={closeEventPeek}
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
      ) : dayPanelOpen ? (
        <DayAgenda
          date={selectedDay}
          items={selectedItems}
          canCreate={canCreate}
          onOpen={(item) => openItem(item, true)}
          onAdd={openCreate}
          onClose={closePeek}
          headingId="cal-day-title"
        />
      ) : null}
    </>
  );

  return (
    <div className="cal-page w-full">
      <header
        className={cn(
          "flex shrink-0 items-center justify-between gap-2 py-1 md:py-2",
          showingDesktop ? "px-1" : "px-3",
        )}
      >
        <CalendarMonthYearJump year={year} month={month} onJump={jumpTo} />
        {monthNav}
      </header>

      <div
        className={cn(
          "cal-filters flex shrink-0 items-center gap-y-1",
          showingDesktop ? "flex-wrap gap-x-3 px-1 pb-1.5" : "gap-x-1 px-2 pb-1",
        )}
        role="group"
        aria-label="Фильтры календаря"
      >
        {LIFE_FILTERS.map((status) => (
          <FilterChip
            key={status}
            label={LIFECYCLE_LABELS[status]}
            color={calendarStatusColor(status)}
            active={filters.lifecycles[status]}
            onToggle={() => toggleLifecycle(status)}
            showLabel={showingDesktop}
            outlined={status === "CALCULATED"}
          />
        ))}
        {KIND_FILTERS.map((kind) => (
          <FilterChip
            key={kind}
            label={KIND_FILTER_LABELS[kind]}
            color={ENTRY_KIND_COLORS[kind]}
            active={filters.kinds[kind]}
            onToggle={() => toggleKind(kind)}
            showLabel={showingDesktop}
          />
        ))}
      </div>

      <div className="cal-tt">
        <div className="cal-tt-main">
        {showingDesktop ? (
          <div className="cal-dash-host pointer-events-none absolute inset-0 z-20 overflow-hidden">
            <div className="sticky top-[calc(var(--app-topbar-height)+0.75rem)] mr-auto w-[19.5rem]">
              <aside
                className={cn(
                  "cal-dash-overlay",
                  !dashVisible && "is-closed",
                  dashMotion && "is-motion",
                )}
                onTransitionEnd={(e) => {
                  if (e.propertyName === "transform") setDashMotion(false);
                }}
              >
                <CalendarDashboard
                  onOpenQuote={(id) => {
                    setPeekReturnToDay(false);
                    setDayPanelOpen(false);
                    setOpenEntryId(null);
                    setOpenQuoteId(id);
                  }}
                  onOpenEntry={(id) => {
                    setPeekReturnToDay(false);
                    setDayPanelOpen(false);
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
        <div className="cal-tt-weekdays flex">
          <div className="cal-tt-weeknum" aria-hidden />
          <div className="grid min-w-0 flex-1 grid-cols-7">
            {weekdayLabels.map((d, i) => (
              <div
                key={d}
                className={cn(
                  showingDesktop ? "py-1.5" : "py-0.5",
                  "text-center text-caption font-medium uppercase tracking-wider",
                  i >= 5 ? "text-rose-400" : "text-[var(--muted)]",
                )}
              >
                {d}
              </div>
            ))}
          </div>
        </div>

        <div
          ref={swipeRef}
          className="cal-tt-swipe"
        >
          <div
            className={cn("cal-tt-swipe-track", swipeSettle && "is-settle")}
            style={{
              transform: `translate3d(calc(-33.333333% + ${swipeTx}px), 0, 0)`,
            }}
          >
            {pages.map((page) => (
              <div key={page.key} className="cal-tt-swipe-page">
                <MonthWeeks
                  layouts={page.layouts}
                  month={page.month}
                  density={density}
                  showingDesktop={showingDesktop}
                  todayKey={todayKey}
                  selectedKey={selectedKey}
                  barFont={barFont}
                  weeksRef={page.month === month && page.year === year ? weeksRef : undefined}
                  onDayClick={onDayClick}
                  onOpenItem={(item, day) => {
                    setSelectedDay(day);
                    openItem(item);
                  }}
                />
              </div>
            ))}
          </div>
        </div>
        </div>

        {showingDesktop ? (
          <aside
            className={cn("cal-tt-peek", desktopPeekOpen && "is-open")}
            aria-hidden={!desktopPeekOpen}
          >
            <div className="cal-tt-peek-inner">{peekEvent}</div>
          </aside>
        ) : null}
      </div>

      {!showingDesktop ? (
        <SideDrawer
          open={dayPanelOpen}
          onClose={closePeek}
          closeOnEscape={!openQuoteId && !openEntryId}
          labelledBy="cal-day-title"
          className="calendar-sheet"
        >
          <DayAgenda
            date={selectedDay}
            items={selectedItems}
            allItems={items}
            canCreate={canCreate}
            onOpen={(item) => openItem(item, true)}
            onAdd={openCreate}
            onClose={closePeek}
            onShiftDay={shiftSelectedDay}
            headingId="cal-day-title"
          />
        </SideDrawer>
      ) : null}

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

      {!showingDesktop ? (
        <>
          <CalendarEntryModal
            open={!!openEntryId}
            entryId={openEntryId}
            onClose={closeEventPeek}
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
            onClose={closeEventPeek}
            onChanged={reload}
            onCopied={(id) => {
              setOpenQuoteId(id);
              reload();
            }}
          />
        </>
      ) : null}
    </div>
  );
}
