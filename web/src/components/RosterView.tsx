"use client";

import {
  useEffect,
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
import {
  eventDayIndexForDate,
  eventStartDate,
  eachDateKey,
  groupRosterByEvent,
  groupRosterByKind,
  itemsOnRosterDay,
  personHasRosterRole,
  personMatchesRosterOwners,
  rankRosterPeople,
  rosterBarLabel,
  rosterItemPast,
  rosterPeopleQueryForSlot,
  rosterPersonMatchesQuery,
  ROSTER_KIND_COLORS,
  ROSTER_KIND_LABELS,
  type RosterItem,
  type RosterKind,
  type RosterPerson,
} from "@/lib/roster";

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

/** Текущая неделя + половина следующей. */
const VISIBLE_DAYS = 10;
const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

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
  const sorted = [...segs].sort((a, b) => {
    if (a.startCol !== b.startCol) return a.startCol - b.startCol;
    return b.span - a.span;
  });
  const laneEnds: number[] = [];
  return sorted.map((seg) => {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane]! > seg.startCol) lane += 1;
    laneEnds[lane] = seg.startCol + seg.span;
    return { ...seg, lane };
  });
}

function groupKey(item: RosterItem): string {
  return item.quoteId || item.entryId || item.title || item.id;
}

function appendGroupedLanes(
  out: RosterSeg[],
  segs: Omit<RosterSeg, "lane">[],
  offset: number,
): number {
  if (segs.length === 0) return offset;
  const groups = new Map<string, Omit<RosterSeg, "lane">[]>();
  for (const seg of segs) {
    const key = groupKey(seg.item);
    const list = groups.get(key) || [];
    list.push(seg);
    groups.set(key, list);
  }
  const ordered = [...groups.entries()].sort((a, b) => {
    const aMin = Math.min(...a[1].map((s) => s.startCol));
    const bMin = Math.min(...b[1].map((s) => s.startCol));
    if (aMin !== bMin) return aMin - bMin;
    const aTitle = a[1][0]?.item.title || "";
    const bTitle = b[1][0]?.item.title || "";
    return aTitle.localeCompare(bTitle, "ru");
  });

  let next = offset;
  for (const [, group] of ordered) {
    const startCol = Math.min(...group.map((s) => s.startCol));
    const endExclusive = Math.max(...group.map((s) => s.startCol + s.span));
    const sample = group[0]!;
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
      continuesLeft: group.some((s) => s.continuesLeft && s.startCol === startCol),
      continuesRight: group.some(
        (s) => s.continuesRight && s.startCol + s.span === endExclusive,
      ),
      lane: next,
      header: true,
    });
    next += 1;
    const laid = assignLanes(group);
    let max = -1;
    for (const s of laid) {
      out.push({ ...s, lane: s.lane + next });
      if (s.lane > max) max = s.lane;
    }
    next += max + 1;
  }
  return next;
}

function assignLanesByKind(segs: Omit<RosterSeg, "lane">[]): RosterSeg[] {
  const out: RosterSeg[] = [];
  let offset = 0;
  for (const kind of KIND_ORDER) {
    offset = appendGroupedLanes(
      out,
      segs.filter((s) => s.item.kind === kind),
      offset,
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
  return d.dayNumHeight + weekLaneCount(segs) * (d.laneHeight + d.laneGap) + 6;
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
    if (userId) return { type: "user" as const, userId };
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
  const [items, setItems] = useState<RosterItem[]>([]);
  const [people, setPeople] = useState<RosterPerson[]>([]);
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

  useEffect(() => {
    if (!peopleOpen && !selectedSlotId) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-roster-people]")) return;
      if (t.closest("[data-roster-slot]")) return;
      if (t.closest("[role='dialog']")) return;
      setSelectedSlotId(null);
      setPeopleQuery("");
      setPeopleOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [peopleOpen, selectedSlotId]);

  const visibleDays = useMemo(
    () => buildDayRange(viewStart, VISIBLE_DAYS),
    [viewStart],
  );
  const viewEnd = visibleDays[visibleDays.length - 1]!;
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
      error?: string;
    } | null;
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "Не удалось загрузить срост");
      return;
    }
    setItems(Array.isArray(data?.items) ? data.items : []);
    setPeople(Array.isArray(data?.people) ? data.people : []);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- padded fetch window follows viewStart
  }, [from, to, earnMonth]);

  const todayKey = formatDateKey(new Date());
  const selectedKey = formatDateKey(selectedDay);

  const visibleItems = useMemo(() => {
    return items
      .filter((item) => kinds[item.kind])
      .map((item) => {
        if (drag?.mode === "resize" && drag.itemId === item.id) {
          return { ...item, start: drag.start, end: drag.end };
        }
        return item;
      });
  }, [items, kinds, drag]);

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
    const base = people.filter(
      (p) =>
        rosterPersonMatchesQuery(p, peopleQuery) &&
        personMatchesRosterOwners(p, ownerFilter),
    );
    let pool = base;
    if (selectedSlot && selectedSlot.assignmentKind !== "MOUNT") {
      if (selectedSlot.specialtyId || selectedSlot.role) {
        const matching = base.filter((p) => personHasRosterRole(p, selectedSlot));
        if (matching.length > 0) pool = matching;
      }
    }
    const dates = selectedSlot
      ? eachDateKey(selectedSlot.start, selectedSlot.end)
      : [selectedKey];
    return rankRosterPeople(pool, dates);
  }, [people, peopleQuery, selectedSlot, selectedKey, ownerFilter]);

  function shiftDays(delta: number) {
    setViewStart((prev) => addDays(prev, delta));
  }

  function goToday() {
    const t = startOfDay(new Date());
    setViewStart(startOfWeekMonday(t));
    setSelectedDay(t);
    if (showingDesktop) setDayPanelOpen(true);
  }

  const viewRef = useRef<HTMLDivElement>(null);
  const peopleSearchRef = useRef<HTMLInputElement>(null);
  const peopleListRef = useRef<HTMLUListElement>(null);
  const wheelLock = useRef(0);
  useEffect(() => {
    if (!peopleOpen) return;
    peopleSearchRef.current?.focus();
  }, [peopleOpen, selectedSlotId]);
  useEffect(() => {
    if (!peopleOpen) return;
    setPeopleCursor(0);
  }, [peopleOpen, selectedSlotId, peopleQuery, ownerFilter]);
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
    const el = viewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const horizontal =
        Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
      if (!horizontal) return;
      e.preventDefault();
      const now = Date.now();
      if (now - wheelLock.current < 70) return;
      wheelLock.current = now;
      const delta = e.shiftKey ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      setViewStart((prev) => addDays(prev, delta > 0 ? 1 : -1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

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
    setSelectedSlotId(item.id);
    setPeopleQuery(rosterPeopleQueryForSlot(item));
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
    if (item.userId && item.userId === person.id) {
      setSelectedSlotId(null);
      setPeopleQuery("");
      setPeopleOpen(false);
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
    if (item.quoteId && !force) {
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
      source: { type: "user", userId: person.id },
      target: { type: "slot", slot: slotRef(item) },
      forcePast,
    });
    setSelectedSlotId(null);
    setPeopleQuery("");
    setPeopleOpen(false);
    setConflictWarn(null);
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
    if (e.button !== 0) return;
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
      const start = eventStartDate({ eventDate: item.eventStart });
      if (!start) return;
      const day = parseEventDate(dayKey);
      if (!day) return;
      const idx = eventDayIndexForDate(start, item.eventDays, day);
      if (idx == null) return;
      const curStart = eventDayIndexForDate(
        start,
        item.eventDays,
        parseEventDate(drag.start) || day,
      );
      const curEnd = eventDayIndexForDate(
        start,
        item.eventDays,
        parseEventDate(drag.end) || day,
      );
      if (curStart == null || curEnd == null) return;
      if (drag.edge === "start") {
        const next = Math.min(idx, curEnd);
        setDrag({
          ...drag,
          start: formatDateKey(addDays(start, next - 1)),
        });
      } else {
        const next = Math.max(idx, curStart);
        setDrag({
          ...drag,
          end: formatDateKey(addDays(start, next - 1)),
        });
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
      const fromDay = eventDayIndexForDate(
        start,
        item.eventDays,
        parseEventDate(current.start) || start,
      );
      const toDay = eventDayIndexForDate(
        start,
        item.eventDays,
        parseEventDate(current.end) || start,
      );
      if (fromDay == null || toDay == null) return;
      if (item.start === current.start && item.end === current.end) return;
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
      const person = people.find((p) => p.id === current.userId);
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
          source: { type: "user", userId: hit.userId },
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

  const tt = showingDesktop ? DENSITY_DESKTOP : DENSITY_MOBILE;
  const barFont = showingDesktop ? 11 : 10;
  const colCount = visibleDays.length;
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
      setPeopleOpen(false);
      setSelectedSlotId(null);
      setPeopleQuery("");
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
        placeholder="Имя или специальность"
        aria-controls="roster-people-list"
        aria-activedescendant={
          highlightedPersonId ? `roster-person-${highlightedPersonId}` : undefined
        }
        className="mb-2 w-full rounded-md border border-[var(--line)] bg-[var(--field-bg)] px-2.5 py-1.5 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
      />
      {selectedSlot ? (
        <p className="mb-2 text-caption text-[var(--accent)]">
          Слот: {selectedSlot.vacant ? selectedSlot.role : rosterBarLabel(selectedSlot)}.
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
            onToggle={() =>
              setOwnerFilter((prev) => ({
                ...prev,
                [owner.value]: !prev[owner.value],
              }))
            }
          />
        ))}
      </div>

      {error ? (
        <p className={cn("pb-2 text-sm text-[var(--danger)]", showingDesktop ? "px-1" : "px-4")}>
          {error}
        </p>
      ) : null}

      <div className={cn("relative flex min-h-0 flex-1 flex-col", showingDesktop && "px-1")}>
        <div ref={viewRef} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
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
            data-roster-week={visibleDays.map((d) => formatDateKey(d)).join(",")}
            className="relative grid min-h-0 flex-1 bg-[var(--bg)]"
            style={{
              minHeight: rowH,
              gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
            }}
          >
            {visibleDays.map((day, dayIdx) => {
                  const key = formatDateKey(day);
                  const isToday = key === todayKey;
                  const isSelected = key === selectedKey;
                  const weekend = day.getDay() === 0 || day.getDay() === 6;
                  const isDrop = dropHint === `day:${key}`;
                  const nextWeek = dayIdx >= 7;
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
                        "relative flex h-full flex-col items-center border-r border-[var(--line)]/70 bg-[var(--panel)] pt-0.5 last:border-r-0",
                        nextWeek &&
                          "bg-[color-mix(in_srgb,var(--panel)_88%,var(--bg))]",
                        isDrop && "bg-[var(--selected)]",
                      )}
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

                <div
                  className="pointer-events-none absolute inset-x-0"
                  style={{
                    top: tt.dayNumHeight,
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
                        data-roster-slot={seg.item.id}
                        role="button"
                        tabIndex={0}
                        aria-label={
                          seg.item.vacant
                            ? `Запрос: ${seg.item.role}`
                            : `Сменить: ${rosterBarLabel(seg.item)}`
                        }
                        className={cn(
                          "roster-bar pointer-events-auto absolute overflow-hidden text-left font-medium",
                          seg.item.vacant && "roster-bar-vacant",
                          selected && "roster-bar-selected",
                          past && "roster-bar-past",
                          dropOver && "roster-bar-drop",
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
                          background: seg.item.vacant
                            ? "var(--panel-muted)"
                            : seg.item.color,
                          color: seg.item.vacant ? seg.item.color : "#fff",
                          borderRadius: `${radiusLeft} ${radiusRight} ${radiusRight} ${radiusLeft}`,
                          opacity: dragging ? 0.4 : 1,
                          touchAction: "none",
                        }}
                        title={`${ROSTER_KIND_LABELS[seg.item.kind]} · ${seg.item.title} · ${rosterBarLabel(seg.item)}`}
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
                setPeopleOpen(false);
                setSelectedSlotId(null);
                setPeopleQuery("");
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
              <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--muted)]">
                Сотрудники
              </h2>
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
}: {
  date: Date;
  items: RosterItem[];
  selectedId: string | null;
  onOpen: (item: RosterItem) => void;
  onUnassign: (item: RosterItem) => void;
  busy: boolean;
}) {
  const heading = date.toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const groups = groupRosterByKind(items);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-1">
        <div className="min-w-0">
          <h2
            id="roster-day-title"
            className="font-display capitalize text-lg leading-tight text-[var(--ink)] sm:text-xl"
          >
            {heading}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--muted)]">
            {items.length
              ? `${items.length} ${items.length === 1 ? "слот" : "слотов"}`
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
                {groupRosterByEvent(group.items).map((block, blockIdx) => (
                  <div key={block.title || group.kind}>
                    {block.title ? (
                      <p
                        className={cn(
                          "mb-1.5 text-caption font-medium text-[var(--ink)]",
                          blockIdx > 0 && "border-t border-[var(--line)] pt-2",
                        )}
                      >
                        {block.title}
                      </p>
                    ) : null}
                    <ul className="space-y-1.5">
                      {block.items.map((item) => (
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
                                  {item.role}
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
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
