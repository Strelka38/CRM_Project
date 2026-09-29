import { cache } from "react";
import { auth } from "./auth";
import { prisma } from "./db";
import { getRolePermissionOverrides } from "./role-permissions";
import {
  roleHasPermission,
  type PermissionId,
  type RolePermissionOverrides,
} from "./permission-tree";
import {
  canAccessDatabase,
  canAccessRepairs,
  canAccessWorkloadStats,
  canBackupDatabase,
  canCreateCalendarDayOff,
  canCreateCalendarProject,
  canCreateCalendarRental,
  canCreateCalendarTask,
  canEditBrief,
  canEditCalendarEntry,
  canEditSpec,
  canManageAssignments,
  canManageEventAttachments,
  canOpenCalendarCreateMenu,
  isAdmin,
  isManager,
} from "./roles";

export {
  canAccessDatabase,
  canAccessRepairs,
  canAccessWorkloadStats,
  canAssignRole,
  canBackupDatabase,
  canCreateCalendarDayOff,
  canCreateCalendarProject,
  canCreateCalendarRental,
  canCreateCalendarTask,
  canEditBrief,
  canEditCalendarEntry,
  canEditQuoteSchedule,
  canEditSpec,
  canEditUserRole,
  canManageAssignments,
  canManageEventAttachments,
  canManageQuotes,
  canViewQuote,
  forbiddenBrigadierQuotePatchKeys,
  canOpenCalendarCreateMenu,
  canResetUserPassword,
  canSendEquipmentToRepair,
  canSeeAllEvents,
  canSeeAssignmentPay,
  isAdmin,
  isManager,
  isQuoteOwnerRole,
  roleLabelRu,
  roleLabelRuTitle,
} from "./roles";

function jsonError(message: string, status: number) {
  return NextResponseJson({ error: message }, status);
}

function NextResponseJson(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const loadRolePermissionOverrides = cache(getRolePermissionOverrides);

export async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) {
    throw jsonError("Unauthorized", 401);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, active: true, role: true, name: true, email: true },
  });

  if (!user || !user.active) {
    throw jsonError("Сессия устарела — войдите снова", 401);
  }

  const permissions: RolePermissionOverrides =
    await loadRolePermissionOverrides();

  return {
    ...session,
    permissions,
    user: {
      ...session.user,
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
    },
  };
}

function denyIf(
  session: Awaited<ReturnType<typeof requireSession>>,
  allowed: boolean,
) {
  if (!allowed) throw jsonError("Forbidden", 403);
  return session;
}

export async function requireManager() {
  const session = await requireSession();
  return denyIf(session, isManager(session.user.role));
}

export async function requireAdmin() {
  const session = await requireSession();
  return denyIf(session, isAdmin(session.user.role));
}

/** Spec edit: manager or brigadier. */
export async function requireSpecEditor() {
  const session = await requireSession();
  return denyIf(session, canEditSpec(session.user.role, session.permissions));
}

/** Assign employees to events: manager or brigadier. */
export async function requireAssignmentManager() {
  const session = await requireSession();
  return denyIf(
    session,
    canManageAssignments(session.user.role, session.permissions),
  );
}

/** Event brief / ТЗ: manager or brigadier. */
export async function requireBriefEditor() {
  const session = await requireSession();
  return denyIf(session, canEditBrief(session.user.role, session.permissions));
}

/** Event card files: manager or brigadier. Invoice-sent PATCH stays requireManager. */
export async function requireEventAttachmentEditor() {
  const session = await requireSession();
  return denyIf(
    session,
    canManageEventAttachments(session.user.role, session.permissions),
  );
}

/** Database section APIs: manager or brigadier. */
export async function requireDatabaseAccess() {
  const session = await requireSession();
  return denyIf(
    session,
    canAccessDatabase(session.user.role, session.permissions),
  );
}

/** Full export/import: admin only. */
export async function requireDatabaseBackup() {
  const session = await requireSession();
  return denyIf(
    session,
    canBackupDatabase(session.user.role, session.permissions),
  );
}

/** Repair section: manager or brigadier. */
export async function requireRepairsAccess() {
  const session = await requireSession();
  return denyIf(
    session,
    canAccessRepairs(session.user.role, session.permissions),
  );
}

/** Workload / statistics: manager or brigadier. */
export async function requireWorkloadStats() {
  const session = await requireSession();
  return denyIf(
    session,
    canAccessWorkloadStats(session.user.role, session.permissions),
  );
}

export async function requireSection(id: PermissionId) {
  const session = await requireSession();
  return denyIf(
    session,
    roleHasPermission(session.user.role, id, session.permissions),
  );
}

/** Раздел «Оплаты»: флаг в карточке пользователя, включает админ. */
export async function requirePaymentsAccess() {
  const session = await requireSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { canAccessPayments: true },
  });
  if (!user?.canAccessPayments) {
    throw jsonError("Forbidden", 403);
  }
  return session;
}
