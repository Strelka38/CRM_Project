import { cn } from "@/lib/cn";

export type LifecycleStatus =
  | "CALCULATED"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED";

const lifecycleStyles: Record<LifecycleStatus, string> = {
  CALCULATED:
    "bg-[var(--lifecycle-calculated)]/15 text-[var(--lifecycle-calculated)]",
  CONFIRMED:
    "bg-[var(--lifecycle-confirmed)]/15 text-[var(--lifecycle-confirmed)]",
  CANCELLED:
    "bg-[var(--lifecycle-cancelled)]/15 text-[var(--lifecycle-cancelled)]",
  COMPLETED:
    "bg-[var(--lifecycle-completed)]/15 text-[var(--lifecycle-completed)]",
};

const lifecycleColors: Record<LifecycleStatus, string> = {
  CALCULATED: "var(--lifecycle-calculated)",
  CONFIRMED: "var(--lifecycle-confirmed)",
  CANCELLED: "var(--lifecycle-cancelled)",
  COMPLETED: "var(--lifecycle-completed)",
};

export const LIFECYCLE_LABELS: Record<LifecycleStatus, string> = {
  CALCULATED: "Посчитано",
  CONFIRMED: "Подтверждено",
  CANCELLED: "Отменено",
  COMPLETED: "Завершено",
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: LifecycleStatus;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        lifecycleStyles[status],
        className,
      )}
    >
      {label ?? LIFECYCLE_LABELS[status]}
    </span>
  );
}

export function lifecycleColor(status: LifecycleStatus) {
  return lifecycleColors[status];
}
