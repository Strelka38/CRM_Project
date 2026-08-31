import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { requireDatabaseAccess } from "@/lib/session";

const putSchema = z.object({
  specialties: z.array(
    z.object({
      specialtyId: z.string().min(1),
      hourlyRate: z.number().nonnegative().default(0),
      shiftRate: z.number().nonnegative().default(0),
    }),
  ),
});

let ensureOnce: Promise<void> | null = null;

function ensureSchemaOnce() {
  if (!ensureOnce) {
    ensureOnce = ensureQuoteSchemaColumns().catch((e) => {
      ensureOnce = null;
      throw e;
    });
  }
  return ensureOnce;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireDatabaseAccess();
    await ensureSchemaOnce();
    const { id } = await params;
    const body = putSchema.parse(await req.json());

    const freelancer = await prisma.freelancer.findUnique({ where: { id } });
    if (!freelancer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.freelancerSpecialty.deleteMany({ where: { freelancerId: id } });
      if (body.specialties.length > 0) {
        await tx.freelancerSpecialty.createMany({
          data: body.specialties.map((s) => ({
            freelancerId: id,
            specialtyId: s.specialtyId,
            hourlyRate: s.hourlyRate,
            shiftRate: s.shiftRate,
          })),
        });
      }
    });

    const specialties = await prisma.freelancerSpecialty.findMany({
      where: { freelancerId: id },
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
