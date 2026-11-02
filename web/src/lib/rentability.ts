/** Выручка / расходы. Нет расходов и есть выручка — бесконечность. Оба нуля — нет коэффициента. */
export function rentabilityRatio(
  revenue: number,
  expenses: number,
): number | null {
  const rev = Number(revenue) || 0;
  const exp = Math.max(0, Number(expenses) || 0);
  if (exp === 0) return rev > 0 ? Number.POSITIVE_INFINITY : null;
  return Math.round((rev / exp) * 100) / 100;
}

export function formatRentability(ratio: number | null): string {
  if (ratio == null) return "—";
  if (!Number.isFinite(ratio)) return "∞";
  return ratio.toFixed(2);
}

export type RentabilityTone = "green" | "blue" | "red" | "muted";

/** > 1.2 зелёный, 1…1.2 синий, < 1 красный. Сравнение по уже округлённому коэффициенту. */
export function rentabilityTone(ratio: number | null): RentabilityTone {
  if (ratio == null) return "muted";
  if (!Number.isFinite(ratio) || ratio > 1.2) return "green";
  if (ratio >= 1) return "blue";
  return "red";
}

export function rentabilityClass(ratio: number | null): string {
  const tone = rentabilityTone(ratio);
  if (tone === "green") return "text-emerald-500 dark:text-emerald-400";
  if (tone === "blue") return "text-sky-500 dark:text-sky-400";
  if (tone === "red") return "text-[var(--danger)]";
  return "text-[var(--muted)]";
}
