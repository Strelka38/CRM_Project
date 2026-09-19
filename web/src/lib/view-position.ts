import { formatDateKey, parseEventDate, startOfDay } from "./dates";

export const CALENDAR_VIEW_STORAGE_KEY = "calendar.view";
export const ROSTER_VIEW_STORAGE_KEY = "roster.view";

export type CalendarViewPosition = {
  cursor: Date;
  selectedDay: Date;
};

export type RosterViewPosition = {
  viewStart: Date;
  selectedDay: Date;
};

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function readJson(raw: string | null | undefined): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseCalendarViewPosition(
  raw: string | null | undefined,
): CalendarViewPosition | null {
  const data = readJson(raw);
  if (!data) return null;
  const cursorRaw = isDateKey(data.cursor)
    ? data.cursor
    : typeof data.month === "string" && /^\d{4}-\d{2}$/.test(data.month)
      ? `${data.month}-01`
      : null;
  const cursorDate = parseEventDate(cursorRaw);
  if (!cursorDate) return null;
  const cursor = startOfMonth(cursorDate);
  const selectedDate = isDateKey(data.selected)
    ? parseEventDate(data.selected)
    : null;
  return {
    cursor,
    selectedDay: startOfDay(selectedDate ?? cursor),
  };
}

export function serializeCalendarViewPosition(pos: CalendarViewPosition): string {
  return JSON.stringify({
    cursor: formatDateKey(startOfMonth(pos.cursor)),
    selected: formatDateKey(startOfDay(pos.selectedDay)),
  });
}

export function parseRosterViewPosition(
  raw: string | null | undefined,
): RosterViewPosition | null {
  const data = readJson(raw);
  if (!data) return null;
  const startDate = isDateKey(data.start) ? parseEventDate(data.start) : null;
  if (!startDate) return null;
  const selectedDate = isDateKey(data.selected)
    ? parseEventDate(data.selected)
    : null;
  return {
    viewStart: startOfDay(startDate),
    selectedDay: startOfDay(selectedDate ?? startDate),
  };
}

export function serializeRosterViewPosition(pos: RosterViewPosition): string {
  return JSON.stringify({
    start: formatDateKey(startOfDay(pos.viewStart)),
    selected: formatDateKey(startOfDay(pos.selectedDay)),
  });
}

export function readStoredCalendarView(): CalendarViewPosition | null {
  try {
    return parseCalendarViewPosition(
      sessionStorage.getItem(CALENDAR_VIEW_STORAGE_KEY),
    );
  } catch {
    return null;
  }
}

export function persistCalendarView(pos: CalendarViewPosition): void {
  try {
    sessionStorage.setItem(
      CALENDAR_VIEW_STORAGE_KEY,
      serializeCalendarViewPosition(pos),
    );
  } catch {
    /* ignore */
  }
}

export function readStoredRosterView(): RosterViewPosition | null {
  try {
    return parseRosterViewPosition(sessionStorage.getItem(ROSTER_VIEW_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function persistRosterView(pos: RosterViewPosition): void {
  try {
    sessionStorage.setItem(
      ROSTER_VIEW_STORAGE_KEY,
      serializeRosterViewPosition(pos),
    );
  } catch {
    /* ignore */
  }
}
