import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { AccountingMenu } from "@/components/AccountingMenu";
import { BrandLogo } from "@/components/BrandLogo";
import { DatabaseMenu } from "@/components/DatabaseMenu";
import { NotificationsBell } from "@/components/NotificationsBell";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavLink } from "@/components/ui/NavLink";
import { Button } from "@/components/ui/Button";
import { canAccessDatabase, isManager, roleLabelRu } from "@/lib/roles";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const manager = isManager(session?.user?.role);
  const database = canAccessDatabase(session?.user?.role);

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-[var(--line-on-dark)] bg-[var(--bg-elevated)]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex flex-wrap items-center gap-5">
            <Link href="/quotes" className="flex items-center gap-2.5">
              <span className="brand-logo-slot flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                <BrandLogo size={32} />
              </span>
              <span className="hidden sm:flex sm:flex-col sm:leading-none">
                <span className="text-sm font-medium text-white">
                  BaikalStageGroup
                </span>
                <span className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-[var(--muted-on-dark)]">
                  CRM
                </span>
              </span>
            </Link>
            <nav className="flex flex-wrap items-center gap-1 text-sm">
              <NavLink href="/quotes">
                {manager ? "Сметы" : "Мероприятия"}
              </NavLink>
              <NavLink href="/calendar">Календарь</NavLink>
              {manager ? (
                <AccountingMenu />
              ) : (
                <NavLink href="/payroll">Моя ЗП</NavLink>
              )}
              {database && <DatabaseMenu />}
            </nav>
          </div>
          {session?.user && (
            <div className="flex items-center gap-2 text-sm text-[var(--muted-on-dark)] sm:gap-3">
              <ThemeToggle />
              <NotificationsBell showUnpaidLink={manager} />
              <Link
                href="/profile"
                className="rounded-md px-2 py-1 transition-colors hover:bg-white/10 hover:text-white"
                title="Мой профиль"
              >
                <span className="md:hidden">Профиль</span>
                <span className="hidden md:inline">
                  {session.user.name}
                  <span className="ml-1 text-xs uppercase opacity-70">
                    {roleLabelRu(session.user.role)}
                  </span>
                </span>
              </Link>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <Button type="submit" variant="ghost" size="sm" className="text-[var(--muted-on-dark)] hover:bg-white/10 hover:text-white">
                  Выйти
                </Button>
              </form>
            </div>
          )}
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
