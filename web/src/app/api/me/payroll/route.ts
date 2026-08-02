import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { CatalogOwnerValue } from "@/lib/catalog-owner";
import { calcAssignmentPay } from "@/lib/payroll";
import {
  formatPeriodLabel,
  formatYearMonthLabel,
  parseListPeriod,
  parseYearMonth,
  resolveListPeriodRange,
  toYearMonthParam,
} from "@/lib/period";
import { computeQuoteSettlement } from "@/lib/quote-settlement";
import { requireSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const session = await requireSession();
    const userId = session.user.id;
    const period = parseListPeriod(req.nextUrl.searchParams.get("period"));
    const ymParam = req.nextUrl.searchParams.get("ym");
    const ym = parseYearMonth(ymParam);
    const periodRange = resolveListPeriodRange(period, ymParam);

    const periodLabel =
      period === "all"
        ? "Все периоды"
        : period === "month"
          ? formatYearMonthLabel(ym)
          : formatPeriodLabel(period, periodRange!.from, periodRange!.to);

    const eventDateFilter = periodRange
      ? { eventDate: { gte: periodRange.from, lt: periodRange.to } }
      : {};

    const [assignments, userSpecs, user, ownedQuotes] = await Promise.all([
      prisma.quoteAssignment.findMany({
        where: {
          userId,
          quote: {
            ...eventDateFilter,
            lifecycle: { in: ["CALCULATED", "CONFIRMED", "COMPLETED"] },
          },
        },
        include: {
          specialty: { select: { id: true, name: true } },
          quote: {
            select: {
              id: true,
              eventName: true,
              date: true,
              eventDate: true,
              lifecycle: true,
              place: true,
              client: true,
            },
          },
        },
        orderBy: { quote: { eventDate: "desc" } },
      }),
      prisma.userSpecialty.findMany({ where: { userId } }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { monthlySalary: true, role: true, owners: true },
      }),
      prisma.quote.findMany({
        where: {
          ownerId: userId,
          ...eventDateFilter,
          lifecycle: { in: ["CALCULATED", "CONFIRMED", "COMPLETED"] },
        },
        orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
        include: {
          owner: { select: { id: true, name: true, owners: true } },
          blocks: {
            orderBy: { sortOrder: "asc" },
            include: {
              catalogItem: { select: { itemKind: true, owners: true } },
              kit: {
                select: {
                  components: {
                    select: {
                      catalogItem: { select: { owners: true } },
                    },
                  },
                },
              },
            },
          },
          calcShares: true,
          extraExpenses: { orderBy: { sortOrder: "asc" } },
          calcLineOverrides: true,
          assignments: {
            include: {
              user: {
                select: {
                  owners: true,
                  specialties: {
                    select: {
                      specialtyId: true,
                      hourlyRate: true,
                      shiftRate: true,
                    },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

    const rateMap = new Map(
      userSpecs.map((s) => [
        s.specialtyId,
        { hourlyRate: s.hourlyRate, shiftRate: s.shiftRate },
      ]),
    );
    const monthlySalary = user?.monthlySalary ?? 0;

    const rows = assignments.map((a) => {
      const rates = rateMap.get(a.specialtyId) || {
        hourlyRate: 0,
        shiftRate: 0,
      };
      const bonus = Math.max(0, Number(a.bonus) || 0);
      const montageAmount = Math.max(0, Number(a.montageAmount) || 0);
      const pay = calcAssignmentPay({
        payMode: a.payMode,
        hours: a.hours,
        rateOverride: a.rateOverride,
        bonus,
        ...rates,
      });
      return {
        id: a.id,
        specialty: a.specialty,
        payMode: a.payMode,
        hours: a.hours,
        rateOverride: a.rateOverride,
        hourlyRate: rates.hourlyRate,
        shiftRate: rates.shiftRate,
        bonus,
        montageAmount,
        pay,
        quote: a.quote,
      };
    });

    const confirmed = rows.filter((r) =>
      ["CONFIRMED", "COMPLETED"].includes(r.quote.lifecycle),
    );
    const pending = rows.filter((r) => r.quote.lifecycle === "CALCULATED");

    const confirmedAssignmentsTotal = confirmed.reduce((s, r) => s + r.pay, 0);
    const pendingAssignmentsTotal = pending.reduce((s, r) => s + r.pay, 0);
    const confirmedMontageTotal = confirmed.reduce(
      (s, r) => s + r.montageAmount,
      0,
    );
    const pendingMontageTotal = pending.reduce(
      (s, r) => s + r.montageAmount,
      0,
    );

    const agencyRows = ownedQuotes.map((q) => {
      const settlement = computeQuoteSettlement({
        ...q,
        owner: {
          owners: q.owner.owners as CatalogOwnerValue[],
        },
        extraExpenses: q.extraExpenses.map((e) => ({
          ...e,
          owners: e.owners as CatalogOwnerValue[],
        })),
      });
      return {
        id: q.id,
        quote: {
          id: q.id,
          eventName: q.eventName,
          date: q.date,
          eventDate: q.eventDate,
          lifecycle: q.lifecycle,
          client: q.client,
          place: q.place,
        },
        agencyTotal: settlement.agency.total,
        deductedTotal: settlement.agency.deductedTotal,
        incomeOnlyTotal: settlement.agency.incomeOnlyTotal,
        byCompany: settlement.agency.byCompany,
      };
    });

    const confirmedAgency = agencyRows.filter((r) =>
      ["CONFIRMED", "COMPLETED"].includes(r.quote.lifecycle),
    );
    const pendingAgency = agencyRows.filter(
      (r) => r.quote.lifecycle === "CALCULATED",
    );

    const confirmedAgencyTotal = confirmedAgency.reduce(
      (s, r) => s + r.agencyTotal,
      0,
    );
    const pendingAgencyTotal = pendingAgency.reduce(
      (s, r) => s + r.agencyTotal,
      0,
    );

    const confirmedTotal =
      confirmedAssignmentsTotal + confirmedMontageTotal + confirmedAgencyTotal;
    const pendingTotal =
      pendingAssignmentsTotal + pendingMontageTotal + pendingAgencyTotal;

    return NextResponse.json({
      period: {
        type: period,
        ym: toYearMonthParam(ym),
        label: periodLabel,
        from: periodRange?.from.toISOString() ?? null,
        to: periodRange?.to.toISOString() ?? null,
      },
      confirmed,
      pending,
      agencyConfirmed: confirmedAgency,
      agencyPending: pendingAgency,
      confirmedAssignmentsTotal,
      pendingAssignmentsTotal,
      confirmedMontageTotal,
      pendingMontageTotal,
      confirmedAgencyTotal,
      pendingAgencyTotal,
      confirmedTotal,
      pendingTotal,
      monthlySalary,
      estimatedSalary: confirmedTotal,
      managerOwners: (user?.owners ?? []) as CatalogOwnerValue[],
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/me/payroll", e);
    return NextResponse.json(
      { error: "Не удалось загрузить зарплату" },
      { status: 500 },
    );
  }
}
