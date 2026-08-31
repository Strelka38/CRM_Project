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
      const inUse = await prisma.quoteAssignment.findMany({
        where: { specialtyId: { in: ids } },
        select: { specialtyId: true },
        distinct: ["specialtyId"],
      });
      if (inUse.length > 0) {
        const blocked = await prisma.specialty.findMany({
          where: { id: { in: inUse.map((a) => a.specialtyId) } },
          select: { name: true },
          orderBy: { name: "asc" },
        });
        const names = blocked.map((s) => s.name).join(", ");
        return NextResponse.json(
          {
            error: names
              ? `Нельзя удалить: есть назначения в сметах (${names})`
              : "Нельзя удалить: есть назначения в сметах",
          },
          { status: 409 },
        );
      }
      const result = await prisma.specialty.deleteMany({
        where: { id: { in: ids } },
      });
      return NextResponse.json({ ok: true, count: result.count });
    }

    const sources = await prisma.specialty.findMany({
      where: { id: { in: ids } },
    });
    const taken = new Set(
      (await prisma.specialty.findMany({ select: { name: true } })).map(
        (s) => s.name,
      ),
    );
    const maxSort = (
      await prisma.specialty.aggregate({ _max: { sortOrder: true } })
    )._max.sortOrder ?? -1;
    let count = 0;
    for (const src of sources) {
      const name = uniqueCopyName(src.name, taken);
      taken.add(name);
      await prisma.specialty.create({
        data: {
          name,
          sortOrder: maxSort + count + 1,
          hourlyRate: src.hourlyRate,
          shiftRate: src.shiftRate,
          description: src.description,
          active: true,
        },
      });
      count += 1;
    }
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("[POST /api/specialties/bulk]", e);
    return NextResponse.json({ error: "Не удалось выполнить действие" }, { status: 500 });
  }
}
