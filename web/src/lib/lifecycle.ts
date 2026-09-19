export const LIFECYCLE_STATUSES = [
  "CALCULATED",
  "CONFIRMED",
  "CANCELLED",
  "COMPLETED",
] as const;

export type LifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];

export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  CALCULATED: "Посчитано",
  CONFIRMED: "Подтверждено",
  CANCELLED: "Отменено",
  COMPLETED: "Завершено",
};

/** Склад, статистика, выплаты, доходность. */
export const STATS_LIFECYCLES = ["CONFIRMED", "COMPLETED"] as const;
export type StatsLifecycle = (typeof STATS_LIFECYCLES)[number];

/** Ростер и ФОТ: все, кроме отменённых. */
export const ROSTER_LIFECYCLES = [
  "CALCULATED",
  "CONFIRMED",
  "COMPLETED",
] as const;
export type RosterLifecycle = (typeof ROSTER_LIFECYCLES)[number];

/** Дашборд: ещё не завершённые. */
export const OPEN_LIFECYCLES = ["CALCULATED", "CONFIRMED"] as const;
export type OpenLifecycle = (typeof OPEN_LIFECYCLES)[number];

export function isLifecycleStatus(v: unknown): v is LifecycleStatus {
  return (
    typeof v === "string" &&
    (LIFECYCLE_STATUSES as readonly string[]).includes(v)
  );
}

export function parseLifecycleStatus(
  raw: string,
  fallback: LifecycleStatus = "CALCULATED",
): LifecycleStatus {
  const t = raw.trim();
  if (isLifecycleStatus(t)) return t;
  const upper = t.toUpperCase();
  if (isLifecycleStatus(upper)) return upper;
  const byLabel = LIFECYCLE_STATUSES.find(
    (s) => LIFECYCLE_LABELS[s].toLowerCase() === t.toLowerCase(),
  );
  return byLabel ?? fallback;
}

export function lifecycleLabel(status: string): string {
  return isLifecycleStatus(status) ? LIFECYCLE_LABELS[status] : status;
}

export function isStatsLifecycle(lifecycle: string): boolean {
  return (STATS_LIFECYCLES as readonly string[]).includes(lifecycle);
}

export function isRosterLifecycle(lifecycle: string): boolean {
  return (ROSTER_LIFECYCLES as readonly string[]).includes(lifecycle);
}

export function isOpenLifecycle(lifecycle: string): boolean {
  return (OPEN_LIFECYCLES as readonly string[]).includes(lifecycle);
}
