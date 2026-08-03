import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { notifyEmployeeOfAssignment } from "@/lib/notifications";
import { calcAssignmentPay } from "@/lib/payroll";
import {
  canManageAssignments,
  requireAssignmentManager,
  requireSession,
} from "@/lib/session";

async function getAccessibleQuote(id: string, userId: string, role: string) {
  const quote = await prisma.quote.findUnique({ where: { id } });
  if (!quote) return null;
  // Менеджер и бригадир — любое мероприятие; сотрудник — только свои назначения
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

function serializeAssignment(
  a: {
    id: string;
    quoteId: string;
    userId: string;
    specialtyId: string;
    payMode: "SHIFT" | "HOURLY";
    hours: number | null;
    rateOverride: number | null;
    bonus?: number | null;
    user: {
      id: string;
      name: string;
      email: string;
      firstName: string;
      lastName: string;
      owners: Array<"SHOW_MASTER" | "DIAKOM" | "NE_EVENT">;
    };
    specialty: { id: string; name: string };
  },
  rates: { hourlyRate: number; shiftRate: number },
) {
  const bonus = Math.max(0, Number(a.bonus) || 0);
  const pay = calcAssignmentPay({
    payMode: a.payMode,
    hours: a.hours,
    rateOverride: a.rateOverride,
    hourlyRate: rates.hourlyRate,
    shiftRate: rates.shiftRate,
    bonus,
  });
  return {
    ...a,
    bonus,
    hourlyRate: rates.hourlyRate,
    shiftRate: rates.shiftRate,
    pay,
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

    const userIds = [...new Set(assignments.map((a) => a.userId))];
    const userSpecs = await prisma.userSpecialty.findMany({
      where: { userId: { in: userIds } },
    });
    const rateKey = (uid: string, sid: string) => `${uid}:${sid}`;
    const rateMap = new Map(
      userSpecs.map((s) => [
        rateKey(s.userId, s.specialtyId),
        { hourlyRate: s.hourlyRate, shiftRate: s.shiftRate },
      ]),
    );

    return NextResponse.json(
      assignments.map((a) =>
        serializeAssignment(
          a,
          rateMap.get(rateKey(a.userId, a.specialtyId)) || {
            hourlyRate: 0,
            shiftRate: 0,
          },
        ),
      ),
    );
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}

const createSchema = z.object({
  userId: z.string().min(1),
  specialtyId: z.string().min(1),
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
        payMode: body.payMode,
        hours: body.payMode === "HOURLY" ? (body.hours ?? 0) : null,
        rateOverride: body.rateOverride ?? null,
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

    return NextResponse.json(
      serializeAssignment(created, {
        hourlyRate: userSpec.hourlyRate,
        shiftRate: userSpec.shiftRate,
      }),
      { status: 201 },
    );
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
