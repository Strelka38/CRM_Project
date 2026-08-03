"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatMoney } from "@/lib/format";
import { STATS_PERIODS, type StatsPeriod } from "@/lib/period";
import {
  CompaniesProfitChart,
  EmployeeDetailChart,
  EmployeesPayrollChart,
  ProfitStructureChart,
  ProjectsBarChart,
} from "@/components/StatisticsCharts";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";
import type { LifecycleStatus } from "@/components/ui";

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
  pay: number;
  payMode: "SHIFT" | "HOURLY";
  hours: number | null;
  rateOverride: number | null;
  hourlyRate: number;
  shiftRate: number;
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
  period: { type: StatsPeriod; label: string };
  profitability: {
    projectCount: number;
    revenue: number;
    laborCost: number;
    profit: number;
    paidRevenue: number;
    projects: ProjectRow[];
  };
  byCompany: {
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
    byEmployee: {
      userId: string;
      name: string;
      confirmed: number;
      pending: number;
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ period });
      if (userId) params.set("userId", userId);
      const res = await fetch(`/api/statistics?${params}`);
      if (cancelled) return;
      if (!res.ok) {
        setError("Не удалось загрузить статистику");
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
  }, [period, userId]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <PageHeader
        title="Статистика"
        subtitle="Доходность проектов и зарплатные начисления за выбранный период. Режим «По фирмам» — ШМ / ДК / NE в наличных по правилам калькуляции."
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

      {data && (
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
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-[var(--table-head)] text-[11px] uppercase tracking-wider text-[var(--muted)]">
                          <tr>
                            <th className="px-4 py-3">Проект</th>
                            <th className="px-4 py-3">Дата</th>
                            <th className="px-4 py-3">Клиент</th>
                            <th className="px-4 py-3">Статус</th>
                            <th className="px-4 py-3 text-right">Выручка</th>
                            <th className="px-4 py-3 text-right">ЗП</th>
                            <th className="px-4 py-3 text-right">Прибыль</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.profitability.projects.map((p) => (
                            <tr
                              key={p.id}
                              className="border-t border-[var(--line)] transition-colors hover:bg-subtle"
                            >
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
                              <td className="px-4 py-3 text-right tabular-nums">
                                {formatMoney(p.revenue)}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {formatMoney(p.laborCost)}
                              </td>
                              <td
                                className={`px-4 py-3 text-right tabular-nums ${
                                  p.profit < 0 ? "text-[var(--danger)]" : ""
                                }`}
                              >
                                {formatMoney(p.profit)}
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
                        className={`mt-1 text-2xl font-light tracking-tight ${
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
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-[var(--table-head)] text-[11px] uppercase tracking-wider text-[var(--muted)]">
                          <tr>
                            <th className="px-4 py-3">Проект</th>
                            <th className="px-4 py-3 text-right">ШМ</th>
                            <th className="px-4 py-3 text-right">ДК</th>
                            <th className="px-4 py-3 text-right">NE</th>
                            <th className="px-4 py-3 text-right">Итого нал.</th>
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
                                className="border-t border-[var(--line)] transition-colors hover:bg-subtle"
                              >
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
                                <td className="px-4 py-3 text-right tabular-nums">
                                  <div>{formatMoney(sm?.profit ?? 0)}</div>
                                  <div className="text-[11px] text-[var(--muted)]">
                                    {formatMoney(sm?.revenue ?? 0)}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                  <div>{formatMoney(dk?.profit ?? 0)}</div>
                                  <div className="text-[11px] text-[var(--muted)]">
                                    {formatMoney(dk?.revenue ?? 0)}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums">
                                  <div>{formatMoney(ni?.profit ?? 0)}</div>
                                  <div className="text-[11px] text-[var(--muted)]">
                                    {formatMoney(ni?.revenue ?? 0)}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums font-medium">
                                  {formatMoney(p.cashRevenue ?? 0)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      <p className="border-t border-[var(--line)] px-4 py-2 text-[11px] text-[var(--muted)]">
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
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-[var(--table-head)] text-[11px] uppercase tracking-wider text-[var(--muted)]">
                          <tr>
                            <th className="px-4 py-3">Сотрудник</th>
                            <th className="px-4 py-3 text-right">
                              Подтверждено
                            </th>
                            <th className="px-4 py-3 text-right">Ожидается</th>
                            <th className="px-4 py-3 text-right">Итого</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.payroll.byEmployee.map((e) => (
                            <tr
                              key={e.userId}
                              className="border-t border-[var(--line)] transition-colors hover:bg-subtle"
                            >
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  className="text-[var(--accent-deep)] hover:underline"
                                  onClick={() => setUserId(e.userId)}
                                >
                                  {e.name}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {formatMoney(e.confirmed)}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">
                                {formatMoney(e.pending)}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums font-medium">
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
                    <EmployeeDetailChart rows={data.payroll.rows} />
                  </Card>
                )}
                <Card>
                  {data.payroll.rows.length === 0 ? (
                    <EmptyState
                      title="Нет начислений"
                      description="У выбранного сотрудника нет назначений за период"
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-[var(--table-head)] text-[11px] uppercase tracking-wider text-[var(--muted)]">
                          <tr>
                            <th className="px-4 py-3">Мероприятие</th>
                            <th className="px-4 py-3">Дата</th>
                            <th className="px-4 py-3">Должность</th>
                            <th className="px-4 py-3">Статус</th>
                            <th className="px-4 py-3">Расчёт</th>
                            <th className="px-4 py-3 text-right">Сумма</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.payroll.rows.map((r) => (
                            <tr
                              key={r.id}
                              className="border-t border-[var(--line)] transition-colors hover:bg-subtle"
                            >
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
                                    ? `${r.hours ?? 0} ч × ${formatMoney(r.hourlyRate)}`
                                    : `смена ${formatMoney(r.shiftRate)}`}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums font-medium">
                                {formatMoney(r.pay)}
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
        className={`mt-1 text-2xl font-light tracking-tight ${
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
