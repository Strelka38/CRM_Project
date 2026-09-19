import { cn } from "@/lib/cn";

export function PageHeader({
  title,
  subtitle,
  eyebrow = "CRM",
  actions,
  className,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-6 flex flex-wrap items-end justify-between gap-3",
        className,
      )}
    >
      <div>
        {eyebrow && (
          <p className="font-mono text-caption uppercase tracking-[0.1em] text-[var(--muted)]">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-[length:var(--fs-h1)] leading-[var(--lh-h1)] font-medium tracking-tight text-[var(--ink)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-[var(--muted)]">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
