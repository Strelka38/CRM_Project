"use client";

import { useTheme } from "@/components/ThemeProvider";
import { cn } from "@/lib/cn";

export function ThemeToggle({
  className,
  variant = "header",
}: {
  className?: string;
  variant?: "header" | "page";
}) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
      title={isDark ? "Светлая тема" : "Тёмная тема"}
      className={cn(
        "relative flex h-9 w-9 items-center justify-center rounded-md transition-colors",
        variant === "header"
          ? "text-[var(--muted-on-dark)] hover:bg-white/10 hover:text-white"
          : "text-[var(--muted)] hover:bg-[var(--selected)] hover:text-[var(--ink)]",
        className,
      )}
    >
      {isDark ? (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
          aria-hidden
        >
          <path d="M21 14.5A8.5 8.5 0 1 1 9.5 3a6.5 6.5 0 0 0 11.5 11.5z" />
        </svg>
      )}
    </button>
  );
}
