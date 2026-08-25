import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { addDays, formatDateKey, parseEventDate } from "@/lib/dates";
import { calcAssignmentPay } from "@/lib/payroll";
import { getYearMonthRange, parseYearMonth } from "@/lib/period";
import {
  rosterPersonName,
  buildRosterItems,
  collectBusyDates,
} from "@/lib/roster";
import { requireAssignmentManager } from "@/lib/session";

function dateOnlyUtc(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export async function GET(req: NextRequest) {
  try {
    await requireAssignmentManager();
    const fromRaw = req.nextUrl.searchParams.get("from");
    const toRaw = req.nextUrl.searchParams.get("to");
    const from = parseEventDate(fromRaw || undefined);
    const to = parseEventDate(toRaw || undefined);
    if (!from || !to) {
      return NextResponse.json({ error: "Укажите from и to" }, { status: 400 });
    }

    const padFrom = addDays(from, -21);
    const padTo = addDays(to, 21);
    const monthRange = getYearMonthRange(
      parseYearMonth(req.nextUrl.searchParams.get("month")),
    );

    const [quotes, entries, dayOffs, monthAssignments, users] = await Promise.all([
      prisma.quote.findMany({
        where: {
          eventDate: {
            gte: padFrom,
            lte: padTo,
          },
        },
        select: {
          id: true,
          proposalNumber: true,
          eventName: true,
          client: true,
          date: true,
          eventDate: true,
          durationDays: true,
          mountDate: true,
          mountDurationDays: true,
          demountDate: true,
          demountDurationDays: true,
          assignments: {
            select: {
              id: true,
              kind: true,
              dayIndex: true,
              userId: true,
              isFreelancer: true,
              freelancerName: true,
              specialtyId: true,
              zoneId: true,
              onMount: true,
              onDemount: true,
              specialty: { select: { id: true, name: true } },
              user: {
                select: {
                  id: true,
                  name: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      }),
      prisma.calendarEntry.findMany({
        where: {
          kind: { in: ["RENTAL", "TASK"] },
          date: {
            gte: dateOnlyUtc(from),
            lte: dateOnlyUtc(to),
          },
        },
        select: {
          id: true,
          kind: true,
          date: true,
          title: true,
          responsibleUser: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
          client: { select: { companyName: true } },
          assignees: {
            select: {
              userId: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
        orderBy: { date: "asc" },
      }),
      prisma.calendarEntry.findMany({
        where: {
          kind: "DAY_OFF",
          date: {
            gte: dateOnlyUtc(padFrom),
            lte: dateOnlyUtc(padTo),
          },
        },
        select: {
          date: true,
          assignees: { select: { userId: true } },
        },
      }),
      prisma.quoteAssignment.findMany({
        where: {
          userId: { not: null },
          isFreelancer: false,
          quote: {
            eventDate: { gte: monthRange.from, lt: monthRange.to },
            lifecycle: { in: ["CALCULATED", "CONFIRMED", "COMPLETED"] },
          },
        },
        select: {
          userId: true,
          specialtyId: true,
          payMode: true,
          hours: true,
          rateOverride: true,
          bonus: true,
          montageAmount: true,
        },
      }),
      prisma.user.findMany({
        where: { active: true },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          firstName: true,
          lastName: true,
          active: true,
          owners: true,
          specialties: {
            select: {
              specialtyId: true,
              hourlyRate: true,
              shiftRate: true,
              specialty: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const items = buildRosterItems(
      quotes,
      entries.map((e) => ({
        ...e,
        date: formatDateKey(
          new Date(
            e.date.getUTCFullYear(),
            e.date.getUTCMonth(),
            e.date.getUTCDate(),
          ),
        ),
      })),
    );

    const busyByUser = collectBusyDates(
      items,
      dayOffs.flatMap((entry) => {
        const date = formatDateKey(
          new Date(
            entry.date.getUTCFullYear(),
            entry.date.getUTCMonth(),
            entry.date.getUTCDate(),
          ),
        );
        return entry.assignees.map((a) => ({ userId: a.userId, date }));
      }),
    );
    const ratesByUser = new Map(
      users.map((u) => [
        u.id,
        new Map(
          u.specialties.map((s) => [
            s.specialtyId,
            { hourlyRate: s.hourlyRate, shiftRate: s.shiftRate },
          ]),
        ),
      ]),
    );
    const earnedByUser = new Map<string, number>();
    for (const a of monthAssignments) {
      if (!a.userId) continue;
      const rates = ratesByUser.get(a.userId)?.get(a.specialtyId) || {
        hourlyRate: 0,
        shiftRate: 0,
      };
      const pay =
        calcAssignmentPay({
          payMode: a.payMode,
          hours: a.hours,
          rateOverride: a.rateOverride,
          bonus: a.bonus,
          ...rates,
        }) + Math.max(0, Number(a.montageAmount) || 0);
      earnedByUser.set(a.userId, (earnedByUser.get(a.userId) || 0) + pay);
    }

    const people = users.map((u) => ({
      id: u.id,
      name: rosterPersonName(u),
      firstName: u.firstName,
      lastName: u.lastName,
      active: u.active,
      specialties: u.specialties.map((s) => s.specialty),
      owners: u.owners,
      monthEarned: earnedByUser.get(u.id) || 0,
      busyDates: busyByUser[u.id] || [],
    }));

    return NextResponse.json({ items, people });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/roster", e);
    return NextResponse.json(
      { error: "Не удалось загрузить срост" },
      { status: 500 },
    );
  }
}
