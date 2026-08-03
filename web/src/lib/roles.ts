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

/** Pay rates / ФОТ / overrides — manager only. */
export function canSeeAssignmentPay(role: string | null | undefined): boolean {
  return role === "MANAGER";
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
