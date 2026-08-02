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
          ? "bg-white/10 text-[var(--accent)] ring-1 ring-[var(--accent-glow)]/40"
          : "text-[var(--muted-on-dark)] hover:bg-white/5 hover:text-white",
        className,
      )}
    >
      {children}
    </Link>
  );
}
