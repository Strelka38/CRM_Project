"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import { STATS_PERIODS, type StatsPeriod } from "@/lib/period";
import {
  CompaniesProfitChart,
  EmployeeDetailChart,
  EmployeesPayrollChart,
  EmployeesShiftsChart,
  ProfitStructureChart,
  ProjectsBarChart,
} from "@/components/StatisticsCharts";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import type { LifecycleStatus } from "@/components/ui";
import {
  DirectoryCardLink,
  DirectoryCsvMenu,
  downloadCsvRows,
} from "@/components/DirectoryToolbar";

type CompanyStat = {
  company: string;
  short: string;
  label: string;
  revenue: number;
  expenses: number;
  laborCost: number;
  profit: number;
  projectCount: number;
};

type ProjectCompany = {
  company: string;
  short: string;
  label: string;
  revenue: number;
  expenses: number;
  laborCost: number;
  profit: number;
  percent: number;
};

type ProjectRow = {
  id: string;
  proposalNumber: string;
  eventName: string;
  date: string;
  client: string;
  lifecycle: string;
  paid: boolean;
  revenue: number;
  laborCost: number;
  profit: number;
  cashRevenue?: number;
  cashExpenses?: number;
  byCompany?: ProjectCompany[];
};

type PayrollRow = {
  id: string;
  pay?: number;
  payMode: "SHIFT" | "HOURLY";
  hours: number | null;
  rateOverride?: number | null;
  hourlyRate?: number;
  shiftRate?: number;
  specialty: { id: string; name: string };
  user: { id: string; name: string };
  quote: {
    id: string;
    eventName: string;
    date: string;
    lifecycle: string;
    place: string;
    client: string;
    proposalNumber: string;
  };
};

type StatsData = {
  hidePay?: boolean;
  period: { type: StatsPeriod; label: string };
  profitability?: {
    projectCount: number;
    revenue: number;
    laborCost: number;
    profit: number;
    paidRevenue: number;
    projects: ProjectRow[];
  };
  byCompany?: {
    note: string;
    cashRevenue: number;
    cashExpenses: number;
    unassignedRevenue: number;
    companies: CompanyStat[];
  };
  payroll: {
    userId: string | null;
    users: { id: string; name: string; role: string }[];
    confirmedTotal: number;
    pendingTotal: number;
    confirmedShifts?: number;
    pendingShifts?: number;
    byEmployee: {
      userId: string;
      name: string;
      confirmed: number;
      pending: number;
      confirmedShifts?: number;
      pendingShifts?: number;
    }[];
    rows: PayrollRow[];
  };
};

const LIFE: Record<string, string> = {
  CALCULATED: "Посчитано",
  CONFIRMED: "Подтверждено",
  COMPLETED: "Завершено",
  CANCELLED: "Отменено",
};

type ProfitMode = "overall" | "companies";

export function StatisticsView() {
  const [period, setPeriod] = useState<StatsPeriod>("month");
  const [profitMode, setProfitMode] = useState<ProfitMode>("overall");
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<StatsData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedPayroll, setSelectedPayroll] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ period });
      if (userId && !data?.hidePay) params.set("userId", userId);
      const res = await fetch(`/api/statistics?${params}`);
      if (cancelled) return;
      if (!res.ok) {
        setError("Не удалось загрузить статистику");
        setData(null);
        setLoading(false);
        return;
      }
      setData(await res.json());
      setSelectedProjects(new Set());
      setSelectedPayroll(new Set());
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [period, userId, data?.hidePay]);

  const projects = data?.profitability?.projects ?? [];
  const allProjectsSelected =
    projects.length > 0 && projects.every((p) => selectedProjects.has(p.id));
  const payrollRows = data?.payroll.rows ?? [];
  const payrollPeople = data?.payroll.byEmployee ?? [];
  const payrollKeys = userId
    ? payrollRows.map((r) => r.id)
    : payrollPeople.map((e) => e.userId);
  const allPayrollSelected =
    payrollKeys.length > 0 && payrollKeys.every((id) => selectedPayroll.has(id));

  function toggleProject(id: string) {
    setSelectedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllProjects() {
    setSelectedProjects(
      allProjectsSelected ? new Set() : new Set(projects.map((p) => p.id)),
    );
  }

  function togglePayroll(id: string) {
    setSelectedPayroll((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllPayroll() {
    setSelectedPayroll(allPayrollSelected ? new Set() : new Set(payrollKeys));
  }

  function exportCsv() {
    if (!data) return;
    const stamp = new Date().toISOString().slice(0, 10);
    const projectList = selectedProjects.size
      ? projects.filter((p) => selectedProjects.has(p.id))
      : projects;
    const rows: string[][] = [];
    if (!data.hidePay) {
      if (profitMode === "companies") {
        rows.push([
          "Раздел",
          "ID",
          "№",
          "Проект",
          "Дата",
          "Клиент",
          "ШМ прибыль",
          "ШМ выручка",
          "ДК прибыль",
          "ДК выручка",
          "NE прибыль",
          "NE выручка",
          "Итого нал.",
        ]);
        for (const p of projectList) {
          const by = Object.fromEntries(
            (p.byCompany ?? []).map((c) => [c.company, c]),
          );
          rows.push([
            "Проекты",
            p.id,
            p.proposalNumber,
            p.eventName,
            p.date,
            p.client,
            String(by.SHOW_MASTER?.profit ?? 0),
            String(by.SHOW_MASTER?.revenue ?? 0),
            String(by.DIAKOM?.profit ?? 0),
            String(by.DIAKOM?.revenue ?? 0),
            String(by.NE_EVENT?.profit ?? 0),
            String(by.NE_EVENT?.revenue ?? 0),
            String(p.cashRevenue ?? 0),
          ]);
        }
      } else {
        rows.push([
          "Раздел",
          "ID",
          "№",
          "Проект",
          "Дата",
          "Клиент",
          "Статус",
          "Выручка",
          "ЗП",
          "Прибыль",
          "Оплачено",
        ]);
        for (const p of projectList) {
          rows.push([
            "Проекты",
            p.id,
            p.proposalNumber,
            p.eventName,
            p.date,
            p.client,
            p.lifecycle,
            String(p.revenue),
            String(p.laborCost),
            String(p.profit),
            p.paid ? "1" : "0",
          ]);
        }
      }
    }
    if (userId || data.hidePay) {
      const list = selectedPayroll.size
        ? payrollRows.filter((r) => selectedPayroll.has(r.id))
        : payrollRows;
      if (list.length > 0 || data.hidePay) {
        rows.push([]);
        rows.push([
          "Раздел",
          "ID",
          "Сотрудник",
          "Мероприятие",
          "Дата",
          "Должность",
          "Статус",
          "Сумма",
        ]);
        for (const r of list) {
          rows.push([
            "Начисления",
            r.id,
            r.user.name,
            r.quote.eventName,
            r.quote.date,
            r.specialty.name,
            r.quote.lifecycle,
            String(r.pay ?? 0),
          ]);
        }
      }
    }
    if (!userId) {
      const list = selectedPayroll.size
        ? payrollPeople.filter((e) => selectedPayroll.has(e.userId))
        : payrollPeople;
      rows.push([]);
      rows.push([
        "Раздел",
        "ID",
        "Сотрудник",
        "Подтверждено",
        "Ожидается",
        "Итого",
      ]);
      for (const e of list) {
        rows.push([
          "ЗП по сотрудникам",
          e.userId,
          e.name,
          String(e.confirmed),
          String(e.pending),
          String(e.confirmed + e.pending),
        ]);
      }
    }
    downloadCsvRows(`statistics-${stamp}.csv`, rows);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <PageHeader
        title="Статистика"
        subtitle={
          data?.hidePay
            ? "Смены и суммы по сотрудникам за период — для равномерного распределения работ. Ставки и коэффициенты в карточке мероприятия по-прежнему скрыты."
            : "Доходность проектов и зарплатные начисления за выбранный период. Режим «По фирмам» — ШМ / ДК / NE в наличных по правилам калькуляции."
        }
        actions={
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="text-xs text-[var(--muted)]">Период</span>
              <select
                className="field mt-1 min-w-[10rem]"
                value={period}
                onChange={(e) => setPeriod(e.target.value as StatsPeriod)}
              >
                {STATS_PERIODS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {data && !data.hidePay && (
              <div className="block text-sm">
                <span className="text-xs text-[var(--muted)]">Доходность</span>
                <div className="mt-1 inline-flex rounded-md border border-[var(--line)] bg-[var(--panel)] p-0.5 text-sm">
                  <button
                    type="button"
                    className={`rounded px-3 py-1.5 ${
                      profitMode === "overall"
                        ? "bg-[var(--solid)] text-[var(--on-solid)]"
                        : "text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                    onClick={() => setProfitMode("overall")}
                  >
                    Общая
                  </button>
                  <button
                    type="button"
                    className={`rounded px-3 py-1.5 ${
                      profitMode === "companies"
                        ? "bg-[var(--solid)] text-[var(--on-solid)]"
                        : "text-[var(--muted)] hover:text-[var(--ink)]"
                    }`}
                    onClick={() => setProfitMode("companies")}
                  >
                    По фирмам
                  </button>
                </div>
              </div>
            )}
            {data && <DirectoryCsvMenu onExport={exportCsv} />}
          </div>
        }
      />

      {data && (
        <p className="mb-6 -mt-4 text-sm text-[var(--muted)]">
          {data.period.label}
        </p>
      )}

      {loading && !data && (
        <p className="text-[var(--muted)]">Загрузка…</p>
      )}
      {error && <p className="text-[var(--danger)]">{error}</p>}

      {data?.hidePay && <WorkloadSection data={data} />}

      {data && !data.hidePay && data.profitability && (
        <div className="space-y-8">
          <section className="space-y-4">
            {profitMode === "overall" ? (
              <>
                <h2 className="text-lg font-medium text-[var(--ink)]">
                  Общая доходность
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  Подтверждённые и завершённые проекты: выручка сметы минус
                  затраты на персонал.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Выручка"
                    value={formatMoney(data.profitability.revenue)}
                  />
                  <StatCard
                    label="Затраты (ЗП)"
                    value={formatMoney(data.profitability.laborCost)}
                  />
                  <StatCard
                    label="Прибыль"
                    value={formatMoney(data.profitability.profit)}
                    accent={data.profitability.profit >= 0}
                    danger={data.profitability.profit < 0}
                  />
                  <StatCard
                    label="Оплачено"
                    value={formatMoney(data.profitability.paidRevenue)}
                  />
                </div>

                <Card className="p-4 md:p-5">
                  <ProfitStructureChart
                    revenue={data.profitability.revenue}
                    laborCost={data.profitability.laborCost}
                    profit={data.profitability.profit}
                    paidRevenue={data.profitability.paidRevenue}
                  />
                </Card>

                {data.profitability.projects.length > 0 && (
                  <Card className="p-4 md:p-5">
                    <ProjectsBarChart projects={data.profitability.projects} />
                  </Card>
                )}

                <Card>
                  {data.profitability.projects.length === 0 ? (
                    <EmptyState
                      title="Нет проектов"
                      description="За выбранный период нет подтверждённых или завершённых проектов"
                    />
                  ) : (
                    <div className="data-table-shell overflow-x-auto">
                      <table className="data-table data-table--editable w-full min-w-[900px] text-left text-sm">
                        <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wider text-[var(--muted)]">
                          <tr>
                            <th className="w-10 px-3 py-2 text-left">
                              <input
                                type="checkbox"
                                checked={allProjectsSelected}
                                onChange={toggleAllProjects}
                                aria-label="Выбрать все проекты"
                              />
                            </th>
                            <th className="px-4 py-3">Проект</th>
                            <th className="px-4 py-3">Дата</th>
                            <th className="px-4 py-3">Клиент</th>
                            <th className="px-4 py-3">Статус</th>
                            <th className="px-4 py-3 text-left">Выручка</th>
                            <th className="px-4 py-3 text-left">ЗП</th>
                            <th className="px-4 py-3 text-left">Прибыль</th>
                            <th className="w-12 px-3 py-2 text-left" />
                          </tr>
                        </thead>
                        <tbody>
                          {data.profitability.projects.map((p) => (
                            <tr
                              key={p.id}
                              className={`border-t border-[var(--line)] transition-colors hover:bg-subtle ${
                                selectedProjects.has(p.id)
                                  ? "bg-[var(--selected)]/40"
                                  : ""
                              }`}
                            >
                              <td className="px-3 py-2 text-left">
                                <input
                                  type="checkbox"
                                  checked={selectedProjects.has(p.id)}
                                  onChange={() => toggleProject(p.id)}
                                  aria-label={`Выбрать №${p.proposalNumber}`}
                                />
                              </td>
                              <td className="px-4 py-3">
                                <Link
                                  href={`/quotes/${p.id}`}
                                  className="text-[var(--accent-deep)] hover:underline"
                                >
                                  №{p.proposalNumber}{" "}
                                  {p.eventName || "Без названия"}
                                </Link>
                                {p.paid ? (
                                  <span className="ml-2 text-xs text-[var(--muted)]">
                                    оплачено
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {p.date || "—"}
                              </td>
                              <td className="px-4 py-3">{p.client || "—"}</td>
                              <td className="px-4 py-3">
                                <StatusBadge
                                  status={p.lifecycle as LifecycleStatus}
                                />
                              </td>
                              <td className="px-4 py-3 text-left tabular-nums">
                                {formatMoney(p.revenue)}
                              </td>
                              <td className="px-4 py-3 text-left tabular-nums">
                                {formatMoney(p.laborCost)}
                              </td>
                              <td
                                className={`px-4 py-3 text-left tabular-nums ${
                                  p.profit < 0 ? "text-[var(--danger)]" : ""
                                }`}
                              >
                                {formatMoney(p.profit)}
                              </td>
                              <td className="px-3 py-2 text-left">
                                <DirectoryCardLink href={`/quotes/${p.id}`} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </>
            ) : (
              <>
                <h2 className="text-lg font-medium text-[var(--ink)]">
                  Доходность по фирмам
                </h2>
                <p className="text-sm text-[var(--muted)]">
                  {data.byCompany?.note ??
                    "ШМ / ДК / NE — выручка в наличных по правилам калькуляции."}
                </p>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <StatCard
                    label="Выручка (нал.)"
                    value={formatMoney(data.byCompany?.cashRevenue ?? 0)}
                  />
                  <StatCard
                    label="Доп. расходы"
                    value={formatMoney(data.byCompany?.cashExpenses ?? 0)}
                  />
                  <StatCard
                    label="Без владельца"
                    value={formatMoney(data.byCompany?.unassignedRevenue ?? 0)}
                  />
                  <StatCard
                    label="Прибыль фирм"
                    value={formatMoney(
                      (data.byCompany?.companies ?? []).reduce(
                        (s, c) => s + c.profit,
                        0,
                      ),
                    )}
                    accent
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {(data.byCompany?.companies ?? []).map((c) => (
                    <Card key={c.company} className="p-4">
                      <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
                        {c.short} · {c.label}
                      </p>
                      <p
                        className={`mt-1 text-2xl font-medium tracking-tight ${
                          c.profit < 0
                            ? "text-[var(--danger)]"
                            : "text-[var(--accent-deep)]"
                        }`}
                      >
                        {formatMoney(c.profit)}
                      </p>
                      <div className="mt-3 space-y-1 text-xs text-[var(--muted)]">
                        <p>Выручка: {formatMoney(c.revenue)}</p>
                        <p>Доп. расходы: {formatMoney(c.expenses)}</p>
                        <p>ЗП: {formatMoney(c.laborCost)}</p>
                        <p>Проектов: {c.projectCount}</p>
                      </div>
                    </Card>
                  ))}
                </div>

                <Card className="p-4 md:p-5">
                  <CompaniesProfitChart
                    companies={data.byCompany?.companies ?? []}
                  />
                </Card>

                <Card>
                  {data.profitability.projects.length === 0 ? (
                    <EmptyState
                      title="Нет проектов"
                      description="За выбранный период нет подтверждённых или завершённых проектов"
                    />
                  ) : (
                    <div className="data-table-shell overflow-x-auto">
                      <table className="data-table data-table--editable w-full min-w-[700px] text-left text-sm">
                        <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wider text-[var(--muted)]">
                          <tr>
                            <th className="w-10 px-3 py-2 text-left">
                              <input
                                type="checkbox"
                                checked={allProjectsSelected}
                                onChange={toggleAllProjects}
                                aria-label="Выбрать все проекты"
                              />
                            </th>
                            <th className="px-4 py-3">Проект</th>
                            <th className="px-4 py-3 text-left">ШМ</th>
                            <th className="px-4 py-3 text-left">ДК</th>
                            <th className="px-4 py-3 text-left">NE</th>
                            <th className="px-4 py-3 text-left">Итого нал.</th>
                            <th className="w-12 px-3 py-2 text-left" />
                          </tr>
                        </thead>
                        <tbody>
                          {data.profitability.projects.map((p) => {
                            const by = Object.fromEntries(
                              (p.byCompany ?? []).map((c) => [c.company, c]),
                            );
                            const sm = by.SHOW_MASTER;
                            const dk = by.DIAKOM;
                            const ni = by.NE_EVENT;
                            return (
                              <tr
                                key={p.id}
                                className={`border-t border-[var(--line)] transition-colors hover:bg-subtle ${
                                  selectedProjects.has(p.id)
                                    ? "bg-[var(--selected)]/40"
                                    : ""
                                }`}
                              >
                                <td className="px-3 py-2 text-left">
                                  <input
                                    type="checkbox"
                                    checked={selectedProjects.has(p.id)}
                                    onChange={() => toggleProject(p.id)}
                                    aria-label={`Выбрать №${p.proposalNumber}`}
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <Link
                                    href={`/calculations/${p.id}`}
                                    className="text-[var(--accent-deep)] hover:underline"
                                  >
                                    №{p.proposalNumber}{" "}
                                    {p.eventName || "Без названия"}
                                  </Link>
                                  <div className="text-xs text-[var(--muted)]">
                                    {p.date || "—"} · {p.client || "—"}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-left tabular-nums">
                                  <div>{formatMoney(sm?.profit ?? 0)}</div>
                                  <div className="text-caption text-[var(--muted)]">
                                    {formatMoney(sm?.revenue ?? 0)}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-left tabular-nums">
                                  <div>{formatMoney(dk?.profit ?? 0)}</div>
                                  <div className="text-caption text-[var(--muted)]">
                                    {formatMoney(dk?.revenue ?? 0)}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-left tabular-nums">
                                  <div>{formatMoney(ni?.profit ?? 0)}</div>
                                  <div className="text-caption text-[var(--muted)]">
                                    {formatMoney(ni?.revenue ?? 0)}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-left tabular-nums font-medium">
                                  {formatMoney(p.cashRevenue ?? 0)}
                                </td>
                                <td className="px-3 py-2 text-left">
                                  <DirectoryCardLink
                                    href={`/calculations/${p.id}`}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <p className="border-t border-[var(--line)] px-4 py-2 text-caption text-[var(--muted)]">
                        В ячейках: сверху прибыль фирмы, снизу выручка.
                      </p>
                    </div>
                  )}
                </Card>
              </>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-medium text-[var(--ink)]">
                  Зарплатная статистика
                </h2>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  Начисления по назначениям за период. Выберите сотрудника для
                  детализации.
                </p>
              </div>
              <label className="block text-sm">
                <span className="text-xs text-[var(--muted)]">Сотрудник</span>
                <select
                  className="field mt-1 min-w-[14rem]"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                >
                  <option value="">Все сотрудники</option>
                  {data.payroll.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                label="Подтверждено / завершено"
                value={formatMoney(data.payroll.confirmedTotal)}
                accent
              />
              <StatCard
                label="Ожидается (посчитано)"
                value={formatMoney(data.payroll.pendingTotal)}
              />
            </div>

            {!userId ? (
              <>
                {data.payroll.byEmployee.length > 0 && (
                  <Card className="p-4 md:p-5">
                    <EmployeesPayrollChart
                      employees={data.payroll.byEmployee}
                      onSelect={setUserId}
                    />
                  </Card>
                )}
                <Card>
                  {data.payroll.byEmployee.length === 0 ? (
                    <EmptyState
                      title="Нет начислений"
                      description="За выбранный период назначений не найдено"
                    />
                  ) : (
                    <div className="data-table-shell overflow-x-auto">
                      <table className="data-table data-table--editable w-full min-w-[560px] text-left text-sm">
                        <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wider text-[var(--muted)]">
                          <tr>
                            <th className="w-10 px-3 py-2 text-left">
                              <input
                                type="checkbox"
                                checked={allPayrollSelected}
                                onChange={toggleAllPayroll}
                                aria-label="Выбрать всех сотрудников"
                              />
                            </th>
                            <th className="px-4 py-3">Сотрудник</th>
                            <th className="px-4 py-3 text-left">
                              Подтверждено
                            </th>
                            <th className="px-4 py-3 text-left">Ожидается</th>
                            <th className="px-4 py-3 text-left">Итого</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.payroll.byEmployee.map((e) => (
                            <tr
                              key={e.userId}
                              className={`border-t border-[var(--line)] transition-colors hover:bg-subtle ${
                                selectedPayroll.has(e.userId)
                                  ? "bg-[var(--selected)]/40"
                                  : ""
                              }`}
                            >
                              <td className="px-3 py-2 text-left">
                                <input
                                  type="checkbox"
                                  checked={selectedPayroll.has(e.userId)}
                                  onChange={() => togglePayroll(e.userId)}
                                  aria-label={`Выбрать ${e.name}`}
                                />
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  className="text-[var(--accent-deep)] hover:underline"
                                  onClick={() => setUserId(e.userId)}
                                >
                                  {e.name}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-left tabular-nums">
                                {formatMoney(e.confirmed)}
                              </td>
                              <td className="px-4 py-3 text-left tabular-nums">
                                {formatMoney(e.pending)}
                              </td>
                              <td className="px-4 py-3 text-left tabular-nums font-medium">
                                {formatMoney(e.confirmed + e.pending)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </>
            ) : (
              <>
                {data.payroll.rows.length > 0 && (
                  <Card className="p-4 md:p-5">
                    <EmployeeDetailChart
                      rows={data.payroll.rows.map((r) => ({
                        ...r,
                        pay: r.pay ?? 0,
                      }))}
                    />
                  </Card>
                )}
                <Card>
                  {data.payroll.rows.length === 0 ? (
                    <EmptyState
                      title="Нет начислений"
                      description="У выбранного сотрудника нет назначений за период"
                    />
                  ) : (
                    <div className="data-table-shell overflow-x-auto">
                      <table className="data-table data-table--editable w-full min-w-[800px] text-left text-sm">
                        <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wider text-[var(--muted)]">
                          <tr>
                            <th className="w-10 px-3 py-2 text-left">
                              <input
                                type="checkbox"
                                checked={allPayrollSelected}
                                onChange={toggleAllPayroll}
                                aria-label="Выбрать все начисления"
                              />
                            </th>
                            <th className="px-4 py-3">Мероприятие</th>
                            <th className="px-4 py-3">Дата</th>
                            <th className="px-4 py-3">Должность</th>
                            <th className="px-4 py-3">Статус</th>
                            <th className="px-4 py-3">Расчёт</th>
                            <th className="px-4 py-3 text-left">Сумма</th>
                            <th className="w-12 px-3 py-2 text-left" />
                          </tr>
                        </thead>
                        <tbody>
                          {data.payroll.rows.map((r) => (
                            <tr
                              key={r.id}
                              className={`border-t border-[var(--line)] transition-colors hover:bg-subtle ${
                                selectedPayroll.has(r.id)
                                  ? "bg-[var(--selected)]/40"
                                  : ""
                              }`}
                            >
                              <td className="px-3 py-2 text-left">
                                <input
                                  type="checkbox"
                                  checked={selectedPayroll.has(r.id)}
                                  onChange={() => togglePayroll(r.id)}
                                  aria-label={`Выбрать ${r.quote.eventName}`}
                                />
                              </td>
                              <td className="px-4 py-3">
                                <Link
                                  href={`/quotes/${r.quote.id}`}
                                  className="text-[var(--accent-deep)] hover:underline"
                                >
                                  {r.quote.eventName ||
                                    `КП №${r.quote.proposalNumber}`}
                                </Link>
                                <div className="text-xs text-[var(--muted)]">
                                  {r.quote.client}
                                </div>
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {r.quote.date || "—"}
                              </td>
                              <td className="px-4 py-3">{r.specialty.name}</td>
                              <td className="px-4 py-3">
                                {LIFE[r.quote.lifecycle] || r.quote.lifecycle}
                              </td>
                              <td className="px-4 py-3 text-xs text-[var(--muted)]">
                                {r.rateOverride != null
                                  ? `override ${formatMoney(r.rateOverride)}`
                                  : r.payMode === "HOURLY"
                                    ? `${r.hours ?? 0} ч × ${formatMoney(r.hourlyRate ?? 0)}`
                                    : `смена ${formatMoney(r.shiftRate ?? 0)}`}
                              </td>
                              <td className="px-4 py-3 text-left tabular-nums font-medium">
                                {formatMoney(r.pay ?? 0)}
                              </td>
                              <td className="px-3 py-2 text-left">
                                <DirectoryCardLink
                                  href={`/quotes/${r.quote.id}`}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Card>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function WorkloadSection({ data }: { data: StatsData }) {
  const [picked, setPicked] = useState<string[] | null>(null);
  const people = useMemo(() => {
    const byId = new Map(
      data.payroll.byEmployee.map((e) => [e.userId, e] as const),
    );
    const list = data.payroll.users.map((u) => {
      const e = byId.get(u.id);
      return (
        e ?? {
          userId: u.id,
          name: u.name,
          confirmed: 0,
          pending: 0,
          confirmedShifts: 0,
          pendingShifts: 0,
        }
      );
    });
    for (const e of data.payroll.byEmployee) {
      if (!list.some((x) => x.userId === e.userId)) list.push(e);
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [data.payroll.byEmployee, data.payroll.users]);

  const selected = useMemo(() => {
    if (picked === null) return people;
    const set = new Set(picked);
    return people.filter((e) => set.has(e.userId));
  }, [people, picked]);

  const selectedIds = useMemo(
    () => new Set(selected.map((e) => e.userId)),
    [selected],
  );

  const rows = useMemo(
    () =>
      picked === null
        ? data.payroll.rows
        : data.payroll.rows.filter((r) => selectedIds.has(r.user.id)),
    [data.payroll.rows, picked, selectedIds],
  );

  const confirmed = selected.reduce(
    (s, e) => s + (e.confirmedShifts ?? 0),
    0,
  );
  const pending = selected.reduce((s, e) => s + (e.pendingShifts ?? 0), 0);
  const confirmedPay = selected.reduce((s, e) => s + e.confirmed, 0);
  const pendingPay = selected.reduce((s, e) => s + e.pending, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium text-[var(--ink)]">
            Загруженность команды
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Каждое назначение — одна смена. Рядом — заработано (подтверждено /
            завершено) и ожидается (посчитано). Отменённые не считаются.
            Отметьте сотрудников, чтобы сравнить их загрузку.
          </p>
        </div>
        <EmployeeCheckFilter
          people={people.map((e) => ({ id: e.userId, name: e.name }))}
          picked={picked}
          onChange={setPicked}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Всего смен"
          value={String(confirmed + pending)}
          accent
        />
        <StatCard label="Подтверждено / завершено" value={String(confirmed)} />
        <StatCard
          label="Заработано"
          value={formatMoney(confirmedPay)}
          accent
        />
        <StatCard label="Ожидается" value={formatMoney(pendingPay)} />
      </div>

      {selected.length > 0 && (confirmed + pending > 0 || confirmedPay > 0) && (
        <>
          <Card className="p-4 md:p-5">
            <EmployeesShiftsChart
              employees={selected.map((e) => ({
                userId: e.userId,
                name: e.name,
                confirmedShifts: e.confirmedShifts ?? 0,
                pendingShifts: e.pendingShifts ?? 0,
              }))}
              onSelect={(id) => setPicked([id])}
            />
          </Card>
          <Card className="p-4 md:p-5">
            <EmployeesPayrollChart
              employees={selected}
              onSelect={(id) => setPicked([id])}
            />
          </Card>
        </>
      )}

      <Card>
        {selected.length === 0 ? (
          <EmptyState
            title="Никто не выбран"
            description="Отметьте сотрудников в списке выше"
          />
        ) : people.every(
            (e) => (e.confirmedShifts ?? 0) + (e.pendingShifts ?? 0) === 0,
          ) ? (
          <EmptyState
            title="Нет смен"
            description="За выбранный период назначений не найдено"
          />
        ) : (
          <div className="data-table-shell overflow-x-auto">
            <table className="data-table w-full min-w-[560px] text-left text-sm">
              <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wider text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">Сотрудник</th>
                  <th className="px-4 py-3 text-left">Смены</th>
                  <th className="px-4 py-3 text-left">Заработано</th>
                  <th className="px-4 py-3 text-left">Ожидается</th>
                  <th className="px-4 py-3 text-left">Итого</th>
                </tr>
              </thead>
              <tbody>
                {selected.map((e) => {
                  const conf = e.confirmedShifts ?? 0;
                  const pend = e.pendingShifts ?? 0;
                  return (
                    <tr
                      key={e.userId}
                      className="border-t border-[var(--line)] transition-colors hover:bg-subtle"
                    >
                      <td className="px-4 py-3">
                        <span className="text-[var(--ink)]">{e.name}</span>
                        <div className="text-xs text-[var(--muted)]">
                          {conf} подтв. · {pend} ожид.
                        </div>
                      </td>
                      <td className="px-4 py-3 text-left tabular-nums">
                        {conf + pend}
                      </td>
                      <td className="px-4 py-3 text-left tabular-nums">
                        {formatMoney(e.confirmed)}
                      </td>
                      <td className="px-4 py-3 text-left tabular-nums">
                        {formatMoney(e.pending)}
                      </td>
                      <td className="px-4 py-3 text-left tabular-nums font-medium">
                        {formatMoney(e.confirmed + e.pending)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            title="Нет выездов"
            description={
              picked === null
                ? "За период никто не назначен на мероприятия"
                : "У выбранных сотрудников нет назначений за период"
            }
          />
        ) : (
          <WorkloadRowsTable
            rows={rows}
            showPerson={picked === null || picked.length !== 1}
          />
        )}
      </Card>
    </div>
  );
}

function EmployeeCheckFilter({
  people,
  picked,
  onChange,
}: {
  people: { id: string; name: string }[];
  picked: string[] | null;
  onChange: (ids: string[] | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const allIds = people.map((p) => p.id);
  const allSelected = picked === null;
  const none = Array.isArray(picked) && picked.length === 0;
  const visibleChecked = none
    ? new Set<string>()
    : allSelected
      ? new Set(allIds)
      : new Set(picked);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle(id: string) {
    const next = new Set(allSelected ? allIds : (picked ?? []));
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) {
      onChange([]);
      return;
    }
    if (next.size === allIds.length) {
      onChange(null);
      return;
    }
    onChange([...next]);
  }

  function toggleAll() {
    onChange(allSelected ? [] : null);
  }

  const label = none
    ? "Никто не выбран"
    : allSelected
      ? "Все сотрудники"
      : picked!.length === 1
        ? (people.find((p) => p.id === picked![0])?.name ?? "1 сотрудник")
        : `${picked!.length} сотрудников`;

  return (
    <div ref={rootRef} className="relative block text-sm">
      <span className="text-xs text-[var(--muted)]">Сотрудники</span>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
        className="field mt-1 flex min-w-[16rem] items-center justify-between gap-2 text-left"
      >
        <span className="truncate">{label}</span>
        <span className="text-caption opacity-70" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute right-0 z-30 mt-1 max-h-72 min-w-full overflow-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] py-1 shadow-xl"
        >
          <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-subtle">
            <input
              type="checkbox"
              className="accent-[var(--accent)]"
              checked={allSelected}
              onChange={toggleAll}
            />
            Все сотрудники
          </label>
          <div className="my-1 border-t border-[var(--line)]" />
          {people.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-subtle"
            >
              <input
                type="checkbox"
                className="accent-[var(--accent)]"
                checked={visibleChecked.has(p.id)}
                onChange={() => toggle(p.id)}
              />
              <span className="truncate">{p.name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkloadRowsTable({
  rows,
  showPerson = false,
}: {
  rows: PayrollRow[];
  showPerson?: boolean;
}) {
  return (
    <div className="data-table-shell overflow-x-auto">
      <table className="data-table w-full min-w-[800px] text-left text-sm">
        <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wider text-[var(--muted)]">
          <tr>
            {showPerson && <th className="px-4 py-3">Сотрудник</th>}
            <th className="px-4 py-3">Мероприятие</th>
            <th className="px-4 py-3">Дата</th>
            <th className="px-4 py-3">Где</th>
            <th className="px-4 py-3">Должность</th>
            <th className="px-4 py-3">Статус</th>
            <th className="px-4 py-3">Режим</th>
            <th className="px-4 py-3 text-left">Сумма</th>
            <th className="w-12 px-3 py-2 text-left" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="border-t border-[var(--line)] transition-colors hover:bg-subtle"
            >
              {showPerson && (
                <td className="px-4 py-3">{r.user.name}</td>
              )}
              <td className="px-4 py-3">
                <Link
                  href={`/quotes/${r.quote.id}/spec`}
                  className="text-[var(--accent-deep)] hover:underline"
                >
                  {r.quote.eventName || `КП №${r.quote.proposalNumber}`}
                </Link>
                <div className="text-xs text-[var(--muted)]">
                  {r.quote.client}
                </div>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {r.quote.date || "—"}
              </td>
              <td className="px-4 py-3">{r.quote.place || "—"}</td>
              <td className="px-4 py-3">{r.specialty.name}</td>
              <td className="px-4 py-3">
                {LIFE[r.quote.lifecycle] || r.quote.lifecycle}
              </td>
              <td className="px-4 py-3 text-xs text-[var(--muted)]">
                {r.payMode === "HOURLY"
                  ? `${r.hours ?? 0} ч`
                  : "Смена"}
              </td>
              <td className="px-4 py-3 text-left tabular-nums font-medium">
                {formatMoney(r.pay ?? 0)}
              </td>
              <td className="px-3 py-2 text-left">
                <DirectoryCardLink href={`/quotes/${r.quote.id}`} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
  danger,
}: {
  label: string;
  value: string;
  accent?: boolean;
  danger?: boolean;
}) {
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-medium tracking-tight ${
          danger
            ? "text-[var(--danger)]"
            : accent
              ? "text-[var(--accent-deep)]"
              : "text-[var(--ink)]"
        }`}
      >
        {value}
      </p>
    </Card>
  );
}
