import { cn } from "@/lib/cn";

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center px-6 py-14 text-center",
        className,
      )}
    >
      <div className="bg-subtle mb-4 size-12 rounded-full ring-1 ring-[var(--accent-glow)]/30" />
      <p className="text-base font-medium text-[var(--ink)]">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
