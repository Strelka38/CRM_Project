import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/session";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  sortOrder: z.number().int().optional(),
  hourlyRate: z.number().nonnegative().optional(),
  shiftRate: z.number().nonnegative().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.specialty.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data: {
      name?: string;
      sortOrder?: number;
      hourlyRate?: number;
      shiftRate?: number;
      active?: boolean;
    } = {};
    if (body.name !== undefined) data.name = body.name.trim();
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    if (body.hourlyRate !== undefined) data.hourlyRate = body.hourlyRate;
    if (body.shiftRate !== undefined) data.shiftRate = body.shiftRate;
    if (body.active !== undefined) data.active = body.active;

    const specialty = await prisma.specialty.update({
      where: { id },
      data,
    });
    return NextResponse.json(specialty);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Не удалось обновить специальность" },
      { status: 400 },
    );
  }
}
