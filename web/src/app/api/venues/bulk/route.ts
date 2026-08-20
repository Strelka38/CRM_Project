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
      const result = await prisma.venue.updateMany({
        where: { id: { in: ids } },
        data: { active: false },
      });
      return NextResponse.json({ ok: true, count: result.count });
    }

    const sources = await prisma.venue.findMany({
      where: { id: { in: ids } },
      select: {
        name: true,
        address: true,
        mapUrl: true,
        comment: true,
      },
    });
    const taken = new Set(
      (await prisma.venue.findMany({ select: { name: true } })).map((v) => v.name),
    );
    let count = 0;
    for (const src of sources) {
      const name = uniqueCopyName(src.name, taken);
      taken.add(name);
      await prisma.venue.create({
        data: { ...src, name, active: true },
      });
      count += 1;
    }
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("[POST /api/venues/bulk]", e);
    return NextResponse.json({ error: "Не удалось выполнить действие" }, { status: 500 });
  }
}
