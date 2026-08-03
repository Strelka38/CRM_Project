import { auth } from "./auth";
import { prisma } from "./db";
import {
  canEditSpec,
  canManageAssignments,
  isManager,
} from "./roles";

export {
  canEditSpec,
  canManageAssignments,
  canManageQuotes,
  canSeeAllEvents,
  isManager,
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
