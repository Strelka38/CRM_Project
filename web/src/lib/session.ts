import { auth } from "./auth";
import { prisma } from "./db";
import type { Role } from "@prisma/client";

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
  if (session.user.role !== "MANAGER") {
    throw jsonError("Forbidden", 403);
  }
  return session;
}

export function isManager(role: Role) {
  return role === "MANAGER";
}
