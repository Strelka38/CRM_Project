import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireManager } from "@/lib/session";

const putSchema = z.object({
  specialties: z.array(
    z.object({
      specialtyId: z.string().min(1),
      hourlyRate: z.number().nonnegative().default(0),
      shiftRate: z.number().nonnegative().default(0),
    }),
  ),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireManager();
    const { id } = await params;
    const body = putSchema.parse(await req.json());

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.userSpecialty.deleteMany({ where: { userId: id } });
      if (body.specialties.length > 0) {
        await tx.userSpecialty.createMany({
          data: body.specialties.map((s) => ({
            userId: id,
            specialtyId: s.specialtyId,
            hourlyRate: s.hourlyRate,
            shiftRate: s.shiftRate,
          })),
        });
      }
    });

    const specialties = await prisma.userSpecialty.findMany({
      where: { userId: id },
      include: { specialty: true },
      orderBy: { specialty: { sortOrder: "asc" } },
    });
    return NextResponse.json(specialties);
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}
