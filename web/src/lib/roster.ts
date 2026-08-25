import {
  addDays,
  formatDateKey,
  parseEventDate,
  startOfDay,
} from "@/lib/dates";
import {
  assignmentDisplayName,
  assignmentKind,
  isFreelancerAssignment,
  isVacantAssignment,
  mountDutyFlags,
} from "@/lib/quote-assignments";
import { normDayIndex, workingDayCount } from "@/lib/quote-assignment-days";
import type { CatalogOwnerValue } from "@/lib/catalog-owner";
import { staffRoleLabel } from "@/lib/staff-slots";

export type RosterKind = "EVENT" | "RENTAL" | "TASK";

export const ROSTER_KIND_LABELS: Record<RosterKind, string> = {
  EVENT: "Мероприятие",
  RENTAL: "Аренда",
  TASK: "Задача",
};

export const ROSTER_KIND_COLORS: Record<RosterKind, string> = {
  EVENT: "#009ee3",
  RENTAL: "#0f766e",
  TASK: "#b45309",
};

/** Монтаж / демонтаж — отдельно от смен шоу. */
export const ROSTER_MOUNT_COLOR = "#6b7280";

export type RosterPerson = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  active: boolean;
  specialties: Array<{ id: string; name: string }>;
  owners?: CatalogOwnerValue[];
  /** Начисления по сменам за выбранный месяц. */
  monthEarned?: number;
  /** YYYY-MM-DD, когда человек уже занят. */
  busyDates?: string[];
};

export type RosterItem = {
  id: string;
  source: "quote" | "entry";
  kind: RosterKind;
  assignmentKind: "EVENT" | "MOUNT" | null;
  quoteId: string | null;
  entryId: string | null;
  assignmentIds: string[];
  userId: string | null;
  vacant: boolean;
  freelancer: boolean;
  name: string;
  role: string;
  title: string;
  subtitle: string;
  start: string;
  end: string;
  dayIndexStart: number | null;
  dayIndexEnd: number | null;
  eventStart: string | null;
  eventDays: number;
  resizable: boolean;
  color: string;
  specialtyId: string | null;
  /** Монтаж или демонтаж, если слот из блока монтажников. */
  mountDuty: "mount" | "demount" | null;
  /** Индекс пустого слота той же роли в этот день — чтобы склеить ×N по дням. */
  slotOrdinal: number;
};

export type RosterQuoteAssignmentInput = {
  id: string;
  kind?: string | null;
  dayIndex?: number | null;
  userId?: string | null;
  isFreelancer?: boolean | null;
  freelancerName?: string | null;
  specialtyId?: string | null;
  specialty?: { id?: string; name?: string } | null;
  zoneId?: string | null;
  onMount?: boolean | null;
  onDemount?: boolean | null;
  user?: {
    id?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
  } | null;
};

export type RosterQuoteInput = {
  id: string;
  proposalNumber?: string | null;
  eventName?: string | null;
  client?: string | null;
  date?: string | null;
  eventDate?: Date | string | null;
  durationDays?: number | null;
  mountDate?: string | null;
  mountDurationDays?: number | null;
  demountDate?: string | null;
  demountDurationDays?: number | null;
  assignments: RosterQuoteAssignmentInput[];
};

export type RosterEntryInput = {
  id: string;
  kind: "RENTAL" | "TASK" | "DAY_OFF" | string;
  date: string;
  title?: string | null;
  responsibleUser?: {
    id: string;
    name: string;
    firstName?: string;
    lastName?: string;
  } | null;
  client?: { companyName?: string | null } | null;
  assignees: Array<{
    userId: string;
    user?: {
      id?: string;
      name?: string;
      firstName?: string;
      lastName?: string;
    } | null;
  }>;
};

export function rosterPersonName(u: {
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  const fio = [u.lastName, u.firstName].filter(Boolean).join(" ").trim();
  return fio || String(u.name || "").trim() || "Сотрудник";
}

export function eventStartDate(q: {
  eventDate?: Date | string | null;
  date?: string | null;
}): Date | null {
  if (q.eventDate instanceof Date && !Number.isNaN(q.eventDate.getTime())) {
    return startOfDay(q.eventDate);
  }
  if (typeof q.eventDate === "string") {
    const parsed = parseEventDate(q.eventDate);
    if (parsed) return startOfDay(parsed);
  }
  const fromText = parseEventDate(q.date);
  return fromText ? startOfDay(fromText) : null;
}

export function dateForEventDay(eventStart: Date, dayIndex: number): Date {
  return addDays(startOfDay(eventStart), Math.max(1, dayIndex) - 1);
}

/** 1-based день мероприятия или null, если дата вне диапазона. */
export function eventDayIndexForDate(
  eventStart: Date,
  eventDays: number,
  day: Date,
): number | null {
  const a = startOfDay(eventStart).getTime();
  const b = startOfDay(day).getTime();
  const idx = Math.round((b - a) / 86_400_000) + 1;
  const days = workingDayCount(eventDays);
  if (idx < 1 || idx > days) return null;
  return idx;
}

function quoteTitle(q: RosterQuoteInput): string {
  const num = String(q.proposalNumber || "").trim();
  const name = String(q.eventName || q.client || "").trim() || "КП";
  return num ? `№${num} ${name}` : name;
}

function entryTitle(e: RosterEntryInput): string {
  const title = String(e.title || "").trim();
  if (e.kind === "TASK") return title || "Задача";
  const client = String(e.client?.companyName || "").trim();
  const bits = [title, client].filter(Boolean);
  return bits.length ? bits.join(" · ") : "Аренда";
}

function rangeKeys(start: Date, end: Date): { start: string; end: string } {
  return { start: formatDateKey(start), end: formatDateKey(end) };
}

function atomicItem(partial: Omit<RosterItem, "color" | "slotOrdinal"> & {
  slotOrdinal?: number;
}): RosterItem {
  return {
    ...partial,
    specialtyId: partial.specialtyId ?? null,
    mountDuty: partial.mountDuty ?? null,
    slotOrdinal: partial.slotOrdinal ?? 0,
    color:
      partial.assignmentKind === "MOUNT" || partial.mountDuty
        ? ROSTER_MOUNT_COLOR
        : ROSTER_KIND_COLORS[partial.kind],
  };
}

export function quoteAssignmentRange(
  q: RosterQuoteInput,
  a: RosterQuoteAssignmentInput,
): {
  start: Date;
  end: Date;
  dayIndexStart: number | null;
  dayIndexEnd: number | null;
} | null {
  const eventStart = eventStartDate(q);
  if (!eventStart) return null;
  const eventDays = workingDayCount(q.durationDays);
  const kind = assignmentKind(a);

  if (kind === "MOUNT") {
    const win = dateWindowFromField(
      q.mountDate,
      q.mountDurationDays,
      addDays(eventStart, -1),
    );
    return {
      ...win,
      dayIndexStart: null,
      dayIndexEnd: null,
    };
  }

  const day = normDayIndex(a.dayIndex);
  if (day != null) {
    const d = dateForEventDay(eventStart, day);
    return { start: d, end: d, dayIndexStart: day, dayIndexEnd: day };
  }
  return {
    start: eventStart,
    end: addDays(eventStart, eventDays - 1),
    dayIndexStart: null,
    dayIndexEnd: null,
  };
}

function dateWindowFromField(
  raw: string | null | undefined,
  durationDays: number | null | undefined,
  fallback: Date,
): { start: Date; end: Date } {
  const parsed = parseEventDate(raw);
  const days = Math.max(1, Number(durationDays) || 1);
  const start = parsed ? startOfDay(parsed) : fallback;
  return { start, end: addDays(start, days - 1) };
}

export function quoteMountWindows(
  q: RosterQuoteInput,
  a: RosterQuoteAssignmentInput,
  eventStart: Date,
  eventDays: number,
): Array<{ duty: "mount" | "demount"; start: Date; end: Date }> {
  const flags = mountDutyFlags(a);
  const out: Array<{ duty: "mount" | "demount"; start: Date; end: Date }> = [];
  if (flags.onMount) {
    out.push({
      duty: "mount",
      ...dateWindowFromField(
        q.mountDate,
        q.mountDurationDays,
        addDays(eventStart, -1),
      ),
    });
  }
  if (flags.onDemount) {
    out.push({
      duty: "demount",
      ...dateWindowFromField(
        q.demountDate,
        q.demountDurationDays,
        addDays(eventStart, eventDays),
      ),
    });
  }
  return out;
}

export function buildQuoteRosterItems(q: RosterQuoteInput): RosterItem[] {
  const eventStart = eventStartDate(q);
  if (!eventStart) return [];
  const title = quoteTitle(q);
  const eventDays = workingDayCount(q.durationDays);
  const eventStartKey = formatDateKey(eventStart);
  const items: RosterItem[] = [];

  for (const a of q.assignments) {
    const vacant = isVacantAssignment(a);
    const freelancer = isFreelancerAssignment(a);
    const kind = assignmentKind(a);
    const name = vacant
      ? ""
      : assignmentDisplayName({
          id: a.id,
          specialtyId: a.specialtyId || a.specialty?.id || "",
          payMode: "SHIFT",
          hours: null,
          rateOverride: null,
          isFreelancer: freelancer,
          freelancerName: a.freelancerName,
          userId: a.userId,
          user: a.user,
          specialty: a.specialty
            ? { id: a.specialty.id || "", name: a.specialty.name || "" }
            : null,
        });
    const windows =
      kind === "MOUNT"
        ? quoteMountWindows(q, a, eventStart, eventDays).map((win) => ({
            ...win,
            id: `qa:${a.id}:${win.duty}`,
            role: win.duty === "mount" ? "монтаж" : "демонтаж",
            mountDuty: win.duty as "mount" | "demount",
            dayIndexStart: null as number | null,
            dayIndexEnd: null as number | null,
          }))
        : (() => {
            const range = quoteAssignmentRange(q, a);
            if (!range) return [];
            return [
              {
                id: `qa:${a.id}`,
                role: staffRoleLabel({
                  kind,
                  specialty: a.specialty,
                }),
                mountDuty: null as "mount" | "demount" | null,
                start: range.start,
                end: range.end,
                dayIndexStart: range.dayIndexStart,
                dayIndexEnd: range.dayIndexEnd,
              },
            ];
          })();
    for (const win of windows) {
      const keys = rangeKeys(win.start, win.end);
      items.push(
        atomicItem({
          id: win.id,
          source: "quote",
          kind: "EVENT",
          assignmentKind: kind,
          quoteId: q.id,
          entryId: null,
          assignmentIds: [a.id],
          userId: a.userId ?? null,
          vacant,
          freelancer,
          name,
          role: win.role,
          mountDuty: win.mountDuty,
          title,
          subtitle: win.role,
          start: keys.start,
          end: keys.end,
          dayIndexStart: win.dayIndexStart,
          dayIndexEnd: win.dayIndexEnd,
          eventStart: eventStartKey,
          eventDays,
          resizable: !vacant && kind === "EVENT",
          specialtyId: a.specialtyId || a.specialty?.id || null,
        }),
      );
    }
  }
  const vacantOrd = new Map<string, number>();
  for (const item of items) {
    if (!item.vacant) continue;
    const key = `${item.start}\t${item.assignmentKind || ""}\t${item.role}`;
    const n = vacantOrd.get(key) || 0;
    item.slotOrdinal = n;
    vacantOrd.set(key, n + 1);
  }
  return items;
}

export function buildEntryRosterItems(e: RosterEntryInput): RosterItem[] {
  if (e.kind !== "RENTAL" && e.kind !== "TASK") return [];
  const start = parseEventDate(e.date);
  if (!start) return [];
  const day = startOfDay(start);
  const keys = rangeKeys(day, day);
  const kind: RosterKind = e.kind;
  const title = entryTitle(e);
  const items: RosterItem[] = [];
  const seen = new Set<string>();

  for (const row of e.assignees) {
    const userId = row.userId;
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    const name = row.user ? rosterPersonName(row.user) : "Сотрудник";
    items.push(
      atomicItem({
        id: `ce:${e.id}:${userId}`,
        source: "entry",
        kind,
        assignmentKind: null,
        quoteId: null,
        entryId: e.id,
        assignmentIds: [e.id],
        userId,
        vacant: false,
        freelancer: false,
        name,
        role: kind === "TASK" ? "исполнитель" : "выдача",
        title,
        subtitle: ROSTER_KIND_LABELS[kind],
        start: keys.start,
        end: keys.end,
        dayIndexStart: null,
        dayIndexEnd: null,
        eventStart: null,
        eventDays: 1,
        resizable: false,
        specialtyId: null,
      }),
    );
  }

  if (
    e.kind === "RENTAL" &&
    e.responsibleUser &&
    !seen.has(e.responsibleUser.id)
  ) {
    seen.add(e.responsibleUser.id);
    items.push(
      atomicItem({
        id: `ce:${e.id}:resp:${e.responsibleUser.id}`,
        source: "entry",
        kind,
        assignmentKind: null,
        quoteId: null,
        entryId: e.id,
        assignmentIds: [e.id],
        userId: e.responsibleUser.id,
        vacant: false,
        freelancer: false,
        name: rosterPersonName(e.responsibleUser),
        role: "ответственный",
        title,
        subtitle: ROSTER_KIND_LABELS[kind],
        start: keys.start,
        end: keys.end,
        dayIndexStart: null,
        dayIndexEnd: null,
        eventStart: null,
        eventDays: 1,
        resizable: false,
        specialtyId: null,
      }),
    );
  }

  if (items.length === 0) {
    items.push(
      atomicItem({
        id: `ce:${e.id}:vacant`,
        source: "entry",
        kind,
        assignmentKind: null,
        quoteId: null,
        entryId: e.id,
        assignmentIds: [e.id],
        userId: null,
        vacant: true,
        freelancer: false,
        name: "",
        role: kind === "TASK" ? "исполнитель" : "выдача",
        title,
        subtitle: ROSTER_KIND_LABELS[kind],
        start: keys.start,
        end: keys.end,
        dayIndexStart: null,
        dayIndexEnd: null,
        eventStart: null,
        eventDays: 1,
        resizable: false,
        specialtyId: null,
      }),
    );
  }

  return items;
}

function mergeKey(item: RosterItem): string {
  return [
    item.source,
    item.quoteId || item.entryId || "",
    item.assignmentKind || item.kind,
    item.userId || (item.freelancer ? `fl:${item.name}` : "vacant"),
    item.role,
    item.vacant ? `vac:${item.slotOrdinal}` : "filled",
  ].join("\t");
}

function dayOffset(a: string, b: string): number {
  const da = parseEventDate(a);
  const db = parseEventDate(b);
  if (!da || !db) return Number.NaN;
  return Math.round(
    (startOfDay(db).getTime() - startOfDay(da).getTime()) / 86_400_000,
  );
}

/** Склеивает соседние дни одного человека на одном слоте. */
export function mergeRosterItems(items: RosterItem[]): RosterItem[] {
  const groups = new Map<string, RosterItem[]>();
  for (const item of items) {
    const key = mergeKey(item);
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }

  const out: RosterItem[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.start.localeCompare(b.start));
    let cur: RosterItem | null = null;
    for (const item of sorted) {
      if (!cur) {
        cur = { ...item, assignmentIds: [...item.assignmentIds] };
        continue;
      }
      const canMerge =
        dayOffset(cur.end, item.start) === 1 &&
        (cur.dayIndexStart == null) === (item.dayIndexStart == null) &&
        item.vacant === cur.vacant &&
        (item.vacant || (item.resizable && cur.resizable));
      if (!canMerge) {
        out.push(cur);
        cur = { ...item, assignmentIds: [...item.assignmentIds] };
        continue;
      }
      cur = {
        ...cur,
        id: `${cur.id}+${item.assignmentIds.join("+")}`,
        assignmentIds: [...cur.assignmentIds, ...item.assignmentIds],
        end: item.end,
        dayIndexEnd: item.dayIndexEnd ?? cur.dayIndexEnd,
      };
    }
    if (cur) out.push(cur);
  }
  return out.sort((a, b) => {
    if (a.start !== b.start) return a.start.localeCompare(b.start);
    if (a.kind !== b.kind) {
      const order: Record<RosterKind, number> = { EVENT: 0, RENTAL: 1, TASK: 2 };
      return order[a.kind] - order[b.kind];
    }
    return (a.name || a.role).localeCompare(b.name || b.role, "ru");
  });
}

export function buildRosterItems(
  quotes: RosterQuoteInput[],
  entries: RosterEntryInput[],
): RosterItem[] {
  const raw: RosterItem[] = [];
  for (const q of quotes) raw.push(...buildQuoteRosterItems(q));
  for (const e of entries) raw.push(...buildEntryRosterItems(e));
  return mergeRosterItems(raw);
}

export type SpanPlan = {
  quoteId: string;
  keepIds: string[];
  createFromId: string;
  createDayIndexes: number[];
  /** Пустые слоты на дни, с которых сняли человека (позиция из сметы остаётся). */
  createVacantDayIndexes: number[];
  deleteIds: string[];
  /** Снять человека, но оставить должность. */
  vacateIds: string[];
  convertToAllDays: boolean;
  /** Перезаписать dayIndex исходного слота. undefined — не трогать. */
  firstDayIndex?: number | null;
};

function uncoveredDays(eventDays: number, from: number, to: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= eventDays; d++) {
    if (d < from || d > to) out.push(d);
  }
  return out;
}

/**
 * Как растянуть слот мероприятия на дни from..to (1-based, включительно).
 * all-days (dayIndex null) при сужении превращается в подневные копии.
 */
export function planAssignmentSpan(opts: {
  quoteId: string;
  assignmentIds: string[];
  dayIndexes: Array<number | null>;
  eventDays: number;
  fromDay: number;
  toDay: number;
}): SpanPlan | null {
  const days = workingDayCount(opts.eventDays);
  const from = Math.min(opts.fromDay, opts.toDay);
  const to = Math.max(opts.fromDay, opts.toDay);
  if (from < 1 || to > days || opts.assignmentIds.length === 0) return null;

  const desired: number[] = [];
  for (let d = from; d <= to; d++) desired.push(d);

  const pairs = opts.assignmentIds.map((id, i) => ({
    id,
    day: normDayIndex(opts.dayIndexes[i]),
  }));
  const allDays = pairs.every((p) => p.day == null);
  const coversAll = from === 1 && to === days;

  if (allDays && coversAll) {
    return {
      quoteId: opts.quoteId,
      keepIds: opts.assignmentIds,
      createFromId: opts.assignmentIds[0]!,
      createDayIndexes: [],
      createVacantDayIndexes: [],
      deleteIds: [],
      vacateIds: [],
      convertToAllDays: false,
    };
  }

  if (allDays) {
    return {
      quoteId: opts.quoteId,
      keepIds: [opts.assignmentIds[0]!],
      createFromId: opts.assignmentIds[0]!,
      createDayIndexes: desired.slice(1),
      createVacantDayIndexes: uncoveredDays(days, from, to),
      deleteIds: opts.assignmentIds.slice(1),
      vacateIds: [],
      convertToAllDays: false,
      firstDayIndex: from,
    };
  }

  const byDay = new Map<number, string>();
  for (const p of pairs) {
    if (p.day != null && !byDay.has(p.day)) byDay.set(p.day, p.id);
  }

  const keepIds: string[] = [];
  const vacateIds: string[] = [];
  const createDayIndexes: number[] = [];

  for (const [day, id] of byDay) {
    if (desired.includes(day)) keepIds.push(id);
    else vacateIds.push(id);
  }
  for (const day of desired) {
    if (!byDay.has(day)) createDayIndexes.push(day);
  }

  const createFromId = keepIds[0] || opts.assignmentIds[0]!;
  if (!keepIds.includes(createFromId) && byDay.size > 0) {
    const firstDesired = desired.find((d) => byDay.has(d));
    if (firstDesired) keepIds.unshift(byDay.get(firstDesired)!);
  }

  const uniqueKeep = [...new Set(keepIds)];
  if (coversAll) {
    const keep = uniqueKeep[0] || opts.assignmentIds[0]!;
    return {
      quoteId: opts.quoteId,
      keepIds: [keep],
      createFromId: keep,
      createDayIndexes: [],
      createVacantDayIndexes: [],
      deleteIds: [
        ...new Set(opts.assignmentIds.filter((id) => id !== keep)),
      ],
      vacateIds: [],
      convertToAllDays: true,
      firstDayIndex: null,
    };
  }
  return {
    quoteId: opts.quoteId,
    keepIds: uniqueKeep,
    createFromId,
    createDayIndexes,
    createVacantDayIndexes: [],
    deleteIds: [],
    vacateIds: [...new Set(vacateIds)],
    convertToAllDays: false,
  };
}

/**
 * Перенос заполненного слота на другие дни мероприятия:
 * человек уезжает, должность на старых днях остаётся пустой.
 */
export function planAssignmentMove(opts: {
  dayIndexes: Array<number | null>;
  eventDays: number;
  destFrom: number;
  destTo: number;
}): { destDays: number[]; vacateDays: number[]; allDays: boolean } | null {
  const days = workingDayCount(opts.eventDays);
  const from = Math.min(opts.destFrom, opts.destTo);
  const to = Math.max(opts.destFrom, opts.destTo);
  if (from < 1 || to > days) return null;
  const destDays: number[] = [];
  for (let d = from; d <= to; d++) destDays.push(d);
  const allDays = opts.dayIndexes.every((d) => normDayIndex(d) == null);
  const sourceDays = allDays
    ? Array.from({ length: days }, (_, i) => i + 1)
    : [
        ...new Set(
          opts.dayIndexes
            .map((d) => normDayIndex(d))
            .filter((d): d is number => d != null),
        ),
      ];
  const destSet = new Set(destDays);
  return {
    destDays,
    vacateDays: sourceDays.filter((d) => !destSet.has(d)),
    allDays,
  };
}

export function rosterBarLabel(item: RosterItem): string {
  if (item.vacant) return item.role || "не назначен";
  const who = item.name || "Сотрудник";
  return item.role ? `${who} · ${item.role}` : who;
}

export function rosterItemPast(
  item: {
    end: string;
    eventStart?: string | null;
    eventDays?: number;
  },
  todayKey = formatDateKey(new Date()),
): boolean {
  if (item.eventStart) {
    const start = parseEventDate(item.eventStart);
    if (start) {
      const eventEnd = formatDateKey(
        addDays(start, Math.max(1, item.eventDays || 1) - 1),
      );
      return eventEnd < todayKey;
    }
  }
  return Boolean(item.end) && item.end < todayKey;
}

export const ROSTER_MOUNT_SPECIALTY_QUERY = "монтажник";

/** Текст в поиске сотрудников при клике на слот. */
export function rosterPeopleQueryForSlot(
  item: Pick<RosterItem, "assignmentKind" | "mountDuty" | "role">,
): string {
  if (item.assignmentKind === "MOUNT" || item.mountDuty) {
    return ROSTER_MOUNT_SPECIALTY_QUERY;
  }
  return item.role || "";
}

export function personMatchesRosterOwners(
  person: { owners?: CatalogOwnerValue[] | null },
  selected: Record<CatalogOwnerValue, boolean>,
): boolean {
  const owners = person.owners || [];
  if (owners.length === 0) return true;
  return owners.some((o) => selected[o]);
}

export function personHasRosterRole(
  person: { specialties?: Array<{ id?: string; name?: string }> },
  item: Pick<RosterItem, "assignmentKind" | "specialtyId" | "role">,
): boolean {
  if (item.assignmentKind === "MOUNT") return true;
  if (!item.specialtyId && !item.role) return true;
  const specs = person.specialties || [];
  if (item.specialtyId && specs.some((s) => s.id === item.specialtyId)) {
    return true;
  }
  const role = normalizeRosterSearch(item.role);
  if (!role) return true;
  return specs.some((s) => normalizeRosterSearch(s.name || "") === role);
}

export function groupRosterByEvent(
  items: RosterItem[],
): Array<{ title: string; items: RosterItem[] }> {
  const order: string[] = [];
  const map = new Map<string, RosterItem[]>();
  const titles = new Map<string, string>();
  for (const item of items) {
    const key = item.quoteId || item.entryId || item.title.trim() || item.id;
    const list = map.get(key);
    if (list) list.push(item);
    else {
      map.set(key, [item]);
      order.push(key);
      titles.set(
        key,
        item.title.trim() || ROSTER_KIND_LABELS[item.kind],
      );
    }
  }
  return order.map((key) => ({
    title: titles.get(key)!,
    items: map.get(key)!,
  }));
}

export function eachDateKey(start: string, end: string): string[] {
  const a = parseEventDate(start);
  const b = parseEventDate(end);
  if (!a && !b) return [];
  if (!a || !b) {
    const one = formatDateKey(startOfDay(a || b!));
    return [one];
  }
  const out: string[] = [];
  let cur = startOfDay(a);
  const last = startOfDay(b);
  while (cur.getTime() <= last.getTime()) {
    out.push(formatDateKey(cur));
    cur = addDays(cur, 1);
  }
  return out;
}

export function collectBusyDates(
  items: Array<{
    userId?: string | null;
    vacant?: boolean;
    start: string;
    end: string;
  }>,
  extra?: Array<{ userId: string; date: string }>,
): Record<string, string[]> {
  const map = new Map<string, Set<string>>();
  function add(userId: string, date: string) {
    if (!userId || !date) return;
    const set = map.get(userId) || new Set<string>();
    set.add(date);
    map.set(userId, set);
  }
  for (const item of items) {
    if (item.vacant || !item.userId) continue;
    for (const day of eachDateKey(item.start, item.end)) add(item.userId, day);
  }
  for (const row of extra || []) add(row.userId, row.date);
  const out: Record<string, string[]> = {};
  for (const [id, set] of map) out[id] = [...set].sort();
  return out;
}

export function personFreeOnDates(
  person: { busyDates?: string[] },
  dates: string[],
): boolean {
  if (dates.length === 0) return true;
  const busy = new Set(person.busyDates || []);
  return dates.every((d) => !busy.has(d));
}

export type RankedRosterPerson = {
  person: RosterPerson;
  free: boolean;
  earnRatio: number;
};

/** Свободные выше; среди равных — кто меньше заработал в месяце. */
export function rankRosterPeople(
  people: RosterPerson[],
  dates: string[],
): RankedRosterPerson[] {
  const maxEarned = people.reduce(
    (m, p) => Math.max(m, Math.max(0, p.monthEarned || 0)),
    0,
  );
  return [...people]
    .map((person) => ({
      person,
      free: personFreeOnDates(person, dates),
      earnRatio: maxEarned > 0 ? Math.max(0, person.monthEarned || 0) / maxEarned : 0,
    }))
    .sort((a, b) => {
      if (a.free !== b.free) return a.free ? -1 : 1;
      const earned = (a.person.monthEarned || 0) - (b.person.monthEarned || 0);
      if (earned !== 0) return earned;
      return a.person.name.localeCompare(b.person.name, "ru");
    });
}

export function normalizeRosterSearch(raw: string): string {
  return String(raw || "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

export function rosterPersonMatchesQuery(
  person: {
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    specialties?: Array<{ name?: string | null }>;
  },
  query: string,
): boolean {
  const q = normalizeRosterSearch(query);
  if (!q) return true;
  const hay = [
    person.name,
    person.firstName,
    person.lastName,
    ...(person.specialties || []).map((s) => s.name),
  ]
    .map((s) => normalizeRosterSearch(String(s || "")))
    .filter(Boolean);
  return q.split(" ").every((tok) => hay.some((h) => h.includes(tok)));
}

export function itemsOnRosterDay(items: RosterItem[], dayKey: string): RosterItem[] {
  return items.filter((item) => item.start <= dayKey && dayKey <= item.end);
}

export function groupRosterByKind(
  items: RosterItem[],
): Array<{ kind: RosterKind; label: string; items: RosterItem[] }> {
  const order: RosterKind[] = ["EVENT", "RENTAL", "TASK"];
  return order
    .map((kind) => ({
      kind,
      label: ROSTER_KIND_LABELS[kind],
      items: items.filter((i) => i.kind === kind),
    }))
    .filter((g) => g.items.length > 0);
}
