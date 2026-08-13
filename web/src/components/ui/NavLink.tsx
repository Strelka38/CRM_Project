"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export function NavLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded-full px-3.5 py-1.5 text-sm transition-all duration-200",
        active
          ? "bg-[var(--header-active-bg)] text-[var(--accent)] ring-1 ring-[var(--accent-glow)]/40"
          : "text-[var(--header-muted)] hover:bg-[var(--header-hover)] hover:text-[var(--header-ink)]",
        className,
      )}
    >
      {children}
    </Link>
  );
}
