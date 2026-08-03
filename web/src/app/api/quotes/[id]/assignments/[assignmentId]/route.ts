import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  canSeeAssignmentPay,
  requireAssignmentManager,
} from "@/lib/session";
import { serializeAssignmentPay } from "@/lib/quote-assignments";

const companyEnum = z.enum(["SHOW_MASTER", "DIAKOM", "NE_EVENT"]);

const patchSchema = z.object({
  payMode: z.enum(["SHIFT", "HOURLY"]).optional(),
  hours: z.number().nonnegative().nullable().optional(),
  rateOverride: z.number().nonnegative().nullable().optional(),
  specialtyId: z.string().min(1).optional(),
  freelancerName: z.string().optional(),
  owners: z.array(companyEnum).optional(),
});

const userSelect = {
  id: true,
  name: true,
  email: true,
  firstName: true,
  lastName: true,
  owners: true,
} as const;

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  try {
    const session = await requireAssignmentManager();
    const showPay = canSeeAssignmentPay(session.user.role);
    const { id, assignmentId } = await params;
    const body = patchSchema.parse(await req.json());

    const existing = await prisma.quoteAssignment.findFirst({
      where: { id: assignmentId, quoteId: id },
    });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const wantsPayChange =
      body.payMode !== undefined ||
      body.hours !== undefined ||
      body.rateOverride !== undefined;
    if (wantsPayChange && !showPay) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const specialtyId = body.specialtyId ?? existing.specialtyId;
    const isFreelancer = existing.isFreelancer || !existing.userId;

    let hourlyRate = 0;
    let shiftRate = 0;

    if (!isFreelancer) {
      if (!existing.userId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
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
      hourlyRate = userSpec.hourlyRate;
      shiftRate = userSpec.shiftRate;
    } else if (body.specialtyId && body.specialtyId !== existing.specialtyId) {
      const specialty = await prisma.specialty.findFirst({
        where: { id: specialtyId, active: true },
        select: { id: true },
      });
      if (!specialty) {
        return NextResponse.json(
          { error: "Должность не найдена" },
          { status: 400 },
        );
      }
    }

    const payMode = isFreelancer
      ? "SHIFT"
      : (body.payMode ?? existing.payMode);

    const updated = await prisma.quoteAssignment.update({
      where: { id: assignmentId },
      data: {
        specialtyId,
        payMode,
        hours: isFreelancer
          ? null
          : body.hours !== undefined
            ? body.hours
            : payMode === "HOURLY"
              ? existing.hours
              : null,
        rateOverride:
          body.rateOverride !== undefined
            ? body.rateOverride
            : existing.rateOverride,
        freelancerName:
          body.freelancerName !== undefined
            ? body.freelancerName.trim()
            : undefined,
        owners: body.owners !== undefined ? body.owners : undefined,
      },
      include: {
        user: { select: userSelect },
        specialty: { select: { id: true, name: true } },
      },
    });

    const full = serializeAssignmentPay({
      ...updated,
      user: updated.user
        ? {
            ...updated.user,
            specialties: [
              {
                specialtyId: updated.specialtyId,
                hourlyRate,
                shiftRate,
              },
            ],
          }
        : null,
    });

    if (!showPay) {
      return NextResponse.json({
        ...full,
        hours: null,
        rateOverride: null,
        bonus: 0,
        hourlyRate: 0,
        shiftRate: 0,
        pay: 0,
      });
    }
    return NextResponse.json(full);
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
    await requireAssignmentManager();
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
