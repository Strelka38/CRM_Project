"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatMoney } from "@/lib/format";
import {
  LIST_PERIODS,
  formatYearMonthLabel,
  parseYearMonth,
  shiftYearMonth,
  toYearMonthParam,
  type ListPeriod,
  type YearMonth,
} from "@/lib/period";
import { Card, PageHeader } from "@/components/ui";

type Row = {
  id: string;
  pay: number;
  payMode: "SHIFT" | "HOURLY";
  hours: number | null;
  rateOverride: number | null;
  hourlyRate: number;
  shiftRate: number;
  bonus?: number;
  montageAmount?: number;
  specialty: { id: string; name: string };
  quote: {
    id: string;
    eventName: string;
    date: string;
    lifecycle: string;
    place: string;
    client: string;
  };
};

type AgencyRow = {
  id: string;
  agencyTotal: number;
  deductedTotal: number;
  incomeOnlyTotal: number;
  byCompany: Array<{
    company: string;
    short: string;
    label: string;
    agency: number;
    deductedFromFirm: boolean;
  }>;
  quote: {
    id: string;
    eventName: string;
    date: string;
    lifecycle: string;
    client: string;
    place: string;
  };
};

type PayrollData = {
  confirmed: Row[];
  pending: Row[];
  agencyConfirmed: AgencyRow[];
  agencyPending: AgencyRow[];
  confirmedTotal: number;
  pendingTotal: number;
  confirmedAssignmentsTotal: number;
  pendingAssignmentsTotal: number;
  confirmedMontageTotal: number;
  pendingMontageTotal: number;
  confirmedAgencyTotal: number;
  pendingAgencyTotal: number;
  monthlySalary: number;
  estimatedSalary: number;
  period: { type: ListPeriod; ym: string; label: string };
};

const LIFE: Record<string, string> = {
  CALCULATED: "Посчитано",
  CONFIRMED: "Подтверждено",
  COMPLETED: "Завершено",
  CANCELLED: "Отменено",
};

function currentYm(): YearMonth {
  const n = new Date();
  return { year: n.getFullYear(), month: n.getMonth() };
}

export function PayrollView() {
  const [period, setPeriod] = useState<ListPeriod>("month");
  const [ym, setYm] = useState<YearMonth>(currentYm);
  const [data, setData] = useState<PayrollData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ period });
      if (period === "month") params.set("ym", toYearMonthParam(ym));
      const res = await fetch(`/api/me/payroll?${params}`);
      if (cancelled) return;
      if (!res.ok) {
        setError("Не удалось загрузить");
        setData(null);
        setLoading(false);
        return;
      }
      setData(await res.json());
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [period, ym]);

  if (loading && !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-[var(--muted)]">
        Загрузка…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-[var(--danger)]">
        {error || "Нет данных"}
      </div>
    );
  }

  const hasAgency =
    (data.agencyConfirmed?.length ?? 0) > 0 ||
    (data.agencyPending?.length ?? 0) > 0 ||
    (data.confirmedAgencyTotal ?? 0) > 0 ||
    (data.pendingAgencyTotal ?? 0) > 0;

  const assignmentsTotal = data.confirmedAssignmentsTotal ?? 0;
  const montageTotal = data.confirmedMontageTotal ?? 0;
  const agencyTotal = data.confirmedAgencyTotal ?? 0;
  const grandTotal =
    (data.monthlySalary ?? 0) + (data.estimatedSalary ?? 0);

  const breakdownParts = [
    data.monthlySalary > 0
      ? `оклад ${formatMoney(data.monthlySalary)}`
      : null,
    assignmentsTotal > 0
      ? `смены ${formatMoney(assignmentsTotal)}`
      : null,
    montageTotal > 0 ? `монт. ${formatMoney(montageTotal)}` : null,
    hasAgency && agencyTotal > 0
      ? `агентские ${formatMoney(agencyTotal)}`
      : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <PageHeader
        title="Моя зарплата"
        subtitle="Оклад, начисления по сменам, монтажные и агентские менеджера за выбранный период."
        actions={
          <div className="min-w-[12rem] text-right animate-fade-up">
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
              Итого
            </p>
            <p className="mt-0.5 text-4xl font-light tracking-tight text-[var(--accent-deep)] tabular-nums sm:text-5xl">
              {formatMoney(grandTotal)}
            </p>
            {breakdownParts.length > 0 && (
              <p className="mt-1 max-w-[18rem] text-[11px] leading-snug text-[var(--muted)] ml-auto">
                {breakdownParts.join(" · ")}
              </p>
            )}
          </div>
        }
      />

      <div className="mb-6 -mt-4 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="text-xs text-[var(--muted)]">Период</span>
          <select
            className="field mt-1 min-w-[10rem]"
            value={period}
            onChange={(e) => setPeriod(e.target.value as ListPeriod)}
          >
            {LIST_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.value === "month" ? "Месяц" : p.label}
              </option>
            ))}
          </select>
        </label>
        {period === "month" && (
          <div className="flex items-end gap-1">
            <button
              type="button"
              className="field px-2.5"
              aria-label="Предыдущий месяц"
              onClick={() => setYm((v) => shiftYearMonth(v, -1))}
            >
              ←
            </button>
            <label className="block text-sm">
              <span className="text-xs text-[var(--muted)]">Месяц</span>
              <input
                type="month"
                className="field mt-1 min-w-[10rem]"
                value={toYearMonthParam(ym)}
                onChange={(e) => setYm(parseYearMonth(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="field px-2.5"
              aria-label="Следующий месяц"
              onClick={() => setYm((v) => shiftYearMonth(v, 1))}
            >
              →
            </button>
          </div>
        )}
        <p className="pb-2 text-sm text-[var(--muted)]">
          {data.period?.label ??
            (period === "month" ? formatYearMonthLabel(ym) : "")}
          {loading ? " · обновление…" : ""}
        </p>
      </div>

      <div
        className={`mb-6 grid gap-3 sm:grid-cols-2 ${
          hasAgency ? "lg:grid-cols-4" : "lg:grid-cols-3"
        }`}
      >
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
            Месячный оклад
          </p>
          <p className="mt-1 text-3xl font-light tracking-tight">
            {formatMoney(data.monthlySalary)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
            Итого (подтв. / заверш.)
          </p>
          <p className="mt-1 text-3xl font-light tracking-tight text-[var(--accent-deep)]">
            {formatMoney(data.estimatedSalary)}
          </p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            смены {formatMoney(data.confirmedAssignmentsTotal ?? 0)}
            {(data.confirmedMontageTotal ?? 0) > 0 &&
              ` · монт. ${formatMoney(data.confirmedMontageTotal)}`}
            {(data.confirmedAgencyTotal ?? 0) > 0 &&
              ` · аг. ${formatMoney(data.confirmedAgencyTotal)}`}
          </p>
        </Card>
        {hasAgency && (
          <Card className="p-5">
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
              Агентские
            </p>
            <p className="mt-1 text-3xl font-light tracking-tight">
              {formatMoney(data.confirmedAgencyTotal ?? 0)}
            </p>
            {(data.pendingAgencyTotal ?? 0) > 0 && (
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                ожид. {formatMoney(data.pendingAgencyTotal)}
              </p>
            )}
          </Card>
        )}
        <Card className="p-5">
          <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
            Ожидается (посчитано)
          </p>
          <p className="mt-1 text-3xl font-light tracking-tight">
            {formatMoney(data.pendingTotal)}
          </p>
        </Card>
      </div>

      <Section title="Начисления по сменам" rows={data.confirmed} />
      <Section
        title="Ожидаемые смены"
        rows={data.pending}
        className="mt-6"
      />

      {hasAgency && (
        <>
          <AgencySection
            title="Агентские менеджера"
            rows={data.agencyConfirmed ?? []}
            className="mt-6"
          />
          {(data.agencyPending?.length ?? 0) > 0 && (
            <AgencySection
              title="Ожидаемые агентские"
              rows={data.agencyPending}
              className="mt-6"
            />
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  rows,
  className = "",
}: {
  title: string;
  rows: Row[];
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--line)] bg-[var(--panel)] ${className}`}
    >
      <h2 className="border-b border-[var(--line)] px-4 py-3 font-display text-lg">
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 text-left">Мероприятие</th>
              <th className="px-3 py-2 text-left">Дата</th>
              <th className="px-3 py-2 text-left">Должность</th>
              <th className="px-3 py-2 text-left">Расчёт</th>
              <th className="px-3 py-2 text-right">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--line)]">
                <td className="px-3 py-2">
                  <Link
                    href={`/quotes/${r.quote.id}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {r.quote.eventName || "Без названия"}
                  </Link>
                  <p className="text-xs text-[var(--muted)]">
                    {LIFE[r.quote.lifecycle] || r.quote.lifecycle}
                  </p>
                </td>
                <td className="px-3 py-2">{r.quote.date || "—"}</td>
                <td className="px-3 py-2">{r.specialty.name}</td>
                <td className="px-3 py-2 text-[var(--muted)]">
                  {r.rateOverride != null
                    ? `override ${formatMoney(r.rateOverride)}`
                    : r.payMode === "HOURLY"
                      ? `${r.hours ?? 0} ч × ${formatMoney(r.hourlyRate)}`
                      : `смена ${formatMoney(r.shiftRate)}`}
                  {(r.bonus ?? 0) > 0 && ` + премия ${formatMoney(r.bonus!)}`}
                  {(r.montageAmount ?? 0) > 0 &&
                    ` · монт. ${formatMoney(r.montageAmount!)}`}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatMoney(r.pay + (r.montageAmount ?? 0))}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  Нет назначений
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AgencySection({
  title,
  rows,
  className = "",
}: {
  title: string;
  rows: AgencyRow[];
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--line)] bg-[var(--panel)] ${className}`}
    >
      <h2 className="border-b border-[var(--line)] px-4 py-3 font-display text-lg">
        {title}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 text-left">Мероприятие</th>
              <th className="px-3 py-2 text-left">Дата</th>
              <th className="px-3 py-2 text-left">По фирмам</th>
              <th className="px-3 py-2 text-right">Агентские 5%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--line)]">
                <td className="px-3 py-2">
                  <Link
                    href={`/calculations/${r.quote.id}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {r.quote.eventName || "Без названия"}
                  </Link>
                  <p className="text-xs text-[var(--muted)]">
                    {LIFE[r.quote.lifecycle] || r.quote.lifecycle}
                    {r.quote.client ? ` · ${r.quote.client}` : ""}
                  </p>
                </td>
                <td className="px-3 py-2">{r.quote.date || "—"}</td>
                <td className="px-3 py-2 text-[var(--muted)]">
                  {r.byCompany
                    .filter((c) => c.agency > 0)
                    .map((c) => `${c.short} ${formatMoney(c.agency)}`)
                    .join(" · ") || "—"}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">
                  {formatMoney(r.agencyTotal)}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  Нет агентских за период
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
