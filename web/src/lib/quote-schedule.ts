import {
  addDays,
  endDateFromDuration,
  formatRuDate,
  parseEventDate,
  startOfDay,
} from "@/lib/dates";

type QuoteScheduleFields = {
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
