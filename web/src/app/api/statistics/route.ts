import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildCalcLines } from "@/lib/calc-lines";
import {
  allocateByRevenueShare,
  allocateLaborByEmployeeOwners,
  CATALOG_OWNERS,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { calcAssignmentPay } from "@/lib/payroll";
import {
  formatPeriodLabel,
  getPeriodRange,
  parseStatsPeriod,
} from "@/lib/period";
import { calcByZones } from "@/lib/quote-calc";
import {
  amountsFromOverride,
  computeQuoteCalculation,
} from "@/lib/quote-calculation";
import { requireManager } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    await requireManager();

    const period = parseStatsPeriod(req.nextUrl.searchParams.get("period"));
    const userId = req.nextUrl.searchParams.get("userId") || "";
    const { from, to } = getPeriodRange(period);

    const dateFilter = { eventDate: { gte: from, lt: to } };

    const [quotes, users, assignments] = await Promise.all([
      prisma.quote.findMany({
        where: {
          ...dateFilter,
          lifecycle: { in: ["CONFIRMED", "COMPLETED"] },
        },
        orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
        include: {
          zones: { orderBy: { sortOrder: "asc" } },
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
          assignments: {
            include: {
              specialty: { select: { id: true, name: true } },
              user: {
                select: {
                  id: true,
                  name: true,
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
          calcShares: true,
          calcLineOverrides: true,
          extraExpenses: { orderBy: { sortOrder: "asc" } },
        },
      }),
      prisma.user.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, role: true },
      }),
      prisma.quoteAssignment.findMany({
        where: {
          ...(userId ? { userId } : {}),
          quote: dateFilter,
        },
        include: {
          specialty: { select: { id: true, name: true } },
          user: {
            select: {
              id: true,
              name: true,
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
          quote: {
            select: {
              id: true,
              eventName: true,
              date: true,
              eventDate: true,
              lifecycle: true,
              place: true,
              client: true,
              proposalNumber: true,
            },
          },
        },
        orderBy: { quote: { eventDate: "desc" } },
      }),
    ]);

    const companyAgg = new Map<
      CatalogOwnerValue,
      {
        company: CatalogOwnerValue;
        short: string;
        label: string;
        revenue: number;
        expenses: number;
        laborCost: number;
        unassignedRevenue: number;
        projectCount: number;
      }
    >();
    for (const c of CATALOG_OWNERS) {
      companyAgg.set(c.value, {
        company: c.value,
        short: c.short,
        label: c.label,
        revenue: 0,
        expenses: 0,
        laborCost: 0,
        unassignedRevenue: 0,
        projectCount: 0,
      });
    }

    let cashRevenueTotal = 0;
    let cashExpensesTotal = 0;
    let unassignedCashTotal = 0;

    const projects = quotes.map((q) => {
      const blockInputs = q.blocks.map((b) => ({
        ...b,
        itemKind: b.catalogItem?.itemKind ?? null,
      }));
      const totals = calcByZones(
        q.zones,
        blockInputs,
        q.cashless,
        q.durationDays,
        q.discountPercent,
      );
      const assignmentPays = q.assignments.map((a) => {
        const rates = a.user.specialties.find(
          (s) => s.specialtyId === a.specialtyId,
        );
        const pay = calcAssignmentPay({
          payMode: a.payMode,
          hours: a.hours,
          rateOverride: a.rateOverride,
          hourlyRate: rates?.hourlyRate ?? 0,
          shiftRate: rates?.shiftRate ?? 0,
        });
        return {
          pay,
          owners: a.user.owners as CatalogOwnerValue[],
        };
      });
      const laborCost = assignmentPays.reduce((s, a) => s + a.pay, 0);
      const laborAlloc = allocateLaborByEmployeeOwners(assignmentPays);

      const lines = buildCalcLines(q.blocks, q.calcLineOverrides);
      const companyCalc = computeQuoteCalculation({
        durationDays: q.durationDays,
        discountPercent: q.discountPercent,
        lines,
        expenses: q.extraExpenses.map((e) => ({
          ...e,
          owners: e.owners as CatalogOwnerValue[],
          amounts: amountsFromOverride(e),
        })),
        sharesCustom: q.sharesCustom,
        customShares: q.calcShares,
      });

      cashRevenueTotal += companyCalc.payable;
      cashExpensesTotal += companyCalc.expensesTotal;
      unassignedCashTotal += companyCalc.unassignedRevenue;

      const revenueByCompany: Partial<Record<CatalogOwnerValue, number>> = {};
      for (const b of companyCalc.breakdown) {
        revenueByCompany[b.company] = b.revenue;
      }
      // ЗП без тегов у сотрудника — по доле выручки фирм в проекте
      const untaggedShare = allocateByRevenueShare(
        laborAlloc.untagged,
        revenueByCompany,
      );

      const byCompany = CATALOG_OWNERS.map((c) => {
        const row = companyCalc.breakdown.find((b) => b.company === c.value);
        const revenue = row?.revenue ?? 0;
        const expenses = row?.expenses ?? 0;
        const labor = Math.round(
          (laborAlloc.byCompany[c.value] ?? 0) + (untaggedShare[c.value] ?? 0),
        );
        const profit = revenue - expenses - labor;

        if (revenue > 0 || expenses > 0 || labor > 0) {
          const agg = companyAgg.get(c.value)!;
          agg.revenue += revenue;
          agg.expenses += expenses;
          agg.laborCost += labor;
          if (revenue > 0) agg.projectCount += 1;
        }

        return {
          company: c.value,
          short: c.short,
          label: c.label,
          revenue,
          expenses,
          laborCost: labor,
          profit,
          percent: row?.percent ?? 0,
        };
      });

      // attribute unassigned only at aggregate level once per quote
      // (already in companyCalc.unassignedRevenue)

      return {
        id: q.id,
        proposalNumber: q.proposalNumber,
        eventName: q.eventName,
        date: q.date,
        client: q.client,
        lifecycle: q.lifecycle,
        paid: q.paid,
        revenue: totals.payable,
        laborCost,
        profit: totals.payable - laborCost,
        cashRevenue: companyCalc.payable,
        cashExpenses: companyCalc.expensesTotal,
        cashUnassigned: companyCalc.unassignedRevenue,
        byCompany,
      };
    });

    const revenue = projects.reduce((s, p) => s + p.revenue, 0);
    const laborCost = projects.reduce((s, p) => s + p.laborCost, 0);
    const profit = revenue - laborCost;
    const paidRevenue = projects
      .filter((p) => p.paid)
      .reduce((s, p) => s + p.revenue, 0);

    const companies = CATALOG_OWNERS.map((c) => {
      const agg = companyAgg.get(c.value)!;
      return {
        company: agg.company,
        short: agg.short,
        label: agg.label,
        revenue: Math.round(agg.revenue),
        expenses: Math.round(agg.expenses),
        laborCost: Math.round(agg.laborCost),
        profit: Math.round(agg.revenue - agg.expenses - agg.laborCost),
        projectCount: agg.projectCount,
      };
    });

    const payrollRows = assignments.map((a) => {
      const rates = a.user.specialties.find(
        (s) => s.specialtyId === a.specialtyId,
      );
      const pay = calcAssignmentPay({
        payMode: a.payMode,
        hours: a.hours,
        rateOverride: a.rateOverride,
        hourlyRate: rates?.hourlyRate ?? 0,
        shiftRate: rates?.shiftRate ?? 0,
      });
      return {
        id: a.id,
        pay,
        payMode: a.payMode,
        hours: a.hours,
        rateOverride: a.rateOverride,
        hourlyRate: rates?.hourlyRate ?? 0,
        shiftRate: rates?.shiftRate ?? 0,
        specialty: a.specialty,
        user: { id: a.user.id, name: a.user.name },
        quote: a.quote,
      };
    });

    const confirmedRows = payrollRows.filter((r) =>
      ["CONFIRMED", "COMPLETED"].includes(r.quote.lifecycle),
    );
    const pendingRows = payrollRows.filter(
      (r) => r.quote.lifecycle === "CALCULATED",
    );

    const byEmployeeMap = new Map<
      string,
      { userId: string; name: string; confirmed: number; pending: number }
    >();
    for (const row of payrollRows) {
      let entry = byEmployeeMap.get(row.user.id);
      if (!entry) {
        entry = {
          userId: row.user.id,
          name: row.user.name,
          confirmed: 0,
          pending: 0,
        };
        byEmployeeMap.set(row.user.id, entry);
      }
      if (["CONFIRMED", "COMPLETED"].includes(row.quote.lifecycle)) {
        entry.confirmed += row.pay;
      } else if (row.quote.lifecycle === "CALCULATED") {
        entry.pending += row.pay;
      }
    }
    const byEmployee = [...byEmployeeMap.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "ru"),
    );

    return NextResponse.json({
      period: {
        type: period,
        from: from.toISOString(),
        to: to.toISOString(),
        label: formatPeriodLabel(period, from, to),
      },
      profitability: {
        projectCount: projects.length,
        revenue,
        laborCost,
        profit,
        paidRevenue,
        projects,
      },
      byCompany: {
        note: "Выручка в наличных по правилам калькуляции (ШМ / ДК / НИ). ЗП списывается с фирм сотрудника (теги в профиле); без тегов — по доле выручки проекта.",
        cashRevenue: Math.round(cashRevenueTotal),
        cashExpenses: Math.round(cashExpensesTotal),
        unassignedRevenue: Math.round(unassignedCashTotal),
        companies,
      },
      payroll: {
        userId: userId || null,
        users,
        confirmedTotal: confirmedRows.reduce((s, r) => s + r.pay, 0),
        pendingTotal: pendingRows.reduce((s, r) => s + r.pay, 0),
        byEmployee,
        rows: userId ? payrollRows : [],
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/statistics", e);
    return NextResponse.json(
      { error: "Не удалось загрузить статистику" },
      { status: 500 },
    );
  }
}
