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
  kind: z.enum(["EVENT", "MOUNT"]).optional(),
  userId: z.string().min(1).nullable().optional(),
  isFreelancer: z.boolean().optional(),
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
    const kind = body.kind ?? existing.kind;
    let nextUserId =
      body.userId !== undefined ? body.userId : existing.userId;
    let nextIsFreelancer =
      body.isFreelancer !== undefined
        ? body.isFreelancer
        : existing.isFreelancer;

    if (body.userId === null) {
      nextUserId = null;
      if (body.isFreelancer === undefined) nextIsFreelancer = false;
    }
    if (nextIsFreelancer) nextUserId = null;

    const specialty = await prisma.specialty.findUnique({
      where: { id: specialtyId },
      select: { id: true, active: true, hourlyRate: true, shiftRate: true },
    });
    if (!specialty) {
      return NextResponse.json(
        { error: "Должность не найдена" },
        { status: 400 },
      );
    }
    if (
      body.specialtyId &&
      body.specialtyId !== existing.specialtyId &&
      !specialty.active
    ) {
      return NextResponse.json(
        { error: "Должность не найдена" },
        { status: 400 },
      );
    }

    let hourlyRate = specialty.hourlyRate;
    let shiftRate = specialty.shiftRate;

    if (nextUserId && !nextIsFreelancer) {
      const userSpec = await prisma.userSpecialty.findUnique({
        where: {
          userId_specialtyId: {
            userId: nextUserId,
            specialtyId,
          },
        },
      });
      if (userSpec) {
        hourlyRate = userSpec.hourlyRate;
        shiftRate = userSpec.shiftRate;
      }
    }

    const payMode = nextIsFreelancer || !nextUserId
      ? "SHIFT"
      : (body.payMode ?? existing.payMode);

    const updated = await prisma.quoteAssignment.update({
      where: { id: assignmentId },
      data: {
        specialtyId,
        kind,
        userId: nextUserId,
        isFreelancer: nextIsFreelancer,
        payMode,
        hours:
          nextIsFreelancer || !nextUserId
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
            : nextIsFreelancer
              ? existing.freelancerName
              : "",
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
    if (
      e &&
      typeof e === "object" &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return NextResponse.json(
        { error: "У этого сотрудника уже есть такая должность на мероприятии" },
        { status: 409 },
      );
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
