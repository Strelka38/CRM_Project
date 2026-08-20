import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { directoryBulkSchema } from "@/lib/csv";
import { requireDatabaseAccess } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const body = directoryBulkSchema.parse(await req.json());
    const ids = [...new Set(body.ids)];

    if (body.action === "copy") {
      return NextResponse.json(
        { error: "Копирование юрлиц недоступно — ИНН должен быть уникальным" },
        { status: 400 },
      );
    }

    const result = await prisma.legalEntity.updateMany({
      where: { id: { in: ids } },
      data: { active: false },
    });
    return NextResponse.json({ ok: true, count: result.count });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("[POST /api/legal-entities/bulk]", e);
    return NextResponse.json({ error: "Не удалось выполнить действие" }, { status: 500 });
  }
}
