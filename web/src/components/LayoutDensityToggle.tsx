"use client";

import { useLayoutDensity } from "@/components/LayoutDensityProvider";
import { cn } from "@/lib/cn";

export function LayoutDensityToggle({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { mode, showingDesktop, setMode } = useLayoutDensity();

  return (
    <div className={cn("flex flex-col items-stretch gap-0.5", className)}>
      <button
        type="button"
        onClick={() => setMode(showingDesktop ? "mobile" : "desktop")}
        className={cn(
          "rounded-md px-2 py-1.5 text-left text-xs text-[var(--header-muted)] transition-colors hover:bg-[var(--header-hover)] hover:text-[var(--header-ink)]",
          compact && "px-2 py-1",
        )}
      >
        {showingDesktop ? "Мобильная версия" : "Полная версия"}
      </button>
      {!compact && mode !== "auto" ? (
        <button
          type="button"
          onClick={() => setMode("auto")}
          className="rounded-md px-2 py-1 text-left text-[10px] text-[var(--header-muted)]/80 hover:text-[var(--header-ink)]"
        >
          Авто
        </button>
      ) : null}
    </div>
  );
}
