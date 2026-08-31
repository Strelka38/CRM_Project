import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyManagerAgency } from "@/lib/calc-agency";
import {
  buildFreelancerExpenseInputs,
  buildLaborAndMontageBreakdown,
} from "@/lib/calc-labor";
import { buildCalcLines } from "@/lib/calc-lines";
import type { CatalogOwnerValue } from "@/lib/catalog-owner";
import { blocksInActiveZones } from "@/lib/quote-calc";
import { montageBudgetFromBlocks } from "@/lib/quote-assignment-slots";
import {
  amountsFromOverride,
  attachCogsToBreakdown,
  computeQuoteCalculation,
} from "@/lib/quote-calculation";
import {
  allocateExpenseInputs,
  buildSummaryPeople,
} from "@/lib/export/calc-summary";
import {
  formatPeriodLabel,
  getPeriodRange,
  parseListPeriod,
} from "@/lib/period";
import { requireManager } from "@/lib/session";

export async function GET(req: NextRequest) {
  try {
    const session = await requireManager();
    const mine = req.nextUrl.searchParams.get("mine") === "1";
    const lifecycle =
      req.nextUrl.searchParams.get("lifecycle") ?? "settlement";
    const period = parseListPeriod(req.nextUrl.searchParams.get("period"));

    const lifecycleWhere =
      lifecycle === "settlement"
        ? { lifecycle: { in: ["CONFIRMED" as const, "COMPLETED" as const] } }
        : lifecycle === "all"
          ? { lifecycle: { not: "CANCELLED" as const } }
          : ["CALCULATED", "CONFIRMED", "COMPLETED"].includes(lifecycle)
            ? {
                lifecycle: lifecycle as
                  | "CALCULATED"
                  | "CONFIRMED"
                  | "COMPLETED",
              }
            : {
                lifecycle: {
                  in: ["CONFIRMED" as const, "COMPLETED" as const],
                },
              };

    const periodRange =
      period === "all" ? null : getPeriodRange(period);
    const periodLabel =
      period === "all"
        ? "Все периоды"
        : formatPeriodLabel(period, periodRange!.from, periodRange!.to);

    const quotes = await prisma.quote.findMany({
      where: {
        ...lifecycleWhere,
        ...(mine ? { ownerId: session.user.id } : {}),
        ...(periodRange
          ? { eventDate: { gte: periodRange.from, lt: periodRange.to } }
          : {}),
      },
      orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
      include: {
        owner: {
          select: { id: true, name: true, owners: true, agencyPercent: true },
        },
        zones: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            name: true,
            sortOrder: true,
            active: true,
            workingDayIndexes: true,
          },
        },
        blocks: {
          orderBy: { sortOrder: "asc" },
          include: {
            catalogItem: {
              select: { name: true, itemKind: true, owners: true, costPrice: true },
            },
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
            specialty: { select: { id: true, name: true } },
            user: {
              select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
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
    });

    const rows = quotes.map((q) => {
      const activeBlocks = blocksInActiveZones(q.zones, q.blocks);
      const lines = buildCalcLines(activeBlocks, q.calcLineOverrides);
      const freelancerExpenses = buildFreelancerExpenseInputs(q.assignments);
      const baseCalc = computeQuoteCalculation({
        cashless: q.cashless,
        durationDays: q.durationDays,
        discountPercent: q.discountPercent,
        lines,
        expenses: [
          ...q.extraExpenses.map((e) => ({
            ...e,
            owners: e.owners as CatalogOwnerValue[],
            amounts: amountsFromOverride(e),
          })),
          ...freelancerExpenses,
        ],
        sharesCustom: q.sharesCustom,
        customShares: q.calcShares,
        zones: q.zones,
      });

      const revenueByCompany: Partial<Record<CatalogOwnerValue, number>> = {};
      const expensesByCompany: Partial<Record<CatalogOwnerValue, number>> = {};
      for (const b of baseCalc.breakdown) {
        revenueByCompany[b.company] = b.revenue;
        expensesByCompany[b.company] = b.expenses;
      }

      const laborMontage = buildLaborAndMontageBreakdown({
        assignments: q.assignments,
        revenueByCompany,
        expensesByCompany,
        montageBudget: montageBudgetFromBlocks(
          activeBlocks.map((b) => ({
            type: b.type,
            name: b.name,
            title: b.title,
            qty: b.qty,
            unitPrice: b.unitPrice,
            dayMode: b.dayMode,
            dayCoefOverride: b.dayCoefOverride,
            itemKind: b.catalogItem?.itemKind ?? null,
            catalogName: b.catalogItem?.name ?? null,
            zoneId: b.zoneId,
          })),
          q.durationDays,
        ),
      });

      const withPercents = laborMontage.breakdown.map((row) => {
        const base = baseCalc.breakdown.find((b) => b.company === row.company);
        return {
          ...row,
          autoPercent: base?.autoPercent ?? 0,
          percent: base?.percent ?? 0,
        };
      });

      const { breakdown, agency, agencyDeductedTotal } = applyManagerAgency(
        withPercents,
        q.owner.owners as CatalogOwnerValue[],
        q.owner.agencyPercent,
      );
      const breakdownWithCogs = attachCogsToBreakdown(breakdown, baseCalc);
      const extraByCompany = allocateExpenseInputs(
        q.extraExpenses.map((e) => ({
          name: e.name,
          amount: e.amount,
          mode: e.mode,
          owners: e.owners as CatalogOwnerValue[],
          company: e.company,
          amounts: amountsFromOverride(e),
        })),
        revenueByCompany,
      );
      const people = buildSummaryPeople(
        laborMontage.assignmentRows,
        revenueByCompany,
      );

      return {
        id: q.id,
        proposalNumber: q.proposalNumber,
        eventName: q.eventName,
        date: q.date,
        eventDate: q.eventDate,
        client: q.client,
        lifecycle: q.lifecycle,
        paid: q.paid,
        owner: {
          id: q.owner.id,
          name: q.owner.name,
          owners: q.owner.owners as CatalogOwnerValue[],
          agencyPercent: q.owner.agencyPercent,
        },
        expensesCount: q.extraExpenses.length,
        ...baseCalc,
        breakdown: breakdownWithCogs,
        laborTotal: laborMontage.laborTotal,
        montageTotal: laborMontage.montageTotal,
        montageBudget: laborMontage.montageBudget,
        montageActual: laborMontage.montageActual,
        montageOverage: laborMontage.montageOverage,
        agencyTotal: agency.total,
        agencyDeductedTotal,
        agency,
        netTotal: Math.round(
          baseCalc.payable -
            baseCalc.cogsTotal -
            baseCalc.expensesTotal -
            laborMontage.laborTotal -
            laborMontage.montageTotal -
            agencyDeductedTotal,
        ),
        sharesCustom: q.sharesCustom,
        extraByCompany,
        people,
      };
    });

    return NextResponse.json({
      period: {
        type: period,
        label: periodLabel,
        from: periodRange?.from.toISOString() ?? null,
        to: periodRange?.to.toISOString() ?? null,
      },
      rows,
      totals: {
        payable: rows.reduce((s, r) => s + r.payable, 0),
        expensesTotal: rows.reduce((s, r) => s + r.expensesTotal, 0),
        laborTotal: rows.reduce((s, r) => s + r.laborTotal, 0),
        agencyTotal: rows.reduce((s, r) => s + r.agencyTotal, 0),
        netTotal: rows.reduce((s, r) => s + r.netTotal, 0),
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("GET /api/calculations", e);
    return NextResponse.json(
      { error: "Не удалось загрузить калькуляции" },
      { status: 500 },
    );
  }
}
