"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountingMenu } from "@/components/AccountingMenu";
import { BrandLogo } from "@/components/BrandLogo";
import { DatabaseMenu } from "@/components/DatabaseMenu";
import { WarehouseMenu } from "@/components/WarehouseMenu";
import { LayoutDensityToggle } from "@/components/LayoutDensityToggle";
import { NotificationsBell } from "@/components/NotificationsBell";
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
  variant = "sidebar",
}: {
  manager: boolean;
  database: boolean;
  workloadStats: boolean;
  showBackup: boolean;
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
        <AccountingMenu variant={variant} />
      ) : (
        <>
          <NavLink href="/quotes" className={horizontal ? "whitespace-nowrap" : undefined}>
            Мероприятия
          </NavLink>
          <NavLink href="/payroll" className={horizontal ? "whitespace-nowrap" : undefined}>
            Моя ЗП
          </NavLink>
          {workloadStats && (
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
  manager,
  logoutAction,
}: {
  userName: string | null;
  manager: boolean;
  logoutAction: () => Promise<void>;
}) {
  return (
    <div className="flex items-center gap-1">
      <ThemeToggle />
      <NotificationsBell showUnpaidLink={manager} />
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
  manager,
  logoutAction,
}: {
  userName: string | null;
  roleLabel: string;
  manager: boolean;
  logoutAction: () => Promise<void>;
}) {
  return (
    <div className="mt-auto flex flex-col gap-1 border-t border-[var(--header-line)] pt-3">
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <NotificationsBell showUnpaidLink={manager} placement="sidebar" />
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

function IconPlus({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      className={className ?? "h-7 w-7"}
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconProfile({ className }: { className?: string }) {
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
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19.5c1.8-3.2 4.2-4.5 6.5-4.5s4.7 1.3 6.5 4.5" />
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
  logoutAction,
}: AppChromeProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const navProps = { manager, database, workloadStats, showBackup };

  function onPlusClick() {
    if (pathname.startsWith("/calendar")) {
      router.push("/calendar?create=1");
      // force re-trigger if already on calendar with create
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("crm:calendar-create"));
      }
      return;
    }
    router.push("/calendar?create=1");
  }

  return (
    <div className="app-frame">
      <header className="app-topnav">
        <SidebarBrand />
        <AppNav {...navProps} variant="top" />
        <DesktopChromeTools
          userName={userName}
          manager={manager}
          logoutAction={logoutAction}
        />
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
        <div className="ml-auto flex items-center gap-1">
          <NotificationsBell showUnpaidLink={manager} />
        </div>
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
            manager={manager}
            logoutAction={logoutAction}
          />
        </aside>
      </div>

      <main className="app-main">{children}</main>

      <nav className="app-bottombar" aria-label="Нижнее меню">
        <button
          type="button"
          className="app-bottombar-btn"
          aria-label={drawerOpen ? "Закрыть меню" : "Открыть меню"}
          aria-expanded={drawerOpen}
          onClick={(e) => {
            e.stopPropagation();
            setDrawerOpen((open) => !open);
          }}
        >
          <IconMenu />
        </button>

        <button
          type="button"
          className="app-bottombar-plus"
          aria-label="Создать"
          onClick={onPlusClick}
        >
          <IconPlus />
        </button>

        <Link
          href="/profile"
          className={`app-bottombar-btn${pathname.startsWith("/profile") ? " is-active" : ""}`}
          aria-label="Профиль"
          title={userName || "Профиль"}
        >
          <IconProfile />
        </Link>
      </nav>
    </div>
  );
}
