"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";
import { LIST_PERIODS, type ListPeriod } from "@/lib/period";
import type { CatalogOwnerValue } from "@/lib/catalog-owner";
import {
  summaryEventFromCalcRow,
  type SummaryPerson,
} from "@/lib/export/calc-summary";
import { Card, EmptyState, StatusBadge, type LifecycleStatus } from "@/components/ui";
import {
  DirectoryCardLink,
  DirectoryCsvMenu,
  DirectoryIconButton,
  IconExcel,
  downloadCsvRows,
} from "@/components/DirectoryToolbar";

type Breakdown = {
  company: CatalogOwnerValue;
  short: string;
  label: string;
  percent: number;
  revenue: number;
  expenses: number;
  net: number;
  cogs?: number;
  agency?: number;
  agencyCost?: number;
};

type Row = {
  id: string;
  proposalNumber: string;
  eventName: string;
  date: string;
  eventDate?: string | null;
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
  extraByCompany?: Partial<Record<CatalogOwnerValue, number>>;
  people?: SummaryPerson[];
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportHint, setExportHint] = useState("");

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
      setSelected(new Set());
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

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll() {
    setExportHint("");
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string) {
    setExportHint("");
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function exportExcel() {
    const list = rows.filter((r) => selected.has(r.id));
    if (list.length === 0) {
      setExportHint("Отметьте калькуляции галочками");
      return;
    }
    setExportHint("");
    setExporting(true);
    try {
      const { exportCalcSummaryExcel } = await import(
        "@/lib/export/calc-summary-excel"
      );
      await exportCalcSummaryExcel(list.map(summaryEventFromCalcRow));
    } catch {
      setExportHint("Не удалось собрать Excel");
    } finally {
      setExporting(false);
    }
  }

  function exportCsv() {
    const list = selected.size ? rows.filter((r) => selected.has(r.id)) : rows;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsvRows(`calculations-${stamp}.csv`, [
      ["ID", "№", "Проект", "Дата", "Клиент", "Менеджер", "Статус", "Выручка", "Расходы", "Нетто", "Доли"],
      ...list.map((r) => [
        r.id,
        r.proposalNumber,
        r.eventName,
        r.date,
        r.client,
        r.owner.name,
        r.lifecycle,
        String(r.payable),
        String(r.expensesTotal),
        String(r.netTotal),
        r.breakdown.map((b) => `${b.short}:${b.percent}`).join(";"),
      ]),
    ]);
  }

  return (
    <div className="w-full px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          CRM
        </p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">Калькуляции</h1>
        <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
          Финальное распределение выручки между ШМ, ДК и NE. Суммы всегда в
          наличных (безнал пересчитывается в кэш). Доли — по владельцам
          позиций, с возможностью правки в каждой смете.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-end gap-3">
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
        <DirectoryCsvMenu
          onExport={exportCsv}
          onExportExcel={() => void exportExcel()}
          excelDisabled={selected.size === 0 || exporting}
          excelHint="Отметьте калькуляции галочками"
          busy={exporting}
        />
        <DirectoryIconButton
          title={
            selected.size === 0
              ? "Отметьте калькуляции галочками"
              : exporting
                ? "Excel…"
                : "Сводная Excel по выбранным"
          }
          disabled={selected.size === 0 || exporting}
          onClick={() => void exportExcel()}
        >
          <IconExcel />
        </DirectoryIconButton>
      </div>
      {exportHint ? (
        <p className="mb-3 text-sm text-[var(--danger)]">{exportHint}</p>
      ) : null}

      {periodLabel ? (
        <p className="mb-4 text-sm text-[var(--muted)]">{periodLabel}</p>
      ) : null}

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
            <div className="data-table-shell overflow-x-auto">
              <table className="data-table data-table--editable w-full min-w-[960px] text-left text-sm">
                <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="w-10 px-3 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        aria-label="Выбрать все"
                      />
                    </th>
                    <th className="px-4 py-3 text-left">Проект</th>
                    <th className="px-4 py-3">Дата</th>
                    <th className="px-4 py-3">Менеджер</th>
                    <th className="px-4 py-3">Статус</th>
                    <th className="px-4 py-3 text-left">Выручка</th>
                    <th className="px-4 py-3 text-left">Расходы</th>
                    <th className="px-4 py-3">Доли</th>
                    <th className="px-4 py-3 text-left">Нетто</th>
                    <th className="w-12 px-3 py-2 text-left" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-t border-[var(--line)] transition-colors hover:bg-subtle ${
                        selected.has(r.id) ? "bg-[var(--selected)]/40" : ""
                      }`}
                    >
                      <td className="px-3 py-2 text-left">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleOne(r.id)}
                          aria-label={`Выбрать №${r.proposalNumber}`}
                        />
                      </td>
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
                      <td className="px-4 py-3 text-left tabular-nums">
                        {formatMoney(r.payable)}
                      </td>
                      <td className="px-4 py-3 text-left tabular-nums">
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
                                className="inline-flex items-center rounded-md bg-[var(--selected)] px-1.5 py-0.5 text-caption text-[var(--accent-deep)]"
                                title={`${b.label}: ${formatMoney(b.net)}`}
                              >
                                {b.short} {b.percent}%
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-left tabular-nums font-medium">
                        {formatMoney(r.netTotal)}
                      </td>
                      <td className="px-3 py-2 text-left">
                        <DirectoryCardLink href={`/calculations/${r.id}`} />
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
        className={`mt-1 text-2xl font-medium tracking-tight ${
          accent ? "text-[var(--accent-deep)]" : "text-[var(--ink)]"
        }`}
      >
        {value}
      </p>
    </Card>
  );
}
