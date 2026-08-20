import { applyManagerAgency, type ManagerAgencySummary } from "@/lib/calc-agency";
import {
  buildFreelancerExpenseInputs,
  buildLaborAndMontageBreakdown,
} from "@/lib/calc-labor";
import { buildCalcLines } from "@/lib/calc-lines";
import type { CatalogOwnerValue } from "@/lib/catalog-owner";
import { blocksInActiveZones } from "@/lib/quote-calc";
import {
  amountsFromOverride,
  computeQuoteCalculation,
} from "@/lib/quote-calculation";

type SettlementQuote = {
  cashless: boolean;
  durationDays: number;
  discountPercent: number;
  sharesCustom: boolean;
  owner: {
    owners: CatalogOwnerValue[] | string[];
    agencyPercent?: number | null;
  };
  blocks: Parameters<typeof buildCalcLines>[0];
  calcLineOverrides: Parameters<typeof buildCalcLines>[1];
  extraExpenses: Array<{
    name: string;
    amount: number;
    mode?: "SHARE" | "AMOUNT";
    owners: CatalogOwnerValue[] | string[];
    company?: CatalogOwnerValue | string | null;
    amountShowMaster?: number;
    amountDiakom?: number;
    amountNeEvent?: number;
    sortOrder?: number;
  }>;
  calcShares: Array<{ company: CatalogOwnerValue | string; percent: number }>;
  assignments: Parameters<typeof buildLaborAndMontageBreakdown>[0]["assignments"];
  zones?: Array<{ id: string; active?: boolean | null }>;
};

/** Полный расчёт калькуляции + агентские менеджера проекта. */
export function computeQuoteSettlement(quote: SettlementQuote): {
  payable: number;
  cogsTotal: number;
  marginTotal: number;
  expensesTotal: number;
  laborTotal: number;
  montageTotal: number;
  agency: ManagerAgencySummary;
  agencyDeductedTotal: number;
  netTotal: number;
} {
  const blocks = quote.zones
    ? blocksInActiveZones(quote.zones, quote.blocks)
    : quote.blocks;
  const lines = buildCalcLines(blocks, quote.calcLineOverrides);
  const freelancerExpenses = buildFreelancerExpenseInputs(quote.assignments);
  const baseCalc = computeQuoteCalculation({
    cashless: quote.cashless,
    durationDays: quote.durationDays,
    discountPercent: quote.discountPercent,
    lines,
    expenses: [
      ...quote.extraExpenses.map((e) => ({
        name: e.name,
        amount: e.amount,
        mode: e.mode,
        owners: e.owners as CatalogOwnerValue[],
        company: (e.company as CatalogOwnerValue | null | undefined) ?? null,
        amounts: amountsFromOverride(e),
        sortOrder: e.sortOrder,
      })),
      ...freelancerExpenses,
    ],
    sharesCustom: quote.sharesCustom,
    customShares: quote.calcShares.map((s) => ({
      company: s.company as CatalogOwnerValue,
      percent: s.percent,
    })),
  });

  const revenueByCompany: Partial<Record<CatalogOwnerValue, number>> = {};
  const expensesByCompany: Partial<Record<CatalogOwnerValue, number>> = {};
  for (const b of baseCalc.breakdown) {
    revenueByCompany[b.company] = b.revenue;
    expensesByCompany[b.company] = b.expenses;
  }

  const laborMontage = buildLaborAndMontageBreakdown({
    assignments: quote.assignments,
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

  const { agency, agencyDeductedTotal } = applyManagerAgency(
    withPercents,
    quote.owner.owners as CatalogOwnerValue[],
    quote.owner.agencyPercent,
  );

  return {
    payable: baseCalc.payable,
    cogsTotal: baseCalc.cogsTotal,
    marginTotal: baseCalc.marginTotal,
    expensesTotal: baseCalc.expensesTotal,
    laborTotal: laborMontage.laborTotal,
    montageTotal: laborMontage.montageTotal,
    agency,
    agencyDeductedTotal,
    netTotal: Math.round(
      baseCalc.payable -
        baseCalc.cogsTotal -
        baseCalc.expensesTotal -
        laborMontage.laborTotal -
        laborMontage.montageTotal -
        agencyDeductedTotal,
    ),
  };
}
