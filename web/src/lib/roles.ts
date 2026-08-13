/** Auth roles and permission helpers (safe for client + server). */

export type AppRole = "MANAGER" | "EMPLOYEE" | "BRIGADIER";

export const APP_ROLES: AppRole[] = ["MANAGER", "EMPLOYEE", "BRIGADIER"];

export function isManager(role: string | null | undefined): boolean {
  return role === "MANAGER";
}

/** Edit event specifications (manager + brigadier). */
export function canEditSpec(role: string | null | undefined): boolean {
  return role === "MANAGER" || role === "BRIGADIER";
}

/** Assign employees to events (manager + brigadier). */
export function canManageAssignments(role: string | null | undefined): boolean {
  return role === "MANAGER" || role === "BRIGADIER";
}

/** Full quote/estimate editor and financial admin (manager only). */
export function canManageQuotes(role: string | null | undefined): boolean {
  return role === "MANAGER";
}

/** See all events in lists (not only personal assignments). */
export function canSeeAllEvents(role: string | null | undefined): boolean {
  return role === "MANAGER" || role === "BRIGADIER";
}

/** Edit event brief / ТЗ (manager + brigadier). */
export function canEditBrief(role: string | null | undefined): boolean {
  return role === "MANAGER" || role === "BRIGADIER";
}

/** Database section: catalog, kits, clients, venues, vehicles, users, rates. */
export function canAccessDatabase(role: string | null | undefined): boolean {
  return role === "MANAGER" || role === "BRIGADIER";
}

/** Full DB backup/restore: only the first registered CRM user. */
export function isCrmOwner(
  userId: string | null | undefined,
  firstUserId: string | null | undefined,
): boolean {
  return !!userId && !!firstUserId && userId === firstUserId;
}

/** Списать единицу в ремонт: любой авторизованный сотрудник. */
export function canSendEquipmentToRepair(
  role: string | null | undefined,
): boolean {
  return role === "MANAGER" || role === "BRIGADIER" || role === "EMPLOYEE";
}

/** Раздел «Ремонт»: бригадир и менеджер. */
export function canAccessRepairs(role: string | null | undefined): boolean {
  return role === "MANAGER" || role === "BRIGADIER";
}

/** Pay rates / ФОТ / overrides — manager only. */
export function canSeeAssignmentPay(role: string | null | undefined): boolean {
  return role === "MANAGER";
}

/** Workload stats: who worked where, shift counts (manager + brigadier). */
export function canAccessWorkloadStats(
  role: string | null | undefined,
): boolean {
  return role === "MANAGER" || role === "BRIGADIER";
}

/** Create project/quote or equipment rental from calendar (manager only). */
export function canCreateCalendarProject(
  role: string | null | undefined,
): boolean {
  return role === "MANAGER";
}

export function canCreateCalendarRental(
  role: string | null | undefined,
): boolean {
  return role === "MANAGER";
}

/** Create task or day-off from calendar (manager + brigadier). */
export function canCreateCalendarTask(
  role: string | null | undefined,
): boolean {
  return role === "MANAGER" || role === "BRIGADIER";
}

export function canCreateCalendarDayOff(
  role: string | null | undefined,
): boolean {
  return role === "MANAGER" || role === "BRIGADIER";
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
  if (role === "MANAGER") return true;
  return createdById === userId;
}

export function roleLabelRu(role: string | null | undefined): string {
  switch (role) {
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
    case "MANAGER":
      return "Менеджер";
    case "BRIGADIER":
      return "Бригадир";
    default:
      return "Сотрудник";
  }
}
