import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { notifyEmployeeOfAssignment } from "@/lib/notifications";
import {
  canManageAssignments,
  canSeeAssignmentPay,
  requireAssignmentManager,
  requireSession,
} from "@/lib/session";
import { serializeAssignmentPay } from "@/lib/quote-assignments";

async function getAccessibleQuote(id: string, userId: string, role: string) {
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) return null;
  if (canManageAssignments(role)) return quote;
  const assigned = await prisma.quoteAssignment.findFirst({
    where: { quoteId: id, userId },
    select: { id: true },
  });
  return assigned ? quote : null;
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  firstName: true,
  lastName: true,
  owners: true,
} as const;

const companyEnum = z.enum(["SHOW_MASTER", "DIAKOM", "NE_EVENT"]);

function stripPay<T extends { pay: number }>(full: T) {
  return {
    ...full,
    hours: null,
    rateOverride: null,
    bonus: 0,
    hourlyRate: 0,
    shiftRate: 0,
    pay: 0,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireSession();
    const { id } = await params;
    const quote = await getAccessibleQuote(
      id,
      session.user.id,
      session.user.role,
    );
    if (!quote) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const assignments = await prisma.quoteAssignment.findMany({
      where: { quoteId: id },
      include: {
        user: { select: userSelect },
        specialty: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const userIds = [
      ...new Set(
        assignments
          .map((a) => a.userId)
          .filter((uid): uid is string => Boolean(uid)),
      ),
    ];
    const userSpecs =
      userIds.length > 0
        ? await prisma.userSpecialty.findMany({
            where: { userId: { in: userIds } },
          })
        : [];
    const rateKey = (uid: string, sid: string) => `${uid}:${sid}`;
    const rateMap = new Map(
      userSpecs.map((s) => [
        rateKey(s.userId, s.specialtyId),
        { hourlyRate: s.hourlyRate, shiftRate: s.shiftRate },
      ]),
    );

    const showPay = canSeeAssignmentPay(session.user.role);
    return NextResponse.json(
      assignments.map((a) => {
        const rates =
          a.userId && rateMap.get(rateKey(a.userId, a.specialtyId))
            ? rateMap.get(rateKey(a.userId, a.specialtyId))!
            : { hourlyRate: 0, shiftRate: 0 };
        const full = serializeAssignmentPay({
          ...a,
          user: a.user
            ? {
                ...a.user,
                specialties: [
                  {
                    specialtyId: a.specialtyId,
                    hourlyRate: rates.hourlyRate,
                    shiftRate: rates.shiftRate,
                  },
                ],
              }
            : null,
        });
        return showPay ? full : stripPay(full);
      }),
    );
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const createSchema = z.object({
  isFreelancer: z.boolean().optional().default(false),
  userId: z.string().min(1).optional(),
  specialtyId: z.string().min(1),
  freelancerName: z.string().optional().default(""),
  owners: z.array(companyEnum).optional().default([]),
  payMode: z.enum(["SHIFT", "HOURLY"]).default("SHIFT"),
  hours: z.number().nonnegative().nullable().optional(),
  rateOverride: z.number().nonnegative().nullable().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAssignmentManager();
    const { id } = await params;
    const quote = await getAccessibleQuote(
      id,
      session.user.id,
      session.user.role,
    );
    if (!quote) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = createSchema.parse(await req.json());
    const showPay = canSeeAssignmentPay(session.user.role);

    if (body.isFreelancer) {
      const specialty = await prisma.specialty.findFirst({
        where: { id: body.specialtyId, active: true },
        select: { id: true, name: true },
      });
      if (!specialty) {
        return NextResponse.json(
          { error: "Должность не найдена" },
          { status: 400 },
        );
      }

      const created = await prisma.quoteAssignment.create({
        data: {
          quoteId: id,
          userId: null,
          specialtyId: body.specialtyId,
          payMode: "SHIFT",
          hours: null,
          rateOverride: showPay ? (body.rateOverride ?? null) : null,
          isFreelancer: true,
          freelancerName: (body.freelancerName || "").trim(),
          owners: body.owners ?? [],
        },
        include: {
          user: { select: userSelect },
          specialty: { select: { id: true, name: true } },
        },
      });

      const full = serializeAssignmentPay({ ...created, user: null });
      return NextResponse.json(showPay ? full : stripPay(full), {
        status: 201,
      });
    }

    if (!body.userId) {
      return NextResponse.json(
        { error: "Выберите сотрудника" },
        { status: 400 },
      );
    }

    const payMode = showPay ? body.payMode : "SHIFT";
    const hours = showPay && payMode === "HOURLY" ? (body.hours ?? 0) : null;
    const rateOverride = showPay ? (body.rateOverride ?? null) : null;

    const userSpec = await prisma.userSpecialty.findUnique({
      where: {
        userId_specialtyId: {
          userId: body.userId,
          specialtyId: body.specialtyId,
        },
      },
    });
    if (!userSpec) {
      return NextResponse.json(
        { error: "У сотрудника нет этой специальности" },
        { status: 400 },
      );
    }

    const created = await prisma.quoteAssignment.create({
      data: {
        quoteId: id,
        userId: body.userId,
        specialtyId: body.specialtyId,
        payMode,
        hours,
        rateOverride,
        isFreelancer: false,
        freelancerName: "",
        owners: [],
      },
      include: {
        user: { select: userSelect },
        specialty: { select: { id: true, name: true } },
      },
    });

    await notifyEmployeeOfAssignment(
      {
        id: quote.id,
        eventName: quote.eventName,
        proposalNumber: quote.proposalNumber,
        date: quote.date,
      },
      body.userId,
      created.specialty.name,
    );

    const full = serializeAssignmentPay({
      ...created,
      user: created.user
        ? {
            ...created.user,
            specialties: [
              {
                specialtyId: created.specialtyId,
                hourlyRate: userSpec.hourlyRate,
                shiftRate: userSpec.shiftRate,
              },
            ],
          }
        : null,
    });
    return NextResponse.json(showPay ? full : stripPay(full), {
      status: 201,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Не удалось назначить (возможно, уже назначен на эту должность)" },
      { status: 400 },
    );
  }
}
