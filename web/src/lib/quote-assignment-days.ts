import {
  addDays,
  formatDayMonth,
  formatRuDate,
  parseEventDate,
  startOfDay,
} from "@/lib/dates";
import {
  assignmentDisplayName,
  assignmentKind,
  isFreelancerAssignment,
  isVacantAssignment,
} from "@/lib/quote-assignments";

export function workingDayCount(durationDays: unknown): number {
  const n = Number(durationDays);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(366, Math.round(n));
}

/** 1-based рабочий день; иначе null (все дни). */
export function normDayIndex(dayIndex: unknown): number | null {
  if (dayIndex == null || dayIndex === "") return null;
  const n = Number(dayIndex);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.round(n);
}

export function dayHeading(dayIndex: number): string {
  return `(${dayIndex} день)`;
}

export type DayAssignmentLike = {
  id: string;
  kind?: string | null;
  dayIndex?: number | null;
  userId?: string | null;
  isFreelancer?: boolean | null;
  freelancerName?: string | null;
  specialtyId?: string | null;
  specialty?: { id?: string; name?: string } | null;
  zoneId?: string | null;
  zone?: { id?: string; name?: string } | null;
  user?: {
    id?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
  } | null;
};

function isEventAssignment(a: { kind?: string | null }): boolean {
  return assignmentKind(a) !== "MOUNT";
}

export function eventAssignments(assignments: DayAssignmentLike[]): DayAssignmentLike[] {
  return assignments.filter(isEventAssignment);
}

export function mountAssignments(assignments: DayAssignmentLike[]): DayAssignmentLike[] {
  return assignments.filter((a) => !isEventAssignment(a));
}

export type ZoneWorkingDays = {
  id: string;
  name?: string | null;
  sortOrder?: number | null;
  workingDayIndexes?: number[] | null;
};

export function rangeDays(n: number): number[] {
  return Array.from({ length: workingDayCount(n) }, (_, i) => i + 1);
}

/** Пустой массив = «все дни мероприятия». */
export function parseWorkingDayIndexes(
  raw: unknown,
  eventDays: number,
): number[] {
  if (!Array.isArray(raw)) return [];
  const days = workingDayCount(eventDays);
  const out = new Set<number>();
  for (const v of raw) {
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    const i = Math.round(n);
    if (i >= 1 && i <= days) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

export function storedWorkingDayIndexes(
  indexes: number[],
  eventDays: number,
): number[] {
  const days = workingDayCount(eventDays);
  const parsed = parseWorkingDayIndexes(indexes, days);
  if (parsed.length === 0 || parsed.length === days) return [];
  return parsed;
}

export function zoneWorkingDays(
  zoneId: string | null | undefined,
  eventDays: number,
  zones?: ZoneWorkingDays[] | null,
): number[] {
  const all = rangeDays(eventDays);
  if (!zoneId || !zones?.length) return all;
  const zone = zones.find((z) => z.id === zoneId);
  if (!zone) return all;
  const parsed = parseWorkingDayIndexes(zone.workingDayIndexes, eventDays);
  return parsed.length > 0 ? parsed : all;
}

/** Число дней для расчёта строки сметы в этой зоне. */
export function zoneDurationDays(
  zoneId: string | null | undefined,
  eventDays: number,
  zones?: ZoneWorkingDays[] | null,
): number {
  return Math.max(1, zoneWorkingDays(zoneId, eventDays, zones).length);
}

/**
 * Пиковое количество позиции в один день с учётом графиков зон.
 * Непересекающиеся зоны не складываются в единицы-дни.
 */
export function peakItemQtyByWorkingDay(
  blocks: Array<{
    catalogItemId?: string | null;
    zoneId?: string | null;
    qty?: number | null;
  }>,
  eventDays: number,
  zones?: ZoneWorkingDays[] | null,
): Map<string, number> {
  const byItemDay = new Map<string, Map<number, number>>();
  for (const block of blocks) {
    if (!block.catalogItemId) continue;
    const qty = Number(block.qty) || 0;
    if (qty <= 0) continue;
    const days = zoneWorkingDays(block.zoneId, eventDays, zones);
    let byDay = byItemDay.get(block.catalogItemId);
    if (!byDay) {
      byDay = new Map<number, number>();
      byItemDay.set(block.catalogItemId, byDay);
    }
    for (const day of days) {
      byDay.set(day, (byDay.get(day) || 0) + qty);
    }
  }

  const peaks = new Map<string, number>();
  for (const [itemId, byDay] of byItemDay) {
    peaks.set(itemId, Math.max(0, ...byDay.values()));
  }
  return peaks;
}

export function assignmentCoveredDays(
  a: DayAssignmentLike,
  eventDays: number,
  zones?: ZoneWorkingDays[] | null,
): number[] {
  const di = normDayIndex(a.dayIndex);
  if (di != null) return [di];
  return zoneWorkingDays(a.zoneId || a.zone?.id, eventDays, zones);
}

export function eventDayIndexFromDate(
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

export function workingDayIndexesFromRange(
  eventStart: Date,
  eventDays: number,
  rangeStart: Date,
  rangeDays: number,
): number[] {
  const days = Math.max(1, Math.round(Number(rangeDays)) || 1);
  const start = startOfDay(rangeStart);
  const out: number[] = [];
  for (let i = 0; i < days; i++) {
    const idx = eventDayIndexFromDate(
      eventStart,
      eventDays,
      addDays(start, i),
    );
    if (idx != null) out.push(idx);
  }
  return storedWorkingDayIndexes(out, eventDays);
}

export function rangeFromWorkingDayIndexes(
  eventStart: Date,
  eventDays: number,
  indexes: number[],
): { date: string; durationDays: number } {
  const days = workingDayCount(eventDays);
  const parsed = parseWorkingDayIndexes(indexes, days);
  const list = parsed.length > 0 ? parsed : rangeDays(days);
  const from = list[0] ?? 1;
  const to = list[list.length - 1] ?? from;
  return {
    date: formatRuDate(addDays(startOfDay(eventStart), from - 1)),
    durationDays: Math.max(1, to - from + 1),
  };
}

export function formatZoneDateHint(
  indexes: number[],
  eventDays: number,
  eventStart?: Date | string | null,
): string {
  const days = workingDayCount(eventDays);
  const parsed = parseWorkingDayIndexes(indexes, days);
  const list = parsed.length > 0 ? parsed : rangeDays(days);
  if (list.length === 0) return "";
  if (parsed.length === 0 || parsed.length === days) {
    return days <= 1 ? "" : "все дни";
  }
  const start =
    eventStart instanceof Date
      ? startOfDay(eventStart)
      : parseEventDate(typeof eventStart === "string" ? eventStart : null);
  if (!start) return formatDayIndexList(list);
  const first = formatDayMonth(addDays(start, list[0]! - 1));
  const last = formatDayMonth(addDays(start, list[list.length - 1]! - 1));
  return first === last ? first : `${first} – ${last}`;
}

/**
 * Слоты дня: подневные (dayIndex) плюс общие (null).
 * Один техник на день не должен выкидывать спецов с dayIndex = null.
 */
export function effectiveEventAssignments<T extends DayAssignmentLike>(
  assignments: T[],
  dayIndex: number,
  opts?: { eventDays?: number; zones?: ZoneWorkingDays[] | null },
): T[] {
  const event = assignments.filter((a) => isEventAssignment(a));
  const day = normDayIndex(dayIndex);
  if (day == null) {
    return event.filter((a) => normDayIndex(a.dayIndex) == null);
  }
  const perDay = event.filter((a) => normDayIndex(a.dayIndex) === day);
  const useZones = opts?.zones != null || opts?.eventDays != null;
  const eventDays = workingDayCount(opts?.eventDays);
  const shared = event.filter((a) => {
    if (normDayIndex(a.dayIndex) != null) return false;
    if (!useZones) return true;
    return assignmentCoveredDays(a, eventDays, opts?.zones).includes(day);
  });
  const perDayKeys = new Set(perDay.map(assignmentDayFingerprint));
  const sharedKept = shared.filter(
    (a) => !perDayKeys.has(assignmentDayFingerprint(a)),
  );
  return [...sharedKept, ...perDay];
}

function personKey(a: DayAssignmentLike): string {
  if (isVacantAssignment(a)) return "vacant";
  if (isFreelancerAssignment(a) || !a.userId) {
    return `fl:${String(a.freelancerName || "").trim().toLowerCase()}`;
  }
  return `u:${a.userId}`;
}

function roleKey(a: DayAssignmentLike): string {
  return String(a.specialtyId || a.specialty?.id || a.specialty?.name || "");
}

export function assignmentDayFingerprint(a: DayAssignmentLike): string {
  return [personKey(a), roleKey(a), String(a.zoneId || "")].join("\t");
}

export function dayRosterFingerprint(assignments: DayAssignmentLike[]): string {
  return assignments
    .map(assignmentDayFingerprint)
    .sort()
    .join("\n");
}

export function specialistDaysDiffer(
  assignments: DayAssignmentLike[],
  durationDays: unknown,
): boolean {
  const days = workingDayCount(durationDays);
  const event = eventAssignments(assignments);
  if (days <= 1) return false;
  if (!event.some((a) => normDayIndex(a.dayIndex) != null)) return false;
  const first = dayRosterFingerprint(effectiveEventAssignments(event, 1));
  for (let d = 2; d <= days; d++) {
    if (dayRosterFingerprint(effectiveEventAssignments(event, d)) !== first) {
      return true;
    }
  }
  return false;
}

export type WhoWorksLine = {
  id: string;
  name: string;
  role: string;
  vacant: boolean;
  freelancer: boolean;
  /** «2, 3 день, 26 авг, 27 авг» — пусто, если все дни или один день. */
  detail: string;
  /** Готовая строка для спеки / экспорта. */
  text: string;
};

export type WhoWorksView =
  | { split: false; lines: WhoWorksLine[] }
  | {
      split: true;
      days: Array<{ dayIndex: number; label: string; lines: WhoWorksLine[] }>;
    };

export function toWhoWorksLine(a: DayAssignmentLike): WhoWorksLine {
  const vacant = isVacantAssignment(a);
  const freelancer = isFreelancerAssignment(a);
  const role = String(a.specialty?.name || "").trim() || "должность";
  const name = vacant ? "не назначен" : assignmentDisplayName(a) || "не назначен";
  return {
    id: a.id,
    name,
    role,
    vacant,
    freelancer,
    detail: "",
    text: vacant ? `Нужно назначить — ${role}` : `${name} — ${role}`,
  };
}

export function formatDayIndexList(days: number[]): string {
  if (days.length === 0) return "";
  return `${days.join(", ")} день`;
}

export function formatDaysWithDates(
  days: number[],
  eventStart?: Date | string | null,
): string {
  const indexes = formatDayIndexList(days);
  if (!indexes) return "";
  const start =
    eventStart instanceof Date
      ? startOfDay(eventStart)
      : parseEventDate(typeof eventStart === "string" ? eventStart : null);
  if (!start) return indexes;
  const dates = days
    .map((d) => formatDayMonth(addDays(start, Math.max(1, d) - 1)))
    .join(", ");
  return dates ? `${indexes} (${dates})` : indexes;
}

function roleGroupKey(a: DayAssignmentLike): string {
  return [
    assignmentKind(a),
    a.specialtyId || a.specialty?.id || a.specialty?.name || "",
    a.zoneId || "",
  ].join("\t");
}

function coverageForRole(
  group: DayAssignmentLike[],
  eventDays: number,
  eventStart?: Date | string | null,
  zones?: ZoneWorkingDays[] | null,
): WhoWorksLine[] {
  const role =
    String(group[0]?.specialty?.name || "").trim() || "должность";
  const people = new Map<
    string,
    { sample: DayAssignmentLike; days: Set<number> }
  >();
  const vacantByDay = new Map<number, number>();
  const relevantDays = new Set<number>();

  for (const a of group) {
    const covered = assignmentCoveredDays(a, eventDays, zones);
    for (const d of covered) relevantDays.add(d);
    if (isVacantAssignment(a)) {
      for (const d of covered) {
        vacantByDay.set(d, (vacantByDay.get(d) || 0) + 1);
      }
      continue;
    }
    const key = personKey(a);
    const cur = people.get(key);
    if (cur) {
      for (const d of covered) cur.days.add(d);
    } else {
      people.set(key, { sample: a, days: new Set(covered) });
    }
  }

  const filledByDay = new Map<number, number>();
  for (const d of relevantDays) filledByDay.set(d, 0);
  for (const { days } of people.values()) {
    for (const d of days) {
      if (relevantDays.has(d)) {
        filledByDay.set(d, (filledByDay.get(d) || 0) + 1);
      }
    }
  }

  let qty = 0;
  for (const d of relevantDays) {
    qty = Math.max(
      qty,
      (filledByDay.get(d) || 0) + (vacantByDay.get(d) || 0),
    );
  }
  if (qty === 0) qty = Math.max(people.size, group.length > 0 ? 1 : 0);

  for (const d of relevantDays) {
    const need = Math.max(0, qty - (filledByDay.get(d) || 0));
    if (need > (vacantByDay.get(d) || 0)) vacantByDay.set(d, need);
  }

  const lines: WhoWorksLine[] = [];
  for (const { sample, days } of people.values()) {
    const dayList = [...days].filter((d) => relevantDays.has(d)).sort(
      (a, b) => a - b,
    );
    const allDays = eventDays > 1 && dayList.length === eventDays;
    const detail =
      eventDays > 1 && !allDays ? formatDaysWithDates(dayList, eventStart) : "";
    const name = assignmentDisplayName(sample) || "Сотрудник";
    lines.push({
      id: sample.id,
      name,
      role,
      vacant: false,
      freelancer: isFreelancerAssignment(sample),
      detail,
      text: detail ? `${name} — ${role} · ${detail}` : `${name} — ${role}`,
    });
  }

  const byCount = new Map<number, number[]>();
  for (const d of [...relevantDays].sort((a, b) => a - b)) {
    const n = vacantByDay.get(d) || 0;
    if (n <= 0) continue;
    const list = byCount.get(n) || [];
    list.push(d);
    byCount.set(n, list);
  }
  const vacantGroups = [...byCount.entries()].sort((a, b) => a[1][0]! - b[1][0]!);

  for (const [count, dayList] of vacantGroups) {
    const qtyLabel = count > 1 ? ` ×${count}` : "";
    const detail =
      eventDays > 1 ? formatDaysWithDates(dayList, eventStart) : "";
    const text = detail
      ? `Нужно назначить ${role}${qtyLabel} на ${detail}`
      : `Нужно назначить — ${role}${qtyLabel}`;
    lines.push({
      id: `vacant:${roleGroupKey(group[0]!)}:${dayList.join(",")}:${count}`,
      name: text,
      role,
      vacant: true,
      freelancer: false,
      detail,
      text,
    });
  }
  return lines;
}

/** Сводка: кто на каких днях + одна запись на остаток «нужно назначить». */
export function staffCoverageLines(
  assignments: DayAssignmentLike[],
  durationDays: unknown,
  eventStart?: Date | string | null,
  zones?: ZoneWorkingDays[] | null,
): WhoWorksLine[] {
  const eventDays = workingDayCount(durationDays);
  const event = eventAssignments(assignments);
  const mount = mountAssignments(assignments);
  const lines: WhoWorksLine[] = [];

  const groups = new Map<string, DayAssignmentLike[]>();
  for (const a of event) {
    const key = roleGroupKey(a);
    const list = groups.get(key) || [];
    list.push(a);
    groups.set(key, list);
  }
  for (const group of groups.values()) {
    lines.push(...coverageForRole(group, eventDays, eventStart, zones));
  }
  for (const a of mount) {
    lines.push(toWhoWorksLine(a));
  }
  return lines;
}

export function whoWorksView(
  assignments: DayAssignmentLike[],
  durationDays: unknown,
  eventStart?: Date | string | null,
  zones?: ZoneWorkingDays[] | null,
): WhoWorksView {
  const lines = staffCoverageLines(
    eventAssignments(assignments),
    durationDays,
    eventStart,
    zones,
  );
  return { split: false, lines };
}
