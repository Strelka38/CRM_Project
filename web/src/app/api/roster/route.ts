import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { addDays, formatDateKey, parseEventDate } from "@/lib/dates";
import { freelancerAssignmentPay, freelancerNameKey } from "@/lib/freelancer-directory";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import { ROSTER_LIFECYCLES } from "@/lib/lifecycle";
import { calcAssignmentPay } from "@/lib/payroll";
import { getYearMonthRange, parseYearMonth } from "@/lib/period";
import {
  rosterPersonName,
  buildRosterItems,
  collectBusyDates,
  collectFreelancerBusyDates,
} from "@/lib/roster";
import { requireAssignmentManager } from "@/lib/session";
import { overlappingEntryWhere } from "@/lib/calendar-entries";

function dateOnlyUtc(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

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

export async function GET(req: NextRequest) {
  try {
    await requireAssignmentManager();
    await ensureSchemaOnce();
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

    const [quotes, entries, dayOffs, monthAssignments, users, monthFreelance, freelancers] =
      await Promise.all([
      prisma.quote.findMany({
        where: {
          eventDate: {
            gte: padFrom,
            lte: padTo,
          },
          lifecycle: { in: [...ROSTER_LIFECYCLES] },
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
          lifecycle: true,
          owner: { select: { owners: true } },
          zones: {
            select: { id: true, name: true, sortOrder: true, workingDayIndexes: true },
          },
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
          createdBy: { select: { owners: true } },
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
          ...overlappingEntryWhere(padFrom, padTo),
        },
        select: {
          date: true,
          endDate: true,
          durationDays: true,
          assignees: { select: { userId: true } },
        },
      }),
      prisma.quoteAssignment.findMany({
        where: {
          userId: { not: null },
          isFreelancer: false,
          quote: {
            eventDate: { gte: monthRange.from, lt: monthRange.to },
            lifecycle: { in: [...ROSTER_LIFECYCLES] },
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
      prisma.quoteAssignment.findMany({
        where: {
          isFreelancer: true,
          freelancerName: { not: "" },
          quote: {
            eventDate: { gte: monthRange.from, lt: monthRange.to },
            lifecycle: { in: [...ROSTER_LIFECYCLES] },
          },
        },
        select: {
          freelancerName: true,
          payMode: true,
          hours: true,
          rateOverride: true,
          bonus: true,
          montageAmount: true,
        },
      }),
      prisma.freelancer.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          active: true,
          specialties: {
            select: {
              specialty: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const items = buildRosterItems(
      quotes.map((q) => ({
        ...q,
        firmOwners: q.owner?.owners ?? [],
      })),
      entries.map((e) => ({
        ...e,
        firmOwners: e.createdBy?.owners ?? [],
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
        const start = new Date(
          entry.date.getUTCFullYear(),
          entry.date.getUTCMonth(),
          entry.date.getUTCDate(),
        );
        const endSrc = entry.endDate ?? entry.date;
        const end = new Date(
          endSrc.getUTCFullYear(),
          endSrc.getUTCMonth(),
          endSrc.getUTCDate(),
        );
        const keys: string[] = [];
        for (
          let cur = start;
          cur.getTime() <= end.getTime();
          cur = addDays(cur, 1)
        ) {
          keys.push(formatDateKey(cur));
        }
        return entry.assignees.flatMap((a) =>
          keys.map((date) => ({ userId: a.userId, date })),
        );
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
      kind: "staff" as const,
    }));

    const earnedByFreelancer = new Map<string, number>();
    const freelancerIdByKey = new Map(
      freelancers.map((f) => [freelancerNameKey(f.name), f.id]),
    );
    for (const a of monthFreelance) {
      const id = freelancerIdByKey.get(freelancerNameKey(a.freelancerName));
      if (!id) continue;
      earnedByFreelancer.set(
        id,
        (earnedByFreelancer.get(id) || 0) + freelancerAssignmentPay(a),
      );
    }
    const busyByFreelancer = collectFreelancerBusyDates(items, freelancers);
    const freelancerPeople = freelancers.map((f) => ({
      id: f.id,
      name: f.name,
      firstName: "",
      lastName: "",
      active: f.active,
      specialties: f.specialties.map((s) => s.specialty),
      monthEarned: earnedByFreelancer.get(f.id) || 0,
      busyDates: busyByFreelancer[f.id] || [],
      kind: "freelancer" as const,
    }));

    return NextResponse.json({ items, people, freelancers: freelancerPeople });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/roster", e);
    return NextResponse.json(
      { error: "Не удалось загрузить срост" },
      { status: 500 },
    );
  }
}
