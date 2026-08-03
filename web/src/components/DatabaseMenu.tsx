"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

const ITEMS = [
  { href: "/catalog", label: "Каталог" },
  { href: "/kits", label: "Комплекты" },
  { href: "/clients", label: "Клиенты" },
  { href: "/venues", label: "Площадки" },
  { href: "/vehicles", label: "Транспорт" },
  { href: "/users", label: "Пользователи" },
  { href: "/rates", label: "Ставки" },
] as const;

export function DatabaseMenu() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = ITEMS.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "rounded-full px-3.5 py-1.5 text-sm transition-all duration-200",
          active || open
            ? "bg-white/10 text-[var(--accent)] ring-1 ring-[var(--accent-glow)]/40"
            : "text-[var(--muted-on-dark)] hover:bg-white/5 hover:text-white",
        )}
      >
        База данных
        <span className="ml-1 inline-block text-[10px] opacity-70" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-40 mt-2 min-w-[11rem] overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] py-1 shadow-xl"
        >
          {ITEMS.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                className={cn(
                  "block px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-[var(--selected)] text-[var(--accent-deep)]"
                    : "text-[var(--muted)] hover:bg-subtle hover:text-[var(--ink)]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
