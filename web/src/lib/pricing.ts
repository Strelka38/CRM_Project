import type {
  Catalog,
  CatalogItem,
  CategoryCalc,
  DayMode,
  LineCalc,
  QuoteCalc,
  QuoteMeta,
} from "./types";

/** Стандартный % начисления безнала (цена = наличные / (1 − %/100)). */
export const DEFAULT_CASHLESS_PERCENT = 10;

/** Excel CEILING.MATH(n, 10) for positive numbers */
export function ceilingMath(value: number, significance = 10): number {
  if (significance === 0) return value;
  return Math.ceil(value / significance - Number.EPSILON) * significance;
}

export function normalizeCashlessPercent(
  value?: number | null,
): number {
  if (value == null || Number.isNaN(Number(value))) {
    return DEFAULT_CASHLESS_PERCENT;
  }
  // 100% сделало бы деление на ноль; верх — 99
  return Math.min(99, Math.max(0, Number(value)));
}

/**
 * Безнал: CEILING.MATH(D + (cashless * ((D/keep) - D)), 10)
 * keep = 1 − percent/100 (при 10% → 0.9, наценка ~11.11% с округлением вверх до 10)
 */
export function cashlessUnitPrice(
  basePrice: number,
  cashless: boolean,
  override: number | null | undefined,
  cashlessPercent: number = DEFAULT_CASHLESS_PERCENT,
): number {
  if (cashless && override != null) return override;
  const flag = cashless ? 1 : 0;
  const percent = normalizeCashlessPercent(cashlessPercent);
  const keep = (100 - percent) / 100;
  if (keep <= 0) return ceilingMath(basePrice, 10);
  return ceilingMath(basePrice + flag * (basePrice / keep - basePrice), 10);
}

export function dayCoefficient(mode: DayMode, days: number): number {
  const d = Math.max(1, days || 1);
  switch (mode) {
    case "full_days":
      return d;
    case "fixed1":
      return 1;
    case "fixed2":
      return 2;
    case "half_extra":
    default:
      return (d - 1) * 0.5 + 1;
  }
}

export function calcLine(
  item: CatalogItem,
  qty: number,
  meta: Pick<QuoteMeta, "cashless" | "durationDays"> & {
    cashlessPercent?: number;
  },
): LineCalc {
  const q = Math.max(0, qty || 0);
  const dayCoef = dayCoefficient(item.dayMode, meta.durationDays);
  const percent = normalizeCashlessPercent(meta.cashlessPercent);
  // Колонка D в Excel — базовая цена; G = F*D*C
  const unitPriceCash = item.price;
  // Колонка E — безнал (формула или ручной override); H = F*E*C
  const unitPriceCashless = cashlessUnitPrice(
    item.price,
    true,
    item.priceCashlessOverride,
    percent,
  );
  const unitPrice = meta.cashless ? unitPriceCashless : unitPriceCash;
  const sumCash = dayCoef * unitPriceCash * q;
  const sumCashless = dayCoef * unitPriceCashless * q;
  const sum = meta.cashless ? sumCashless : sumCash;

  return {
    item,
    qty: q,
    unitPrice,
    unitPriceCash,
    unitPriceCashless,
    dayCoef,
    sum,
    sumCash,
    sumCashless,
  };
}

export function calcQuote(
  catalog: Catalog,
  quantities: Record<string, number>,
  meta: Pick<QuoteMeta, "cashless" | "durationDays"> & {
    cashlessPercent?: number;
  },
): QuoteCalc {
  let totalCash = 0;
  let totalCashless = 0;
  let selectedCount = 0;
  const categories: CategoryCalc[] = [];

  for (const category of catalog.categories) {
    const lines: LineCalc[] = [];
    let subtotalCash = 0;
    let subtotalCashless = 0;

    for (const item of category.items) {
      const qty = quantities[item.id] ?? 0;
      if (qty <= 0) continue;
      const line = calcLine(item, qty, meta);
      lines.push(line);
      subtotalCash += line.sumCash;
      subtotalCashless += line.sumCashless;
      selectedCount += 1;
    }

    if (lines.length === 0) continue;

    totalCash += subtotalCash;
    totalCashless += subtotalCashless;
    categories.push({
      category,
      lines,
      subtotal: meta.cashless ? subtotalCashless : subtotalCash,
      subtotalCash,
      subtotalCashless,
    });
  }

  return {
    categories,
    total: meta.cashless ? totalCashless : totalCash,
    totalCash,
    totalCashless,
    selectedCount,
  };
}

export function defaultMeta(manager: string): QuoteMeta {
  return {
    proposalNumber: "90",
    eventName: "",
    date: "",
    time: "",
    place: "",
    client: "",
    manager,
    cashless: true,
    durationDays: 1,
  };
}
