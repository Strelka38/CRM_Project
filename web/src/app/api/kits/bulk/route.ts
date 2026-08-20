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
      const result = await prisma.kit.updateMany({
        where: { id: { in: ids } },
        data: { active: false },
      });
      return NextResponse.json({ ok: true, count: result.count });
    }

    const sources = await prisma.kit.findMany({
      where: { id: { in: ids } },
      include: { components: true },
    });
    const taken = new Set(
      (await prisma.kit.findMany({ select: { name: true } })).map((k) => k.name),
    );
    let count = 0;
    for (const src of sources) {
      const name = uniqueCopyName(src.name, taken);
      taken.add(name);
      const max = await prisma.kit.aggregate({
        where: { categoryId: src.categoryId },
        _max: { sortOrder: true },
      });
      await prisma.kit.create({
        data: {
          name,
          description: src.description,
          categoryId: src.categoryId,
          basePrice: src.basePrice,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
          active: true,
          components: {
            create: src.components.map((c) => ({
              catalogItemId: c.catalogItemId,
              qty: c.qty,
            })),
          },
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
    console.error("[POST /api/kits/bulk]", e);
    return NextResponse.json({ error: "Не удалось выполнить действие" }, { status: 500 });
  }
}
