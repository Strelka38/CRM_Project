import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/session";

const bodySchema = z.object({
  action: z.enum(["delete", "paid", "invoice"]),
  ids: z.array(z.string()).min(1),
});

export async function POST(req: NextRequest) {
  try {
    await requireManager();
    const body = bodySchema.parse(await req.json());
    const ids = [...new Set(body.ids)];

    if (body.action === "delete") {
      const result = await prisma.quote.deleteMany({ where: { id: { in: ids } } });
      return NextResponse.json({ ok: true, count: result.count });
    }
    if (body.action === "paid") {
      const count = await prisma.$transaction(async (tx) => {
        const completing = await tx.quote.findMany({
          where: { id: { in: ids }, lifecycle: "CONFIRMED" },
          select: { id: true },
        });
        const completingIds = completing.map((row) => row.id);
        const completed =
          completingIds.length === 0
            ? { count: 0 }
            : await tx.quote.updateMany({
                where: { id: { in: completingIds } },
                data: { paid: true, invoiceSent: true, lifecycle: "COMPLETED" },
              });
        if (completingIds.length > 0) {
          await tx.quoteShare.deleteMany({
            where: { quoteId: { in: completingIds } },
          });
        }
        const restIds = ids.filter((id) => !completingIds.includes(id));
        const rest =
          restIds.length === 0
            ? { count: 0 }
            : await tx.quote.updateMany({
                where: { id: { in: restIds } },
                data: { paid: true, invoiceSent: true },
              });
        return completed.count + rest.count;
      });
      return NextResponse.json({ ok: true, count });
    }
    const result = await prisma.quote.updateMany({
      where: { id: { in: ids } },
      data: { invoiceSent: true },
    });
    return NextResponse.json({ ok: true, count: result.count });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("[POST /api/quotes/bulk]", e);
    return NextResponse.json({ error: "Не удалось выполнить действие" }, { status: 500 });
  }
}
