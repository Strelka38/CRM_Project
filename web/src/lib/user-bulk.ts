import {
  canAssignRole,
  canEditUserRole,
  type AppRole,
} from "@/lib/roles";

export type UserBulkTarget = {
  id: string;
  role: AppRole;
  active: boolean;
};

export function uniqueBulkIds(ids: string[], actorId: string): string[] {
  return [...new Set(ids)].filter((id) => id !== actorId);
}

/** Keep at least one active admin if the batch would remove all of them. */
export function lastAdminSkipIds(
  targets: UserBulkTarget[],
  activeAdminCount: number,
): Set<string> {
  const adminIds = targets
    .filter((u) => u.role === "ADMIN" && u.active)
    .map((u) => u.id);
  const skip = new Set<string>();
  if (adminIds.length && activeAdminCount <= adminIds.length && adminIds[0]) {
    skip.add(adminIds[0]);
  }
  return skip;
}

export function filterDeactivateIds(
  targets: UserBulkTarget[],
  ids: string[],
  activeAdminCount: number,
): { apply: string[]; skipped: number } {
  const skip = lastAdminSkipIds(targets, activeAdminCount);
  const apply = ids.filter((id) => !skip.has(id));
  return { apply, skipped: ids.length - apply.length };
}

export function filterRoleChangeIds(
  targets: UserBulkTarget[],
  actorRole: string,
  nextRole: string,
  activeAdminCount: number,
): { apply: string[]; skipped: number } {
  if (!canAssignRole(actorRole, nextRole)) {
    return { apply: [], skipped: targets.length };
  }
  const skipLast =
    nextRole === "ADMIN"
      ? new Set<string>()
      : lastAdminSkipIds(targets, activeAdminCount);
  const apply = targets
    .filter(
      (u) => canEditUserRole(actorRole, u.role) && !skipLast.has(u.id),
    )
    .map((u) => u.id);
  return { apply, skipped: targets.length - apply.length };
}
