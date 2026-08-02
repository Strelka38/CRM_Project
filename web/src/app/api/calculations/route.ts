import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { applyManagerAgency } from "@/lib/calc-agency";
import { buildLaborAndMontageBreakdown } from "@/lib/calc-labor";
import { buildCalcLines } from "@/lib/calc-lines";
import type { CatalogOwnerValue } from "@/lib/catalog-owner";
import {
  amountsFromOverride,
  computeQuoteCalculation,
} from "@/lib/quote-calculation";
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
        owner: { select: { id: true, name: true, owners: true } },
        zones: {
          orderBy: { sortOrder: "asc" },
          select: { id: true, name: true, sortOrder: true },
        },
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
    });

    const rows = quotes.map((q) => {
      const lines = buildCalcLines(q.blocks, q.calcLineOverrides);
      const baseCalc = computeQuoteCalculation({
        cashless: q.cashless,
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
        },
        expensesCount: q.extraExpenses.length,
        ...baseCalc,
        breakdown,
        laborTotal: laborMontage.laborTotal,
        montageTotal: laborMontage.montageTotal,
        agencyTotal: agency.total,
        agencyDeductedTotal,
        agency,
        netTotal: Math.round(
          baseCalc.payable -
            baseCalc.expensesTotal -
            laborMontage.laborTotal -
            laborMontage.montageTotal -
            agencyDeductedTotal,
        ),
        sharesCustom: q.sharesCustom,
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
