import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { directoryBulkSchema, uniqueCopyName } from "@/lib/csv";
import { requireDatabaseAccess } from "@/lib/session";

const clientSelect = {
  companyName: true,
  contactName: true,
  phone: true,
  email: true,
  comment: true,
  legalAddress: true,
  legalDetails: true,
} as const;

export async function POST(req: NextRequest) {
  try {
    await requireDatabaseAccess();
    const body = directoryBulkSchema.parse(await req.json());
    const ids = [...new Set(body.ids)];

    if (body.action === "delete") {
      const result = await prisma.client.updateMany({
        where: { id: { in: ids } },
        data: { active: false },
      });
      return NextResponse.json({ ok: true, count: result.count });
    }

    const sources = await prisma.client.findMany({
      where: { id: { in: ids } },
      select: clientSelect,
    });
    const taken = new Set(
      (await prisma.client.findMany({ select: { companyName: true } })).map(
        (c) => c.companyName,
      ),
    );
    let count = 0;
    for (const src of sources) {
      const companyName = uniqueCopyName(src.companyName, taken);
      taken.add(companyName);
      await prisma.client.create({
        data: { ...src, companyName, inn: "", active: true },
      });
      count += 1;
    }
    return NextResponse.json({ ok: true, count });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    console.error("[POST /api/clients/bulk]", e);
    return NextResponse.json({ error: "Не удалось выполнить действие" }, { status: 500 });
  }
}
