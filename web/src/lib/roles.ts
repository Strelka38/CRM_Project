/** Auth roles and permission helpers (safe for client + server). */

import {
  roleHasDatabaseAccess,
  roleHasPermission,
  type RolePermissionOverrides,
} from "./permission-tree";

export type { RolePermissionOverrides };

export const APP_ROLES = [
  "ADMIN",
  "MANAGER",
  "EMPLOYEE",
  "BRIGADIER",
] as const;

export type AppRole = (typeof APP_ROLES)[number];

/** Roles that can own a quote / act as project manager. */
export const QUOTE_OWNER_ROLES: AppRole[] = ["ADMIN", "MANAGER"];

export function isAdmin(role: string | null | undefined): boolean {
  return role === "ADMIN";
}

/** Manager-level operational access. Admin included. */
export function isManager(role: string | null | undefined): boolean {
  return role === "MANAGER" || role === "ADMIN";
}

export function isQuoteOwnerRole(role: string | null | undefined): boolean {
  return role === "MANAGER" || role === "ADMIN";
}

/** Edit event specifications (manager + brigadier). */
export function canEditSpec(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.quotes.editSpec", overrides);
}

/** Assign employees to events (manager + brigadier). */
export function canManageAssignments(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.quotes.assignments", overrides);
}

/** Календарь сроста / распределение сотрудников. */
export function canAccessRoster(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "section.roster", overrides);
}

/** Full quote/estimate editor and financial admin (manager + admin). */
export function canManageQuotes(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.quotes.manage", overrides);
}

/** Open the estimate tab (read-only for brigadier). */
export function canViewQuote(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.quotes.view", overrides);
}

/** Event dates, time, mount/demount on «Основное» (manager + brigadier). */
export function canEditQuoteSchedule(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.quotes.editSchedule", overrides);
}

/** Meta keys a brigadier may PATCH on a quote. Blocks/zones are never allowed. */
export const BRIGADIER_QUOTE_PATCH_KEYS = [
  "brief",
  "date",
  "durationDays",
  "time",
  "mountDate",
  "mountDurationDays",
  "demountDate",
  "demountDurationDays",
] as const;

export type BrigadierQuotePatchKey = (typeof BRIGADIER_QUOTE_PATCH_KEYS)[number];

const BRIGADIER_QUOTE_PATCH_KEY_SET = new Set<string>(
  BRIGADIER_QUOTE_PATCH_KEYS,
);

export function isBrigadierQuotePatchKey(key: string): boolean {
  return BRIGADIER_QUOTE_PATCH_KEY_SET.has(key);
}

/** Disallowed keys in a brigadier PATCH body (`forceStock` is ignored). */
export function forbiddenBrigadierQuotePatchKeys(
  keys: readonly string[],
): string[] {
  return keys.filter(
    (key) => key !== "forceStock" && !BRIGADIER_QUOTE_PATCH_KEY_SET.has(key),
  );
}

/** See all events in lists (not only personal assignments). */
export function canSeeAllEvents(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.quotes.seeAll", overrides);
}

/** Edit event brief / ТЗ (manager + brigadier). */
export function canEditBrief(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.quotes.editBrief", overrides);
}

/** Upload/delete event files (manager + brigadier). Invoice-sent flag stays manager-only. */
export function canManageEventAttachments(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.quotes.attachments", overrides);
}

/** Database section: catalog, kits, clients, venues, vehicles, users, rates, freelancers. */
export function canAccessDatabase(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasDatabaseAccess(role, overrides);
}

/** Assign or demote managers and admins. */
export function canAssignManagerRole(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.users.assignManagers", overrides);
}

/** Reset another user's password. */
export function canResetUserPassword(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.users.resetPassword", overrides);
}

/** Full JSON DB backup / import. */
export function canBackupDatabase(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "section.backup", overrides);
}

export function canAssignRole(
  actorRole: string | null | undefined,
  nextRole: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  if (!nextRole || !APP_ROLES.includes(nextRole as AppRole)) return false;
  if (canAssignManagerRole(actorRole, overrides)) return true;
  if (roleHasPermission(actorRole, "fn.users.assignStaff", overrides)) {
    return nextRole === "EMPLOYEE" || nextRole === "BRIGADIER";
  }
  return false;
}

/** Whether the actor may change this user's current role at all. */
export function canEditUserRole(
  actorRole: string | null | undefined,
  targetRole: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  if (canAssignManagerRole(actorRole, overrides)) return true;
  if (!roleHasPermission(actorRole, "fn.users.assignStaff", overrides)) {
    return false;
  }
  return targetRole === "EMPLOYEE" || targetRole === "BRIGADIER";
}

export function assignableRoles(
  actorRole: string | null | undefined,
  overrides?: RolePermissionOverrides,
): AppRole[] {
  if (canAssignManagerRole(actorRole, overrides)) {
    return ["EMPLOYEE", "BRIGADIER", "MANAGER", "ADMIN"];
  }
  if (roleHasPermission(actorRole, "fn.users.assignStaff", overrides)) {
    return ["EMPLOYEE", "BRIGADIER"];
  }
  return [];
}

/** Списать единицу в ремонт: любой авторизованный сотрудник. */
export function canSendEquipmentToRepair(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.warehouse.sendRepair", overrides);
}

/** Раздел «Ремонт»: бригадир и менеджер. */
export function canAccessRepairs(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "section.repairs", overrides);
}

/** Pay rates / ФОТ / overrides — manager + admin. */
export function canSeeAssignmentPay(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.quotes.seePay", overrides);
}

/** Workload stats: who worked where, shift counts (manager + brigadier). */
export function canAccessWorkloadStats(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "section.statistics", overrides);
}

/** Create project/quote or equipment rental from calendar (manager only). */
export function canCreateCalendarProject(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.calendar.createProject", overrides);
}

export function canCreateCalendarRental(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.calendar.createRental", overrides);
}

/** Create task or day-off from calendar (manager + brigadier). */
export function canCreateCalendarTask(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.calendar.createTask", overrides);
}

export function canCreateCalendarDayOff(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.calendar.createDayOff", overrides);
}

/** Any create action in calendar day menu. */
export function canOpenCalendarCreateMenu(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return (
    canCreateCalendarProject(role, overrides) ||
    canCreateCalendarRental(role, overrides) ||
    canCreateCalendarTask(role, overrides) ||
    canCreateCalendarDayOff(role, overrides)
  );
}

/** Меню ⋯ мероприятия: бригадир, менеджер, админ. Не сотрудник. */
export function canOpenCalendarEventMenu(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.calendar.eventMenu", overrides);
}

/** Скопировать мероприятие на другую дату. */
export function canCopyCalendarEvent(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.calendar.copyEvent", overrides);
}

/** Снять даты и отменить смету (уходит из календаря в «Сметы»). */
export function canUnscheduleCalendarEvent(
  role: string | null | undefined,
  overrides?: RolePermissionOverrides,
): boolean {
  return roleHasPermission(role, "fn.calendar.unschedule", overrides);
}

/** Edit/delete calendar entry (not quote): manager or original creator. */
export function canEditCalendarEntry(
  role: string | null | undefined,
  createdById: string,
  userId: string,
): boolean {
  if (isManager(role)) return true;
  return createdById === userId;
}

export function roleLabelRu(role: string | null | undefined): string {
  switch (role) {
    case "ADMIN":
      return "админ";
    case "MANAGER":
      return "менеджер";
    case "BRIGADIER":
      return "бригадир";
    default:
      return "сотрудник";
  }
}

export function roleLabelRuTitle(role: string | null | undefined): string {
  switch (role) {
    case "ADMIN":
      return "Админ";
    case "MANAGER":
      return "Менеджер";
    case "BRIGADIER":
      return "Бригадир";
    default:
      return "Сотрудник";
  }
}
