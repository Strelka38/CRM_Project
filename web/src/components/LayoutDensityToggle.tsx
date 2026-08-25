"use client";

import { useLayoutDensity } from "@/components/LayoutDensityProvider";
import { cn } from "@/lib/cn";

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="7" y="2.5" width="10" height="19" rx="2" />
      <path d="M11 18.5h2" />
    </svg>
  );
}

export function LayoutDensityToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { mode, showingDesktop, setMode } = useLayoutDensity();
  const toMobile = showingDesktop;

  return (
    <div className={cn("flex flex-col items-stretch gap-0.5", className)}>
      <button
        type="button"
        onClick={() => setMode(toMobile ? "mobile" : "desktop")}
        aria-label={toMobile ? "Мобильная версия" : "Полная версия"}
        title={toMobile ? "Мобильная версия" : "Полная версия"}
        className={cn(
          "rounded-md text-[var(--header-muted)] transition-colors hover:bg-[var(--header-hover)] hover:text-[var(--header-ink)]",
          toMobile
            ? "flex h-9 w-9 items-center justify-center"
            : cn(
                "px-2 py-1.5 text-left text-xs",
                compact && "px-2 py-1",
              ),
        )}
      >
        {toMobile ? <PhoneIcon className="h-5 w-5" /> : "Полная версия"}
      </button>
      {!compact && mode !== "auto" ? (
        <button
          type="button"
          onClick={() => setMode("auto")}
          className="rounded-md px-2 py-1 text-left text-caption text-[var(--header-muted)]/80 hover:text-[var(--header-ink)]"
        >
          Авто
        </button>
      ) : null}
    </div>
  );
}
