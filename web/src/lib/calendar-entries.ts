import type { CalendarEntryKind } from "@prisma/client";
import {
  canCreateCalendarDayOff,
  canCreateCalendarRental,
  canCreateCalendarTask,
  canEditCalendarEntry,
} from "@/lib/roles";

export const CALENDAR_ENTRY_INCLUDE = {
  responsibleUser: {
    select: { id: true, name: true, firstName: true, lastName: true },
  },
  createdBy: {
    select: { id: true, name: true },
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

export function canMutateEntry(
  role: string | null | undefined,
  createdById: string,
  userId: string,
  kind: CalendarEntryKind,
): boolean {
  if (!canEditCalendarEntry(role, createdById, userId)) return false;
  // Brigadier may only edit kinds they can create
  if (role === "BRIGADIER") return canCreateEntryKind(role, kind);
  return true;
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
