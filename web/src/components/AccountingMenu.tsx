"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/quotes", label: "Сметы" },
  { href: "/payroll", label: "Моя ЗП" },
  { href: "/unpaid", label: "Неоплаченные" },
  { href: "/statistics", label: "Статистика" },
  { href: "/calculations", label: "Калькуляции" },
] as const;

function isItemActive(pathname: string, href: string) {
  // Редактор сметы открывается из календаря — подсвечиваем «Сметы» только на списке.
  if (href === "/quotes") return pathname === "/quotes";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AccountingMenu({
  variant = "sidebar",
}: {
  variant?: "sidebar" | "top";
}) {
  const pathname = usePathname();
  const active = ITEMS.some((item) => isItemActive(pathname, item.href));
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

  const links = ITEMS.map((item) => {
    const isActive = isItemActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "rounded-md px-2 py-1.5 text-sm transition-colors",
          isActive
            ? "text-[var(--accent)]"
            : "text-[var(--header-muted)] hover:bg-[var(--header-hover)] hover:text-[var(--header-ink)]",
        )}
      >
        {item.label}
      </Link>
    );
  });

  return (
    <div ref={rootRef} className={variant === "top" ? "relative" : undefined}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
          variant === "sidebar" ? "w-full" : "gap-1.5 whitespace-nowrap",
          active || open
            ? "bg-[var(--header-active-bg)] text-[var(--accent)]"
            : "text-[var(--header-muted)] hover:bg-[var(--header-hover)] hover:text-[var(--header-ink)]",
        )}
      >
        Учёт
        <span className="text-[10px] opacity-70" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && variant === "sidebar" ? (
        <div className="ml-2 mt-0.5 flex flex-col border-l border-[var(--header-line)] pl-2">
          {links}
        </div>
      ) : null}
      {open && variant === "top" ? (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[11rem] rounded-lg border border-[var(--header-line)] bg-[var(--bg-elevated)] p-1 shadow-lg">
          <div className="flex flex-col">{links}</div>
        </div>
      ) : null}
    </div>
  );
}
