import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { dayOffsOverlappingQuote } from "@/lib/day-off-conflicts";
import { notifyEmployeeOfAssignment } from "@/lib/notifications";
import {
  canManageAssignments,
  canSeeAssignmentPay,
  requireAssignmentManager,
  requireSession,
} from "@/lib/session";
import { serializeAssignmentPay } from "@/lib/quote-assignments";
import { ensureFreelancerByName } from "@/lib/freelancer-directory";
import {
  backfillAssignmentZones,
  ensureMountSpecialtyId,
  inferAssignmentZoneId,
  quoteZoneIdOrNull,
} from "@/lib/quote-assignment-slots";
import { normDayIndex } from "@/lib/quote-assignment-days";

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

    await backfillAssignmentZones(prisma, id);

    const assignments = await prisma.quoteAssignment.findMany({
      where: { quoteId: id },
      include: {
        user: { select: userSelect },
        specialty: { select: { id: true, name: true } },
        zone: { select: { id: true, name: true } },
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
  specialtyId: z.string().min(1).optional(),
  kind: z.enum(["EVENT", "MOUNT"]).optional().default("EVENT"),
  zoneId: z.string().min(1).nullable().optional(),
  dayIndex: z.number().int().min(1).nullable().optional(),
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
    const kind = body.kind ?? "EVENT";
    const specialtyId =
      kind === "MOUNT"
        ? body.specialtyId || (await ensureMountSpecialtyId(prisma))
        : body.specialtyId;
    if (!specialtyId) {
      return NextResponse.json(
        { error: "Выберите должность" },
        { status: 400 },
      );
    }
    const dayIndex =
      kind === "MOUNT" ? null : normDayIndex(body.dayIndex);
    const zoneId =
      body.zoneId === undefined
        ? await inferAssignmentZoneId(prisma, id, specialtyId, kind)
        : await quoteZoneIdOrNull(prisma, id, body.zoneId);

    const assignmentInclude = {
      user: { select: userSelect },
      specialty: { select: { id: true, name: true } },
      zone: { select: { id: true, name: true } },
    } as const;

    async function emptySlot() {
      const dayWhere = { dayIndex };
      const matchZone = zoneId
        ? await prisma.quoteAssignment.findFirst({
            where: {
              quoteId: id,
              kind,
              userId: null,
              isFreelancer: false,
              zoneId,
              ...dayWhere,
              ...(kind === "MOUNT" ? {} : { specialtyId }),
            },
            orderBy: { createdAt: "asc" },
          })
        : null;
      if (matchZone) return matchZone;
      return prisma.quoteAssignment.findFirst({
        where: {
          quoteId: id,
          kind,
          userId: null,
          isFreelancer: false,
          ...dayWhere,
          ...(kind === "MOUNT" ? {} : { specialtyId }),
        },
        orderBy: { createdAt: "asc" },
      });
    }

    if (body.isFreelancer) {
      const specialty = await prisma.specialty.findFirst({
        where: { id: specialtyId, active: true },
        select: { id: true, name: true },
      });
      if (!specialty) {
        return NextResponse.json(
          { error: "Должность не найдена" },
          { status: 400 },
        );
      }

      const vacant = await emptySlot();
      const created = vacant
        ? await prisma.quoteAssignment.update({
            where: { id: vacant.id },
            data: {
              userId: null,
              payMode: "SHIFT",
              hours: null,
              rateOverride: showPay ? (body.rateOverride ?? null) : null,
              isFreelancer: true,
              freelancerName: (body.freelancerName || "").trim(),
              owners: body.owners ?? [],
              kind,
            },
            include: assignmentInclude,
          })
        : await prisma.quoteAssignment.create({
            data: {
              quoteId: id,
              userId: null,
              specialtyId,
              kind,
              zoneId,
              dayIndex,
              payMode: "SHIFT",
              hours: null,
              rateOverride: showPay ? (body.rateOverride ?? null) : null,
              isFreelancer: true,
              freelancerName: (body.freelancerName || "").trim(),
              owners: body.owners ?? [],
            },
            include: assignmentInclude,
          });

      await ensureFreelancerByName(created.freelancerName);

      const full = serializeAssignmentPay({ ...created, user: null });
      return NextResponse.json(showPay ? full : stripPay(full), {
        status: 201,
      });
    }

    if (!body.userId) {
      const specialty = await prisma.specialty.findFirst({
        where: { id: specialtyId, active: true },
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
          specialtyId,
          kind,
          zoneId,
          dayIndex,
          payMode: "SHIFT",
          hours: null,
          rateOverride: null,
          isFreelancer: false,
          freelancerName: "",
          owners: [],
        },
        include: assignmentInclude,
      });
      const full = serializeAssignmentPay({ ...created, user: null });
      return NextResponse.json(showPay ? full : stripPay(full), {
        status: 201,
      });
    }

    const payMode = showPay ? body.payMode : "SHIFT";
    const hours = showPay && payMode === "HOURLY" ? (body.hours ?? 0) : null;
    const rateOverride = showPay ? (body.rateOverride ?? null) : null;

    const vacant = await emptySlot();
    const userSpec = await prisma.userSpecialty.findUnique({
      where: {
        userId_specialtyId: {
          userId: body.userId,
          specialtyId,
        },
      },
    });
    if (kind !== "MOUNT" && !userSpec && !vacant) {
      return NextResponse.json(
        { error: "У сотрудника нет этой специальности" },
        { status: 400 },
      );
    }

    const dayOffs = await dayOffsOverlappingQuote(body.userId, quote);
    if (dayOffs.length > 0) {
      const when = dayOffs
        .map((d) =>
          d.startTime && d.endTime
            ? `${d.date} (${d.startTime}–${d.endTime})`
            : d.date,
        )
        .join(", ");
      return NextResponse.json(
        {
          error: `У сотрудника выходной в эти дни: ${when}. Назначить нельзя.`,
          dayOffs,
        },
        { status: 409 },
      );
    }

    const created = vacant
      ? await prisma.quoteAssignment.update({
          where: { id: vacant.id },
          data: {
            userId: body.userId,
            payMode,
            hours,
            rateOverride,
            isFreelancer: false,
            freelancerName: "",
            owners: [],
            kind,
          },
          include: assignmentInclude,
        })
      : await prisma.quoteAssignment.create({
          data: {
            quoteId: id,
            userId: body.userId,
            specialtyId,
            kind,
            zoneId,
            dayIndex,
            payMode,
            hours,
            rateOverride,
            isFreelancer: false,
            freelancerName: "",
            owners: [],
          },
          include: assignmentInclude,
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
                hourlyRate: userSpec?.hourlyRate ?? 0,
                shiftRate: userSpec?.shiftRate ?? 0,
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
