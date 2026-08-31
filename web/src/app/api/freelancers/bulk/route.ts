import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { directoryBulkSchema, uniqueCopyName } from "@/lib/csv";
import { requireDatabaseAccess } from "@/lib/session";

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const body = directoryBulkSchema.parse(await req.json());
    const ids = [...new Set(body.ids)];

    if (body.action === "delete") {
      const result = await prisma.freelancer.updateMany({
        where: { id: { in: ids } },
        data: { active: false },
      });
      return NextResponse.json({ ok: true, count: result.count });
    }

    const sources = await prisma.freelancer.findMany({
      where: { id: { in: ids } },
      select: { name: true, comment: true },
    });
    const taken = new Set(
      (await prisma.freelancer.findMany({ select: { name: true } })).map(
        (f) => f.name,
      ),
    );
    let count = 0;
    for (const src of sources) {
      const name = uniqueCopyName(src.name, taken);
      taken.add(name);
      await prisma.freelancer.create({
        data: { name, comment: src.comment, active: true },
      });
      count += 1;
    }
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("[POST /api/freelancers/bulk]", e);
    return NextResponse.json(
      { error: "Не удалось выполнить действие" },
      { status: 500 },
    );
  }
}
