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
  DataCards,
  EmptyState,
  SortableTh,
  StatusBadge,
  useTableSort,
  type DataCardItem,
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

function payDetail(r: Row): string {
  const bits = [
    r.rateOverride != null
      ? `override ${formatMoney(r.rateOverride)}`
      : r.payMode === "HOURLY"
        ? `${r.hours ?? 0} ч × ${formatMoney(r.hourlyRate)}`
        : `смена ${formatMoney(r.shiftRate)}`,
  ];
  if ((r.bonus ?? 0) > 0) bits.push(`премия ${formatMoney(r.bonus!)}`);
  if ((r.montageAmount ?? 0) > 0) {
    bits.push(`монт. ${formatMoney(r.montageAmount!)}`);
  }
  return bits.join(" · ");
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
    <div className="mx-auto max-w-6xl px-3 py-3 md:px-6 md:py-6">
      <header className="mb-3 flex items-end justify-between gap-3 md:mb-6">
        <div className="min-w-0">
          <p className="hidden font-mono text-caption uppercase tracking-[0.1em] text-[var(--muted)] md:block">
            CRM
          </p>
          <h1 className="text-xl font-medium tracking-tight text-[var(--ink)] md:mt-1 md:text-[length:var(--fs-h1)] md:leading-[var(--lh-h1)]">
            Моя зарплата
          </h1>
          <p className="mt-1 hidden max-w-prose text-sm leading-relaxed text-[var(--muted)] md:block">
            Оклад, начисления по сменам, монтажные и агентские за выбранный
            период.
          </p>
        </div>
        <div className="min-w-0 shrink-0 text-right">
          <p className="hidden text-caption uppercase tracking-[0.12em] text-[var(--muted)] md:block">
            Итого
          </p>
          <p className="flex items-baseline justify-end gap-2 text-2xl font-medium tracking-tight text-[var(--accent-deep)] tabular-nums md:text-4xl">
            <span className="text-caption uppercase tracking-[0.12em] text-[var(--muted)] md:hidden">
              Итого
            </span>
            {formatMoney(grandTotal)}
          </p>
          {composition.length > 0 ? (
            <div className="hidden md:block">
              <CompositionBar parts={composition} total={grandTotal} />
            </div>
          ) : null}
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-end gap-2 md:mb-6 md:gap-3">
        <label className="block text-sm">
          <span className="text-caption text-[var(--muted)]">Период</span>
          <select
            className="field mt-1 min-w-[8.5rem]"
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
              <span className="text-caption text-[var(--muted)]">Месяц</span>
              <input
                type="month"
                className="field mt-1 min-w-[9rem]"
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
        <p className="hidden pb-2 text-sm text-[var(--muted)] md:block">
          {data.period?.label ??
            (period === "month" ? formatYearMonthLabel(ym) : "")}
          {loading ? " · обновление…" : ""}
        </p>
        <div className="ml-auto hidden pb-1 md:block">
          <DirectoryCsvMenu onExport={exportCsv} />
        </div>
      </div>

      <div
        className={`mb-3 grid grid-cols-2 gap-2 md:mb-6 md:gap-3 ${
          hasAgency ? "lg:grid-cols-4" : "sm:grid-cols-2 lg:grid-cols-3"
        }`}
      >
        <KpiCard
          label="Оклад"
          value={data.monthlySalary}
          share={grandTotal}
          color={SLICE_COLORS.salary}
        />
        <KpiCard
          label="Подтв. / заверш."
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
          label="Ожидается"
          value={data.pendingTotal}
          color={SLICE_COLORS.pending}
          hint="не входит в итого"
        />
      </div>

      {showCharts && (
        <Card className="mb-6 hidden p-4 md:block md:p-5">
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
        className="mt-3 md:mt-6"
      />

      {hasAgency && (
        <>
          <AgencySection
            title="Агентские менеджера"
            rows={data.agencyConfirmed ?? []}
            className="mt-3 md:mt-6"
          />
          {(data.agencyPending?.length ?? 0) > 0 && (
            <AgencySection
              title="Ожидаемые агентские"
              rows={data.agencyPending}
              className="mt-3 md:mt-6"
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
    <Card className="p-3 md:p-5">
      <p className="text-caption uppercase tracking-[0.12em] text-[var(--muted)] md:text-xs md:tracking-[0.15em]">
        {label}
      </p>
      <p className="mt-0.5 text-xl font-medium tracking-tight tabular-nums md:mt-1 md:text-3xl">
        {formatMoney(value)}
      </p>
      {pct != null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--line)] md:mt-3">
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.min(100, pct)}%`, background: color }}
          />
        </div>
      )}
      {hint && (
        <p className="mt-1 line-clamp-2 text-caption text-[var(--muted)] md:mt-1.5">
          {hint}
        </p>
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
  const cards: DataCardItem[] = sorted.map((r) => {
    const life = asLifecycle(r.quote.lifecycle);
    return {
      id: r.id,
      title: r.quote.eventName || "Без названия",
      subtitle: [r.quote.date || "—", r.specialty.name]
        .filter(Boolean)
        .join(" · "),
      href: `/quotes/${r.quote.id}`,
      trailing: (
        <span className="font-medium tabular-nums">
          {formatMoney(r.pay + (r.montageAmount ?? 0))}
        </span>
      ),
      fields: [
        ...(life
          ? [{ label: "Статус", value: <StatusBadge status={life} /> }]
          : []),
        { label: "Расчёт", value: payDetail(r), block: true },
      ],
    };
  });
  return (
    <section
      className={`rounded-xl border border-[var(--line)] bg-[var(--panel)] ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] px-3 py-2 md:px-4 md:py-3">
        <h2 className="font-display text-base md:text-lg">{title}</h2>
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
          className="py-6 md:py-16"
          title="Нет назначений"
          description="За этот период смены не начислялись."
        />
      ) : (
        <>
          <DataCards className="p-2 md:hidden" items={cards} />
          <div className="data-table-shell hidden overflow-x-auto md:block">
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
        </>
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
  const cards: DataCardItem[] = sorted.map((r) => {
    const life = asLifecycle(r.quote.lifecycle);
    return {
      id: r.id,
      title: r.quote.eventName || "Без названия",
      subtitle: r.quote.date || "—",
      href: `/calculations/${r.quote.id}`,
      trailing: (
        <span className="font-medium tabular-nums">
          {formatMoney(r.agencyTotal)}
        </span>
      ),
      fields: [
        ...(life
          ? [{ label: "Статус", value: <StatusBadge status={life} /> }]
          : []),
        {
          label: "По фирмам",
          value:
            r.byCompany
              .filter((c) => c.agency > 0)
              .map((c) => `${c.short} ${formatMoney(c.agency)}`)
              .join(" · ") || "—",
          block: true,
        },
      ],
    };
  });
  return (
    <section
      className={`rounded-xl border border-[var(--line)] bg-[var(--panel)] ${className}`}
    >
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] px-3 py-2 md:px-4 md:py-3">
        <h2 className="font-display text-base md:text-lg">{title}</h2>
        {rows.length > 0 && (
          <p className="text-sm tabular-nums text-[var(--muted)]">
            {formatMoney(rows.reduce((s, r) => s + r.agencyTotal, 0))}
          </p>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          className="py-6 md:py-16"
          title="Нет агентских за период"
          description="Комиссия появится по вашим подтверждённым проектам."
        />
      ) : (
        <>
          <DataCards className="p-2 md:hidden" items={cards} />
          <div className="data-table-shell hidden overflow-x-auto md:block">
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
        </>
      )}
    </section>
  );
}
