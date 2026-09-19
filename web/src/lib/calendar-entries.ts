import type { CalendarEntryKind } from "@prisma/client";
import {
  endDateFromDuration,
  formatDateKey,
} from "@/lib/dates";
import {
  canCreateCalendarDayOff,
  canCreateCalendarRental,
  canCreateCalendarTask,
  canEditCalendarEntry,
  isManager,
} from "@/lib/roles";

export const CALENDAR_ENTRY_INCLUDE = {
  responsibleUser: {
    select: { id: true, name: true, firstName: true, lastName: true },
  },
  createdBy: {
    select: { id: true, name: true },
  },
  client: {
    select: {
      id: true,
      companyName: true,
      contactName: true,
      phone: true,
    },
  },
  assignees: {
    include: {
      user: {
        select: { id: true, name: true, firstName: true, lastName: true },
      },
    },
  },
  lines: {
    include: {
      catalogItem: { select: { id: true, name: true, stockQty: true } },
    },
  },
} as const;

export function canCreateEntryKind(
  role: string | null | undefined,
  kind: CalendarEntryKind,
): boolean {
  switch (kind) {
    case "RENTAL":
      return canCreateCalendarRental(role);
    case "TASK":
      return canCreateCalendarTask(role);
    case "DAY_OFF":
      return canCreateCalendarDayOff(role);
    default:
      return false;
  }
}

export function utcDateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export function localFromUtcDate(d: Date): Date {
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function serializeEntryDate(d: Date): string {
  return formatDateKey(localFromUtcDate(d));
}

export function entrySpanUtc(start: Date, durationDays: number | null | undefined) {
  const days = Math.max(1, Math.round(Number(durationDays) || 1));
  return {
    durationDays: days,
    date: utcDateOnly(start),
    endDate: utcDateOnly(endDateFromDuration(start, days)),
  };
}

export function serializeCalendarEntry<
  T extends { date: Date; endDate?: Date | null; durationDays?: number | null },
>(entry: T) {
  const end = entry.endDate ?? entry.date;
  return {
    ...entry,
    date: serializeEntryDate(entry.date),
    endDate: serializeEntryDate(end),
    durationDays: Math.max(1, entry.durationDays || 1),
  };
}

export function overlappingEntryWhere(from: Date, to: Date) {
  return {
    date: { lte: utcDateOnly(to) },
    endDate: { gte: utcDateOnly(from) },
  };
}

export function canMutateEntry(
  role: string | null | undefined,
  createdById: string,
  userId: string,
  kind: CalendarEntryKind,
): boolean {
  // Выходные — кадровые записи: админ, менеджер и бригадир могут править чужие.
  if (kind === "DAY_OFF") return canCreateCalendarDayOff(role);
  if (!canEditCalendarEntry(role, createdById, userId)) return false;
  // Brigadier may only edit kinds they can create
  if (role === "BRIGADIER") return canCreateEntryKind(role, kind);
  return true;
}

/** Отметить задачу выполненной: исполнитель, автор или менеджер. */
export function canCompleteTask(opts: {
  role: string | null | undefined;
  userId: string;
  createdById: string;
  assigneeIds: string[];
}): boolean {
  if (isManager(opts.role)) return true;
  if (opts.createdById === opts.userId) return true;
  return opts.assigneeIds.includes(opts.userId);
}

export function displayUserName(u: {
  name: string;
  firstName?: string;
  lastName?: string;
}): string {
  const fio = [u.lastName, u.firstName].filter(Boolean).join(" ").trim();
  return fio || u.name;
}

export const ENTRY_KIND_LABELS: Record<CalendarEntryKind, string> = {
  RENTAL: "Аренда оборудования",
  TASK: "Задача",
  DAY_OFF: "Выходной",
};

export const ENTRY_KIND_COLORS: Record<CalendarEntryKind, string> = {
  RENTAL: "#0f766e",
  TASK: "#b45309",
  DAY_OFF: "#64748b",
};
