import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  storedWorkingDayIndexes,
  workingDayCount,
} from "@/lib/quote-assignment-days";
import { requireAssignmentManager } from "@/lib/session";

const patchSchema = z.object({
  workingDayIndexes: z.array(z.number().int().min(1).max(366)),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; zoneId: string }> },
) {
  try {
    await requireAssignmentManager();
    const { id, zoneId } = await params;
    const body = patchSchema.parse(await req.json());

    const zone = await prisma.quoteZone.findFirst({
      where: { id: zoneId, quoteId: id },
      select: {
        id: true,
        quote: { select: { durationDays: true } },
      },
    });
    if (!zone) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const workingDayIndexes = storedWorkingDayIndexes(
      body.workingDayIndexes,
      workingDayCount(zone.quote.durationDays),
    );
    const updated = await prisma.quoteZone.update({
      where: { id: zone.id },
      data: { workingDayIndexes },
      select: { id: true, name: true, workingDayIndexes: true },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Некорректные даты зоны" }, { status: 400 });
    }
    console.error("PATCH /api/quotes/[id]/zones/[zoneId]", e);
    return NextResponse.json(
      { error: "Не удалось сохранить даты зоны" },
      { status: 500 },
    );
  }
}
