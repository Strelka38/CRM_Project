"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  CalendarEntryFormModal,
  type CalendarEntryKind,
} from "@/components/CalendarEntryFormModal";
import { CalendarEntryModal } from "@/components/CalendarEntryModal";
import { useLayoutDensity } from "@/components/LayoutDensityProvider";
import { ProjectModal } from "@/components/ProjectModal";
import { Button, Modal, SideDrawer } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  CATALOG_OWNERS,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import {
  addDays,
  formatDateKey,
  parseEventDate,
  startOfDay,
} from "@/lib/dates";
import { freelancerNamesMatch } from "@/lib/freelancer-directory";
import {
  eventDayIndexForDate,
  eventStartDate,
  eachDateKey,
  groupRosterByEvent,
  groupRosterByKind,
  itemsOnRosterDay,
  packRosterGroupSkyline,
  placeRosterSegOnSkyline,
  isRosterFringeItem,
  personHasRosterRole,
  personMatchesRosterOwners,
  personMatchesSpecialtyFilter,
  rankRosterPeople,
  rosterBarLabel,
  rosterItemPast,
  rosterItemMatchesFirms,
  isVacantInstallerSlot,
  isRosterDutyMark,
  isRosterZoneMark,
  collapseRosterDutyMarks,
  packRosterLanes,
  dateInRosterResizeWindow,
  rosterPersonMatchesQuery,
  rosterSpecialtyFilterForSlot,
  ROSTER_KIND_COLORS,
  ROSTER_KIND_LABELS,
  ROSTER_MOUNT_COLOR,
  type RosterItem,
  type RosterKind,
  type RosterPerson,
  type RosterSpecialtyFilter,
} from "@/lib/roster";
import {
  persistRosterView,
  readStoredRosterView,
} from "@/lib/view-position";

type RosterSeg = {
  item: RosterItem;
  startCol: number;
  span: number;
  lane: number;
  continuesLeft: boolean;
  continuesRight: boolean;
  header?: boolean;
};

type Density = {
  laneHeight: number;
  laneGap: number;
  dayNumHeight: number;
};

const DENSITY_MOBILE: Density = {
  laneHeight: 18,
  laneGap: 3,
  dayNumHeight: 34,
};

const DENSITY_DESKTOP: Density = {
  laneHeight: 20,
  laneGap: 3,
  dayNumHeight: 38,
};

/** Текущая неделя + половина следующей (при зуме 1). */
const BASE_VISIBLE_DAYS = 10;
/** Дни слева вне кадра — длинные мероприятия дольше держат упаковку, подъём позже. */
const LEFT_PACK_BUFFER = 4;
const RIGHT_PACK_BUFFER = 1;
const ROSTER_ZOOM_STORAGE_KEY = "roster.zoom";
const ROSTER_LANE_ZOOM_STORAGE_KEY = "roster.laneZoom";
const ROSTER_ZOOM_MIN = 0.55;
const ROSTER_ZOOM_MAX = 1.7;
const ROSTER_LANE_ZOOM_MIN = 0.7;
const ROSTER_LANE_ZOOM_MAX = 1.55;
const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

function clampRosterZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ROSTER_ZOOM_MAX, Math.max(ROSTER_ZOOM_MIN, Math.round(zoom * 100) / 100));
}

function clampRosterLaneZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(
    ROSTER_LANE_ZOOM_MAX,
    Math.max(ROSTER_LANE_ZOOM_MIN, Math.round(zoom * 100) / 100),
  );
}

function rosterVisibleDaysForZoom(zoom: number): number {
  return Math.round(
    Math.min(18, Math.max(5, BASE_VISIBLE_DAYS / clampRosterZoom(zoom))),
  );
}

function readStoredRosterZoom(): number {
  try {
    const raw = localStorage.getItem(ROSTER_ZOOM_STORAGE_KEY);
    if (raw == null) return 1;
    return clampRosterZoom(Number(raw));
  } catch {
    return 1;
  }
}

function persistRosterZoom(zoom: number): void {
  try {
    localStorage.setItem(ROSTER_ZOOM_STORAGE_KEY, String(clampRosterZoom(zoom)));
  } catch {
    /* ignore */
  }
}

function readStoredRosterLaneZoom(): number {
  try {
    const raw = localStorage.getItem(ROSTER_LANE_ZOOM_STORAGE_KEY);
    if (raw == null) return 1;
    return clampRosterLaneZoom(Number(raw));
  } catch {
    return 1;
  }
}

function persistRosterLaneZoom(zoom: number): void {
  try {
    localStorage.setItem(
      ROSTER_LANE_ZOOM_STORAGE_KEY,
      String(clampRosterLaneZoom(zoom)),
    );
  } catch {
    /* ignore */
  }
}

function densityForLaneZoom(base: Density, zoom: number): Density {
  const z = clampRosterLaneZoom(zoom);
  return {
    laneHeight: Math.max(14, Math.round(base.laneHeight * z)),
    laneGap: Math.max(2, Math.round(base.laneGap * z)),
    dayNumHeight: base.dayNumHeight,
  };
}

const KIND_ORDER: RosterKind[] = ["EVENT", "RENTAL", "TASK"];

const OWNER_CHIP_COLORS: Record<CatalogOwnerValue, string> = {
  SHOW_MASTER: "#0f69b1",
  DIAKOM: "#009ee3",
  NE_EVENT: "#4371ea",
};

type ScheduleConflict = {
  quoteId: string;
  proposalNumber: string;
  eventName: string;
  overlapDates: string[];
};

type DayOffConflict = {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  note: string;
  overlapDates: string[];
};

type CalendarBusyConflict = {
  id: string;
  kind: "RENTAL" | "TASK";
  date: string;
  title: string;
  role: "responsible" | "assignee";
  overlapDates: string[];
};

type DragState =
  | {
      mode: "move";
      itemId: string;
      x: number;
      y: number;
      moved: boolean;
    }
  | {
      mode: "user";
      userId: string;
      kind: "staff" | "freelancer";
      name: string;
      x: number;
      y: number;
      moved: boolean;
    }
  | {
      mode: "resize";
      itemId: string;
      edge: "start" | "end";
      start: string;
      end: string;
    };

function FilterChip({
  label,
  color,
  active,
  onToggle,
  title,
}: {
  label: string;
  color: string;
  active: boolean;
  onToggle: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
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

function startOfWeekMonday(d: Date) {
  const day = startOfDay(d);
  return addDays(day, -((day.getDay() + 6) % 7));
}

function buildDayRange(start: Date, count: number): Date[] {
  const s = startOfDay(start);
  return Array.from({ length: count }, (_, i) => addDays(s, i));
}

function formatRosterRange(start: Date, end: Date) {
  const sameMonth =
    start.getMonth() === end.getMonth() &&
    start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    return `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric",
    })}`;
  }
  const from = start.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
  });
  const to = end.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${from} – ${to}`;
}

function assignLanes(segs: Omit<RosterSeg, "lane">[]): RosterSeg[] {
  return packRosterLanes(segs);
}

function groupKey(item: RosterItem): string {
  return item.quoteId || item.entryId || item.title || item.id;
}

function colRangeOf(group: Array<{ startCol: number; span: number }>) {
  const startCol = Math.min(...group.map((s) => s.startCol));
  const endExclusive = Math.max(...group.map((s) => s.startCol + s.span));
  return { startCol, endExclusive };
}

function appendGroupedLanes(
  out: RosterSeg[],
  segs: Omit<RosterSeg, "lane">[],
  colHeight: number[],
) {
  if (segs.length === 0) return;
  const groups = new Map<string, Omit<RosterSeg, "lane">[]>();
  for (const seg of segs) {
    const key = groupKey(seg.item);
    const list = groups.get(key) || [];
    list.push(seg);
    groups.set(key, list);
  }
  const ordered = [...groups.entries()].sort((a, b) => {
    const aCore = a[1].filter((s) => !isRosterFringeItem(s.item));
    const bCore = b[1].filter((s) => !isRosterFringeItem(s.item));
    const aRange = colRangeOf(aCore.length ? aCore : a[1]);
    const bRange = colRangeOf(bCore.length ? bCore : b[1]);
    if (aRange.startCol !== bRange.startCol) {
      return aRange.startCol - bRange.startCol;
    }
    const aSpan = aRange.endExclusive - aRange.startCol;
    const bSpan = bRange.endExclusive - bRange.startCol;
    if (aSpan !== bSpan) return bSpan - aSpan;
    const aTitle = a[1][0]?.item.title || "";
    const bTitle = b[1][0]?.item.title || "";
    return aTitle.localeCompare(bTitle, "ru");
  });

  for (const [, group] of ordered) {
    const core = group.filter((s) => !isRosterFringeItem(s.item));
    const fringe = group.filter((s) => isRosterFringeItem(s.item));
    // Шапка + слоты — одна горизонтальная плоскость (общий offset).
    // Монтаж/демонтаж — бахрома, не расширяет прямоугольник.
    if (core.length > 0) {
      const { startCol, endExclusive } = colRangeOf(core);
      const laid = assignLanes(core);
      const width = Math.max(0, endExclusive - startCol);
      const columnHeights = Array.from({ length: width }, () => 1);
      for (const s of laid) {
        for (let c = s.startCol; c < s.startCol + s.span; c++) {
          const idx = c - startCol;
          if (idx < 0 || idx >= width) continue;
          columnHeights[idx] = Math.max(columnHeights[idx]!, 2 + s.lane);
        }
      }
      const offset = packRosterGroupSkyline(
        { startCol, endExclusive, columnHeights },
        colHeight,
      );
      const sample = core[0]!;
      out.push({
        item: {
          ...sample.item,
          id: `hdr:${groupKey(sample.item)}`,
          vacant: false,
          resizable: false,
          name: "",
          role: "",
          assignmentIds: [],
        },
        startCol,
        span: endExclusive - startCol,
        continuesLeft: core.some((s) => s.continuesLeft && s.startCol === startCol),
        continuesRight: core.some(
          (s) => s.continuesRight && s.startCol + s.span === endExclusive,
        ),
        lane: offset,
        header: true,
      });
      for (const s of laid) {
        out.push({ ...s, lane: s.lane + offset + 1 });
      }
    } else if (fringe.length > 0) {
      // Только монтаж/демонтаж — шапка в те же дни, общим offset по бахроме.
      const { startCol, endExclusive } = colRangeOf(fringe);
      const width = Math.max(0, endExclusive - startCol);
      const columnHeights = Array.from({ length: width }, () => 1);
      const offset = packRosterGroupSkyline(
        { startCol, endExclusive, columnHeights },
        colHeight,
      );
      const sample = fringe[0]!;
      out.push({
        item: {
          ...sample.item,
          id: `hdr:${groupKey(sample.item)}`,
          vacant: false,
          resizable: false,
          name: "",
          role: "",
          assignmentIds: [],
        },
        startCol,
        span: endExclusive - startCol,
        continuesLeft: false,
        continuesRight: false,
        lane: offset,
        header: true,
      });
    }

    const fringeLaid = [...fringe].sort((a, b) => {
      if (a.startCol !== b.startCol) return a.startCol - b.startCol;
      if (a.span !== b.span) return b.span - a.span;
      return (a.item.role || "").localeCompare(b.item.role || "", "ru");
    });
    for (const seg of fringeLaid) {
      const lane = placeRosterSegOnSkyline(
        { startCol: seg.startCol, span: seg.span },
        colHeight,
      );
      out.push({ ...seg, lane });
    }
  }
}

function assignLanesByKind(segs: Omit<RosterSeg, "lane">[]): RosterSeg[] {
  const out: RosterSeg[] = [];
  const colCount = segs.reduce((m, s) => Math.max(m, s.startCol + s.span), 0);
  const colHeight = Array.from({ length: colCount }, () => 0);
  for (const kind of KIND_ORDER) {
    appendGroupedLanes(
      out,
      segs.filter((s) => s.item.kind === kind),
      colHeight,
    );
  }
  return out;
}

function segmentsForDays(days: Date[], items: RosterItem[]): RosterSeg[] {
  if (days.length === 0) return [];
  const weekDates = days.map((d) => startOfDay(d));
  const first = weekDates[0]!;
  const last = weekDates[weekDates.length - 1]!;
  const raw: Omit<RosterSeg, "lane">[] = [];

  for (const item of items) {
    const start = parseEventDate(item.start);
    const end = parseEventDate(item.end);
    if (!start || !end || end < first || start > last) continue;
    let startCol = -1;
    let endCol = -1;
    for (let c = 0; c < weekDates.length; c++) {
      const day = weekDates[c]!;
      if (day >= startOfDay(start) && day <= startOfDay(end)) {
        if (startCol < 0) startCol = c;
        endCol = c;
      }
    }
    if (startCol < 0 || endCol < 0) continue;
    raw.push({
      item,
      startCol,
      span: endCol - startCol + 1,
      continuesLeft: startOfDay(start) < weekDates[startCol]!,
      continuesRight: startOfDay(end) > weekDates[endCol]!,
    });
  }
  return assignLanesByKind(raw);
}

function weekLaneCount(segs: RosterSeg[]) {
  let maxLane = -1;
  for (const s of segs) if (s.lane > maxLane) maxLane = s.lane;
  return Math.max(2, maxLane + 1);
}

function weekRowHeight(d: Density, segs: RosterSeg[]) {
  return weekLaneCount(segs) * (d.laneHeight + d.laneGap) + 6;
}

function slotRef(item: RosterItem) {
  return {
    source: item.source,
    quoteId: item.quoteId,
    entryId: item.entryId,
    assignmentIds: item.assignmentIds,
    userId: item.userId,
    entryRole: item.id.includes(":resp:")
      ? ("responsible" as const)
      : item.vacant
        ? ("vacant" as const)
        : ("assignee" as const),
    dayIndexStart: item.dayIndexStart,
    dayIndexEnd: item.dayIndexEnd,
    eventDays: item.eventDays,
    mountDuty: item.mountDuty,
  };
}

function hitTarget(x: number, y: number, ignoreId?: string) {
  const stack = document.elementsFromPoint(x, y);
  for (const node of stack) {
    const slotEl = (node as HTMLElement).closest?.("[data-roster-slot]") as
      | HTMLElement
      | null;
    const slotId = slotEl?.dataset.rosterSlot;
    if (slotId && slotId !== ignoreId) return { type: "slot" as const, id: slotId };
  }
  for (const node of stack) {
    const userEl = (node as HTMLElement).closest?.("[data-roster-user]") as
      | HTMLElement
      | null;
    const userId = userEl?.dataset.rosterUser;
    if (userId) {
      const kind =
        userEl.dataset.rosterKind === "freelancer" ? "freelancer" : "staff";
      return { type: "user" as const, userId, kind };
    }
  }
  for (const node of stack) {
    if ((node as HTMLElement).closest?.("[data-roster-unassign]")) {
      return { type: "unassign" as const };
    }
  }
  const dayKey = dateFromPoint(x, y);
  if (dayKey) return { type: "day" as const, dateKey: dayKey };
  return null;
}

function dateFromPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const weekEl = el?.closest("[data-roster-week]") as HTMLElement | null;
  if (weekEl) {
    const keys = (weekEl.dataset.rosterWeek || "").split(",").filter(Boolean);
    const rect = weekEl.getBoundingClientRect();
    if (rect.width > 0 && keys.length > 0) {
      const col = Math.min(
        keys.length - 1,
        Math.max(0, Math.floor(((x - rect.left) / rect.width) * keys.length)),
      );
      return keys[col] ?? null;
    }
  }
  return el?.closest("[data-roster-day]")?.getAttribute("data-roster-day") ?? null;
}

export function RosterView() {
  const { showingDesktop } = useLayoutDensity();
  const [viewStart, setViewStart] = useState(() => startOfWeekMonday(new Date()));
  const [viewReady, setViewReady] = useState(false);
  const [dayZoom, setDayZoom] = useState(1);
  const [laneZoom, setLaneZoom] = useState(1);
  const [panPx, setPanPx] = useState(0);
  const [zoomMotion, setZoomMotion] = useState(false);
  const [items, setItems] = useState<RosterItem[]>([]);
  const [people, setPeople] = useState<RosterPerson[]>([]);
  const [freelancers, setFreelancers] = useState<RosterPerson[]>([]);
  const [peopleKind, setPeopleKind] = useState<"staff" | "freelancer">("staff");
  const [kinds, setKinds] = useState<Record<RosterKind, boolean>>({
    EVENT: true,
    RENTAL: true,
    TASK: true,
  });
  const [ownerFilter, setOwnerFilter] = useState<Record<CatalogOwnerValue, boolean>>({
    SHOW_MASTER: true,
    DIAKOM: true,
    NE_EVENT: true,
  });
  const [showVacantInstallers, setShowVacantInstallers] = useState(true);
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [dayPanelOpen, setDayPanelOpen] = useState(false);
  const [openQuoteId, setOpenQuoteId] = useState<string | null>(null);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  const [entryForm, setEntryForm] = useState<{
    kind: CalendarEntryKind;
    dateKey: string;
    entryId: string;
  } | null>(null);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [specialtyFilter, setSpecialtyFilter] =
    useState<RosterSpecialtyFilter | null>(null);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peopleCursor, setPeopleCursor] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [conflictWarn, setConflictWarn] = useState<{
    userName: string;
    userId: string;
    itemId: string;
    conflicts: ScheduleConflict[];
    dayOffs: DayOffConflict[];
    calendarBusy: CalendarBusyConflict[];
  } | null>(null);
  const [pastConfirm, setPastConfirm] = useState<{
    run: (forcePast: boolean) => Promise<void>;
  } | null>(null);

  function closePeoplePanel() {
    setPeopleOpen(false);
    setSelectedSlotId(null);
    setPeopleQuery("");
    setSpecialtyFilter(null);
  }

  useLayoutEffect(() => {
    const stored = readStoredRosterView();
    if (stored) {
      setViewStart(stored.viewStart);
      setSelectedDay(stored.selectedDay);
    }
    setDayZoom(readStoredRosterZoom());
    setLaneZoom(readStoredRosterLaneZoom());
    setViewReady(true);
  }, []);

  useEffect(() => {
    if (!viewReady) return;
    persistRosterView({ viewStart, selectedDay });
  }, [viewReady, viewStart, selectedDay]);

  useEffect(() => {
    if (!viewReady) return;
    persistRosterZoom(dayZoom);
  }, [viewReady, dayZoom]);

  useEffect(() => {
    if (!viewReady) return;
    persistRosterLaneZoom(laneZoom);
  }, [viewReady, laneZoom]);

  useEffect(() => {
    if (!peopleOpen && !selectedSlotId) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-roster-people]")) return;
      if (t.closest("[data-roster-slot]")) return;
      if (t.closest("[role='dialog']")) return;
      closePeoplePanel();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [peopleOpen, selectedSlotId]);

  const visibleDayCount = rosterVisibleDaysForZoom(dayZoom);
  /** Буфер слева держит упаковку после ухода длинных мероприятий из кадра. */
  const renderDayCount = visibleDayCount + LEFT_PACK_BUFFER + RIGHT_PACK_BUFFER;
  const visibleDays = useMemo(
    () => buildDayRange(addDays(viewStart, -LEFT_PACK_BUFFER), renderDayCount),
    [viewStart, renderDayCount],
  );
  const viewEnd = visibleDays[visibleDays.length - 1 - RIGHT_PACK_BUFFER]!;
  const from = formatDateKey(addDays(viewStart, -21));
  const to = formatDateKey(addDays(viewEnd, 21));
  const earnMonth = (
    items.find((i) => i.id === selectedSlotId)?.start || formatDateKey(viewStart)
  ).slice(0, 7);

  async function reload() {
    const res = await fetch(
      `/api/roster?from=${from}&to=${to}&month=${encodeURIComponent(earnMonth)}`,
    );
    const data = (await res.json().catch(() => null)) as {
      items?: RosterItem[];
      people?: RosterPerson[];
      freelancers?: RosterPerson[];
      error?: string;
    } | null;
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "Не удалось загрузить срост");
      return;
    }
    setItems(Array.isArray(data?.items) ? data.items : []);
    setPeople(Array.isArray(data?.people) ? data.people : []);
    setFreelancers(Array.isArray(data?.freelancers) ? data.freelancers : []);
  }

  useEffect(() => {
    if (!viewReady) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- padded fetch window follows viewStart
  }, [from, to, earnMonth, viewReady]);

  const todayKey = formatDateKey(new Date());
  const selectedKey = formatDateKey(selectedDay);

  const visibleItems = useMemo(() => {
    return collapseRosterDutyMarks(
      items
        .filter((item) => kinds[item.kind])
        .filter((item) => rosterItemMatchesFirms(item, ownerFilter))
        .filter((item) => showVacantInstallers || !isVacantInstallerSlot(item))
        .map((item) => {
          if (drag?.mode === "resize" && drag.itemId === item.id) {
            return { ...item, start: drag.start, end: drag.end };
          }
          return item;
        }),
    );
  }, [items, kinds, ownerFilter, showVacantInstallers, drag]);

  const viewLayout = useMemo(
    () => ({ days: visibleDays, segs: segmentsForDays(visibleDays, visibleItems) }),
    [visibleDays, visibleItems],
  );

  const selectedItems = useMemo(
    () => itemsOnRosterDay(visibleItems, selectedKey),
    [visibleItems, selectedKey],
  );

  const selectedSlot = useMemo(
    () => items.find((i) => i.id === selectedSlotId) || null,
    [items, selectedSlotId],
  );

  const rangeLabel = formatRosterRange(viewStart, viewEnd);

  const rankedPeople = useMemo(() => {
    const source = peopleKind === "freelancer" ? freelancers : people;
    const base = source.filter(
      (p) =>
        rosterPersonMatchesQuery(p, peopleQuery) &&
        (peopleKind === "freelancer" ||
          personMatchesRosterOwners(p, ownerFilter)),
    );
    let pool = base;
    if (specialtyFilter) {
      pool = base.filter((p) =>
        personMatchesSpecialtyFilter(p, specialtyFilter),
      );
    }
    const dates = selectedSlot
      ? eachDateKey(selectedSlot.start, selectedSlot.end)
      : [selectedKey];
    return rankRosterPeople(pool, dates);
  }, [people, freelancers, peopleKind, peopleQuery, specialtyFilter, selectedSlot, selectedKey, ownerFilter]);

  function shiftDays(delta: number) {
    panPxRef.current = 0;
    setPanPx(0);
    setViewStart((prev) => addDays(prev, delta));
  }

  function goToday() {
    const t = startOfDay(new Date());
    panPxRef.current = 0;
    setPanPx(0);
    setViewStart(startOfWeekMonday(t));
    setSelectedDay(t);
    if (showingDesktop) setDayPanelOpen(true);
  }

  function nudgeZoom(dir: 1 | -1) {
    setZoomMotion(true);
    setDayZoom((z) => clampRosterZoom(z + dir * 0.12));
    panPxRef.current = 0;
    setPanPx(0);
  }

  function nudgeLaneZoom(dir: 1 | -1) {
    setZoomMotion(true);
    setLaneZoom((z) => clampRosterLaneZoom(z + dir * 0.1));
  }

  const viewRef = useRef<HTMLDivElement>(null);
  const panPxRef = useRef(0);
  const panRafRef = useRef(0);
  const zoomAccRef = useRef(0);
  const peopleSearchRef = useRef<HTMLInputElement>(null);
  const peopleListRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!peopleOpen) return;
    peopleSearchRef.current?.focus();
  }, [peopleOpen, selectedSlotId]);
  useEffect(() => {
    if (!peopleOpen) return;
    setPeopleCursor(0);
  }, [peopleOpen, selectedSlotId, peopleQuery, specialtyFilter, ownerFilter, peopleKind]);
  useEffect(() => {
    if (peopleCursor < rankedPeople.length) return;
    setPeopleCursor(Math.max(0, rankedPeople.length - 1));
  }, [rankedPeople.length, peopleCursor]);
  useEffect(() => {
    if (!peopleOpen) return;
    const id = rankedPeople[peopleCursor]?.person.id;
    if (!id) return;
    const root = peopleListRef.current;
    const el = root?.querySelector(`[data-roster-user="${id}"]`);
    if (el instanceof HTMLElement) el.scrollIntoView({ block: "nearest" });
  }, [peopleCursor, peopleOpen, rankedPeople]);
  useEffect(() => {
    if (!zoomMotion) return;
    const t = window.setTimeout(() => setZoomMotion(false), 80);
    return () => window.clearTimeout(t);
  }, [zoomMotion, dayZoom, laneZoom]);

  useEffect(() => {
    const el = viewRef.current;
    if (!el) return;

    const flushPan = () => {
      panRafRef.current = 0;
      setPanPx(panPxRef.current);
    };

    const onWheel = (e: WheelEvent) => {
      // Pinch / ctrl+wheel — зум числа дней.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setZoomMotion(true);
        zoomAccRef.current += -e.deltaY * 0.0015;
        if (Math.abs(zoomAccRef.current) < 0.01) return;
        const step = zoomAccRef.current;
        zoomAccRef.current = 0;
        panPxRef.current = 0;
        setPanPx(0);
        setDayZoom((z) => clampRosterZoom(z + step));
        return;
      }

      const absX = Math.abs(e.deltaX);
      const absY = Math.abs(e.deltaY);
      const horizontal = absX > absY || e.shiftKey;
      if (!horizontal) return;

      e.preventDefault();
      const raw = e.shiftKey ? e.deltaY : e.deltaX;
      if (raw === 0) return;

      const dayW = Math.max(24, el.clientWidth / Math.max(1, visibleDayCount));
      let next = panPxRef.current + raw;
      let shift = 0;
      while (next >= dayW) {
        next -= dayW;
        shift += 1;
      }
      while (next <= -dayW) {
        next += dayW;
        shift -= 1;
      }
      panPxRef.current = next;
      if (shift !== 0) {
        setViewStart((prev) => addDays(prev, shift));
      }
      if (!panRafRef.current) {
        panRafRef.current = requestAnimationFrame(flushPan);
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (panRafRef.current) cancelAnimationFrame(panRafRef.current);
    };
  }, [visibleDayCount]);

  function openItem(item: RosterItem) {
    selectSlot(item);
  }

  function confirmIfPast(
    involved: RosterItem[],
    run: (forcePast: boolean) => Promise<void>,
  ) {
    if (!involved.some((item) => rosterItemPast(item))) {
      void run(false);
      return;
    }
    setPastConfirm({ run });
  }

  function selectSlot(item: RosterItem) {
    if (isRosterZoneMark(item)) {
      if (item.quoteId) setOpenQuoteId(item.quoteId);
      return;
    }
    setSelectedSlotId(item.id);
    setPeopleQuery("");
    setSpecialtyFilter(rosterSpecialtyFilterForSlot(item));
    setPeopleOpen(true);
    setDayPanelOpen(false);
    setError("");
  }

  async function unassignItem(item: RosterItem) {
    if (item.vacant) return;
    confirmIfPast([item], async (forcePast) => {
      await postMove({
        source: { type: "slot", slot: slotRef(item) },
        target: { type: "unassign" },
        forcePast,
      });
    });
  }

  async function assignPersonToItem(
    person: RosterPerson,
    item: RosterItem,
    force = false,
    forcePast = false,
  ) {
    if (item.userId && person.kind !== "freelancer" && item.userId === person.id) {
      closePeoplePanel();
      return;
    }
    if (
      person.kind === "freelancer" &&
      item.freelancer &&
      freelancerNamesMatch(item.name, person.name)
    ) {
      closePeoplePanel();
      return;
    }
    if (person.kind === "freelancer" && item.source !== "quote") {
      setError("Фрилансера можно назначить только на слот сметы");
      return;
    }
    if (rosterItemPast(item) && !forcePast) {
      setPastConfirm({
        run: (nextForce) => assignPersonToItem(person, item, force, nextForce),
      });
      return;
    }
    if (!personHasRosterRole(person, item)) {
      setError(
        `У ${person.name} нет специальности «${item.role || "должность"}»`,
      );
      return;
    }
    if (item.quoteId && person.kind !== "freelancer" && !force) {
      setBusy(true);
      try {
        const checkRes = await fetch(
          `/api/quotes/${item.quoteId}/assignments/conflicts?userId=${encodeURIComponent(person.id)}`,
        );
        if (checkRes.ok) {
          const data = (await checkRes.json()) as {
            conflicts?: ScheduleConflict[];
            dayOffs?: DayOffConflict[];
            calendarBusy?: CalendarBusyConflict[];
          };
          const conflicts = data.conflicts || [];
          const dayOffs = data.dayOffs || [];
          const calendarBusy = data.calendarBusy || [];
          if (conflicts.length || dayOffs.length || calendarBusy.length) {
            setConflictWarn({
              userName: person.name,
              userId: person.id,
              itemId: item.id,
              conflicts,
              dayOffs,
              calendarBusy,
            });
            return;
          }
        }
      } finally {
        setBusy(false);
      }
    }
    await postMove({
      source:
        person.kind === "freelancer"
          ? { type: "freelancer", freelancerId: person.id }
          : { type: "user", userId: person.id },
      target: { type: "slot", slot: slotRef(item) },
      forcePast,
    });
    setConflictWarn(null);
    closePeoplePanel();
  }

  async function postMove(body: unknown) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/roster/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(
          typeof data?.error === "string" ? data.error : "Не удалось перенести",
        );
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function postSpan(
    item: RosterItem,
    fromDay: number,
    toDay: number,
    forcePast = false,
  ) {
    if (!item.quoteId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/roster/span", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId: item.quoteId,
          assignmentIds: item.assignmentIds,
          fromDay,
          toDay,
          forcePast,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(
          typeof data?.error === "string" ? data.error : "Не удалось растянуть слот",
        );
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  function onBarPointerDown(e: ReactPointerEvent, item: RosterItem) {
    if (e.button !== 0 || isRosterZoneMark(item)) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      mode: "move",
      itemId: item.id,
      x: e.clientX,
      y: e.clientY,
      moved: false,
    });
  }

  function onHandlePointerDown(
    e: ReactPointerEvent,
    item: RosterItem,
    edge: "start" | "end",
  ) {
    if (e.button !== 0 || !item.resizable || item.vacant) {
      return;
    }
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      mode: "resize",
      itemId: item.id,
      edge,
      start: item.start,
      end: item.end,
    });
  }

  function onUserPointerDown(e: ReactPointerEvent, person: RosterPerson) {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({
      mode: "user",
      userId: person.id,
      kind: person.kind === "freelancer" ? "freelancer" : "staff",
      name: person.name,
      x: e.clientX,
      y: e.clientY,
      moved: false,
    });
  }

  function onPointerMove(e: ReactPointerEvent) {
    if (!drag) return;
    if (drag.mode === "resize") {
      const dayKey = dateFromPoint(e.clientX, e.clientY);
      if (!dayKey) return;
      const item = items.find((i) => i.id === drag.itemId);
      if (!item?.eventStart) return;
      if (!dateInRosterResizeWindow(item, dayKey)) return;
      if (!parseEventDate(dayKey)) return;
      if (drag.edge === "start") {
        if (dayKey > drag.end) return;
        setDrag({ ...drag, start: dayKey });
      } else {
        if (dayKey < drag.start) return;
        setDrag({ ...drag, end: dayKey });
      }
      return;
    }

    const moved =
      drag.moved ||
      Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 5;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, moved });
    if (!moved) return;
    const ignore = drag.mode === "move" ? drag.itemId : undefined;
    const hit = hitTarget(e.clientX, e.clientY, ignore);
    setDropHint(
      hit?.type === "slot"
        ? hit.id
        : hit?.type === "day"
          ? `day:${hit.dateKey}`
          : hit?.type === "unassign" || hit?.type === "user"
            ? "unassign"
            : null,
    );
  }

  async function onPointerUp(e: ReactPointerEvent) {
    if (!drag) return;
    const current = drag;
    setDrag(null);
    setDropHint(null);

    if (current.mode === "resize") {
      const item = items.find((i) => i.id === current.itemId);
      if (!item?.eventStart || !item.quoteId || item.vacant) {
        return;
      }
      const start = eventStartDate({ eventDate: item.eventStart });
      if (!start) return;
      const eventEnd = addDays(start, Math.max(1, item.eventDays) - 1);
      const spanStart = parseEventDate(current.start);
      const spanEnd = parseEventDate(current.end);
      const fromDay = eventDayIndexForDate(
        start,
        item.eventDays,
        spanStart && spanStart > start ? spanStart : start,
      );
      const toDay = eventDayIndexForDate(
        start,
        item.eventDays,
        spanEnd && spanEnd < eventEnd ? spanEnd : eventEnd,
      );
      if (
        fromDay == null ||
        toDay == null ||
        (item.start === formatDateKey(addDays(start, fromDay - 1)) &&
          item.end === formatDateKey(addDays(start, toDay - 1)))
      ) {
        return;
      }
      confirmIfPast([item], async (forcePast) => {
        await postSpan(item, fromDay, toDay, forcePast);
      });
      return;
    }

    if (!current.moved) {
      if (current.mode === "move") {
        const item = items.find((i) => i.id === current.itemId);
        if (item) selectSlot(item);
      }
      return;
    }

    const ignore = current.mode === "move" ? current.itemId : undefined;
    const hit = hitTarget(e.clientX, e.clientY, ignore);
    if (!hit) return;

    if (current.mode === "user") {
      if (hit.type !== "slot") return;
      const target = items.find((i) => i.id === hit.id);
      if (!target) return;
      const pool = current.kind === "freelancer" ? freelancers : people;
      const person = pool.find((p) => p.id === current.userId);
      if (!person) return;
      await assignPersonToItem(person, target);
      return;
    }

    const source = items.find((i) => i.id === current.itemId);
    if (!source || source.vacant) return;
    if (hit.type === "slot") {
      const target = items.find((i) => i.id === hit.id);
      if (!target || target.id === source.id) return;
      confirmIfPast([source, target], async (forcePast) => {
        await postMove({
          source: { type: "slot", slot: slotRef(source) },
          target: { type: "slot", slot: slotRef(target) },
          forcePast,
        });
      });
      return;
    }
    if (hit.type === "user") {
      confirmIfPast([source], async (forcePast) => {
        await postMove({
          source:
            hit.kind === "freelancer"
              ? { type: "freelancer", freelancerId: hit.userId }
              : { type: "user", userId: hit.userId },
          target: { type: "slot", slot: slotRef(source) },
          forcePast,
        });
      });
      return;
    }
    if (hit.type === "unassign") {
      await unassignItem(source);
      return;
    }
    confirmIfPast([source], async (forcePast) => {
      await postMove({
        source: { type: "slot", slot: slotRef(source) },
        target: { type: "day", dateKey: hit.dateKey },
        forcePast,
      });
    });
  }

  const tt = densityForLaneZoom(
    showingDesktop ? DENSITY_DESKTOP : DENSITY_MOBILE,
    laneZoom,
  );
  const barFont = showingDesktop ? 11 : 10;
  const colCount = visibleDays.length;
  const weekStart = startOfWeekMonday(viewStart);
  const nextWeekFrom = addDays(weekStart, 7);
  const viewSegs = viewLayout.segs;
  const lanes = weekLaneCount(viewSegs);
  const rowH = weekRowHeight(tt, viewSegs);
  const dragSource = drag?.mode === "move"
    ? items.find((i) => i.id === drag.itemId)
    : null;
  const dragLabel =
    drag?.mode === "user"
      ? drag.name
      : dragSource
        ? rosterBarLabel(dragSource)
        : null;

  const highlightedPersonId = rankedPeople[peopleCursor]?.person.id ?? null;

  function onPeopleKeyDown(e: ReactKeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      closePeoplePanel();
      return;
    }
    if (rankedPeople.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPeopleCursor((i) => Math.min(rankedPeople.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setPeopleCursor((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      const row = rankedPeople[peopleCursor];
      if (!row || !selectedSlot) return;
      e.preventDefault();
      void assignPersonToItem(row.person, selectedSlot);
    }
  }

  const peopleList = (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        dropHint === "unassign" && "bg-[var(--selected)]",
      )}
    >
      <input
        ref={peopleSearchRef}
        value={peopleQuery}
        onChange={(e) => setPeopleQuery(e.target.value)}
        placeholder="Фамилия или имя"
        aria-controls="roster-people-list"
        aria-activedescendant={
          highlightedPersonId ? `roster-person-${highlightedPersonId}` : undefined
        }
        className="mb-2 w-full rounded-md border border-[var(--line)] bg-[var(--field-bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
      />
      {selectedSlot ? (
        <p className="mb-2 text-caption text-[var(--accent)]">
          {isRosterDutyMark(selectedSlot)
            ? `День ${selectedSlot.role}.`
            : `Слот: ${selectedSlot.vacant ? selectedSlot.role : rosterBarLabel(selectedSlot)}.`}{" "}
          Стрелки вверх/вниз и Enter — выбрать.
        </p>
      ) : null}
      {drag?.mode === "move" && drag.moved ? (
        <p className="mb-2 text-caption text-[var(--muted)]">
          Бросьте сюда, чтобы снять сотрудника со слота
        </p>
      ) : null}
      <ul
        id="roster-people-list"
        ref={peopleListRef}
        role="listbox"
        className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5"
      >
        {rankedPeople.length === 0 ? (
          <li className="px-1 py-2 text-xs text-[var(--muted)]">
            Никого не найдено
            {peopleKind === "freelancer"
              ? ". Специальности задаются в карточке фрилансера."
              : ""}
          </li>
        ) : (
          rankedPeople.map(({ person: p, free, earnRatio }, idx) => (
            <li key={p.id} role="presentation">
              <button
                type="button"
                id={`roster-person-${p.id}`}
                role="option"
                aria-selected={highlightedPersonId === p.id}
                data-roster-user={p.id}
                data-roster-kind={p.kind === "freelancer" ? "freelancer" : "staff"}
                onPointerDown={(e) => onUserPointerDown(e, p)}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => void onPointerUp(e)}
                onMouseEnter={() => setPeopleCursor(idx)}
                onClick={() => {
                  if (selectedSlot) void assignPersonToItem(p, selectedSlot);
                }}
                className={cn(
                  "flex w-full flex-col rounded-lg border bg-[var(--panel)] px-2.5 py-1.5 text-left hover:border-[var(--accent)]",
                  highlightedPersonId === p.id
                    ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/35"
                    : "border-[var(--line)]",
                  !free && "opacity-70",
                )}
              >
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm text-[var(--ink)]">{p.name}</span>
                  {!free ? (
                    <span className="shrink-0 text-caption text-[var(--muted)]">
                      занят
                    </span>
                  ) : null}
                </span>
                <span
                  className="roster-earn-track mt-1"
                  title="Относительный заработок за месяц"
                >
                  <span
                    className="roster-earn-fill"
                    style={{ width: `${Math.round(earnRatio * 100)}%` }}
                  />
                </span>
                {p.specialties.length > 0 ? (
                  <span className="mt-0.5 truncate text-caption text-[var(--muted)]">
                    {p.specialties.map((s) => s.name).join(" · ")}
                  </span>
                ) : null}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );

  return (
    <div
      className={cn(
        "roster-page mx-auto w-full",
        showingDesktop ? "px-4 pt-5 md:px-6" : "px-0 pb-20 pt-1",
      )}
    >
      <header
        className={cn(
          "flex items-center justify-between gap-2 py-2",
          showingDesktop ? "px-1" : "px-4",
        )}
      >
        <div className="min-w-0">
          <h1 className="font-display capitalize text-2xl tracking-tight text-[var(--ink)]">
            {rangeLabel}
          </h1>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            Срост — кто занят на мероприятии, аренде и задаче. Перетащите
            сотрудника, потяните край слота или снимите человека крестиком.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={goToday}>
            Сегодня
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="size-8 rounded-full !px-0"
            onClick={() => shiftDays(-1)}
            aria-label="На день назад"
          >
            ←
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="size-8 rounded-full !px-0"
            onClick={() => shiftDays(1)}
            aria-label="На день вперёд"
          >
            →
          </Button>
        </div>
      </header>

      <div
        className={cn(
          "flex flex-wrap items-center gap-x-3 gap-y-1 pb-1.5",
          showingDesktop ? "px-1" : "px-3",
        )}
        role="group"
        aria-label="Фильтры сроста"
      >
        {KIND_ORDER.map((kind) => (
          <FilterChip
            key={kind}
            label={ROSTER_KIND_LABELS[kind]}
            color={ROSTER_KIND_COLORS[kind]}
            active={kinds[kind]}
            onToggle={() => setKinds((prev) => ({ ...prev, [kind]: !prev[kind] }))}
          />
        ))}
        <span className="mx-1 hidden h-3 w-px bg-[var(--line)] sm:inline-block" />
        {CATALOG_OWNERS.map((owner) => (
          <FilterChip
            key={owner.value}
            label={owner.short}
            color={OWNER_CHIP_COLORS[owner.value]}
            active={ownerFilter[owner.value]}
            title={`Мероприятия менеджеров ${owner.label}`}
            onToggle={() =>
              setOwnerFilter((prev) => ({
                ...prev,
                [owner.value]: !prev[owner.value],
              }))
            }
          />
        ))}
        <span className="mx-1 hidden h-3 w-px bg-[var(--line)] sm:inline-block" />
        <FilterChip
          label="Пустые монтаж"
          color={ROSTER_MOUNT_COLOR}
          active={showVacantInstallers}
          title="Пустые слоты монтажа и демонтажа"
          onToggle={() => setShowVacantInstallers((v) => !v)}
        />
      </div>

      {error ? (
        <p className={cn("pb-2 text-sm text-[var(--danger)]", showingDesktop ? "px-1" : "px-4")}>
          {error}
        </p>
      ) : null}

      <div className={cn("relative flex min-h-0 flex-1 flex-col", showingDesktop && "px-1")}>
        <div
          ref={viewRef}
          className="roster-pan-viewport relative flex min-h-0 min-w-0 flex-1 flex-col"
        >
          <div
            className="roster-pan-track flex min-h-0 min-w-0 flex-1 flex-col"
            style={{
              width: `${(colCount / Math.max(1, visibleDayCount)) * 100}%`,
              transform: `translate3d(calc(-100% / ${colCount} * ${LEFT_PACK_BUFFER} - ${panPx}px), 0, 0)`,
            }}
          >
          <div className="roster-dates-sticky">
            <div
              className="grid shrink-0 px-0.5"
              style={{
                gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
              }}
            >
              {visibleDays.map((day) => {
                const weekend = day.getDay() === 0 || day.getDay() === 6;
                const wd = WEEKDAY_LABELS[(day.getDay() + 6) % 7];
                return (
                  <div
                    key={`wd-${formatDateKey(day)}`}
                    className={cn(
                      "py-1.5 text-center text-caption font-medium uppercase tracking-wider",
                      weekend ? "text-rose-400" : "text-[var(--muted)]",
                    )}
                  >
                    {wd}
                  </div>
                );
              })}
            </div>
            <div
              className="grid px-0.5"
              style={{
                gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
              }}
            >
              {visibleDays.map((day) => {
                const key = formatDateKey(day);
                const isToday = key === todayKey;
                const isSelected = key === selectedKey;
                const weekend = day.getDay() === 0 || day.getDay() === 6;
                const isDrop = dropHint === `day:${key}`;
                const nextWeek = day >= nextWeekFrom;
                return (
                  <button
                    key={`num-${key}`}
                    type="button"
                    data-roster-day={key}
                    onClick={() => {
                      setSelectedDay(startOfDay(day));
                      setDayPanelOpen(true);
                    }}
                    className={cn(
                      "relative flex items-center justify-center border-r border-[var(--line)]/70 bg-[var(--panel)] py-0.5 last:border-r-0",
                      nextWeek &&
                        "bg-[color-mix(in_srgb,var(--panel)_88%,var(--bg))]",
                      isDrop && "bg-[var(--selected)]",
                    )}
                    style={{ minHeight: tt.dayNumHeight }}
                  >
                    <span
                      className={cn(
                        "flex items-center justify-center rounded-full tabular-nums",
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
                          weekend &&
                          "text-rose-400",
                        !isSelected &&
                          !isToday &&
                          !weekend &&
                          "text-[var(--ink)]",
                      )}
                    >
                      {day.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div
            className="roster-week-scroll flex-1"
            data-roster-week={visibleDays.map((d) => formatDateKey(d)).join(",")}
          >
            <div
              className="roster-day-cols grid px-0.5"
              style={{
                gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
              }}
            >
              {visibleDays.map((day) => {
                const key = formatDateKey(day);
                const isDrop = dropHint === `day:${key}`;
                const nextWeek = day >= nextWeekFrom;
                return (
                  <button
                    key={key}
                    type="button"
                    data-roster-day={key}
                    onClick={() => {
                      setSelectedDay(startOfDay(day));
                      setDayPanelOpen(true);
                    }}
                    className={cn(
                      "h-full border-r border-[var(--line)]/70 bg-[var(--panel)] last:border-r-0",
                      nextWeek &&
                        "bg-[color-mix(in_srgb,var(--panel)_88%,var(--bg))]",
                      isDrop && "bg-[var(--selected)]",
                    )}
                    aria-label={day.toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "long",
                    })}
                  />
                );
              })}
            </div>
            <div
              className={cn(
                "roster-week-lanes min-h-full",
                zoomMotion && "is-zooming",
                drag && "is-dragging",
              )}
              style={{ minHeight: rowH }}
            >
                <div
                  className="absolute inset-x-0 top-0"
                  style={{
                    height: lanes * (tt.laneHeight + tt.laneGap),
                  }}
                >
                  {viewSegs.map((seg) => {
                    const left = `calc(${(seg.startCol / colCount) * 100}% + 2px)`;
                    const width = `calc(${(seg.span / colCount) * 100}% - 4px)`;
                    const top = seg.lane * (tt.laneHeight + tt.laneGap);
                    const radiusLeft = seg.continuesLeft ? "4px" : "6px";
                    const radiusRight = seg.continuesRight ? "4px" : "6px";
                    const dragging =
                      drag?.mode === "move" && drag.itemId === seg.item.id && drag.moved;
                    const dropOver = dropHint === seg.item.id;
                    const past = rosterItemPast(seg.item);
                    const canResize =
                      seg.item.resizable && !seg.item.vacant && !seg.header;
                    const selected = selectedSlotId === seg.item.id;
                    const dutyMark = isRosterDutyMark(seg.item);
                    const zoneMark = isRosterZoneMark(seg.item);
                    const softMark = dutyMark || zoneMark;
                    if (seg.header) {
                      return (
                        <div
                          key={`${seg.item.id}-${seg.startCol}`}
                          className="roster-event-label pointer-events-auto absolute overflow-hidden text-left font-medium"
                          style={{
                            left,
                            width,
                            top,
                            height: tt.laneHeight,
                            lineHeight: `${tt.laneHeight}px`,
                            fontSize: barFont,
                            borderRadius: `${radiusLeft} ${radiusRight} ${radiusRight} ${radiusLeft}`,
                            ["--roster-col" as string]: seg.startCol,
                          }}
                          title={seg.item.title}
                          onClick={() => {
                            if (seg.item.quoteId) setOpenQuoteId(seg.item.quoteId);
                            else if (seg.item.entryId) setOpenEntryId(seg.item.entryId);
                          }}
                        >
                          <span className="block truncate px-1.5">{seg.item.title}</span>
                        </div>
                      );
                    }
                    return (
                      <div
                        key={`${seg.item.id}-${seg.startCol}`}
                        {...(zoneMark
                          ? {}
                          : { "data-roster-slot": seg.item.id })}
                        role="button"
                        tabIndex={0}
                        aria-label={
                          zoneMark
                            ? `Зона ${seg.item.zoneName || seg.item.role}`
                            : dutyMark
                              ? `День ${seg.item.role}`
                              : seg.item.vacant
                                ? `Запрос: ${seg.item.role}`
                                : `Сменить: ${rosterBarLabel(seg.item)}`
                        }
                        className={cn(
                          "roster-bar pointer-events-auto absolute overflow-hidden text-left font-medium",
                          softMark && "roster-bar-duty-mark",
                          seg.item.vacant && !softMark && "roster-bar-vacant",
                          selected && !softMark && "roster-bar-selected",
                          past && "roster-bar-past",
                          dropOver && !softMark && "roster-bar-drop",
                          dragging && "pointer-events-none opacity-40",
                          (seg.item.vacant || past) && "roster-bar-fixed",
                        )}
                        style={{
                          left,
                          width,
                          top,
                          height: tt.laneHeight,
                          lineHeight: `${tt.laneHeight}px`,
                          fontSize: barFont,
                          background: softMark
                            ? "transparent"
                            : seg.item.vacant
                              ? "var(--panel-muted)"
                              : seg.item.color,
                          color: softMark
                            ? "var(--muted)"
                            : seg.item.vacant
                              ? seg.item.color
                              : "#fff",
                          borderRadius: softMark
                            ? "0"
                            : `${radiusLeft} ${radiusRight} ${radiusRight} ${radiusLeft}`,
                          opacity: dragging ? 0.4 : 1,
                          touchAction: "none",
                          ["--roster-col" as string]: seg.startCol,
                        }}
                        title={
                          zoneMark
                            ? `${seg.item.title} · зона ${seg.item.zoneName || seg.item.role}`
                            : dutyMark
                              ? `${seg.item.title} · день ${seg.item.role}`
                              : `${ROSTER_KIND_LABELS[seg.item.kind]} · ${seg.item.title} · ${rosterBarLabel(seg.item)}`
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectSlot(seg.item);
                          }
                        }}
                        onClick={() => selectSlot(seg.item)}
                        onPointerDown={(e) => onBarPointerDown(e, seg.item)}
                        onPointerMove={onPointerMove}
                        onPointerUp={(e) => void onPointerUp(e)}
                      >
                        {canResize ? (
                          <span
                            className="roster-handle roster-handle-start"
                            onPointerDown={(e) =>
                              onHandlePointerDown(e, seg.item, "start")
                            }
                            onPointerMove={onPointerMove}
                            onPointerUp={(e) => void onPointerUp(e)}
                          />
                        ) : null}
                        <span className={cn("block truncate px-1.5", !seg.item.vacant && "pr-3.5")}>
                          {rosterBarLabel(seg.item)}
                        </span>
                        {!seg.item.vacant ? (
                          <button
                            type="button"
                            className="roster-bar-clear"
                            aria-label="Снять сотрудника"
                            title="Снять сотрудника"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              void unassignItem(seg.item);
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                        {canResize ? (
                          <span
                            className="roster-handle roster-handle-end"
                            onPointerDown={(e) =>
                              onHandlePointerDown(e, seg.item, "end")
                            }
                            onPointerMove={onPointerMove}
                            onPointerUp={(e) => void onPointerUp(e)}
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
          </div>
          </div>
        </div>

        <div className="roster-zoom-pad" role="group" aria-label="Масштаб сроста">
          <button
            type="button"
            className="roster-zoom-btn"
            aria-label="Выше строки"
            title="Вертикальный зум +"
            onClick={() => nudgeLaneZoom(1)}
          >
            ↑
          </button>
          <div className="roster-zoom-pad-row">
            <button
              type="button"
              className="roster-zoom-btn"
              aria-label="Больше дней"
              title="Горизонтальный зум −"
              onClick={() => nudgeZoom(-1)}
            >
              ←
            </button>
            <button
              type="button"
              className="roster-zoom-btn"
              aria-label="Шире дни"
              title="Горизонтальный зум +"
              onClick={() => nudgeZoom(1)}
            >
              →
            </button>
          </div>
          <button
            type="button"
            className="roster-zoom-btn"
            aria-label="Ниже строки"
            title="Вертикальный зум −"
            onClick={() => nudgeLaneZoom(-1)}
          >
            ↓
          </button>
        </div>

        <div
          data-roster-people=""
          data-roster-unassign=""
          onKeyDown={onPeopleKeyDown}
          className={cn(
            "roster-people-dock",
            dropHint === "unassign" && "is-drop",
          )}
        >
          <button
            type="button"
            className={cn("roster-people-fab", peopleOpen && "is-open")}
            aria-label={peopleOpen ? "Свернуть сотрудников" : "Сотрудники"}
            title={peopleOpen ? "Свернуть сотрудников" : "Сотрудники"}
            aria-pressed={peopleOpen}
            onClick={() => {
              if (peopleOpen) {
                closePeoplePanel();
              } else {
                setPeopleOpen(true);
              }
            }}
          >
            {peopleOpen ? (
              <span aria-hidden className="text-lg leading-none">
                ×
              </span>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-5"
                aria-hidden
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            )}
          </button>
          {peopleOpen ? (
            <div className="roster-people-panel">
              <div className="mb-2 flex rounded-md border border-[var(--line)] p-0.5">
                <button
                  type="button"
                  aria-pressed={peopleKind === "staff"}
                  onClick={() => setPeopleKind("staff")}
                  className={cn(
                    "flex-1 rounded-[5px] px-2 py-1 text-xs font-medium uppercase tracking-wider",
                    peopleKind === "staff"
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--muted)] hover:text-[var(--ink)]",
                  )}
                >
                  Сотрудники
                </button>
                <button
                  type="button"
                  aria-pressed={peopleKind === "freelancer"}
                  onClick={() => setPeopleKind("freelancer")}
                  className={cn(
                    "flex-1 rounded-[5px] px-2 py-1 text-xs font-medium uppercase tracking-wider",
                    peopleKind === "freelancer"
                      ? "bg-[var(--accent)] text-white"
                      : "text-[var(--muted)] hover:text-[var(--ink)]",
                  )}
                >
                  Фрилансеры
                </button>
              </div>
              {peopleList}
            </div>
          ) : null}
        </div>
      </div>

      {drag && drag.mode !== "resize" && drag.moved && dragLabel ? (
        <div
          className="pointer-events-none fixed z-[80] rounded-md px-2 py-1 text-caption font-medium text-white shadow-lg"
          style={{
            left: drag.x + 12,
            top: drag.y + 12,
            background: "var(--accent)",
          }}
        >
          {dragLabel}
        </div>
      ) : null}

      <SideDrawer
        open={dayPanelOpen}
        onClose={() => setDayPanelOpen(false)}
        labelledBy="roster-day-title"
        closeOnEscape={!openQuoteId && !openEntryId}
      >
        <RosterDayAgenda
          date={selectedDay}
          items={selectedItems}
          selectedId={selectedSlotId}
          onOpen={openItem}
          onUnassign={unassignItem}
          busy={busy}
          onClose={() => setDayPanelOpen(false)}
        />
      </SideDrawer>

      <CalendarEntryModal
        open={!!openEntryId}
        entryId={openEntryId}
        onClose={() => setOpenEntryId(null)}
        onEdit={(entry) => {
          setOpenEntryId(null);
          setEntryForm({
            kind: entry.kind,
            dateKey: entry.date,
            entryId: entry.id,
          });
        }}
        onDeleted={reload}
        onChanged={reload}
      />

      {entryForm ? (
        <CalendarEntryFormModal
          open
          kind={entryForm.kind}
          dateKey={entryForm.dateKey}
          entryId={entryForm.entryId}
          onClose={() => setEntryForm(null)}
          onSaved={reload}
        />
      ) : null}

      <ProjectModal
        open={!!openQuoteId}
        quoteId={openQuoteId}
        onClose={() => {
          setOpenQuoteId(null);
          void reload();
        }}
        onChanged={() => {
          void reload();
        }}
        onCopied={(id) => {
          setOpenQuoteId(id);
          void reload();
        }}
      />

      <Modal
        open={Boolean(conflictWarn)}
        onClose={() => setConflictWarn(null)}
        title={
          conflictWarn?.dayOffs.length
            ? "У сотрудника выходной"
            : "Сотрудник уже занят"
        }
        className="max-w-md"
      >
        {conflictWarn && (
          <div className="mt-3 space-y-3">
            {conflictWarn.dayOffs.length > 0 && (
              <p className="text-sm">
                <span className="font-medium">{conflictWarn.userName}</span> в
                эти дни в выходном — назначить нельзя.
              </p>
            )}
            {conflictWarn.calendarBusy.map((c) => (
              <p key={c.id} className="text-sm text-[var(--ink)]">
                {c.date}: {c.kind === "RENTAL" ? "Аренда" : "Задача"} «{c.title}»
              </p>
            ))}
            {conflictWarn.conflicts.map((c) => (
              <p key={c.quoteId} className="text-sm text-[var(--ink)]">
                {c.overlapDates[0]}
                {c.overlapDates.length > 1
                  ? ` — ${c.overlapDates[c.overlapDates.length - 1]}`
                  : ""}
                : №{c.proposalNumber}{" "}
                {c.eventName.trim() ? `«${c.eventName.trim()}»` : ""}
              </p>
            ))}
            <p className="text-xs text-[var(--muted)]">
              {conflictWarn.dayOffs.length
                ? "Снимите выходной в календаре или выберите другого сотрудника."
                : "Можно всё равно назначить или выбрать другого сотрудника."}
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConflictWarn(null)}
              >
                Выбрать другого
              </Button>
              {conflictWarn.dayOffs.length === 0 && (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    const item = items.find((i) => i.id === conflictWarn.itemId);
                    const person = people.find((p) => p.id === conflictWarn.userId);
                    if (!item || !person) return;
                    void assignPersonToItem(
                      person,
                      item,
                      true,
                      rosterItemPast(item),
                    );
                  }}
                >
                  Назначить всё равно
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(pastConfirm)}
        onClose={() => setPastConfirm(null)}
        title="Мероприятие уже прошло"
        className="max-w-md"
      >
        <div className="mt-3 space-y-3">
          <p className="text-sm">
            Мероприятие уже прошло. Всё равно изменить сотрудника?
          </p>
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPastConfirm(null)}
            >
              Отмена
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                const run = pastConfirm?.run;
                setPastConfirm(null);
                if (run) void run(true);
              }}
            >
              Изменить
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function RosterDayAgenda({
  date,
  items,
  selectedId,
  onOpen,
  onUnassign,
  busy,
  onClose,
}: {
  date: Date;
  items: RosterItem[];
  selectedId: string | null;
  onOpen: (item: RosterItem) => void;
  onUnassign: (item: RosterItem) => void;
  busy: boolean;
  onClose: () => void;
}) {
  const heading = date.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const softMarks = items.filter(
    (item) => isRosterDutyMark(item) || isRosterZoneMark(item),
  );
  const slotCount = items.filter(
    (item) => !isRosterDutyMark(item) && !isRosterZoneMark(item),
  ).length;
  const groups = groupRosterByKind(items);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start gap-2 px-3 pb-3 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="drawer-close flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-lg leading-none text-[var(--muted)] hover:bg-[var(--ink)]/10 hover:text-[var(--ink)]"
          aria-label="Закрыть"
        >
          ×
        </button>
        <div className="min-w-0 flex-1">
          <h2
            id="roster-day-title"
            className="font-display capitalize text-lg leading-tight text-[var(--ink)] sm:text-xl"
          >
            {heading}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {slotCount
              ? `${slotCount} ${slotCount === 1 ? "слот" : "слотов"}`
              : softMarks.length
                ? softMarks
                    .map((item) =>
                      isRosterZoneMark(item)
                        ? item.zoneName || item.role
                        : item.role,
                    )
                    .join(" · ")
                : "Никто не занят"}
          </p>
        </div>
      </div>
      {groups.length === 0 ? (
        <p className="px-4 text-sm text-[var(--muted)]">
          На этот день нет потребностей и назначений.
        </p>
      ) : (
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-4">
          {groups.map((group) => (
            <section key={group.kind}>
              <h3 className="mb-1.5 flex items-center gap-1.5 px-1 text-caption font-medium uppercase tracking-wider text-[var(--muted)]">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ background: ROSTER_KIND_COLORS[group.kind] }}
                />
                {group.label}
              </h3>
              <div className="space-y-3">
                {groupRosterByEvent(group.items).map((block, blockIdx) => {
                  const dutyMarks = block.items.filter(isRosterDutyMark);
                  const zoneMarks = block.items.filter(isRosterZoneMark);
                  const slots = block.items.filter(
                    (item) =>
                      !isRosterDutyMark(item) && !isRosterZoneMark(item),
                  );
                  return (
                  <div key={block.title || group.kind}>
                    {block.title ? (
                      <p
                        className={cn(
                          "mb-1.5 text-caption font-medium text-[var(--ink)]",
                          blockIdx > 0 && "border-t border-[var(--line)] pt-2",
                        )}
                      >
                        {block.title}
                        {zoneMarks.length || dutyMarks.length ? (
                          <span className="ml-1.5 font-normal text-[var(--muted)]">
                            {[
                              ...zoneMarks.map(
                                (item) => item.zoneName || item.role,
                              ),
                              ...dutyMarks.map((item) => item.role),
                            ].join(" · ")}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    {slots.length ? (
                    <ul className="space-y-1.5">
                      {slots.map((item) => (
                        <li key={item.id}>
                          <div className="flex items-stretch gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => onOpen(item)}
                              className={cn(
                                "flex min-w-0 flex-1 items-stretch gap-3 rounded-xl border bg-[var(--panel)] px-3 py-2.5 text-left transition-colors hover:border-[var(--accent)]",
                                selectedId === item.id
                                  ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/40"
                                  : "border-[var(--line)]",
                              )}
                            >
                              <span
                                className="w-1 shrink-0 self-stretch rounded-full"
                                style={{ background: item.color }}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium text-[var(--ink)]">
                                  {item.vacant
                                    ? "Не назначен"
                                    : item.name || "Сотрудник"}
                                </span>
                                <span className="text-caption text-[var(--muted)]">
                                  {item.zoneName
                                    ? `${item.zoneName} · ${item.role}`
                                    : item.role}
                                </span>
                              </span>
                            </button>
                            {!item.vacant ? (
                              <button
                                type="button"
                                disabled={busy}
                                title="Снять сотрудника"
                                aria-label="Снять сотрудника"
                                onClick={() => onUnassign(item)}
                                className="shrink-0 rounded-xl border border-[var(--line)] px-2.5 text-lg leading-none text-[var(--muted)] hover:border-[var(--danger)] hover:text-[var(--danger)]"
                              >
                                ×
                              </button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                    ) : dutyMarks.length ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => onOpen(dutyMarks[0]!)}
                        className="px-1 text-left text-sm text-[var(--muted)] hover:text-[var(--ink)]"
                      >
                        {dutyMarks.map((item) => item.role).join(" · ")}
                      </button>
                    ) : null}
                  </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
