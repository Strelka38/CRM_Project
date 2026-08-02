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
        "mb-8 flex flex-wrap items-end justify-between gap-4",
        className,
      )}
    >
      <div className="animate-fade-up">
        {eyebrow && (
          <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-1 text-3xl font-light tracking-tight text-[var(--ink)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-[var(--muted)]">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
