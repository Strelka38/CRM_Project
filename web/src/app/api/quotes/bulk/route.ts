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
      const result = await prisma.quote.updateMany({
        where: { id: { in: ids } },
        data: { paid: true, invoiceSent: true },
      });
      return NextResponse.json({ ok: true, count: result.count });
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
