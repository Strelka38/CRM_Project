import { cn } from "@/lib/cn";
import {
  LIFECYCLE_LABELS,
  type LifecycleStatus,
} from "@/lib/lifecycle";

export {
  LIFECYCLE_LABELS,
  LIFECYCLE_STATUSES,
  lifecycleLabel,
  type LifecycleStatus,
} from "@/lib/lifecycle";

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
