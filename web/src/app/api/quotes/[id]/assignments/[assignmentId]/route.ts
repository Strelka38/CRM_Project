import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { calcAssignmentPay } from "@/lib/payroll";
import { requireManager } from "@/lib/session";

const patchSchema = z.object({
  payMode: z.enum(["SHIFT", "HOURLY"]).optional(),
  hours: z.number().nonnegative().nullable().optional(),
  rateOverride: z.number().nonnegative().nullable().optional(),
  specialtyId: z.string().min(1).optional(),
});

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  try {
    await requireManager();
    const { id, assignmentId } = await params;
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.quoteAssignment.findFirst({
      where: { id: assignmentId, quoteId: id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const specialtyId = body.specialtyId ?? existing.specialtyId;
    const userSpec = await prisma.userSpecialty.findUnique({
      where: {
        userId_specialtyId: {
          userId: existing.userId,
          specialtyId,
        },
      },
    });
    if (!userSpec) {
      return NextResponse.json(
        { error: "У сотрудника нет этой специальности" },
        { status: 400 },
      );
    }

    const payMode = body.payMode ?? existing.payMode;
    const updated = await prisma.quoteAssignment.update({
      where: { id: assignmentId },
      data: {
        specialtyId,
        payMode,
        hours:
          body.hours !== undefined
            ? body.hours
            : payMode === "HOURLY"
              ? existing.hours
              : null,
        rateOverride:
          body.rateOverride !== undefined
            ? body.rateOverride
            : existing.rateOverride,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            firstName: true,
            lastName: true,
            owners: true,
          },
        },
        specialty: { select: { id: true, name: true } },
      },
    });

    const pay = calcAssignmentPay({
      payMode: updated.payMode,
      hours: updated.hours,
      rateOverride: updated.rateOverride,
      hourlyRate: userSpec.hourlyRate,
      shiftRate: userSpec.shiftRate,
      bonus: updated.bonus,
    });

    return NextResponse.json({
      ...updated,
      hourlyRate: userSpec.hourlyRate,
      shiftRate: userSpec.shiftRate,
      pay,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  try {
    await requireManager();
    const { id, assignmentId } = await params;
    const existing = await prisma.quoteAssignment.findFirst({
      where: { id: assignmentId, quoteId: id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await prisma.quoteAssignment.delete({ where: { id: assignmentId } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
