"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

function readOpen(key: string, fallback: boolean) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    /* ignore */
  }
  return fallback;
}

/**
 * Длинные предупреждения (склад, незакрытые слоты) сворачиваются в одну строку.
 * Состояние помнит localStorage — и на телефоне, и на десктопе.
 */
export function CollapsibleNotice({
  storageKey,
  title,
  summary,
  defaultOpen = false,
  className,
  headerClassName,
  children,
}: {
  storageKey: string;
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  className?: string;
  headerClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    setOpen(readOpen(storageKey, defaultOpen));
  }, [storageKey, defaultOpen]);

  function toggle() {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium md:px-4",
          headerClassName,
        )}
      >
        <span className="min-w-0 flex-1">
          {title}
          {summary ? (
            <span className="font-normal text-current/80"> · {summary}</span>
          ) : null}
        </span>
        <svg
          viewBox="0 0 24 24"
          className={cn(
            "size-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? children : null}
    </div>
  );
}
