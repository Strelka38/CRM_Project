"use client";

import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/format";
import { useTheme } from "@/components/ThemeProvider";

function readChartColors() {
  if (typeof window === "undefined") {
    return {
      revenue: "#009ee3",
      labor: "#4db8eb",
      profit: "#7c9cff",
      paid: "#22c55e",
      unpaid: "#f59e0b",
      pending: "#8a9abc",
      confirmed: "#009ee3",
      ink: "#e8eef8",
      muted: "#8a9abc",
      line: "rgba(255,255,255,0.12)",
      panel: "#121826",
    };
  }
  const s = getComputedStyle(document.documentElement);
  const get = (name: string, fallback: string) =>
    s.getPropertyValue(name).trim() || fallback;
  return {
    revenue: get("--accent", "#009ee3"),
    labor: get("--accent-deep", "#4db8eb"),
    profit: get("--lifecycle-completed", "#7c9cff"),
    paid: get("--success", "#22c55e"),
    unpaid: get("--warning", "#f59e0b"),
    pending: get("--muted", "#8a9abc"),
    confirmed: get("--accent", "#009ee3"),
    ink: get("--ink", "#e8eef8"),
    muted: get("--muted", "#8a9abc"),
    line: get("--line", "rgba(255,255,255,0.12)"),
    panel: get("--panel", "#121826"),
  };
}

function useChartColors() {
  const { theme } = useTheme();
  const [colors, setColors] = useState(readChartColors);
  useEffect(() => {
    setColors(readChartColors());
  }, [theme]);
  return colors;
}

function moneyTick(value: number) {
  if (Math.abs(value) >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)} млн`;
  }
  if (Math.abs(value) >= 1_000) {
    return `${Math.round(value / 1_000)} тыс`;
  }
  return String(Math.round(value));
}

function shortLabel(text: string, max = 18) {
  const t = text.trim() || "—";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function MoneyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  const colors = useChartColors();
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: colors.panel,
        border: `1px solid ${colors.line}`,
        borderRadius: 8,
        fontSize: 12,
        color: colors.ink,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
      }}
      className="px-3 py-2"
    >
      {label && (
        <p className="mb-1 font-medium text-[var(--ink)]">{label}</p>
      )}
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }} className="tabular-nums">
          {entry.name}: {formatMoney(entry.value)}
        </p>
      ))}
    </div>
  );
}

export function ProfitStructureChart({
  revenue,
  laborCost,
  profit,
  paidRevenue,
}: {
  revenue: number;
  laborCost: number;
  profit: number;
  paidRevenue: number;
}) {

  const COLORS = useChartColors();
  const summary = [
    { name: "Выручка", value: revenue, fill: COLORS.revenue },
    { name: "Затраты ЗП", value: laborCost, fill: COLORS.labor },
    { name: "Прибыль", value: profit, fill: profit >= 0 ? COLORS.profit : "#dc2626" },
  ];

  const unpaid = Math.max(0, revenue - paidRevenue);
  const payment = [
    { name: "Оплачено", value: paidRevenue, fill: COLORS.paid },
    { name: "Не оплачено", value: unpaid, fill: COLORS.unpaid },
  ].filter((d) => d.value > 0);

  const hasSummary = summary.some((d) => d.value !== 0);
  const hasPayment = payment.length > 0;

  if (!hasSummary && !hasPayment) {
    return (
      <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">
        Нет данных для графика
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="h-64 min-h-[16rem] w-full">
        <p className="mb-2 px-1 text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          Структура периода
        </p>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={summary} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: COLORS.muted, fontSize: 12 }}
              axisLine={{ stroke: COLORS.line }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={moneyTick}
              tick={{ fill: COLORS.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip content={<MoneyTooltip />} cursor={{ fill: "rgba(0,158,227,0.06)" }} />
            <Bar dataKey="value" name="Сумма" radius={[6, 6, 0, 0]} maxBarSize={56}>
              {summary.map((entry) => (
                <Cell key={entry.name} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="h-64 min-h-[16rem] w-full">
        <p className="mb-2 px-1 text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          Оплата выручки
        </p>
        {hasPayment ? (
          <ResponsiveContainer width="100%" height="90%">
            <PieChart>
              <Pie
                data={payment}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="48%"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={2}
                stroke="none"
              >
                {payment.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<MoneyTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={28}
                formatter={(value) => (
                  <span className="text-xs text-[var(--muted)]">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-[90%] items-center justify-center text-sm text-[var(--muted)]">
            Нет выручки за период
          </p>
        )}
      </div>
    </div>
  );
}

export function ProjectsBarChart({
  projects,
}: {
  projects: {
    id: string;
    eventName: string;
    proposalNumber: string;
    revenue: number;
    laborCost: number;
    profit: number;
  }[];
}) {

  const COLORS = useChartColors();
  if (projects.length === 0) return null;

  const data = [...projects]
    .reverse()
    .slice(-12)
    .map((p) => ({
      name: shortLabel(p.eventName || `КП №${p.proposalNumber}`, 16),
      fullName: p.eventName || `КП №${p.proposalNumber}`,
      Выручка: Math.round(p.revenue),
      ЗП: Math.round(p.laborCost),
      Прибыль: Math.round(p.profit),
    }));

  return (
    <div className="h-72 w-full">
      <p className="mb-2 px-1 text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
        По проектам{projects.length > 12 ? " (последние 12)" : ""}
      </p>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            axisLine={{ stroke: COLORS.line }}
            tickLine={false}
            interval={0}
            angle={data.length > 6 ? -25 : 0}
            textAnchor={data.length > 6 ? "end" : "middle"}
            height={data.length > 6 ? 56 : 28}
          />
          <YAxis
            tickFormatter={moneyTick}
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const full = (payload[0]?.payload as { fullName?: string })?.fullName;
              return (
                <MoneyTooltip
                  active={active}
                  label={full}
                  payload={payload.map((p) => ({
                    name: String(p.name),
                    value: Number(p.value),
                    color: String(p.color),
                  }))}
                />
              );
            }}
            cursor={{ fill: "rgba(0,158,227,0.06)" }}
          />
          <Legend
            formatter={(value) => (
              <span className="text-xs text-[var(--muted)]">{value}</span>
            )}
          />
          <Bar dataKey="Выручка" fill={COLORS.revenue} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="ЗП" fill={COLORS.labor} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="Прибыль" fill={COLORS.profit} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function EmployeesPayrollChart({
  employees,
  onSelect,
}: {
  employees: {
    userId: string;
    name: string;
    confirmed: number;
    pending: number;
  }[];
  onSelect?: (userId: string) => void;
}) {

  const COLORS = useChartColors();
  if (employees.length === 0) return null;

  const data = [...employees]
    .sort((a, b) => b.confirmed + b.pending - (a.confirmed + a.pending))
    .map((e) => ({
      userId: e.userId,
      name: shortLabel(e.name, 14),
      fullName: e.name,
      Подтверждено: Math.round(e.confirmed),
      Ожидается: Math.round(e.pending),
    }));

  const height = Math.max(220, data.length * 36 + 48);

  return (
    <div className="w-full" style={{ height }}>
      <p className="mb-2 px-1 text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
        Начисления по сотрудникам
      </p>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={moneyTick}
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={88}
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const full = (payload[0]?.payload as { fullName?: string })?.fullName;
              return (
                <MoneyTooltip
                  active={active}
                  label={full}
                  payload={payload.map((p) => ({
                    name: String(p.name),
                    value: Number(p.value),
                    color: String(p.color),
                  }))}
                />
              );
            }}
            cursor={{ fill: "rgba(0,158,227,0.06)" }}
          />
          <Legend
            formatter={(value) => (
              <span className="text-xs text-[var(--muted)]">{value}</span>
            )}
          />
          <Bar
            dataKey="Подтверждено"
            stackId="pay"
            fill={COLORS.confirmed}
            radius={[0, 0, 0, 0]}
            maxBarSize={22}
            cursor={onSelect ? "pointer" : undefined}
            onClick={(entry) => {
              const id = (entry as { payload?: { userId?: string } }).payload
                ?.userId;
              if (id && onSelect) onSelect(id);
            }}
          />
          <Bar
            dataKey="Ожидается"
            stackId="pay"
            fill={COLORS.pending}
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            cursor={onSelect ? "pointer" : undefined}
            onClick={(entry) => {
              const id = (entry as { payload?: { userId?: string } }).payload
                ?.userId;
              if (id && onSelect) onSelect(id);
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const COMPANY_COLORS: Record<string, string> = {
  SHOW_MASTER: "#0f69b1",
  DIAKOM: "#009ee3",
  NE_EVENT: "#4371ea",
};

export function CompaniesProfitChart({
  companies,
}: {
  companies: {
    company: string;
    short: string;
    label: string;
    revenue: number;
    expenses: number;
    laborCost: number;
    profit: number;
  }[];
}) {

  const COLORS = useChartColors();
  const hasData = companies.some(
    (c) => c.revenue || c.expenses || c.laborCost || c.profit,
  );
  if (!hasData) {
    return (
      <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">
        Нет данных по фирмам за период
      </p>
    );
  }

  const bars = companies.map((c) => ({
    name: c.short,
    fullName: c.label,
    Выручка: c.revenue,
    "Доп. расходы": c.expenses,
    ЗП: c.laborCost,
    Прибыль: c.profit,
  }));

  const pie = companies
    .filter((c) => c.revenue > 0)
    .map((c) => ({
      name: c.short,
      value: c.revenue,
      fill: COMPANY_COLORS[c.company] ?? COLORS.revenue,
    }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="h-72 w-full">
        <p className="mb-2 px-1 text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          Доходность по фирмам
        </p>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={bars} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
            <XAxis
              dataKey="name"
              tick={{ fill: COLORS.muted, fontSize: 12 }}
              axisLine={{ stroke: COLORS.line }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={moneyTick}
              tick={{ fill: COLORS.muted, fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={56}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const full = (payload[0]?.payload as { fullName?: string })
                  ?.fullName;
                return (
                  <MoneyTooltip
                    active={active}
                    label={full}
                    payload={payload.map((p) => ({
                      name: String(p.name),
                      value: Number(p.value),
                      color: String(p.color),
                    }))}
                  />
                );
              }}
              cursor={{ fill: "rgba(0,158,227,0.06)" }}
            />
            <Legend
              formatter={(value) => (
                <span className="text-xs text-[var(--muted)]">{value}</span>
              )}
            />
            <Bar dataKey="Выручка" fill={COLORS.revenue} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="Доп. расходы" fill={COLORS.unpaid} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="ЗП" fill={COLORS.labor} radius={[4, 4, 0, 0]} maxBarSize={22} />
            <Bar dataKey="Прибыль" fill={COLORS.profit} radius={[4, 4, 0, 0]} maxBarSize={22} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="h-72 w-full">
        <p className="mb-2 px-1 text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          Доля выручки
        </p>
        {pie.length > 0 ? (
          <ResponsiveContainer width="100%" height="90%">
            <PieChart>
              <Pie
                data={pie}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="48%"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={2}
                stroke="none"
              >
                {pie.map((entry) => (
                  <Cell key={entry.name} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip content={<MoneyTooltip />} />
              <Legend
                verticalAlign="bottom"
                height={28}
                formatter={(value) => (
                  <span className="text-xs text-[var(--muted)]">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="flex h-[90%] items-center justify-center text-sm text-[var(--muted)]">
            Нет выручки по фирмам
          </p>
        )}
      </div>
    </div>
  );
}

export function EmployeeDetailChart({
  rows,
}: {
  rows: {
    id: string;
    pay: number;
    specialty: { name: string };
    quote: { eventName: string; proposalNumber: string; lifecycle: string };
  }[];
}) {

  const COLORS = useChartColors();
  if (rows.length === 0) return null;

  const data = [...rows]
    .reverse()
    .slice(-15)
    .map((r) => ({
      name: shortLabel(r.quote.eventName || `КП №${r.quote.proposalNumber}`, 14),
      fullName: `${r.quote.eventName || `КП №${r.quote.proposalNumber}`} · ${r.specialty.name}`,
      Сумма: Math.round(r.pay),
      fill: ["CONFIRMED", "COMPLETED"].includes(r.quote.lifecycle)
        ? COLORS.confirmed
        : COLORS.pending,
    }));

  return (
    <div className="h-64 w-full">
      <p className="mb-2 px-1 text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
        Начисления по мероприятиям{rows.length > 15 ? " (последние 15)" : ""}
      </p>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.line} vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            axisLine={{ stroke: COLORS.line }}
            tickLine={false}
            interval={0}
            angle={data.length > 5 ? -25 : 0}
            textAnchor={data.length > 5 ? "end" : "middle"}
            height={data.length > 5 ? 56 : 28}
          />
          <YAxis
            tickFormatter={moneyTick}
            tick={{ fill: COLORS.muted, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const full = (payload[0]?.payload as { fullName?: string })?.fullName;
              return (
                <MoneyTooltip
                  active={active}
                  label={full}
                  payload={payload.map((p) => ({
                    name: String(p.name),
                    value: Number(p.value),
                    color: String(p.color ?? COLORS.confirmed),
                  }))}
                />
              );
            }}
            cursor={{ fill: "rgba(0,158,227,0.06)" }}
          />
          <Bar dataKey="Сумма" radius={[6, 6, 0, 0]} maxBarSize={40}>
            {data.map((entry) => (
              <Cell key={entry.name + entry.fullName} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
