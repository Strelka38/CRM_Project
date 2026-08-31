import type { CatalogOwner, CalcLineMode } from "@prisma/client";
import {
  CATALOG_OWNERS,
  normalizeOwners,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { resolveLineEconomics } from "@/lib/calc-line-cost";
import { calcBlock, type QuoteBlockInput } from "@/lib/quote-calc";
import {
  zoneDurationDays,
  type ZoneWorkingDays,
} from "@/lib/quote-assignment-days";

export type LineAmountSplit = {
  SHOW_MASTER: number;
  DIAKOM: number;
  NE_EVENT: number;
};

export type CalcExpenseInput = {
  id?: string;
  name: string;
  amount: number;
  mode?: CalcLineMode | "SHARE" | "AMOUNT";
  /** @deprecated use owners */
  company?: CatalogOwnerValue | CatalogOwner | null;
  owners?: CatalogOwnerValue[] | CatalogOwner[];
  amounts?: LineAmountSplit;
  sortOrder?: number;
};

export type CalcShareInput = {
  company: CatalogOwnerValue | CatalogOwner;
  percent: number;
};

export type LineCalcOverride = {
  mode: CalcLineMode | "SHARE" | "AMOUNT";
  ownersCustom: boolean;
  owners: CatalogOwnerValue[];
  amounts: LineAmountSplit;
  /** Абсолютная себестоимость строки; null = из каталога / дефолт (услуга 0, лицензия passthrough). */
  costOverride?: number | null;
};

export type LineOwnerInput = {
  block: QuoteBlockInput;
  /** Catalog / kit default owners. */
  catalogOwners: CatalogOwnerValue[];
  override?: LineCalcOverride | null;
  /** CatalogItem.costPrice (за единицу). */
  unitCost?: number | null;
};

export type CompanyBreakdown = {
  company: CatalogOwnerValue;
  label: string;
  short: string;
  /** Auto-computed share from item owners (0–100). */
  autoPercent: number;
  /** Effective share used for settlement (auto or custom). */
  percent: number;
  /** Маржа (клиент − закуп). Не раздувается себестоимостью Zoom. */
  revenue: number;
  /** Закуп / себестоимость позиций. */
  cogs: number;
  expenses: number;
  net: number;
};

export type QuoteCalculationResult = {
  subtotal: number;
  discount: number;
  payable: number;
  cogsTotal: number;
  marginTotal: number;
  expensesTotal: number;
  netTotal: number;
  sharesCustom: boolean;
  companiesPresent: CatalogOwnerValue[];
  unassignedRevenue: number;
  breakdown: CompanyBreakdown[];
  autoShares: CalcShareInput[];
};

export function emptyAmounts(): LineAmountSplit {
  return { SHOW_MASTER: 0, DIAKOM: 0, NE_EVENT: 0 };
}

export function amountsFromOverride(o: {
  amountShowMaster?: number | null;
  amountDiakom?: number | null;
  amountNeEvent?: number | null;
}): LineAmountSplit {
  return {
    SHOW_MASTER: Math.max(0, Number(o.amountShowMaster) || 0),
    DIAKOM: Math.max(0, Number(o.amountDiakom) || 0),
    NE_EVENT: Math.max(0, Number(o.amountNeEvent) || 0),
  };
}

function companyMeta(company: CatalogOwnerValue) {
  return (
    CATALOG_OWNERS.find((o) => o.value === company) ?? {
      value: company,
      label: company,
      short: company,
    }
  );
}

/** Equal percents for a set of companies (sums to 100). */
export function equalShares(
  companies: CatalogOwnerValue[],
): CalcShareInput[] {
  const unique = CATALOG_OWNERS.map((o) => o.value).filter((v) =>
    companies.includes(v),
  );
  if (unique.length === 0) return [];
  const base = Math.floor(10000 / unique.length) / 100;
  const shares = unique.map((company) => ({ company, percent: base }));
  const sum = shares.reduce((s, x) => s + x.percent, 0);
  if (shares.length > 0) {
    shares[0] = {
      ...shares[0],
      percent: Math.round((shares[0].percent + (100 - sum)) * 100) / 100,
    };
  }
  return shares;
}

function effectiveOwners(line: LineOwnerInput): CatalogOwnerValue[] {
  if (line.override?.ownersCustom) {
    return normalizeOwners(line.override.owners);
  }
  return normalizeOwners(line.catalogOwners);
}

/**
 * Split each line's revenue by owners (equal) or fixed amounts.
 * Always uses cash (наличные) prices — even if the quote itself is cashless.
 * Discount is applied proportionally to payable/subtotal.
 * Quote-level custom shares redistribute only SHARE-mode revenue;
 * AMOUNT-mode lines keep their fixed allocations.
 */
export function computeQuoteCalculation(input: {
  /** Ignored for pricing: calculation always uses cash totals. */
  cashless?: boolean;
  durationDays: number;
  discountPercent: number;
  lines: LineOwnerInput[];
  expenses: CalcExpenseInput[];
  sharesCustom: boolean;
  customShares?: CalcShareInput[];
  /** Если зона с отдельными датами — коэффициент дней берётся от неё. */
  zones?: ZoneWorkingDays[] | null;
}): QuoteCalculationResult {
  const discountRate = Math.max(0, Number(input.discountPercent) || 0) / 100;

  let subtotal = 0;
  const shareAuto = new Map<CatalogOwnerValue, number>();
  const amountAuto = new Map<CatalogOwnerValue, number>();
  const cogsRawByCompany = new Map<CatalogOwnerValue, number>();
  let unassignedRevenue = 0;
  let cogsRawTotal = 0;

  function addMap(
    map: Map<CatalogOwnerValue, number>,
    company: CatalogOwnerValue,
    value: number,
  ) {
    if (value <= 0) return;
    map.set(company, (map.get(company) ?? 0) + value);
  }

  const prepared: Array<{ line: LineOwnerInput; lineTotal: number }> = [];
  for (const line of input.lines) {
    const { block } = line;
    if (block.type !== "ITEM" && block.type !== "KIT_HEADER") continue;
    // Always cash: безнал → пересчёт в наличные для распределения прибыли
    const calc = calcBlock(
      { ...block, type: block.type === "KIT_HEADER" ? "ITEM" : block.type },
      false,
      zoneDurationDays(block.zoneId, input.durationDays, input.zones),
    );
    const lineTotal = calc.lineTotalCash;
    if (lineTotal <= 0) continue;
    subtotal += lineTotal;
    prepared.push({ line, lineTotal });
  }

  const discount = subtotal * discountRate;
  const payable = Math.max(0, subtotal - discount);
  const scale = subtotal > 0 ? payable / subtotal : 0;

  for (const { line, lineTotal } of prepared) {
    const { block } = line;
    // Скидка режет клиентскую сумму; закуп (override / каталог) не дисконтируется.
    const client = lineTotal * scale;
    const eco = resolveLineEconomics({
      clientTotal: client,
      qty: block.qty,
      itemKind: block.itemKind,
      name: block.name || block.title,
      catalogUnitCost: line.unitCost,
      costOverride: line.override?.costOverride,
    });
    cogsRawTotal += eco.cost;

    const mode = line.override?.mode ?? "SHARE";
    if (mode === "AMOUNT" && line.override) {
      const amounts = line.override.amounts;
      let assignedOrig = 0;
      for (const company of CATALOG_OWNERS.map((o) => o.value)) {
        const origPart = Math.max(0, Number(amounts[company]) || 0);
        if (origPart <= 0) continue;
        assignedOrig += origPart;
        const ratio = lineTotal > 0 ? origPart / lineTotal : 0;
        const clientPart = client * ratio;
        const costPart = eco.cost * ratio;
        addMap(amountAuto, company, Math.max(0, clientPart - costPart));
        addMap(cogsRawByCompany, company, costPart);
      }
      const restOrig = Math.max(0, lineTotal - assignedOrig);
      if (restOrig > 0.0001 && lineTotal > 0) {
        const ratio = restOrig / lineTotal;
        unassignedRevenue += Math.max(0, client * ratio - eco.cost * ratio);
      }
      continue;
    }

    const list = effectiveOwners(line);
    if (list.length === 0) {
      unassignedRevenue += eco.margin;
      continue;
    }
    const marginPart = eco.margin / list.length;
    const costPart = eco.cost / list.length;
    for (const company of list) {
      addMap(shareAuto, company, marginPart);
      addMap(cogsRawByCompany, company, costPart);
    }
  }

  const cogsTotal = cogsRawTotal;

  const autoRevenue = new Map<CatalogOwnerValue, number>();
  for (const company of CATALOG_OWNERS.map((o) => o.value)) {
    const total =
      (shareAuto.get(company) ?? 0) + (amountAuto.get(company) ?? 0);
    if (total > 0) autoRevenue.set(company, total);
  }

  const companiesPresent = CATALOG_OWNERS.map((o) => o.value).filter(
    (v) =>
      (autoRevenue.get(v) ?? 0) > 0.0001 ||
      (cogsRawByCompany.get(v) ?? 0) > 0.0001,
  );

  const autoShares = equalShares(companiesPresent);
  const autoTotal = [...autoRevenue.values()].reduce((s, v) => s + v, 0);

  let effectiveRevenue = new Map<CatalogOwnerValue, number>(autoRevenue);
  let sharesCustom = input.sharesCustom;

  if (sharesCustom && input.customShares && input.customShares.length > 0) {
    const custom = input.customShares
      .map((s) => ({
        company: s.company as CatalogOwnerValue,
        percent: Math.max(0, Number(s.percent) || 0),
      }))
      .filter((s) => CATALOG_OWNERS.some((o) => o.value === s.company));
    const percentSum = custom.reduce((s, x) => s + x.percent, 0);
    const sharePool = [...shareAuto.values()].reduce((s, v) => s + v, 0);
    effectiveRevenue = new Map(amountAuto);
    if (percentSum > 0 && sharePool > 0) {
      for (const s of custom) {
        effectiveRevenue.set(
          s.company,
          (effectiveRevenue.get(s.company) ?? 0) +
            (sharePool * s.percent) / percentSum,
        );
      }
    } else if (percentSum > 0 && sharePool <= 0) {
      // Only amount lines — keep them; don't wipe with empty custom pool
      effectiveRevenue = new Map(autoRevenue);
      sharesCustom = false;
    }
  } else {
    sharesCustom = false;
  }

  function expenseTotalOf(exp: CalcExpenseInput): number {
    if ((exp.mode ?? "SHARE") === "AMOUNT" && exp.amounts) {
      return (
        Math.max(0, Number(exp.amounts.SHOW_MASTER) || 0) +
        Math.max(0, Number(exp.amounts.DIAKOM) || 0) +
        Math.max(0, Number(exp.amounts.NE_EVENT) || 0)
      );
    }
    return Math.max(0, Number(exp.amount) || 0);
  }

  const expensesTotal = input.expenses.reduce(
    (s, e) => s + expenseTotalOf(e),
    0,
  );

  const expenseByCompany = new Map<CatalogOwnerValue, number>();
  let revenueForShare = [...effectiveRevenue.entries()].filter(
    ([, v]) => v > 0,
  );
  let revenueShareSum = revenueForShare.reduce((s, [, v]) => s + v, 0);
  if (revenueShareSum <= 0) {
    revenueForShare = [...cogsRawByCompany.entries()].filter(([, v]) => v > 0);
    revenueShareSum = revenueForShare.reduce((s, [, v]) => s + v, 0);
  }

  for (const exp of input.expenses) {
    const mode = exp.mode ?? "SHARE";

    if (mode === "AMOUNT" && exp.amounts) {
      for (const company of CATALOG_OWNERS.map((o) => o.value)) {
        const part = Math.max(0, Number(exp.amounts[company]) || 0);
        if (part <= 0) continue;
        expenseByCompany.set(
          company,
          (expenseByCompany.get(company) ?? 0) + part,
        );
      }
      continue;
    }

    const amount = Math.max(0, Number(exp.amount) || 0);
    if (amount <= 0) continue;

    let owners = normalizeOwners(
      (exp.owners ?? []) as CatalogOwnerValue[],
    );
    // legacy single-company field
    if (owners.length === 0 && exp.company) {
      owners = normalizeOwners([exp.company as CatalogOwnerValue]);
    }

    if (owners.length > 0) {
      const part = amount / owners.length;
      for (const company of owners) {
        expenseByCompany.set(
          company,
          (expenseByCompany.get(company) ?? 0) + part,
        );
      }
      continue;
    }

    // empty owners → split by revenue shares
    if (revenueShareSum <= 0) continue;
    for (const [company, rev] of revenueForShare) {
      expenseByCompany.set(
        company,
        (expenseByCompany.get(company) ?? 0) + (amount * rev) / revenueShareSum,
      );
    }
  }

  const allCompanies = CATALOG_OWNERS.map((o) => o.value).filter(
    (v) =>
      (effectiveRevenue.get(v) ?? 0) > 0.0001 ||
      (expenseByCompany.get(v) ?? 0) > 0.0001 ||
      (cogsRawByCompany.get(v) ?? 0) > 0.0001 ||
      (autoRevenue.get(v) ?? 0) > 0.0001 ||
      (input.customShares ?? []).some((s) => s.company === v),
  );

  if (sharesCustom && input.customShares) {
    for (const s of input.customShares) {
      const c = s.company as CatalogOwnerValue;
      if (!allCompanies.includes(c)) allCompanies.push(c);
    }
  }

  const ordered = CATALOG_OWNERS.map((o) => o.value).filter((v) =>
    allCompanies.includes(v),
  );

  const breakdown: CompanyBreakdown[] = ordered.map((company) => {
    const meta = companyMeta(company);
    const revenue = effectiveRevenue.get(company) ?? 0;
    const cogs = cogsRawByCompany.get(company) ?? 0;
    const expenses = expenseByCompany.get(company) ?? 0;
    const autoRev = autoRevenue.get(company) ?? 0;
    const autoPercent =
      autoTotal > 0 ? Math.round((autoRev / autoTotal) * 10000) / 100 : 0;
    let percent = autoPercent;
    if (sharesCustom && input.customShares) {
      const custom = input.customShares.find((s) => s.company === company);
      percent = custom ? Math.max(0, Number(custom.percent) || 0) : 0;
    }
    return {
      company,
      label: meta.label,
      short: meta.short,
      autoPercent,
      percent,
      revenue: Math.round(revenue),
      cogs: Math.round(cogs),
      expenses: Math.round(expenses),
      // Закуп уже вычтен из выручки (маржа). Не минусуем повторно.
      net: Math.round(revenue - expenses),
    };
  });

  const netTotal = breakdown.reduce((s, b) => s + b.net, 0);
  const marginTotal = breakdown.reduce((s, b) => s + b.revenue, 0);

  return {
    subtotal: Math.round(subtotal),
    discount: Math.round(discount),
    payable: Math.round(payable),
    cogsTotal: Math.round(cogsTotal),
    marginTotal: Math.round(marginTotal),
    expensesTotal: Math.round(expensesTotal),
    netTotal,
    sharesCustom,
    companiesPresent,
    unassignedRevenue: Math.round(unassignedRevenue),
    breakdown,
    autoShares,
  };
}

/** Перенести закуп из базового расчёта в строки после ЗП/агентских. */
export function attachCogsToBreakdown<
  T extends { company: CatalogOwnerValue },
>(rows: T[], calc: QuoteCalculationResult): Array<T & { cogs: number }> {
  const byCo = new Map(calc.breakdown.map((b) => [b.company, b.cogs]));
  return rows.map((row) => ({
    ...row,
    cogs: byCo.get(row.company) ?? 0,
  }));
}

/** Resolve owners for a kit from its components (unique union). */
export function ownersFromKitComponents(
  components: { catalogItem?: { owners?: CatalogOwner[] | null } | null }[],
): CatalogOwnerValue[] {
  const set = new Set<CatalogOwnerValue>();
  for (const c of components) {
    for (const o of normalizeOwners(
      (c.catalogItem?.owners ?? []) as CatalogOwnerValue[],
    )) {
      set.add(o);
    }
  }
  return CATALOG_OWNERS.map((o) => o.value).filter((v) => set.has(v));
}
