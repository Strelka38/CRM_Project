import {
  CATALOG_OWNERS,
  normalizeOwners,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";

/** Агентские менеджера проекта: 5% от (выручка − расходы − ЗП − монтажные). */
export const AGENCY_RATE = 0.05;

export type CompanyProfitRow = {
  company: CatalogOwnerValue;
  label: string;
  short: string;
  revenue: number;
  expenses: number;
  laborCost: number;
  montageCost: number;
  net: number;
  autoPercent?: number;
  percent?: number;
};

export type CompanyAgencyRow = CompanyProfitRow & {
  /** База для %: выручка − расходы − ЗП − монтажные */
  agencyBase: number;
  /** Полная сумма агентских (всегда начисляется менеджеру) */
  agency: number;
  /** Списывается с фирмы в калькуляции (только если менеджер — сотрудник этой фирмы) */
  agencyCost: number;
  /** Агентские учтены в ЗП менеджера, но не в расходах фирмы */
  agencyToManagerOnly: boolean;
};

export type ManagerAgencySummary = {
  rate: number;
  total: number;
  /** Сумма, списанная с фирм менеджера в калькуляции */
  deductedTotal: number;
  /** Сумма с чужих фирм — только в ЗП менеджера */
  incomeOnlyTotal: number;
  managerOwners: CatalogOwnerValue[];
  byCompany: Array<{
    company: CatalogOwnerValue;
    short: string;
    label: string;
    agency: number;
    deductedFromFirm: boolean;
  }>;
};

/**
 * Агентские = max(0, выручка − расходы на сотрудников − прочие расходы − монтажные) × 5%.
 * Если менеджер — сотрудник фирмы: агентские минусуются из нетто этой фирмы.
 * С остальных фирм: сумма идёт менеджеру в ЗП, но в расходах калькуляции фирмы не отражается.
 */
export function applyManagerAgency(
  breakdown: CompanyProfitRow[],
  managerOwners: CatalogOwnerValue[] | null | undefined,
): {
  breakdown: CompanyAgencyRow[];
  agency: ManagerAgencySummary;
  agencyDeductedTotal: number;
} {
  const owners = normalizeOwners(managerOwners);
  const ownerSet = new Set(owners);

  const enriched: CompanyAgencyRow[] = breakdown.map((row) => {
    const agencyBase = Math.round(
      row.revenue - row.expenses - row.laborCost - row.montageCost,
    );
    const agency = Math.round(Math.max(0, agencyBase) * AGENCY_RATE);
    const deductedFromFirm = ownerSet.has(row.company) && agency > 0;
    const agencyCost = deductedFromFirm ? agency : 0;
    return {
      ...row,
      agencyBase,
      agency,
      agencyCost,
      agencyToManagerOnly: agency > 0 && !deductedFromFirm,
      net: Math.round(agencyBase - agencyCost),
    };
  });

  // Ensure all three firms appear in agency summary even if zero
  const byCompany = CATALOG_OWNERS.map((c) => {
    const row = enriched.find((r) => r.company === c.value);
    const agency = row?.agency ?? 0;
    const deductedFromFirm = ownerSet.has(c.value) && agency > 0;
    return {
      company: c.value,
      short: c.short,
      label: c.label,
      agency,
      deductedFromFirm,
    };
  });

  const total = byCompany.reduce((s, r) => s + r.agency, 0);
  const deductedTotal = byCompany
    .filter((r) => r.deductedFromFirm)
    .reduce((s, r) => s + r.agency, 0);
  const incomeOnlyTotal = total - deductedTotal;

  return {
    breakdown: enriched,
    agencyDeductedTotal: deductedTotal,
    agency: {
      rate: AGENCY_RATE,
      total,
      deductedTotal,
      incomeOnlyTotal,
      managerOwners: owners,
      byCompany,
    },
  };
}
