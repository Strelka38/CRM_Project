import { prisma } from "@/lib/db";
import { formatRuDate, startOfDay } from "@/lib/dates";
import {
  overlapDateLabels,
  quoteOccupancyRange,
  type QuoteScheduleFields,
} from "@/lib/quote-schedule";

export type DayOffConflictRow = {
  id: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  title: string;
  note: string;
  overlapDates: string[];
};

export type CalendarBusyConflictRow = {
  id: string;
  kind: "RENTAL" | "TASK";
  date: string;
  title: string;
  role: "responsible" | "assignee";
  overlapDates: string[];
};

function occupancyUtcWindow(quote: QuoteScheduleFields) {
  const targetRange = quoteOccupancyRange(quote);
  if (!targetRange) return null;
  const fromUtc = new Date(
    Date.UTC(
      targetRange.start.getFullYear(),
      targetRange.start.getMonth(),
      targetRange.start.getDate(),
    ),
  );
  const toUtc = new Date(
    Date.UTC(
      targetRange.end.getFullYear(),
      targetRange.end.getMonth(),
      targetRange.end.getDate(),
    ),
  );
  return { targetRange, fromUtc, toUtc };
}

function entryDay(date: Date) {
  return startOfDay(
    new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** Day-offs for user overlapping quote occupancy (mount / event / demount). */
export async function dayOffsOverlappingQuote(
  userId: string,
  quote: QuoteScheduleFields,
): Promise<DayOffConflictRow[]> {
  const win = occupancyUtcWindow(quote);
  if (!win) return [];
  const { targetRange, fromUtc, toUtc } = win;

  const dayOffEntries = await prisma.calendarEntry.findMany({
    where: {
      kind: "DAY_OFF",
      date: { gte: fromUtc, lte: toUtc },
      assignees: { some: { userId } },
    },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      title: true,
      note: true,
    },
    orderBy: { date: "asc" },
  });

  return dayOffEntries.map((e) => {
    const day = entryDay(e.date);
    return {
      id: e.id,
      date: formatRuDate(day),
      startTime: e.startTime,
      endTime: e.endTime,
      title: e.title || "Выходной",
      note: e.note || "",
      overlapDates: overlapDateLabels(targetRange, { start: day, end: day }),
    };
  });
}

/**
 * Rentals (responsible) and tasks (assignee) overlapping quote occupancy.
 */
export async function calendarBusyOverlappingQuote(
  userId: string,
  quote: QuoteScheduleFields,
): Promise<CalendarBusyConflictRow[]> {
  const win = occupancyUtcWindow(quote);
  if (!win) return [];
  const { targetRange, fromUtc, toUtc } = win;

  const entries = await prisma.calendarEntry.findMany({
    where: {
      date: { gte: fromUtc, lte: toUtc },
      OR: [
        { kind: "RENTAL", responsibleUserId: userId },
        { kind: "TASK", assignees: { some: { userId } } },
      ],
    },
    select: {
      id: true,
      kind: true,
      date: true,
      title: true,
      responsibleUserId: true,
    },
    orderBy: { date: "asc" },
  });

  return entries
    .filter((e) => e.kind === "RENTAL" || e.kind === "TASK")
    .map((e) => {
      const day = entryDay(e.date);
      const kind = e.kind as "RENTAL" | "TASK";
      return {
        id: e.id,
        kind,
        date: formatRuDate(day),
        title:
          e.title?.trim() ||
          (kind === "RENTAL" ? "Аренда оборудования" : "Задача"),
        role: kind === "RENTAL" ? ("responsible" as const) : ("assignee" as const),
        overlapDates: overlapDateLabels(targetRange, { start: day, end: day }),
      };
    });
}
