import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireDatabaseAccess } from "@/lib/session";

const bodySchema = z.object({
  parentId: z.string().nullable(),
  orderedIds: z.array(z.string()).min(1),
});

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const body = bodySchema.parse(await req.json());
    const orderedIds = [...new Set(body.orderedIds)];
    const siblings = await prisma.catalogCategory.findMany({
      where: { parentId: body.parentId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true },
    });
    const siblingIds = new Set(siblings.map((row) => row.id));
    if (orderedIds.some((id) => !siblingIds.has(id))) {
      return NextResponse.json(
        { error: "Раздел не на этом уровне" },
        { status: 400 },
      );
    }

    const known = new Set(orderedIds);
    const finalIds = [
      ...orderedIds,
      ...siblings.map((row) => row.id).filter((id) => !known.has(id)),
    ];
    await prisma.$transaction(
      finalIds.map((id, index) =>
        prisma.catalogCategory.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}
