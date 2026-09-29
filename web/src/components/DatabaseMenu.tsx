"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import {
  isNavItemActive,
  navGroupIsActive,
  navMenuItems,
} from "@/lib/nav-sections";

export function DatabaseMenu({
  showBackup = false,
  variant = "sidebar",
  allowedHrefs,
}: {
  showBackup?: boolean;
  variant?: "sidebar" | "top";
  allowedHrefs?: readonly string[];
}) {
  const pathname = usePathname();
  const items = navMenuItems("database", {
    showBackup,
    mobile: variant === "sidebar",
    allowedHrefs,
  });

  const active = navGroupIsActive(pathname, "database", {
    showBackup,
    allowedHrefs,
  });
  const [open, setOpen] = useState(variant === "sidebar" ? active : false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (variant === "sidebar" && active) setOpen(true);
    if (variant === "top") setOpen(false);
  }, [active, pathname, variant]);

  useEffect(() => {
    if (variant !== "top" || !open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, variant]);

  if (items.length === 0) return null;

  const links = items.map((item) => {
    const isActive = isNavItemActive(pathname, item.href, item.exactActive);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "rounded-md px-2 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-[var(--header-active-bg)] font-medium text-[var(--ink)]"
            : "text-[var(--header-muted)] hover:bg-[var(--header-hover)] hover:text-[var(--header-ink)]",
        )}
      >
        {item.label}
      </Link>
    );
  });

  return (
    <div
      ref={rootRef}
      className={variant === "top" ? "relative" : undefined}
      onMouseEnter={variant === "top" ? () => setOpen(true) : undefined}
      onMouseLeave={variant === "top" ? () => setOpen(false) : undefined}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={variant === "top" ? undefined : () => setOpen((v) => !v)}
        className={cn(
          "flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
          variant === "sidebar" ? "w-full" : "gap-1.5 whitespace-nowrap",
          active || open
            ? "bg-[var(--header-active-bg)] font-medium text-[var(--ink)]"
            : "text-[var(--header-muted)] hover:bg-[var(--header-hover)] hover:text-[var(--header-ink)]",
        )}
      >
        База Данных
        <span className="text-caption opacity-70" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && variant === "sidebar" ? (
        <div className="ml-2 mt-0.5 flex flex-col border-l border-[var(--header-line)] pl-2">
          {links}
        </div>
      ) : null}
      {open && variant === "top" ? (
        <div className="absolute right-0 top-full z-50 pt-1">
          <div className="min-w-[12rem] rounded-lg border border-[var(--header-line)] bg-[var(--bg-elevated)] p-1 shadow-lg">
            <div className="flex flex-col">{links}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
