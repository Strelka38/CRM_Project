import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { directoryBulkSchema } from "@/lib/csv";
import { requireDatabaseAccess } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    const session = await requireDatabaseAccess();
    const body = directoryBulkSchema.parse(await req.json());
    const ids = [...new Set(body.ids)].filter((id) => id !== session.user.id);

    if (body.action === "copy") {
      return NextResponse.json(
        { error: "Копирование пользователей недоступно — нужен уникальный email" },
        { status: 400 },
      );
    }

    const targets = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, role: true, active: true },
    });
    const adminIds = targets
      .filter((u) => u.role === "ADMIN" && u.active)
      .map((u) => u.id);
    const skipAdmin = new Set<string>();
    if (adminIds.length) {
      const adminCount = await prisma.user.count({
        where: { role: "ADMIN", active: true },
      });
      if (adminCount <= adminIds.length && adminIds[0]) {
        skipAdmin.add(adminIds[0]);
      }
    }
    const deactivate = ids.filter((id) => !skipAdmin.has(id));
    const result = deactivate.length
      ? await prisma.user.updateMany({
          where: { id: { in: deactivate } },
          data: { active: false },
        })
      : { count: 0 };
    return NextResponse.json({
      ok: true,
      count: result.count,
      skipped: skipAdmin.size + (body.ids.length - ids.length),
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("[POST /api/users/bulk]", e);
    return NextResponse.json({ error: "Не удалось выполнить действие" }, { status: 500 });
  }
}
