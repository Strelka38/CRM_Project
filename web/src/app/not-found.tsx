import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6 py-16">
      <p className="font-mono text-caption uppercase tracking-[0.12em] text-[var(--muted)]">
        404
      </p>
      <h1 className="mt-2 text-[length:var(--fs-h1)] leading-[var(--lh-h1)] font-medium tracking-tight text-[var(--ink)]">
        Такой страницы нет
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
        Адрес не найден или у вас нет доступа. Вернитесь в календарь — оттуда
        открываются сметы, склад и смены.
      </p>
      <p className="mt-6">
        <Link
          href="/calendar"
          className="inline-flex h-10 items-center rounded-[var(--radius-sm)] bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-ink)]"
        >
          Открыть календарь
        </Link>
      </p>
    </main>
  );
}
