"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountingMenu } from "@/components/AccountingMenu";
import { BrandLogo } from "@/components/BrandLogo";
import { DatabaseMenu } from "@/components/DatabaseMenu";
import { WarehouseMenu } from "@/components/WarehouseMenu";
import { LayoutDensityToggle } from "@/components/LayoutDensityToggle";
import {
  NotificationsBell,
  useUnreadNotifications,
} from "@/components/NotificationsBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavLink } from "@/components/ui/NavLink";
import { Button } from "@/components/ui/Button";

export type AppChromeProps = {
  children: React.ReactNode;
  userName: string | null;
  roleLabel: string;
  manager: boolean;
  database: boolean;
  workloadStats: boolean;
  showBackup: boolean;
  payoutsAccess: boolean;
  logoutAction: () => Promise<void>;
};

function SidebarBrand() {
  return (
    <Link href="/calendar" className="flex items-center gap-2.5 px-1 py-1">
      <span className="brand-logo-slot flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg">
        <BrandLogo size={32} />
      </span>
      <span className="flex min-w-0 flex-col leading-none">
        <span className="truncate text-sm font-medium text-[var(--header-ink)]">
          BaikalStageGroup
        </span>
        <span className="mt-0.5 text-caption uppercase tracking-[0.2em] text-[var(--header-muted)]">
          CRM
        </span>
      </span>
    </Link>
  );
}

function AppNav({
  manager,
  database,
  workloadStats,
  showBackup,
  payoutsAccess,
  variant = "sidebar",
}: {
  manager: boolean;
  database: boolean;
  workloadStats: boolean;
  showBackup: boolean;
  payoutsAccess: boolean;
  variant?: "sidebar" | "top";
}) {
  const horizontal = variant === "top";
  return (
    <nav
      className={
        horizontal
          ? "flex min-w-0 flex-1 items-center gap-0.5 overflow-visible text-sm"
          : "flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto text-sm"
      }
    >
      <NavLink href="/calendar" className={horizontal ? "whitespace-nowrap" : undefined}>
        Календарь
      </NavLink>
      {manager ? (
        <AccountingMenu variant={variant} showPayouts={payoutsAccess} />
      ) : (
        <>
          <NavLink href="/quotes" className={horizontal ? "whitespace-nowrap" : undefined}>
            Мероприятия
          </NavLink>
          <NavLink href="/payroll" className={horizontal ? "whitespace-nowrap" : undefined}>
            Моя ЗП
          </NavLink>
          {payoutsAccess && (
            <NavLink href="/payouts" className={horizontal ? "whitespace-nowrap" : undefined}>
              Оплаты
            </NavLink>
          )}
          {workloadStats && variant === "top" && (
            <NavLink href="/roster" className={horizontal ? "whitespace-nowrap" : undefined}>
              Срост
            </NavLink>
          )}
          {workloadStats && (
            <NavLink
              href="/statistics"
              className={horizontal ? "whitespace-nowrap" : undefined}
            >
              Статистика
            </NavLink>
          )}
        </>
      )}
      {database && (
        <>
          <WarehouseMenu variant={variant} />
          <DatabaseMenu showBackup={showBackup} variant={variant} />
        </>
      )}
    </nav>
  );
}

function SignOutForm({ logoutAction }: { logoutAction: () => Promise<void> }) {
  return (
    <form action={logoutAction}>
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        className="justify-start px-2 text-[var(--header-muted)] hover:bg-[var(--header-hover)] hover:text-[var(--header-ink)]"
      >
        Выйти
      </Button>
    </form>
  );
}

/** Desktop topnav tools — theme stays here for desktop. */
function DesktopChromeTools({
  userName,
  logoutAction,
}: {
  userName: string | null;
  logoutAction: () => Promise<void>;
}) {
  return (
    <div className="flex items-center gap-1">
      <ThemeToggle />
      <NotificationsBell />
      {userName ? (
        <Link
          href="/profile"
          className="rounded-md px-2 py-1.5 text-sm text-[var(--header-muted)] transition-colors hover:bg-[var(--header-hover)] hover:text-[var(--header-ink)]"
          title="Мой профиль"
        >
          <span className="max-w-[9rem] truncate">{userName}</span>
        </Link>
      ) : null}
      <LayoutDensityToggle compact className="hidden min-[380px]:flex" />
      <SignOutForm logoutAction={logoutAction} />
    </div>
  );
}

/** Drawer footer: theme + density only here on mobile (not on bottom bar). */
function DrawerChromeTools({
  userName,
  roleLabel,
  logoutAction,
}: {
  userName: string | null;
  roleLabel: string;
  logoutAction: () => Promise<void>;
}) {
  return (
    <div className="mt-auto flex flex-col gap-1 border-t border-[var(--header-line)] pt-3">
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <NotificationsBell placement="sidebar" />
      </div>
      {userName ? (
        <Link
          href="/profile"
          className="rounded-md px-2 py-1.5 text-sm text-[var(--header-muted)] transition-colors hover:bg-[var(--header-hover)] hover:text-[var(--header-ink)]"
          title="Мой профиль"
        >
          <span className="block truncate">{userName}</span>
          <span className="text-caption uppercase tracking-wide opacity-70">
            {roleLabel}
          </span>
        </Link>
      ) : null}
      <LayoutDensityToggle />
      <SignOutForm logoutAction={logoutAction} />
    </div>
  );
}

function IconMenu({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className={className ?? "h-6 w-6"}
      aria-hidden
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function IconCalendar({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-6 w-6"}
      aria-hidden
    >
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    </svg>
  );
}

function IconBell({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-6 w-6"}
      aria-hidden
    >
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

function IconWallet({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "h-6 w-6"}
      aria-hidden
    >
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10.5h18" />
      <circle cx="16.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function AppChrome({
  children,
  userName,
  roleLabel,
  manager,
  database,
  workloadStats,
  showBackup,
  payoutsAccess,
  logoutAction,
}: AppChromeProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const unread = useUnreadNotifications();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [drawerOpen]);

  const navProps = { manager, database, workloadStats, showBackup, payoutsAccess };
  const isPrintSheet = pathname.startsWith("/catalog/print-qr");

  if (isPrintSheet) {
    return <div className="qr-print-frame min-h-dvh bg-white text-black">{children}</div>;
  }

  return (
    <div className="app-frame">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-[var(--radius-sm)] focus:bg-[var(--accent)] focus:px-3 focus:py-2 focus:text-[var(--accent-ink)]"
      >
        К содержимому
      </a>
      <header className="app-topnav">
        <SidebarBrand />
        <AppNav {...navProps} variant="top" />
        <DesktopChromeTools userName={userName} logoutAction={logoutAction} />
      </header>

      <header className="app-topbar">
        <Link href="/calendar" className="flex min-w-0 items-center gap-2">
          <span className="brand-logo-slot flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg">
            <BrandLogo size={32} />
          </span>
          <span className="truncate text-sm font-medium text-[var(--header-ink)]">
            CRM
          </span>
        </Link>
      </header>

      <div
        className={`app-drawer${drawerOpen ? " is-open" : ""}`}
        role="dialog"
        aria-modal={drawerOpen}
        aria-hidden={!drawerOpen}
        aria-label="Меню"
        {...(!drawerOpen ? { inert: true } : {})}
      >
        <button
          type="button"
          className="app-drawer-overlay"
          tabIndex={drawerOpen ? 0 : -1}
          aria-label="Закрыть меню"
          onClick={() => setDrawerOpen(false)}
        />
        <aside className="app-drawer-panel">
          <div className="mb-1 flex items-center justify-between gap-2">
            <SidebarBrand />
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-md text-[var(--header-muted)] hover:bg-[var(--header-hover)] hover:text-[var(--header-ink)]"
              aria-label="Закрыть"
              tabIndex={drawerOpen ? 0 : -1}
              onClick={() => setDrawerOpen(false)}
            >
              ×
            </button>
          </div>
          <AppNav {...navProps} />
          <DrawerChromeTools
            userName={userName}
            roleLabel={roleLabel}
            logoutAction={logoutAction}
          />
        </aside>
      </div>

      <main id="main-content" className="app-main">{children}</main>

      <nav className="app-bottombar" aria-label="Нижнее меню">
        <Link
          href="/calendar"
          className={`app-bottombar-btn${pathname.startsWith("/calendar") ? " is-active" : ""}`}
          aria-label="Календарь"
          title="Календарь"
        >
          <IconCalendar />
        </Link>

        <Link
          href="/notifications"
          className={`app-bottombar-btn${pathname.startsWith("/notifications") ? " is-active" : ""}`}
          aria-label={
            unread > 0 ? `Уведомления, непрочитанных: ${unread}` : "Уведомления"
          }
          title="Уведомления"
        >
          <span className="relative flex">
            <IconBell />
            {unread > 0 ? (
              <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-caption font-bold leading-none text-white shadow-sm">
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </span>
        </Link>

        <Link
          href="/payroll"
          className={`app-bottombar-btn${pathname.startsWith("/payroll") ? " is-active" : ""}`}
          aria-label="Моя ЗП"
          title="Моя ЗП"
        >
          <IconWallet />
        </Link>

        <button
          type="button"
          className={`app-bottombar-btn${drawerOpen ? " is-active" : ""}`}
          aria-label={drawerOpen ? "Закрыть меню" : "Все разделы"}
          aria-expanded={drawerOpen}
          onClick={(e) => {
            e.stopPropagation();
            setDrawerOpen((open) => !open);
          }}
        >
          <IconMenu />
        </button>
      </nav>
    </div>
  );
}
