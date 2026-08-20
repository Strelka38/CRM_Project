import {
  addDays,
  endDateFromDuration,
  formatRuDate,
  parseEventDate,
  startOfDay,
} from "@/lib/dates";

/** Same calendar day, regardless of ДД.ММ.ГГГГ vs ISO. */
export function sameCalendarDate(a: string, b: string): boolean {
  const da = parseEventDate(a);
  const db = parseEventDate(b);
  if (!da && !db) return !String(a || "").trim() && !String(b || "").trim();
  if (!da || !db) return false;
  return formatRuDate(da) === formatRuDate(db);
}

/** Монтаж = день до начала мероприятия. */
export function defaultMountDate(eventDate: string): string {
  const d = parseEventDate(eventDate);
  if (!d) return "";
  return formatRuDate(addDays(startOfDay(d), -1));
}

/** Демонтаж = день после последнего дня мероприятия. */
export function defaultDemountDate(
  eventDate: string,
  durationDays: number,
): string {
  const d = parseEventDate(eventDate);
  if (!d) return "";
  const end = endDateFromDuration(d, Math.max(1, durationDays || 1));
  return formatRuDate(addDays(end, 1));
}

/**
 * Fill mount/demount when empty or still equal to the previous auto value.
 * Manual dates are kept.
 */
export function applyAutoMountDemount(opts: {
  prevDate: string;
  prevDurationDays: number;
  nextDate: string;
  nextDurationDays: number;
  mountDate: string;
  demountDate: string;
}): { mountDate: string; demountDate: string } {
  const nextMount = defaultMountDate(opts.nextDate);
  const nextDemount = defaultDemountDate(opts.nextDate, opts.nextDurationDays);
  const prevMount = defaultMountDate(opts.prevDate);
  const prevDemount = defaultDemountDate(opts.prevDate, opts.prevDurationDays);

  const mountWasAuto =
    !String(opts.mountDate || "").trim() ||
    (Boolean(prevMount) && sameCalendarDate(opts.mountDate, prevMount));
  const demountWasAuto =
    !String(opts.demountDate || "").trim() ||
    (Boolean(prevDemount) && sameCalendarDate(opts.demountDate, prevDemount));

  return {
    mountDate: mountWasAuto && nextMount ? nextMount : opts.mountDate,
    demountDate:
      demountWasAuto && nextDemount ? nextDemount : opts.demountDate,
  };
}

/** 30-minute slots; keep a legacy custom value in the list. */
export function quoteTimeOptions(current?: string): string[] {
  const opts: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      opts.push(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`,
      );
    }
  }
  const extra = String(current || "").trim();
  if (extra && !opts.includes(extra)) opts.unshift(extra);
  return opts;
}

export type QuoteScheduleFields = {
  date: string;
  eventDate: Date | null;
  durationDays: number;
  mountDate?: string | null;
  mountDurationDays?: number | null;
  demountDate?: string | null;
  demountDurationDays?: number | null;
};

/** Inclusive occupancy: event + mount + demount windows. */
export function quoteOccupancyRange(
  q: QuoteScheduleFields,
): { start: Date; end: Date } | null {
  const eventStart = q.eventDate
    ? startOfDay(q.eventDate)
    : parseEventDate(q.date);
  if (!eventStart) return null;

  const eventDays = Math.max(1, q.durationDays || 1);
  const eventEnd = endDateFromDuration(eventStart, eventDays);
  const bounds: Date[] = [eventStart, eventEnd];

  const mount = parseEventDate(q.mountDate);
  if (mount) {
    const m0 = startOfDay(mount);
    const mDays = Math.max(1, q.mountDurationDays || 1);
    bounds.push(m0, endDateFromDuration(m0, mDays));
  }

  const demount = parseEventDate(q.demountDate);
  if (demount) {
    const d0 = startOfDay(demount);
    const dDays = Math.max(1, q.demountDurationDays || 1);
    bounds.push(d0, endDateFromDuration(d0, dDays));
  }

  const start = bounds.reduce((a, b) => (a <= b ? a : b));
  const end = bounds.reduce((a, b) => (a >= b ? a : b));
  return { start, end };
}

export function dateRangesOverlap(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): boolean {
  return a.start.getTime() <= b.end.getTime() && b.start.getTime() <= a.end.getTime();
}

/** Occupancy windows of two quotes overlap (event + mount + demount). */
export function quoteOccupanciesOverlap(
  a: QuoteScheduleFields,
  b: QuoteScheduleFields,
): boolean {
  const ra = quoteOccupancyRange(a);
  const rb = quoteOccupancyRange(b);
  if (!ra || !rb) return false;
  return dateRangesOverlap(ra, rb);
}

/** Query params for /api/stock occupancy (mount/demount included). */
export function appendOccupancyParams(
  params: URLSearchParams,
  q: {
    date?: string | null;
    durationDays?: number | null;
    mountDate?: string | null;
    mountDurationDays?: number | null;
    demountDate?: string | null;
    demountDurationDays?: number | null;
  },
) {
  if (q.date) params.set("eventDate", q.date);
  params.set("days", String(Math.max(1, q.durationDays || 1)));
  if (q.mountDate) params.set("mountDate", q.mountDate);
  params.set("mountDays", String(Math.max(1, q.mountDurationDays || 1)));
  if (q.demountDate) params.set("demountDate", q.demountDate);
  params.set("demountDays", String(Math.max(1, q.demountDurationDays || 1)));
}

/** Inclusive intersection days as ДД.ММ.ГГГГ. */
export function overlapDateLabels(
  a: { start: Date; end: Date },
  b: { start: Date; end: Date },
): string[] {
  const start = a.start > b.start ? a.start : b.start;
  const end = a.end < b.end ? a.end : b.end;
  if (start > end) return [];
  const labels: string[] = [];
  let cur = startOfDay(start);
  const last = startOfDay(end);
  while (cur.getTime() <= last.getTime()) {
    labels.push(formatRuDate(cur));
    cur = addDays(cur, 1);
  }
  return labels;
}
