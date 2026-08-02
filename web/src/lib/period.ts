export type StatsPeriod = "month" | "quarter" | "year";
export type ListPeriod = StatsPeriod | "all";

export const STATS_PERIODS: { value: StatsPeriod; label: string }[] = [
  { value: "month", label: "Текущий месяц" },
  { value: "quarter", label: "Квартал" },
  { value: "year", label: "Год" },
];

export const LIST_PERIODS: { value: ListPeriod; label: string }[] = [
  ...STATS_PERIODS,
  { value: "all", label: "Все периоды" },
];

export function parseStatsPeriod(value: string | null): StatsPeriod {
  if (value === "quarter" || value === "year" || value === "month") return value;
  return "month";
}

export function parseListPeriod(value: string | null): ListPeriod {
  if (value === "all" || value === "quarter" || value === "year" || value === "month") {
    return value;
  }
  return "month";
}

/** Half-open [from, to) range in local time for the given period. */
export function getPeriodRange(period: StatsPeriod, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();

  if (period === "month") {
    return {
      from: new Date(year, month, 1),
      to: new Date(year, month + 1, 1),
    };
  }
  if (period === "quarter") {
    const qStart = Math.floor(month / 3) * 3;
    return {
      from: new Date(year, qStart, 1),
      to: new Date(year, qStart + 3, 1),
    };
  }
  return {
    from: new Date(year, 0, 1),
    to: new Date(year + 1, 0, 1),
  };
}

export function formatPeriodLabel(period: StatsPeriod, from: Date, to: Date) {
  const fmt = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const end = new Date(to.getTime() - 1);
  const name =
    STATS_PERIODS.find((p) => p.value === period)?.label ?? period;
  return `${name}: ${fmt.format(from)} — ${fmt.format(end)}`;
}

export type YearMonth = { year: number; month: number };

/** Parse `YYYY-MM`; falls back to current local month. */
export function parseYearMonth(value: string | null, now = new Date()): YearMonth {
  if (value && /^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split("-").map(Number);
    if (m >= 1 && m <= 12) return { year: y, month: m - 1 };
  }
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function getYearMonthRange(ym: YearMonth) {
  return {
    from: new Date(ym.year, ym.month, 1),
    to: new Date(ym.year, ym.month + 1, 1),
  };
}

export function shiftYearMonth(ym: YearMonth, delta: number): YearMonth {
  const d = new Date(ym.year, ym.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

export function toYearMonthParam(ym: YearMonth) {
  return `${ym.year}-${String(ym.month + 1).padStart(2, "0")}`;
}

export function formatYearMonthLabel(ym: YearMonth) {
  const raw = new Intl.DateTimeFormat("ru-RU", {
    month: "long",
    year: "numeric",
  }).format(new Date(ym.year, ym.month, 1));
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/** Half-open range for list filters; `ym` selects a concrete month when period is `month`. */
export function resolveListPeriodRange(
  period: ListPeriod,
  ymParam: string | null = null,
  now = new Date(),
): { from: Date; to: Date } | null {
  if (period === "all") return null;
  if (period === "month") {
    return getYearMonthRange(parseYearMonth(ymParam, now));
  }
  return getPeriodRange(period, now);
}
