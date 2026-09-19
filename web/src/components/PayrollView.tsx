"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  Card,
  EmptyState,
  PageHeader,
  SortableTh,
  StatusBadge,
  useTableSort,
  type LifecycleStatus,
} from "@/components/ui";
import {
  DirectoryCardLink,
  DirectoryCsvMenu,
  downloadCsvRows,
} from "@/components/DirectoryToolbar";
import {
  PayrollCompositionChart,
  PayrollEventsChart,
} from "@/components/StatisticsCharts";
import { dateSortValue } from "@/lib/table-sort";

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

function payrollSortValue(r: Row, key: string) {
  switch (key) {
    case "event":
      return r.quote.eventName;
    case "date":
      return dateSortValue(r.quote.date);
    case "role":
      return r.specialty.name;
    case "payMode":
      return r.payMode;
    case "amount":
      return r.pay + (r.montageAmount ?? 0);
    default:
      return null;
  }
}

function agencySortValue(r: AgencyRow, key: string) {
  switch (key) {
    case "event":
      return r.quote.eventName;
    case "date":
      return dateSortValue(r.quote.date);
    case "companies":
      return r.byCompany.map((c) => c.short).join(" ");
    case "amount":
      return r.agencyTotal;
    default:
      return null;
  }
}

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

const SLICE_COLORS = {
  salary: "var(--muted)",
  shifts: "var(--accent)",
  montage: "var(--lifecycle-completed)",
  agency: "var(--lifecycle-confirmed)",
  pending: "var(--lifecycle-calculated)",
} as const;

function currentYm(): YearMonth {
  const n = new Date();
  return { year: n.getFullYear(), month: n.getMonth() };
}

function asLifecycle(value: string): LifecycleStatus | null {
  if (
    value === "CALCULATED" ||
    value === "CONFIRMED" ||
    value === "COMPLETED" ||
    value === "CANCELLED"
  ) {
    return value;
  }
  return null;
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
      <div className="mx-auto max-w-6xl px-4 py-10 text-[var(--muted)]">
        Загрузка…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-[var(--danger)]">
        {error || "Нет данных"}
      </div>
    );
  }

  return (
    <PayrollDashboard
      data={data}
      period={period}
      ym={ym}
      loading={loading}
      onPeriod={setPeriod}
      onYm={setYm}
    />
  );
}

function PayrollDashboard({
  data,
  period,
  ym,
  loading,
  onPeriod,
  onYm,
}: {
  data: PayrollData;
  period: ListPeriod;
  ym: YearMonth;
  loading: boolean;
  onPeriod: (v: ListPeriod) => void;
  onYm: (v: YearMonth | ((prev: YearMonth) => YearMonth)) => void;
}) {
  const hasAgency =
    (data.agencyConfirmed?.length ?? 0) > 0 ||
    (data.agencyPending?.length ?? 0) > 0 ||
    (data.confirmedAgencyTotal ?? 0) > 0 ||
    (data.pendingAgencyTotal ?? 0) > 0;

  const assignmentsTotal = data.confirmedAssignmentsTotal ?? 0;
  const montageTotal = data.confirmedMontageTotal ?? 0;
  const agencyTotal = data.confirmedAgencyTotal ?? 0;
  const grandTotal = (data.monthlySalary ?? 0) + (data.estimatedSalary ?? 0);

  const composition = useMemo(() => {
    return [
      {
        key: "salary",
        name: "Оклад",
        value: data.monthlySalary,
        fill: "#8a9abc",
        css: SLICE_COLORS.salary,
      },
      {
        key: "shifts",
        name: "Смены",
        value: assignmentsTotal,
        fill: "#009ee3",
        css: SLICE_COLORS.shifts,
      },
      {
        key: "montage",
        name: "Монтаж",
        value: montageTotal,
        fill: "#7c9cff",
        css: SLICE_COLORS.montage,
      },
      {
        key: "agency",
        name: "Агентские",
        value: agencyTotal,
        fill: "#22c55e",
        css: SLICE_COLORS.agency,
      },
    ].filter((s) => s.value > 0);
  }, [data.monthlySalary, assignmentsTotal, montageTotal, agencyTotal]);

  const eventRows = useMemo(() => {
    return [
      ...data.confirmed.map((r) => ({
        id: r.id,
        name: r.quote.eventName || "Без названия",
        amount: r.pay + (r.montageAmount ?? 0),
        kind: "confirmed" as const,
      })),
      ...data.pending.map((r) => ({
        id: r.id,
        name: r.quote.eventName || "Без названия",
        amount: r.pay + (r.montageAmount ?? 0),
        kind: "pending" as const,
      })),
      ...(data.agencyConfirmed ?? [])
        .filter((r) => r.agencyTotal > 0)
        .map((r) => ({
          id: `ag-${r.id}`,
          name: r.quote.eventName || "Без названия",
          amount: r.agencyTotal,
          kind: "agency" as const,
        })),
      ...(data.agencyPending ?? [])
        .filter((r) => r.agencyTotal > 0)
        .map((r) => ({
          id: `agp-${r.id}`,
          name: r.quote.eventName || "Без названия",
          amount: r.agencyTotal,
          kind: "pending" as const,
        })),
    ];
  }, [data]);

  const showCharts = composition.length > 0 || eventRows.length > 0;

  function exportCsv() {
    const stamp = new Date().toISOString().slice(0, 10);
    const rows: string[][] = [
      ["Раздел", "Мероприятие", "Дата", "Должность", "Расчёт", "Сумма"],
      ...data.confirmed.map((r) => [
        "Начисления",
        r.quote.eventName,
        r.quote.date,
        r.specialty.name,
        r.payMode === "HOURLY" ? `${r.hours ?? 0} ч` : "смена",
        String(r.pay + (r.montageAmount ?? 0)),
      ]),
      ...data.pending.map((r) => [
        "Ожидаемые",
        r.quote.eventName,
        r.quote.date,
        r.specialty.name,
        r.payMode === "HOURLY" ? `${r.hours ?? 0} ч` : "смена",
        String(r.pay + (r.montageAmount ?? 0)),
      ]),
      ...(data.agencyConfirmed ?? []).map((r) => [
        "Агентские",
        r.quote.eventName,
        r.quote.date,
        "",
        r.byCompany.map((c) => c.short).join(";"),
        String(r.agencyTotal),
      ]),
      ...(data.agencyPending ?? []).map((r) => [
        "Ожидаемые агентские",
        r.quote.eventName,
        r.quote.date,
        "",
        r.byCompany.map((c) => c.short).join(";"),
        String(r.agencyTotal),
      ]),
    ];
    downloadCsvRows(`payroll-${stamp}.csv`, rows);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <PageHeader
        title="Моя зарплата"
        subtitle="Оклад, начисления по сменам, монтажные и агентские за выбранный период."
        actions={
          <div className="min-w-[12rem] text-right animate-fade-up">
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
              Итого
            </p>
            <p className="mt-0.5 text-4xl font-medium tracking-tight text-[var(--accent-deep)] tabular-nums sm:text-5xl">
              {formatMoney(grandTotal)}
            </p>
            {composition.length > 0 && (
              <CompositionBar parts={composition} total={grandTotal} />
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
            onChange={(e) => onPeriod(e.target.value as ListPeriod)}
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
              onClick={() => onYm((v) => shiftYearMonth(v, -1))}
            >
              ←
            </button>
            <label className="block text-sm">
              <span className="text-xs text-[var(--muted)]">Месяц</span>
              <input
                type="month"
                className="field mt-1 min-w-[10rem]"
                value={toYearMonthParam(ym)}
                onChange={(e) => onYm(parseYearMonth(e.target.value))}
              />
            </label>
            <button
              type="button"
              className="field px-2.5"
              aria-label="Следующий месяц"
              onClick={() => onYm((v) => shiftYearMonth(v, 1))}
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
        <div className="ml-auto pb-1">
          <DirectoryCsvMenu onExport={exportCsv} />
        </div>
      </div>

      <div
        className={`mb-6 grid gap-3 sm:grid-cols-2 ${
          hasAgency ? "lg:grid-cols-4" : "lg:grid-cols-3"
        }`}
      >
        <KpiCard
          label="Месячный оклад"
          value={data.monthlySalary}
          share={grandTotal}
          color={SLICE_COLORS.salary}
        />
        <KpiCard
          label="Итого подтв. / заверш."
          value={data.estimatedSalary}
          share={grandTotal}
          color={SLICE_COLORS.shifts}
          hint={[
            `смены ${formatMoney(data.confirmedAssignmentsTotal ?? 0)}`,
            (data.confirmedMontageTotal ?? 0) > 0
              ? `монт. ${formatMoney(data.confirmedMontageTotal)}`
              : null,
            (data.confirmedAgencyTotal ?? 0) > 0
              ? `аг. ${formatMoney(data.confirmedAgencyTotal)}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        {hasAgency && (
          <KpiCard
            label="Агентские"
            value={data.confirmedAgencyTotal ?? 0}
            share={grandTotal}
            color={SLICE_COLORS.agency}
            hint={
              (data.pendingAgencyTotal ?? 0) > 0
                ? `ожид. ${formatMoney(data.pendingAgencyTotal)}`
                : undefined
            }
          />
        )}
        <KpiCard
          label="Ожидается (посчитано)"
          value={data.pendingTotal}
          color={SLICE_COLORS.pending}
          hint="не входит в итого"
        />
      </div>

      {showCharts && (
        <Card className="mb-6 p-4 md:p-5">
          <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
            <PayrollCompositionChart
              slices={composition.map((s) => ({
                name: s.name,
                value: s.value,
                fill: s.fill,
              }))}
            />
            {eventRows.length > 0 ? (
              <PayrollEventsChart rows={eventRows} />
            ) : (
              <p className="flex h-64 items-center justify-center text-sm text-[var(--muted)]">
                Нет начислений по мероприятиям
              </p>
            )}
          </div>
        </Card>
      )}

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

function CompositionBar({
  parts,
  total,
}: {
  parts: { name: string; value: number; css: string }[];
  total: number;
}) {
  if (total <= 0 || parts.length === 0) return null;
  return (
    <div className="mt-2 ml-auto w-full max-w-[18rem] text-left">
      <div className="flex h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
        {parts.map((p) => (
          <div
            key={p.name}
            className="h-full"
            style={{
              width: `${Math.max(2, (p.value / total) * 100)}%`,
              background: p.css,
            }}
            title={`${p.name}: ${formatMoney(p.value)}`}
          />
        ))}
      </div>
      <p className="mt-1.5 text-caption leading-snug text-[var(--muted)]">
        {parts.map((p) => `${p.name} ${formatMoney(p.value)}`).join(" · ")}
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  share,
  color,
  hint,
}: {
  label: string;
  value: number;
  share?: number;
  color: string;
  hint?: string;
}) {
  const pct =
    share && share > 0 ? Math.round((value / share) * 100) : null;
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
        {label}
      </p>
      <p className="mt-1 text-3xl font-medium tracking-tight tabular-nums">
        {formatMoney(value)}
      </p>
      {pct != null && (
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-[var(--line)]">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, pct)}%`, background: color }}
          />
        </div>
      )}
      {hint && (
        <p className="mt-1.5 text-caption text-[var(--muted)]">{hint}</p>
      )}
    </Card>
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
  const { sorted, sort, onSort } = useTableSort(rows, payrollSortValue);
  return (
    <section
      className={`rounded-xl border border-[var(--line)] bg-[var(--panel)] ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <h2 className="font-display text-lg">{title}</h2>
        {rows.length > 0 && (
          <p className="text-sm tabular-nums text-[var(--muted)]">
            {formatMoney(
              rows.reduce((s, r) => s + r.pay + (r.montageAmount ?? 0), 0),
            )}
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="Нет назначений"
          description="За этот период смены не начислялись."
        />
      ) : (
        <div className="data-table-shell overflow-x-auto">
          <table className="data-table w-full min-w-[600px] text-sm">
            <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <SortableTh
                  label="Мероприятие"
                  sortKey="event"
                  state={sort}
                  onSort={onSort}
                  className="px-4 py-2"
                />
                <SortableTh
                  label="Дата"
                  sortKey="date"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Должность"
                  sortKey="role"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Расчёт"
                  sortKey="payMode"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Сумма"
                  sortKey="amount"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                  align="right"
                />
                <th className="w-12 px-3 py-2 text-left" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const life = asLifecycle(r.quote.lifecycle);
                return (
                  <tr
                    key={r.id}
                    className="border-t border-[var(--line)] hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/quotes/${r.quote.id}`}
                        className="text-[var(--accent)] hover:underline"
                      >
                        {r.quote.eventName || "Без названия"}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {life && <StatusBadge status={life} />}
                        {r.quote.client ? (
                          <span className="text-xs text-[var(--muted)]">
                            {r.quote.client}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {r.quote.date || "—"}
                    </td>
                    <td className="px-3 py-2.5">{r.specialty.name}</td>
                    <td className="px-3 py-2.5 text-[var(--muted)]">
                      {r.rateOverride != null
                        ? `override ${formatMoney(r.rateOverride)}`
                        : r.payMode === "HOURLY"
                          ? `${r.hours ?? 0} ч × ${formatMoney(r.hourlyRate)}`
                          : `смена ${formatMoney(r.shiftRate)}`}
                      {(r.bonus ?? 0) > 0 &&
                        ` + премия ${formatMoney(r.bonus!)}`}
                      {(r.montageAmount ?? 0) > 0 &&
                        ` · монт. ${formatMoney(r.montageAmount!)}`}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                      {formatMoney(r.pay + (r.montageAmount ?? 0))}
                    </td>
                    <td className="px-3 py-2.5 text-left">
                      <DirectoryCardLink href={`/quotes/${r.quote.id}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
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
  const { sorted, sort, onSort } = useTableSort(rows, agencySortValue);
  return (
    <section
      className={`rounded-xl border border-[var(--line)] bg-[var(--panel)] ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
        <h2 className="font-display text-lg">{title}</h2>
        {rows.length > 0 && (
          <p className="text-sm tabular-nums text-[var(--muted)]">
            {formatMoney(rows.reduce((s, r) => s + r.agencyTotal, 0))}
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="Нет агентских за период"
          description="Комиссия появится по вашим подтверждённым проектам."
        />
      ) : (
        <div className="data-table-shell overflow-x-auto">
          <table className="data-table w-full min-w-[560px] text-sm">
            <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <SortableTh
                  label="Мероприятие"
                  sortKey="event"
                  state={sort}
                  onSort={onSort}
                  className="px-4 py-2"
                />
                <SortableTh
                  label="Дата"
                  sortKey="date"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="По фирмам"
                  sortKey="companies"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Агентские 5%"
                  sortKey="amount"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                  align="right"
                />
                <th className="w-12 px-3 py-2 text-left" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const life = asLifecycle(r.quote.lifecycle);
                return (
                  <tr
                    key={r.id}
                    className="border-t border-[var(--line)] hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/calculations/${r.quote.id}`}
                        className="text-[var(--accent)] hover:underline"
                      >
                        {r.quote.eventName || "Без названия"}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        {life && <StatusBadge status={life} />}
                        {r.quote.client ? (
                          <span className="text-xs text-[var(--muted)]">
                            {r.quote.client}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {r.quote.date || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--muted)]">
                      {r.byCompany
                        .filter((c) => c.agency > 0)
                        .map((c) => `${c.short} ${formatMoney(c.agency)}`)
                        .join(" · ") || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                      {formatMoney(r.agencyTotal)}
                    </td>
                    <td className="px-3 py-2.5 text-left">
                      <DirectoryCardLink href={`/calculations/${r.quote.id}`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
