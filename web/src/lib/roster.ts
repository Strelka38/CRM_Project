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
import {
  normDayIndex,
  workingDayCount,
  zoneWorkingDays,
  type ZoneWorkingDays,
} from "@/lib/quote-assignment-days";
import { CATALOG_OWNERS, type CatalogOwnerValue } from "@/lib/catalog-owner";
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
  kind?: "staff" | "freelancer";
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
  /** Фирмы менеджера, который завёл смету / запись. */
  firmOwners: CatalogOwnerValue[];
  mountStart: string | null;
  mountEnd: string | null;
  demountStart: string | null;
  demountEnd: string | null;
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
  zones?: ZoneWorkingDays[] | null;
  assignments: RosterQuoteAssignmentInput[];
  /** Фирмы менеджера-владельца сметы (ШМ / ДК / NE). */
  firmOwners?: CatalogOwnerValue[] | null;
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
  /** Фирмы менеджера, который завёл запись. */
  firmOwners?: CatalogOwnerValue[] | null;
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

function atomicItem(
  partial: Omit<
    RosterItem,
    | "color"
    | "slotOrdinal"
    | "firmOwners"
    | "mountStart"
    | "mountEnd"
    | "demountStart"
    | "demountEnd"
  > & {
    slotOrdinal?: number;
    firmOwners?: CatalogOwnerValue[];
    mountStart?: string | null;
    mountEnd?: string | null;
    demountStart?: string | null;
    demountEnd?: string | null;
  },
): RosterItem {
  return {
    ...partial,
    specialtyId: partial.specialtyId ?? null,
    mountDuty: partial.mountDuty ?? null,
    slotOrdinal: partial.slotOrdinal ?? 0,
    firmOwners: partial.firmOwners ?? [],
    mountStart: partial.mountStart ?? null,
    mountEnd: partial.mountEnd ?? null,
    demountStart: partial.demountStart ?? null,
    demountEnd: partial.demountEnd ?? null,
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
  const zoneDays = zoneWorkingDays(a.zoneId, eventDays, q.zones);
  const from = zoneDays[0] ?? 1;
  const to = zoneDays[zoneDays.length - 1] ?? eventDays;
  const subset = zoneDays.length > 0 && zoneDays.length < eventDays;
  return {
    start: dateForEventDay(eventStart, from),
    end: dateForEventDay(eventStart, to),
    dayIndexStart: subset ? from : null,
    dayIndexEnd: subset ? to : null,
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

export function quoteDutyWindows(
  q: Pick<
    RosterQuoteInput,
    "mountDate" | "mountDurationDays" | "demountDate" | "demountDurationDays"
  >,
  eventStart: Date,
  eventDays: number,
): {
  mount: { start: Date; end: Date };
  demount: { start: Date; end: Date };
} {
  return {
    mount: dateWindowFromField(
      q.mountDate,
      q.mountDurationDays,
      addDays(eventStart, -1),
    ),
    demount: dateWindowFromField(
      q.demountDate,
      q.demountDurationDays,
      addDays(eventStart, eventDays),
    ),
  };
}

export function quoteMountWindows(
  q: RosterQuoteInput,
  a: RosterQuoteAssignmentInput,
  eventStart: Date,
  eventDays: number,
): Array<{ duty: "mount" | "demount"; start: Date; end: Date }> {
  const flags = mountDutyFlags(a);
  const windows = quoteDutyWindows(q, eventStart, eventDays);
  const out: Array<{ duty: "mount" | "demount"; start: Date; end: Date }> = [];
  if (flags.onMount) out.push({ duty: "mount", ...windows.mount });
  if (flags.onDemount) out.push({ duty: "demount", ...windows.demount });
  return out;
}

export function buildQuoteRosterItems(q: RosterQuoteInput): RosterItem[] {
  const eventStart = eventStartDate(q);
  if (!eventStart) return [];
  const title = quoteTitle(q);
  const eventDays = workingDayCount(q.durationDays);
  const eventStartKey = formatDateKey(eventStart);
  const firmOwners = [...(q.firmOwners || [])];
  const dutyWindows = quoteDutyWindows(q, eventStart, eventDays);
  const mountKeys = rangeKeys(dutyWindows.mount.start, dutyWindows.mount.end);
  const demountKeys = rangeKeys(
    dutyWindows.demount.start,
    dutyWindows.demount.end,
  );
  const dutyDates = {
    mountStart: mountKeys.start,
    mountEnd: mountKeys.end,
    demountStart: demountKeys.start,
    demountEnd: demountKeys.end,
  };
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
          firmOwners,
          ...dutyDates,
        }),
      );
    }
  }
  for (const duty of ["mount", "demount"] as const) {
    const keys = duty === "mount" ? mountKeys : demountKeys;
    items.push(
      atomicItem({
        id: `qa:${q.id}:open:${duty}`,
        source: "quote",
        kind: "EVENT",
        assignmentKind: "MOUNT",
        quoteId: q.id,
        entryId: null,
        assignmentIds: [],
        userId: null,
        vacant: true,
        freelancer: false,
        name: "",
        role: duty === "mount" ? "монтаж" : "демонтаж",
        mountDuty: duty,
        title,
        subtitle: duty === "mount" ? "монтаж" : "демонтаж",
        start: keys.start,
        end: keys.end,
        dayIndexStart: null,
        dayIndexEnd: null,
        eventStart: eventStartKey,
        eventDays,
        resizable: false,
        specialtyId: null,
        firmOwners,
        ...dutyDates,
      }),
    );
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
  const firmOwners = [...(e.firmOwners || [])];
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
        firmOwners,
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
        firmOwners,
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
        firmOwners,
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
    item.vacant
      ? item.assignmentIds.length === 0
        ? "vac:open"
        : `vac:${item.slotOrdinal}`
      : "filled",
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
    return compareRosterLaneItems(a, b);
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

export type RosterSpecialtyFilter = {
  id: string | null;
  name: string;
};

function specialtyKey(s: { id?: string | null; name?: string | null }): string {
  const id = String(s.id || "").trim();
  if (id) return `id:${id}`;
  return `name:${normalizeRosterSearch(s.name || "")}`;
}

export function sameRosterSpecialtyFilter(
  a: RosterSpecialtyFilter | null | undefined,
  b: RosterSpecialtyFilter | null | undefined,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return specialtyKey(a) === specialtyKey(b);
}

/** Фильтр специальности при клике на слот — не текст поиска. */
export function rosterSpecialtyFilterForSlot(
  item: Pick<
    RosterItem,
    "assignmentKind" | "mountDuty" | "specialtyId" | "role"
  >,
): RosterSpecialtyFilter | null {
  if (item.assignmentKind === "MOUNT" || item.mountDuty) {
    return { id: null, name: ROSTER_MOUNT_SPECIALTY_QUERY };
  }
  const name = String(item.role || "").trim();
  const id = String(item.specialtyId || "").trim() || null;
  if (!id && !name) return null;
  return { id, name };
}

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

export function rosterOwnersAllSelected(
  selected: Record<CatalogOwnerValue, boolean>,
): boolean {
  return CATALOG_OWNERS.every((o) => selected[o.value]);
}

/** Мероприятие видно, если его завёл менеджер выбранной фирмы. */
export function rosterItemMatchesFirms(
  item: { firmOwners?: CatalogOwnerValue[] | null },
  selected: Record<CatalogOwnerValue, boolean>,
): boolean {
  if (rosterOwnersAllSelected(selected)) return true;
  if (CATALOG_OWNERS.every((o) => !selected[o.value])) return false;
  const owners = item.firmOwners || [];
  if (owners.length === 0) return false;
  return owners.some((o) => selected[o]);
}

export function isOpenMountDropSlot(
  item: Pick<RosterItem, "vacant" | "assignmentIds" | "mountDuty">,
): boolean {
  return item.vacant && item.assignmentIds.length === 0 && item.mountDuty != null;
}

export function isVacantInstallerSlot(
  item: Pick<RosterItem, "vacant" | "assignmentKind" | "mountDuty" | "assignmentIds">,
): boolean {
  if (!item.vacant) return false;
  if (isOpenMountDropSlot(item)) return false;
  return item.assignmentKind === "MOUNT" || item.mountDuty != null;
}

export function dateInRosterResizeWindow(
  item: Pick<
    RosterItem,
    | "eventStart"
    | "eventDays"
    | "mountStart"
    | "mountEnd"
    | "demountStart"
    | "demountEnd"
  >,
  dayKey: string,
): boolean {
  if (item.eventStart && item.eventDays > 0) {
    const start = parseEventDate(item.eventStart);
    if (start) {
      const end = formatDateKey(addDays(start, item.eventDays - 1));
      if (item.eventStart <= dayKey && dayKey <= end) return true;
    }
  }
  if (
    item.mountStart &&
    item.mountEnd &&
    item.mountStart <= dayKey &&
    dayKey <= item.mountEnd
  ) {
    return true;
  }
  if (
    item.demountStart &&
    item.demountEnd &&
    item.demountStart <= dayKey &&
    dayKey <= item.demountEnd
  ) {
    return true;
  }
  return false;
}

function rangesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string | null,
  bEnd: string | null,
): boolean {
  if (!bStart || !bEnd) return false;
  return aStart <= bEnd && aEnd >= bStart;
}

export function rosterRangeDuties(
  item: Pick<RosterItem, "mountStart" | "mountEnd" | "demountStart" | "demountEnd">,
  startKey: string,
  endKey: string,
): Array<"mount" | "demount"> {
  const out: Array<"mount" | "demount"> = [];
  if (rangesOverlap(startKey, endKey, item.mountStart, item.mountEnd)) {
    out.push("mount");
  }
  if (rangesOverlap(startKey, endKey, item.demountStart, item.demountEnd)) {
    out.push("demount");
  }
  return out;
}

export function personHasRosterRole(
  person: { specialties?: Array<{ id?: string; name?: string }> },
  item: Pick<RosterItem, "assignmentKind" | "specialtyId" | "role">,
): boolean {
  if (item.assignmentKind === "MOUNT") return true;
  if (!item.specialtyId && !item.role) return true;
  return personMatchesSpecialtyFilter(person, {
    id: item.specialtyId || null,
    name: item.role || "",
  });
}

export function personMatchesSpecialtyFilter(
  person: { specialties?: Array<{ id?: string | null; name?: string | null }> },
  filter: RosterSpecialtyFilter | null | undefined,
): boolean {
  if (!filter) return true;
  const specs = person.specialties || [];
  if (filter.id && specs.some((s) => s.id === filter.id)) return true;
  const q = normalizeRosterSearch(filter.name);
  if (!q) return !filter.id;
  return specs.some((s) => {
    const n = normalizeRosterSearch(s.name || "");
    return n === q || n.includes(q) || q.includes(n);
  });
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

/** Занятые слоты выше пустых: «Копняев» над свободным «демонтаж», не под ним. */
export function compareRosterLaneItems(
  a: Pick<RosterItem, "vacant" | "name" | "role" | "assignmentIds" | "mountDuty">,
  b: Pick<RosterItem, "vacant" | "name" | "role" | "assignmentIds" | "mountDuty">,
): number {
  const aVac = a.vacant ? 1 : 0;
  const bVac = b.vacant ? 1 : 0;
  if (aVac !== bVac) return aVac - bVac;
  const aOpen = isOpenMountDropSlot(a) ? 1 : 0;
  const bOpen = isOpenMountDropSlot(b) ? 1 : 0;
  if (aOpen !== bOpen) return aOpen - bOpen;
  return (a.name || a.role).localeCompare(b.name || b.role, "ru");
}

/** Дорожка 0 сверху. Сначала длинные и занятые, пустое поле монтажа — снизу. */
export function packRosterLanes<
  T extends {
    startCol: number;
    span: number;
    item: Pick<
      RosterItem,
      "vacant" | "name" | "role" | "assignmentIds" | "mountDuty"
    >;
  },
>(segs: T[]): Array<T & { lane: number }> {
  const sorted = [...segs].sort((a, b) => {
    if (a.startCol !== b.startCol) return a.startCol - b.startCol;
    if (a.span !== b.span) return b.span - a.span;
    return compareRosterLaneItems(a.item, b.item);
  });
  const laneEnds: number[] = [];
  return sorted.map((seg) => {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane]! > seg.startCol) lane += 1;
    laneEnds[lane] = seg.startCol + seg.span;
    return { ...seg, lane };
  });
}

/** Смещения дорожек: группы в разных днях занимают верх колонки, а не лесенку. */
export function packRosterGroupOffsets(
  groups: Array<{ startCol: number; endExclusive: number; height: number }>,
  colHeight: number[] = [],
): number[] {
  return groups.map((g) => {
    let offset = 0;
    for (let c = g.startCol; c < g.endExclusive; c++) {
      offset = Math.max(offset, colHeight[c] ?? 0);
    }
    for (let c = g.startCol; c < g.endExclusive; c++) {
      colHeight[c] = offset + g.height;
    }
    return offset;
  });
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

export function collectFreelancerBusyDates(
  items: Array<{
    freelancer?: boolean;
    vacant?: boolean;
    name: string;
    start: string;
    end: string;
  }>,
  freelancers: Array<{ id: string; name: string }>,
): Record<string, string[]> {
  const idByKey = new Map<string, string>();
  for (const f of freelancers) {
    const key = f.name.trim().replace(/\s+/g, " ").toLowerCase();
    if (key) idByKey.set(key, f.id);
  }
  const map = new Map<string, Set<string>>();
  function add(id: string, date: string) {
    if (!id || !date) return;
    const set = map.get(id) || new Set<string>();
    set.add(date);
    map.set(id, set);
  }
  for (const item of items) {
    if (item.vacant || !item.freelancer) continue;
    const id = idByKey.get(item.name.trim().replace(/\s+/g, " ").toLowerCase());
    if (!id) continue;
    for (const day of eachDateKey(item.start, item.end)) add(id, day);
  }
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
