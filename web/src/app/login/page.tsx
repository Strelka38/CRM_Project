"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/ThemeToggle";

function BrandMark({
  compact = false,
  onDark = false,
}: {
  compact?: boolean;
  onDark?: boolean;
}) {
  const size = compact ? 32 : 40;
  return (
    <div className={`flex items-center ${compact ? "gap-2.5" : "gap-3"}`}>
      <span
        className={`flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-sm)] ${
          compact ? "size-8" : "size-10"
        }`}
      >
        <BrandLogo size={size} invertOnLight={!onDark} />
      </span>
      <span className="leading-none">
        <span
          className={`block font-medium ${
            onDark ? "text-[var(--login-ink)]" : "text-[var(--ink)]"
          } ${compact ? "text-sm" : "text-base"}`}
        >
          BaikalStageGroup
        </span>
        <span
          className={`mt-1 block font-mono text-caption uppercase tracking-[0.12em] ${
            onDark ? "text-[var(--login-muted)]" : "text-[var(--muted)]"
          }`}
        >
          CRM
        </span>
      </span>
    </div>
  );
}

function safeCallbackUrl(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/calendar";
  const path = raw.split("?")[0] ?? "";
  if (
    path.startsWith("/login") ||
    path.startsWith("/brand/") ||
    path.startsWith("/api/")
  ) {
    return "/calendar";
  }
  if (/\.[a-z0-9]+$/i.test(path)) return "/calendar";
  return raw;
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
      setError(
        res.error === "CredentialsSignin"
          ? "Неверный email или пароль. Проверьте данные и попробуйте снова."
          : "Не удалось войти. Обновите страницу и попробуйте ещё раз.",
      );
      return;
    }
    router.push(safeCallbackUrl(params.get("callbackUrl")));
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
    <div className="relative min-h-dvh bg-[var(--bg)]">
      <div className="absolute right-3 top-3 z-20 sm:right-5 sm:top-5">
        <ThemeToggle variant="header" />
      </div>

      <div className="relative flex min-h-dvh flex-col lg:flex-row">
        <aside className="relative hidden border-r border-[var(--login-line)] bg-[var(--login-surface)] lg:flex lg:w-[44%] lg:min-h-dvh lg:flex-col">
          <div className="relative z-10 flex flex-1 flex-col justify-between p-10 xl:p-14">
            <BrandMark onDark />
            <div className="max-w-md">
              <p className="font-mono text-caption uppercase tracking-[0.12em] text-[var(--login-accent)]">
                Иркутск · продакшен
              </p>
              <h1 className="mt-3 text-[clamp(2rem,4vw,3.25rem)] leading-[1.1] font-medium tracking-tight text-[var(--login-ink)]">
                Сметы, склад
                <br />
                и календарь смен
              </h1>
              <p className="mt-5 max-w-sm text-[length:var(--fs-read)] leading-[var(--lh-read)] text-[var(--login-muted)]">
                Панель команды BaikalStageGroup: КП, комплекты, занятость
                площадок и выплаты — без переключения между таблицами.
              </p>
              <dl className="mt-10 grid grid-cols-2 gap-x-8 gap-y-5">
                {[
                  ["Сметы", "Клиент, закуп, маржа"],
                  ["Склад", "Каталог и субаренда"],
                  ["Календарь", "Смены и выходные"],
                  ["Зарплата", "Начисления по проектам"],
                ].map(([term, def]) => (
                  <div key={term}>
                    <dt className="text-sm font-medium text-[var(--login-ink)]">
                      {term}
                    </dt>
                    <dd className="mt-0.5 text-sm text-[var(--login-muted)]">
                      {def}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="font-mono text-caption tracking-wide text-[var(--login-muted)]">
              Байкал · Бурятия
            </p>
          </div>
        </aside>

        <div className="relative flex flex-1 flex-col bg-[var(--bg)]">
          <div className="relative z-10 px-5 pb-2 pt-[max(1.25rem,env(safe-area-inset-top))] lg:hidden">
            <BrandMark compact />
            <div className="mt-8 max-w-sm">
              <h1 className="text-[1.75rem] leading-snug font-medium tracking-tight text-[var(--ink)]">
                Вход в CRM
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
                Email и пароль аккаунта команды.
              </p>
            </div>
          </div>

          <div className="relative z-10 flex flex-1 flex-col justify-end px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:justify-center sm:px-6 sm:py-10 lg:items-center lg:justify-center lg:px-8">
            <form
              onSubmit={onSubmit}
              className="w-full max-w-md rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--panel)] p-5 sm:p-7"
            >
              <div className="hidden lg:block">
                <p className="font-mono text-caption uppercase tracking-[0.1em] text-[var(--muted)]">
                  BaikalStageGroup
                </p>
                <h2 className="mt-1 text-[length:var(--fs-h1)] leading-[var(--lh-h1)] font-medium tracking-tight text-[var(--ink)]">
                  Войти
                </h2>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Откроется календарь смен и ваши сметы.
                </p>
              </div>

              <div className="lg:hidden">
                <h2 className="text-lg font-medium tracking-tight text-[var(--ink)]">
                  Войти
                </h2>
              </div>

              <label className="mt-5 block text-sm lg:mt-6">
                <span className="font-mono text-caption uppercase tracking-[0.08em] text-[var(--muted)]">
                  Email
                </span>
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
                <span className="font-mono text-caption uppercase tracking-[0.08em] text-[var(--muted)]">
                  Пароль
                </span>
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
                    className="absolute inset-y-0 right-0 px-3.5 text-xs font-medium text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
                  >
                    {showPassword ? "Скрыть" : "Показать"}
                  </button>
                </div>
              </label>

              {error && (
                <p
                  role="alert"
                  className="mt-3 rounded-[var(--radius-sm)] border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-3 py-2 text-sm text-[var(--danger)]"
                >
                  {error}
                </p>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="mt-5 w-full"
                size="lg"
              >
                {loading ? "Входим…" : "Войти"}
              </Button>

              <div className="mt-4 border-t border-[var(--line)] pt-4">
                <button
                  type="button"
                  onClick={() => setShowDemo((v) => !v)}
                  className="text-xs text-[var(--muted)] transition-colors hover:text-[var(--ink)]"
                >
                  {showDemo ? "Скрыть демо-доступы" : "Демо-доступы для теста"}
                </button>
                {showDemo && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => fillDemo("manager")}
                      className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-muted)] px-3 py-2.5 text-left transition-colors hover:border-[var(--ink)]"
                    >
                      <span className="block text-xs font-medium text-[var(--ink)]">
                        Менеджер
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-caption text-[var(--muted)]">
                        manager@local.test
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => fillDemo("employee")}
                      className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--panel-muted)] px-3 py-2.5 text-left transition-colors hover:border-[var(--ink)]"
                    >
                      <span className="block text-xs font-medium text-[var(--ink)]">
                        Сотрудник
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-caption text-[var(--muted)]">
                        employee@local.test
                      </span>
                    </button>
                  </div>
                )}
              </div>
            </form>
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
