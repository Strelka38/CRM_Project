"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";
import { LIST_PERIODS, type ListPeriod } from "@/lib/period";
import {
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
  type LifecycleStatus,
} from "@/components/ui";

type Breakdown = {
  company: string;
  short: string;
  label: string;
  percent: number;
  revenue: number;
  expenses: number;
  net: number;
};

type Row = {
  id: string;
  proposalNumber: string;
  eventName: string;
  date: string;
  client: string;
  lifecycle: string;
  paid: boolean;
  owner: { id: string; name: string };
  sharesCustom: boolean;
  expensesCount: number;
  payable: number;
  expensesTotal: number;
  netTotal: number;
  unassignedRevenue: number;
  breakdown: Breakdown[];
};

export function CalculationsView() {
  const [mine, setMine] = useState(true);
  const [lifecycle, setLifecycle] = useState("settlement");
  const [period, setPeriod] = useState<ListPeriod>("month");
  const [periodLabel, setPeriodLabel] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [totals, setTotals] = useState({
    payable: 0,
    expensesTotal: 0,
    agencyTotal: 0,
    netTotal: 0,
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams();
      if (mine) params.set("mine", "1");
      if (lifecycle) params.set("lifecycle", lifecycle);
      params.set("period", period);
      const res = await fetch(`/api/calculations?${params}`);
      if (cancelled) return;
      if (!res.ok) {
        setError("Не удалось загрузить калькуляции");
        setRows([]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setRows(data.rows ?? []);
      setTotals(
        data.totals ?? {
          payable: 0,
          expensesTotal: 0,
          agencyTotal: 0,
          netTotal: 0,
        },
      );
      setPeriodLabel(data.period?.label ?? "");
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [mine, lifecycle, period]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <PageHeader
        title="Калькуляции"
        subtitle="Финальное распределение выручки между ШМ, ДК и НИ. Суммы всегда в наличных (безнал пересчитывается в кэш). Доли — по владельцам позиций, с возможностью правки в каждой смете."
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="text-xs text-[var(--muted)]">Период</span>
              <select
                className="field mt-1 min-w-[11rem]"
                value={period}
                onChange={(e) => setPeriod(e.target.value as ListPeriod)}
              >
                {LIST_PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs text-[var(--muted)]">Проекты</span>
              <select
                className="field mt-1 min-w-[10rem]"
                value={mine ? "mine" : "all"}
                onChange={(e) => setMine(e.target.value === "mine")}
              >
                <option value="mine">Мои</option>
                <option value="all">Все менеджеры</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-xs text-[var(--muted)]">Статус</span>
              <select
                className="field mt-1 min-w-[12rem]"
                value={lifecycle}
                onChange={(e) => setLifecycle(e.target.value)}
              >
                <option value="settlement">Подтверждено + завершено</option>
                <option value="CONFIRMED">Подтверждено</option>
                <option value="COMPLETED">Завершено</option>
                <option value="CALCULATED">Посчитано</option>
                <option value="all">Все (кроме отменённых)</option>
              </select>
            </label>
          </div>
        }
      />

      {periodLabel && (
        <p className="mb-4 -mt-4 text-sm text-[var(--muted)]">{periodLabel}</p>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Выручка" value={formatMoney(totals.payable)} />
        <SummaryCard
          label="Доп. расходы"
          value={formatMoney(totals.expensesTotal)}
        />
        <SummaryCard
          label="Агентские"
          value={formatMoney(totals.agencyTotal ?? 0)}
        />
        <SummaryCard
          label="Итого к распределению"
          value={formatMoney(totals.netTotal)}
          accent
        />
      </div>

      {loading && <p className="text-[var(--muted)]">Загрузка…</p>}
      {error && <p className="text-[var(--danger)]">{error}</p>}

      {!loading && !error && (
        <Card>
          {rows.length === 0 ? (
            <EmptyState
              title="Нет проектов"
              description="Под выбранные период и фильтры сметы не найдены"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[var(--table-head)] text-[11px] uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3">Проект</th>
                    <th className="px-4 py-3">Дата</th>
                    <th className="px-4 py-3">Менеджер</th>
                    <th className="px-4 py-3">Статус</th>
                    <th className="px-4 py-3 text-right">Выручка</th>
                    <th className="px-4 py-3 text-right">Расходы</th>
                    <th className="px-4 py-3">Доли</th>
                    <th className="px-4 py-3 text-right">Нетто</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-t border-[var(--line)] transition-colors hover:bg-subtle"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/calculations/${r.id}`}
                          className="font-medium text-[var(--accent-deep)] hover:underline"
                        >
                          №{r.proposalNumber} {r.eventName || "Без названия"}
                        </Link>
                        <div className="text-xs text-[var(--muted)]">
                          {r.client || "—"}
                          {r.sharesCustom ? " · доли вручную" : ""}
                          {r.expensesCount > 0
                            ? ` · расходов: ${r.expensesCount}`
                            : ""}
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {r.date || "—"}
                      </td>
                      <td className="px-4 py-3">{r.owner.name}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={r.lifecycle as LifecycleStatus}
                        />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(r.payable)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(r.expensesTotal)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {r.breakdown.length === 0 ? (
                            <span className="text-xs text-[var(--muted)]">
                              —
                            </span>
                          ) : (
                            r.breakdown.map((b) => (
                              <span
                                key={b.company}
                                className="inline-flex items-center rounded-md bg-[var(--selected)] px-1.5 py-0.5 text-[11px] text-[var(--accent-deep)]"
                                title={`${b.label}: ${formatMoney(b.net)}`}
                              >
                                {b.short} {b.percent}%
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">
                        {formatMoney(r.netTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-light tracking-tight ${
          accent ? "text-[var(--accent-deep)]" : "text-[var(--ink)]"
        }`}
      >
        {value}
      </p>
    </Card>
  );
}
