/** Auth roles and permission helpers (safe for client + server). */

export type AppRole = "ADMIN" | "MANAGER" | "EMPLOYEE" | "BRIGADIER";

export const APP_ROLES: AppRole[] = [
  "ADMIN",
  "MANAGER",
  "EMPLOYEE",
  "BRIGADIER",
];

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
export function canEditSpec(role: string | null | undefined): boolean {
  return isManager(role) || role === "BRIGADIER";
}

/** Assign employees to events (manager + brigadier). */
export function canManageAssignments(role: string | null | undefined): boolean {
  return isManager(role) || role === "BRIGADIER";
}

/** Календарь сроста / распределение сотрудников. */
export function canAccessRoster(role: string | null | undefined): boolean {
  return canManageAssignments(role);
}

/** Full quote/estimate editor and financial admin (manager + admin). */
export function canManageQuotes(role: string | null | undefined): boolean {
  return isManager(role);
}

/** Open the estimate tab (read-only for brigadier). */
export function canViewQuote(role: string | null | undefined): boolean {
  return isManager(role) || role === "BRIGADIER";
}

/** Event dates, time, mount/demount on «Основное» (manager + brigadier). */
export function canEditQuoteSchedule(role: string | null | undefined): boolean {
  return isManager(role) || role === "BRIGADIER";
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
export function canSeeAllEvents(role: string | null | undefined): boolean {
  return isManager(role) || role === "BRIGADIER";
}

/** Edit event brief / ТЗ (manager + brigadier). */
export function canEditBrief(role: string | null | undefined): boolean {
  return isManager(role) || role === "BRIGADIER";
}

/** Upload/delete event files (manager + brigadier). Invoice-sent flag stays manager-only. */
export function canManageEventAttachments(
  role: string | null | undefined,
): boolean {
  return isManager(role) || role === "BRIGADIER";
}

/** Database section: catalog, kits, clients, venues, vehicles, users, rates. */
export function canAccessDatabase(role: string | null | undefined): boolean {
  return isManager(role) || role === "BRIGADIER";
}

/** Assign or demote managers and admins. */
export function canAssignManagerRole(
  role: string | null | undefined,
): boolean {
  return isAdmin(role);
}

/** Reset another user's password. */
export function canResetUserPassword(
  role: string | null | undefined,
): boolean {
  return isAdmin(role);
}

/** Full JSON DB backup / import. */
export function canBackupDatabase(role: string | null | undefined): boolean {
  return isAdmin(role);
}

export function canAssignRole(
  actorRole: string | null | undefined,
  nextRole: string | null | undefined,
): boolean {
  if (!nextRole || !APP_ROLES.includes(nextRole as AppRole)) return false;
  if (isAdmin(actorRole)) return true;
  if (canAccessDatabase(actorRole)) {
    return nextRole === "EMPLOYEE" || nextRole === "BRIGADIER";
  }
  return false;
}

/** Whether the actor may change this user's current role at all. */
export function canEditUserRole(
  actorRole: string | null | undefined,
  targetRole: string | null | undefined,
): boolean {
  if (isAdmin(actorRole)) return true;
  if (!canAccessDatabase(actorRole)) return false;
  return targetRole === "EMPLOYEE" || targetRole === "BRIGADIER";
}

export function assignableRoles(
  actorRole: string | null | undefined,
): AppRole[] {
  if (isAdmin(actorRole)) {
    return ["EMPLOYEE", "BRIGADIER", "MANAGER", "ADMIN"];
  }
  if (canAccessDatabase(actorRole)) return ["EMPLOYEE", "BRIGADIER"];
  return [];
}

/** Списать единицу в ремонт: любой авторизованный сотрудник. */
export function canSendEquipmentToRepair(
  role: string | null | undefined,
): boolean {
  return (
    isManager(role) || role === "BRIGADIER" || role === "EMPLOYEE"
  );
}

/** Раздел «Ремонт»: бригадир и менеджер. */
export function canAccessRepairs(role: string | null | undefined): boolean {
  return isManager(role) || role === "BRIGADIER";
}

/** Pay rates / ФОТ / overrides — manager + admin. */
export function canSeeAssignmentPay(role: string | null | undefined): boolean {
  return isManager(role);
}

/** Workload stats: who worked where, shift counts (manager + brigadier). */
export function canAccessWorkloadStats(
  role: string | null | undefined,
): boolean {
  return isManager(role) || role === "BRIGADIER";
}

/** Create project/quote or equipment rental from calendar (manager only). */
export function canCreateCalendarProject(
  role: string | null | undefined,
): boolean {
  return isManager(role);
}

export function canCreateCalendarRental(
  role: string | null | undefined,
): boolean {
  return isManager(role);
}

/** Create task or day-off from calendar (manager + brigadier). */
export function canCreateCalendarTask(
  role: string | null | undefined,
): boolean {
  return isManager(role) || role === "BRIGADIER";
}

export function canCreateCalendarDayOff(
  role: string | null | undefined,
): boolean {
  return isManager(role) || role === "BRIGADIER";
}

/** Any create action in calendar day menu. */
export function canOpenCalendarCreateMenu(
  role: string | null | undefined,
): boolean {
  return (
    canCreateCalendarProject(role) ||
    canCreateCalendarRental(role) ||
    canCreateCalendarTask(role) ||
    canCreateCalendarDayOff(role)
  );
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
