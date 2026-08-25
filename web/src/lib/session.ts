import { auth } from "./auth";
import { prisma } from "./db";
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

  return {
    ...session,
    user: {
      ...session.user,
      id: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
    },
  };
}

export async function requireManager() {
  const session = await requireSession();
  if (!isManager(session.user.role)) {
    throw jsonError("Forbidden", 403);
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  if (!isAdmin(session.user.role)) {
    throw jsonError("Forbidden", 403);
  }
  return session;
}

/** Spec edit: manager or brigadier. */
export async function requireSpecEditor() {
  const session = await requireSession();
  if (!canEditSpec(session.user.role)) {
    throw jsonError("Forbidden", 403);
  }
  return session;
}

/** Assign employees to events: manager or brigadier. */
export async function requireAssignmentManager() {
  const session = await requireSession();
  if (!canManageAssignments(session.user.role)) {
    throw jsonError("Forbidden", 403);
  }
  return session;
}

/** Event brief / ТЗ: manager or brigadier. */
export async function requireBriefEditor() {
  const session = await requireSession();
  if (!canEditBrief(session.user.role)) {
    throw jsonError("Forbidden", 403);
  }
  return session;
}

/** Event card files: manager or brigadier. Invoice-sent PATCH stays requireManager. */
export async function requireEventAttachmentEditor() {
  const session = await requireSession();
  if (!canManageEventAttachments(session.user.role)) {
    throw jsonError("Forbidden", 403);
  }
  return session;
}

/** Database section APIs: manager or brigadier. */
export async function requireDatabaseAccess() {
  const session = await requireSession();
  if (!canAccessDatabase(session.user.role)) {
    throw jsonError("Forbidden", 403);
  }
  return session;
}

/** Full export/import: admin only. */
export async function requireDatabaseBackup() {
  const session = await requireSession();
  if (!canBackupDatabase(session.user.role)) {
    throw jsonError("Forbidden", 403);
  }
  return session;
}

/** Repair section: manager or brigadier. */
export async function requireRepairsAccess() {
  const session = await requireSession();
  if (!canAccessRepairs(session.user.role)) {
    throw jsonError("Forbidden", 403);
  }
  return session;
}

/** Workload / statistics: manager or brigadier. */
export async function requireWorkloadStats() {
  const session = await requireSession();
  if (!canAccessWorkloadStats(session.user.role)) {
    throw jsonError("Forbidden", 403);
  }
  return session;
}
