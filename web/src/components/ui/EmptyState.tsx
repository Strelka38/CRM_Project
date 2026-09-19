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
      role="status"
      className={cn(
        "mx-auto flex max-w-sm flex-col items-center px-6 py-16 text-center",
        className,
      )}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        className="mb-5 text-[var(--muted)]"
        aria-hidden
      >
        <rect
          x="8"
          y="10"
          width="32"
          height="28"
          rx="4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        <path
          d="M16 20h16M16 26h10"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <p className="text-base font-medium tracking-tight text-[var(--ink)]">
        {title}
      </p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-[var(--muted)]">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
