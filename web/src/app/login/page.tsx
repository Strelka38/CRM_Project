"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ThemeToggle";

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? "gap-2.5" : "gap-3"}`}>
      <span
        className={`bg-cta flex items-center justify-center font-bold text-white shadow-lg shadow-[#009ee3]/25 ${
          compact ? "size-9 rounded-lg text-xs" : "size-11 rounded-xl text-sm"
        }`}
      >
        BS
      </span>
      <span className="leading-none">
        <span
          className={`block font-medium text-white ${
            compact ? "text-base" : "text-lg"
          }`}
        >
          BaikalStageGroup
        </span>
        <span className="mt-1 block text-[10px] uppercase tracking-[0.22em] text-[var(--muted-on-dark)]">
          Event CRM
        </span>
      </span>
    </div>
  );
}

function Atmosphere() {
  return (
    <>
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 20% 10%, rgba(236,20,254,0.38) 0%, transparent 45%), radial-gradient(ellipse at 85% 75%, rgba(0,158,227,0.42) 0%, transparent 42%), radial-gradient(ellipse at 50% 100%, rgba(67,113,234,0.25) 0%, transparent 40%), linear-gradient(165deg, #070a12 0%, #101827 45%, #0c2438 100%)",
        }}
      />
      <div
        className="absolute inset-0 opacity-[0.22]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage:
            "radial-gradient(ellipse at center, black 20%, transparent 75%)",
        }}
      />
      <div className="pointer-events-none absolute -left-20 top-1/4 size-64 rounded-full bg-[#ec14fe]/20 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-1/4 size-72 rounded-full bg-[#009ee3]/25 blur-3xl" />
    </>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("Неверный email или пароль");
      return;
    }
    router.push(params.get("callbackUrl") || "/quotes");
    router.refresh();
  }

  function fillDemo(role: "manager" | "employee") {
    if (role === "manager") {
      setEmail("manager@local.test");
      setPassword("manager123");
    } else {
      setEmail("employee@local.test");
      setPassword("employee123");
    }
    setShowDemo(false);
  }

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="absolute right-3 top-3 z-20 sm:right-5 sm:top-5">
        <ThemeToggle
          variant="header"
          className="bg-black/25 backdrop-blur-sm lg:bg-[var(--panel)] lg:text-[var(--muted)] lg:hover:bg-[var(--selected)] lg:hover:text-[var(--ink)]"
        />
      </div>
      {/* Mobile / tablet: full-bleed atmosphere */}
      <div className="absolute inset-0 lg:hidden">
        <Atmosphere />
      </div>

      <div className="relative flex min-h-dvh flex-col lg:flex-row">
        {/* Desktop brand panel */}
        <aside className="relative hidden overflow-hidden lg:flex lg:w-[46%] lg:min-h-dvh lg:flex-col">
          <Atmosphere />
          <div className="relative z-10 flex flex-1 flex-col justify-between p-10 xl:p-14">
            <BrandMark />
            <div className="animate-fade-up max-w-lg">
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent-glow)]">
                Технический продакшен
              </p>
              <h1 className="mt-3 text-4xl font-light leading-[1.15] tracking-tight text-white xl:text-5xl">
                Полное техническое
                <br />
                сопровождение мероприятий
              </h1>
              <p className="mt-5 max-w-md text-base font-light leading-relaxed text-[var(--muted-on-dark)]">
                Сметы, каталог, календарь и склад — в одной панели для команды
                продакшена.
              </p>
              <ul className="mt-8 flex flex-wrap gap-2">
                {["Сметы", "Склад", "Календарь", "Зарплата"].map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-[var(--muted-on-dark)] backdrop-blur-sm"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-xs tracking-wide text-[var(--muted-on-dark)]">
              Иркутск · Байкал · Бурятия
            </p>
          </div>
        </aside>

        {/* Form column */}
        <div className="relative flex flex-1 flex-col lg:bg-[var(--bg)]">
          {/* Mobile brand header */}
          <div className="relative z-10 px-5 pb-2 pt-[max(1.25rem,env(safe-area-inset-top))] lg:hidden">
            <BrandMark compact />
            <div className="animate-fade-up mt-6 max-w-sm">
              <h1 className="text-[1.65rem] font-light leading-snug tracking-tight text-white">
                Вход в панель продакшена
              </h1>
              <p className="mt-2 text-sm font-light leading-relaxed text-[var(--muted-on-dark)]">
                Сметы, каталог и календарь — в одном месте.
              </p>
            </div>
          </div>

          <div className="relative z-10 flex flex-1 flex-col justify-end px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:justify-center sm:px-6 sm:py-10 lg:items-center lg:justify-center lg:px-8">
            <form
              onSubmit={onSubmit}
              className="animate-fade-up w-full max-w-md rounded-[1.35rem] border border-white/50 bg-[var(--panel)]/95 p-5 shadow-[0_20px_60px_rgba(7,10,18,0.35)] backdrop-blur-xl sm:p-7 lg:border-[var(--line)] lg:bg-[var(--panel)] lg:shadow-sm lg:backdrop-blur-none"
            >
              <div className="hidden lg:block">
                <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
                  BaikalStageGroup
                </p>
                <h2 className="mt-1 text-3xl font-light tracking-tight text-[var(--ink)]">
                  Вход
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Войдите в аккаунт команды, чтобы открыть сметы и календарь.
                </p>
              </div>

              <div className="lg:hidden">
                <h2 className="text-xl font-medium tracking-tight text-[var(--ink)]">
                  Войти
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Email и пароль от вашего аккаунта
                </p>
              </div>

              <label className="mt-5 block text-sm lg:mt-6">
                <span className="text-[var(--muted)]">Email</span>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  placeholder="name@company.ru"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="field mt-1.5 min-h-12 text-base sm:text-sm"
                />
              </label>

              <label className="mt-3.5 block text-sm">
                <span className="text-[var(--muted)]">Пароль</span>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="field min-h-12 pr-14 text-base sm:text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 px-3.5 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--accent-deep)]"
                  >
                    {showPassword ? "Скрыть" : "Показать"}
                  </button>
                </div>
              </label>

              {error && (
                <p
                  role="alert"
                  className="mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-[var(--danger)]"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="mt-5 min-h-12 w-full text-base sm:text-sm"
                size="lg"
              >
                {loading ? "Входим…" : "Войти"}
              </Button>

              <div className="mt-4 border-t border-[var(--line)] pt-4">
                <button
                  type="button"
                  onClick={() => setShowDemo((v) => !v)}
                  className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--accent-deep)]"
                >
                  {showDemo ? "Скрыть демо-доступы" : "Демо-доступы для теста"}
                </button>
                {showDemo && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => fillDemo("manager")}
                      className="rounded-xl border border-[var(--line)] bg-[var(--panel-muted)] px-3 py-2.5 text-left transition-colors hover:border-[var(--accent-glow)] hover:bg-subtle"
                    >
                      <span className="block text-xs font-medium text-[var(--ink)]">
                        Менеджер
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">
                        manager@local.test
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fillDemo("employee")}
                      className="rounded-xl border border-[var(--line)] bg-[var(--panel-muted)] px-3 py-2.5 text-left transition-colors hover:border-[var(--accent-glow)] hover:bg-subtle"
                    >
                      <span className="block text-xs font-medium text-[var(--ink)]">
                        Сотрудник
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">
                        employee@local.test
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </form>

            <p className="mt-4 text-center text-[11px] text-white/55 lg:mt-6 lg:text-[var(--muted)]">
              Иркутск · Байкал · Бурятия
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
