"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatMoney } from "@/lib/format";
import {
  CATALOG_OWNERS,
  normalizeOwners,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { exportCalculationExcel, ownerShorts } from "@/lib/export/calc-excel";
import { OwnerTagsPicker } from "@/components/OwnerTagsPicker";
import { CalcEstimateTable } from "@/components/CalcEstimateTable";
import { CalcTabs, type CalcTabId } from "@/components/CalcTabs";
import {
  DirectoryAddButton,
  DirectoryCsvMenu,
  DirectoryIconButton,
  IconEdit,
  IconPlusDoc,
  IconSave,
  IconTrash,
  downloadCsvExport,
  uploadCsvImport,
} from "@/components/DirectoryToolbar";
import { Button, Card, PageHeader, StatusBadge } from "@/components/ui";
import type { LifecycleStatus } from "@/components/ui";
import { emptyAmounts, type LineAmountSplit } from "@/lib/quote-calculation";

type ShareRow = { company: CatalogOwnerValue; percent: number };

type ExpenseRow = {
  id?: string;
  name: string;
  amount: number;
  mode: "SHARE" | "AMOUNT";
  company: CatalogOwnerValue | null;
  owners: CatalogOwnerValue[];
  amounts: LineAmountSplit;
  sortOrder: number;
};

type LineRow = {
  id: string;
  name: string;
  type: string;
  itemKind?: string | null;
  lineTotal: number;
  clientTotal?: number;
  costTotal: number;
  margin: number;
  costSource?: string;
  costOverride: number | null;
  catalogOwners: CatalogOwnerValue[];
  owners: CatalogOwnerValue[];
  ownersCustom: boolean;
  mode: "SHARE" | "AMOUNT";
  amounts: LineAmountSplit;
  hasOverride: boolean;
};

type EstimateBlock = {
  id: string;
  type: string;
  zoneId: string | null;
  zoneName: string;
  zoneActive: boolean;
  name: string;
  title: string | null;
  qty: number | null;
  unitPrice: number | null;
  dayMode: string | null;
  dayCoef: number;
  lineTotal: number;
  isKit: boolean;
};

type AssignmentRow = {
  id: string;
  userId: string;
  userName: string;
  specialtyId: string;
  specialtyName: string;
  kind?: "EVENT" | "MOUNT";
  payMode: "SHIFT" | "HOURLY";
  hours: number | null;
  owners: CatalogOwnerValue[];
  isFreelancer?: boolean;
  basePay: number;
  bonus: number;
  montageAmount: number;
  pay: number;
};

type AgencyInfo = {
  rate: number;
  percent?: number;
  total: number;
  deductedTotal: number;
  incomeOnlyTotal: number;
  managerOwners: CatalogOwnerValue[];
  byCompany: Array<{
    company: CatalogOwnerValue;
    short: string;
    label: string;
    agency: number;
    deductedFromFirm: boolean;
  }>;
};

type CalculationPayload = {
  id: string;
  proposalNumber: string;
  eventName: string;
  date: string;
  client: string;
  lifecycle: string;
  paid: boolean;
  owner: { id: string; name: string; owners?: CatalogOwnerValue[] };
  agency?: AgencyInfo;
  sharesCustom: boolean;
  shares: ShareRow[];
  expenses: Array<
    Omit<ExpenseRow, "mode" | "owners" | "amounts"> & {
      mode?: "SHARE" | "AMOUNT";
      owners?: CatalogOwnerValue[];
      amounts?: LineAmountSplit;
    }
  >;
  companies: typeof CATALOG_OWNERS;
  estimateBlocks?: EstimateBlock[];
  lineDetails: LineRow[];
  autoExpenses?: Array<{
    name: string;
    amount: number;
    owners: CatalogOwnerValue[];
  }>;
  assignments?: AssignmentRow[];
  calculation: {
    subtotal: number;
    discount: number;
    payable: number;
    expensesTotal: number;
    cogsTotal?: number;
    marginTotal?: number;
    laborTotal?: number;
    montageTotal?: number;
    montageBudget?: number;
    montageActual?: number;
    montageOverage?: number;
    agencyTotal?: number;
    agencyDeductedTotal?: number;
    netTotal: number;
    sharesCustom: boolean;
    unassignedRevenue: number;
    autoShares: ShareRow[];
    agency?: AgencyInfo;
    breakdown: {
      company: CatalogOwnerValue;
      label: string;
      short: string;
      autoPercent: number;
      percent: number;
      revenue: number;
      cogs?: number;
      expenses: number;
      laborCost?: number;
      montageCost?: number;
      agency?: number;
      agencyCost?: number;
      agencyToManagerOnly?: boolean;
      net: number;
    }[];
  };
};

function seedAmounts(
  owners: CatalogOwnerValue[],
  lineTotal: number,
): LineAmountSplit {
  const amounts = emptyAmounts();
  const list = normalizeOwners(owners);
  if (list.length === 0 || lineTotal <= 0) return amounts;
  const base = Math.floor(lineTotal / list.length);
  let left = Math.round(lineTotal);
  list.forEach((c, i) => {
    const v = i === list.length - 1 ? left : base;
    amounts[c] = v;
    left -= v;
  });
  return amounts;
}

function applyPayload(
  json: CalculationPayload,
  setSharesCustom: (v: boolean) => void,
  setShares: (v: ShareRow[]) => void,
  setExpenses: (v: ExpenseRow[]) => void,
  setLines: (v: LineRow[]) => void,
  setAssignments: (v: AssignmentRow[]) => void,
  setEstimateBlocks: (v: EstimateBlock[]) => void,
) {
  setSharesCustom(json.sharesCustom);
  setShares(
    json.sharesCustom
      ? json.shares
      : json.calculation.autoShares.length > 0
        ? json.calculation.autoShares
        : CATALOG_OWNERS.map((o) => ({ company: o.value, percent: 0 })),
  );
  setExpenses(
    json.expenses.map((e, i) => ({
      ...e,
      mode: e.mode ?? "SHARE",
      company: e.company ?? null,
      owners: normalizeOwners(e.owners ?? (e.company ? [e.company] : [])),
      amounts: {
        SHOW_MASTER: e.amounts?.SHOW_MASTER ?? 0,
        DIAKOM: e.amounts?.DIAKOM ?? 0,
        NE_EVENT: e.amounts?.NE_EVENT ?? 0,
      },
      sortOrder: e.sortOrder ?? i,
    })),
  );
  setLines(
    (json.lineDetails ?? []).map((l) => ({
      ...l,
      costTotal: Number(l.costTotal) || 0,
      margin: Number(l.margin) || 0,
      costOverride: l.costOverride == null ? null : Number(l.costOverride),
      owners: normalizeOwners(l.owners),
      catalogOwners: normalizeOwners(l.catalogOwners),
      amounts: {
        SHOW_MASTER: l.amounts?.SHOW_MASTER ?? 0,
        DIAKOM: l.amounts?.DIAKOM ?? 0,
        NE_EVENT: l.amounts?.NE_EVENT ?? 0,
      },
    })),
  );
  setAssignments(
    (json.assignments ?? []).map((a) => ({
      ...a,
      owners: normalizeOwners(a.owners),
      isFreelancer: Boolean(a.isFreelancer),
      bonus: Math.max(0, Number(a.bonus) || 0),
      montageAmount: Math.max(0, Number(a.montageAmount) || 0),
      basePay: Math.max(0, Number(a.basePay) || 0),
      pay: Math.max(0, Number(a.pay) || 0),
    })),
  );
  setEstimateBlocks(json.estimateBlocks ?? []);
}

export function CalculationEditor({ quoteId }: { quoteId: string }) {
  const [data, setData] = useState<CalculationPayload | null>(null);
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [sharesCustom, setSharesCustom] = useState(false);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [lines, setLines] = useState<LineRow[]>([]);
  const [estimateBlocks, setEstimateBlocks] = useState<EstimateBlock[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [tab, setTab] = useState<CalcTabId>("estimate");
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const csvFileRef = useRef<HTMLInputElement>(null);
  const csvKindRef = useRef<"lines" | "staff">("lines");

  const load = useCallback(async () => {
    setError("");
    const res = await fetch(`/api/calculations/${quoteId}`);
    if (!res.ok) {
      setError("Не удалось загрузить");
      return;
    }
    const json: CalculationPayload = await res.json();
    setData(json);
    applyPayload(
      json,
      setSharesCustom,
      setShares,
      setExpenses,
      setLines,
      setAssignments,
      setEstimateBlocks,
    );
  }, [quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shareSum = useMemo(
    () => shares.reduce((s, x) => s + (Number(x.percent) || 0), 0),
    [shares],
  );

  const localLaborTotal = useMemo(
    () =>
      assignments
        .filter((a) => !a.isFreelancer && a.kind !== "MOUNT")
        .reduce(
          (s, a) => s + a.basePay + Math.max(0, Number(a.bonus) || 0),
          0,
        ),
    [assignments],
  );

  const localMontageTotal = useMemo(
    () =>
      assignments.reduce((s, a) => {
        if (a.kind === "MOUNT") {
          return s + a.pay + Math.max(0, Number(a.montageAmount) || 0);
        }
        if (a.isFreelancer) return s;
        return s + Math.max(0, Number(a.montageAmount) || 0);
      }, 0),
    [assignments],
  );

  const localFreelanceTotal = useMemo(
    () =>
      assignments
        .filter((a) => a.isFreelancer)
        .reduce(
          (s, a) =>
            s +
            a.basePay +
            Math.max(0, Number(a.bonus) || 0) +
            Math.max(0, Number(a.montageAmount) || 0),
          0,
        ),
    [assignments],
  );

  const localCogsTotal = useMemo(
    () =>
      lines.reduce(
        (s, l) =>
          s + Math.max(0, l.costOverride != null ? l.costOverride : l.costTotal),
        0,
      ),
    [lines],
  );

  async function save(next?: {
    sharesCustom?: boolean;
    shares?: ShareRow[];
    expenses?: ExpenseRow[];
    lines?: LineRow[];
    assignments?: AssignmentRow[];
  }) {
    setSaving(true);
    setError("");
    const body: Record<string, unknown> = {};

    // Отправляем только изменённые блоки — иначе сохранение премий ломает доли
    if (next?.sharesCustom !== undefined || next?.shares !== undefined) {
      body.sharesCustom = next.sharesCustom ?? sharesCustom;
      body.shares = next.shares ?? shares;
    }
    if (next?.expenses !== undefined) {
      body.expenses = next.expenses.map((e, i) => ({
        name: e.name.trim() || "Расход",
        amount: Math.max(0, Number(e.amount) || 0),
        mode: e.mode,
        company: e.owners.length === 1 ? e.owners[0] : null,
        owners: e.owners,
        amounts: e.amounts,
        sortOrder: i,
      }));
    }
    if (next?.lines !== undefined) {
      body.lineOverrides = next.lines.map((l) => ({
        blockId: l.id,
        mode: l.mode,
        ownersCustom: l.ownersCustom,
        owners: l.owners,
        amounts: l.amounts,
        costOverride: l.costOverride,
      }));
    }
    if (next?.assignments !== undefined) {
      body.assignmentPay = next.assignments.map((a) => ({
        id: a.id,
        bonus: Math.max(0, Number(a.bonus) || 0),
        montageAmount: Math.max(0, Number(a.montageAmount) || 0),
      }));
    }

    // Полное сохранение (кнопки без next.*) — все блоки
    if (
      next?.sharesCustom === undefined &&
      next?.shares === undefined &&
      next?.expenses === undefined &&
      next?.lines === undefined &&
      next?.assignments === undefined
    ) {
      body.sharesCustom = sharesCustom;
      if (sharesCustom) body.shares = shares;
      body.expenses = expenses.map((e, i) => ({
        name: e.name.trim() || "Расход",
        amount: Math.max(0, Number(e.amount) || 0),
        mode: e.mode,
        company: e.owners.length === 1 ? e.owners[0] : null,
        owners: e.owners,
        amounts: e.amounts,
        sortOrder: i,
      }));
      body.lineOverrides = lines.map((l) => ({
        blockId: l.id,
        mode: l.mode,
        ownersCustom: l.ownersCustom,
        owners: l.owners,
        amounts: l.amounts,
        costOverride: l.costOverride,
      }));
      body.assignmentPay = assignments.map((a) => ({
        id: a.id,
        bonus: Math.max(0, Number(a.bonus) || 0),
        montageAmount: Math.max(0, Number(a.montageAmount) || 0),
      }));
    }

    const res = await fetch(`/api/calculations/${quoteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      setError(
        typeof err?.error === "string" ? err.error : "Не удалось сохранить",
      );
      return;
    }
    const json: CalculationPayload = await res.json();
    setData(json);
    applyPayload(
      json,
      setSharesCustom,
      setShares,
      setExpenses,
      setLines,
      setAssignments,
      setEstimateBlocks,
    );
    setSavedAt(new Date().toLocaleTimeString("ru-RU"));
  }

  function setAssignmentBonus(id: string, bonus: number) {
    setAssignments((prev) =>
      prev.map((a) =>
        a.id === id
          ? {
              ...a,
              bonus: Math.max(0, bonus),
              pay: a.basePay + Math.max(0, bonus),
            }
          : a,
      ),
    );
  }

  function setAssignmentMontage(id: string, montageAmount: number) {
    setAssignments((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, montageAmount: Math.max(0, montageAmount) }
          : a,
      ),
    );
  }

  function updateShare(company: CatalogOwnerValue, percent: number) {
    setShares((prev) => {
      const exists = prev.some((s) => s.company === company);
      if (exists) {
        return prev.map((s) =>
          s.company === company ? { ...s, percent } : s,
        );
      }
      return [...prev, { company, percent }];
    });
  }

  function enableCustomShares() {
    const nextShares = data?.calculation.autoShares.length
      ? data.calculation.autoShares
      : CATALOG_OWNERS.map((o) => ({
          company: o.value,
          percent: Math.round((100 / 3) * 100) / 100,
        }));
    setSharesCustom(true);
    setShares(nextShares);
    void save({ sharesCustom: true, shares: nextShares });
  }

  function resetAutoShares() {
    setSharesCustom(false);
    void save({ sharesCustom: false, shares: [] });
  }

  function setLineOwnersFixed(id: string, owners: CatalogOwnerValue[]) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const nextOwners = normalizeOwners(owners);
        return {
          ...l,
          owners: nextOwners,
          ownersCustom: true,
          amounts:
            l.mode === "AMOUNT"
              ? seedAmounts(nextOwners, l.lineTotal)
              : l.amounts,
        };
      }),
    );
  }

  function setLineMode(id: string, mode: "SHARE" | "AMOUNT") {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        if (mode === "AMOUNT") {
          return {
            ...l,
            mode,
            ownersCustom: l.ownersCustom || l.owners.length > 0,
            amounts: seedAmounts(
              l.owners.length ? l.owners : l.catalogOwners,
              l.lineTotal,
            ),
          };
        }
        return { ...l, mode };
      }),
    );
  }

  function setLineAmount(
    id: string,
    company: CatalogOwnerValue,
    value: number,
  ) {
    setLines((prev) =>
      prev.map((l) =>
        l.id === id
          ? {
              ...l,
              mode: "AMOUNT",
              amounts: {
                ...l.amounts,
                [company]: Math.max(0, Number(value) || 0),
              },
            }
          : l,
      ),
    );
  }

  function setLineCost(id: string, value: number | null) {
    setLines((prev) =>
      prev.map((l) =>
        l.id === id
          ? {
              ...l,
              costOverride: value == null ? null : Math.max(0, value),
              margin: Math.max(
                0,
                l.lineTotal - (value == null ? l.costTotal : Math.max(0, value)),
              ),
            }
          : l,
      ),
    );
  }

  function resetLineToCatalog(id: string) {
    setLines((prev) =>
      prev.map((l) =>
        l.id === id
          ? {
              ...l,
              mode: "SHARE",
              ownersCustom: false,
              owners: l.catalogOwners,
              amounts: seedAmounts(l.catalogOwners, l.lineTotal),
              costOverride: null,
            }
          : l,
      ),
    );
  }

  async function exportCsv(kind: "lines" | "staff" | "stats") {
    setCsvBusy(true);
    setCsvMessage("");
    try {
      const msg = await downloadCsvExport(
        `/api/calculations/${quoteId}/csv?kind=${kind}`,
      );
      setCsvMessage(msg);
    } catch (e) {
      setCsvMessage(e instanceof Error ? e.message : "Ошибка CSV");
    } finally {
      setCsvBusy(false);
    }
  }

  function pickCsv(kind: "lines" | "staff") {
    csvKindRef.current = kind;
    csvFileRef.current?.click();
  }

  async function onCsvFile(file: File) {
    setCsvBusy(true);
    setCsvMessage("");
    try {
      const kind = csvKindRef.current;
      const msg = await uploadCsvImport(
        `/api/calculations/${quoteId}/csv?kind=${kind}`,
        file,
      );
      setCsvMessage(msg);
      await load();
    } catch (e) {
      setCsvMessage(e instanceof Error ? e.message : "Ошибка импорта");
    } finally {
      setCsvBusy(false);
    }
  }

  if (!data && !error) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-[var(--muted)]">
        Загрузка…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-[var(--danger)]">{error}</div>
    );
  }

  const calc = data.calculation;
  const extraOnly = expenses.reduce(
    (s, e) => s + Math.max(0, Number(e.amount) || 0),
    0,
  );
  const displayLaborTotal =
    assignments.length > 0 ? localLaborTotal : (calc.laborTotal ?? 0);
  const displayMontageTotal =
    assignments.length > 0 ? localMontageTotal : (calc.montageTotal ?? 0);
  const displayCogs = lines.length > 0 ? localCogsTotal : (calc.cogsTotal ?? 0);
  const displayFreelance =
    assignments.length > 0
      ? localFreelanceTotal
      : (data.autoExpenses ?? []).reduce((s, e) => s + e.amount, 0);
  const agencyInfo = data.agency ?? calc.agency;
  const displayAgencyDeducted = agencyInfo?.deductedTotal ?? 0;
  const displayAgencyTotal = agencyInfo?.total ?? 0;
  const displayMargin = Math.round(calc.payable - displayCogs);
  const displayNetTotal = Math.round(
    calc.payable -
      displayCogs -
      extraOnly -
      displayFreelance -
      displayLaborTotal -
      displayMontageTotal -
      displayAgencyDeducted,
  );

  async function downloadExcel() {
    if (!data) return;
    setExporting(true);
    try {
      await exportCalculationExcel({
        proposalNumber: data.proposalNumber,
        eventName: data.eventName,
        date: data.date,
        client: data.client,
        ownerName: data.owner.name,
        payable: calc.payable,
        cogsTotal: displayCogs,
        marginTotal: displayMargin,
        extraTotal: extraOnly,
        freelanceTotal: displayFreelance,
        laborTotal: displayLaborTotal,
        montageTotal: displayMontageTotal,
        agencyTotal: displayAgencyTotal,
        netTotal: displayNetTotal,
        lines: lines.map((l) => ({
          name: l.name,
          client: l.lineTotal,
          cost: l.costOverride != null ? l.costOverride : l.costTotal,
          margin: Math.max(
            0,
            l.lineTotal -
              (l.costOverride != null ? l.costOverride : l.costTotal),
          ),
          owners: ownerShorts(l.owners.length ? l.owners : l.catalogOwners),
        })),
        autoExpenses: data.autoExpenses ?? [],
        extras: expenses.map((e) => ({
          name: e.name || "Расход",
          amount: e.amount,
        })),
        specialists: assignments.map((a) => ({
          name: a.userName,
          specialty: a.specialtyName,
          freelancer: Boolean(a.isFreelancer),
          pay: a.pay,
          montage: a.montageAmount,
        })),
        breakdown: (calc.breakdown ?? []).map((b) => ({
          short: b.short,
          label: b.label,
          revenue: b.revenue,
          cogs: b.cogs ?? 0,
          expenses: b.expenses,
          labor: b.laborCost ?? 0,
          montage: b.montageCost ?? 0,
          agency: b.agency ?? 0,
          net: b.net,
        })),
      });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1920px] px-2 py-3 md:px-3">
      <PageHeader
        title={`Калькуляция №${data.proposalNumber}`}
        subtitle={`${data.eventName || "Без названия"} · ${data.client || "—"} · ${data.date || "без даты"}`}
        actions={
          <div className="flex items-center gap-0.5">
            <DirectoryIconButton
              title={exporting ? "Excel…" : "Excel"}
              disabled={exporting}
              onClick={() => void downloadExcel()}
            >
              <IconExcel />
            </DirectoryIconButton>
            <DirectoryIconButton
              title="Открыть смету"
              href={`/quotes/${data.id}`}
            >
              <IconPlusDoc />
            </DirectoryIconButton>
            <DirectoryIconButton title="К списку" href="/calculations">
              <IconBack />
            </DirectoryIconButton>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <StatusBadge status={data.lifecycle as LifecycleStatus} />
        <span className="text-[var(--muted)]">Менеджер: {data.owner.name}</span>
        {data.paid && (
          <span className="text-xs text-[var(--muted)]">оплачено</span>
        )}
        {savedAt && (
          <span className="text-xs text-[var(--muted)]">
            сохранено в {savedAt}
          </span>
        )}
        {saving && (
          <span className="text-xs text-[var(--muted)]">сохранение…</span>
        )}
      </div>

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      <input
        ref={csvFileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void onCsvFile(file);
        }}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Stat label="Сумма КП" value={formatMoney(calc.payable)} />
        <Stat label="Выручка (маржа)" value={formatMoney(displayMargin)} />
        <Stat label="Закуп" value={formatMoney(displayCogs)} />
        <Stat
          label="Доп. расходы"
          value={formatMoney(extraOnly + displayFreelance)}
        />
        <Stat label="ЗП штат" value={formatMoney(displayLaborTotal)} />
        <Stat label="Монтажные" value={formatMoney(displayMontageTotal)} />
        <Stat
          label="Агентские"
          value={formatMoney(displayAgencyTotal)}
        />
        <Stat
          label="Нетто"
          value={formatMoney(displayNetTotal)}
          accent={displayNetTotal >= 0}
          danger={displayNetTotal < 0}
        />
      </div>

      <CalcTabs active={tab} onSelect={setTab} />

      {tab === "estimate" ? (
        <div className="pt-4">
          <CalcEstimateTable
            blocks={estimateBlocks}
            lines={lines}
            saving={saving}
            csvBusy={csvBusy}
            csvMessage={tab === "estimate" ? csvMessage : ""}
            onSave={() => void save({ lines })}
            onExportCsv={() => void exportCsv("lines")}
            onImportCsv={() => pickCsv("lines")}
            onSetLineMode={setLineMode}
            onSetLineOwners={setLineOwnersFixed}
            onSetLineAmount={setLineAmount}
            onSetLineCost={setLineCost}
            onResetLine={resetLineToCatalog}
          />
        </div>
      ) : null}

      {tab === "staff" ? (
        <div className="space-y-3 pt-4">
      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Сотрудники на мероприятии</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Участники шоу — в ЗП. Монтажники — в факт пусконаладки. Перерасход
              режет маржу конторы, выручку не раздувает.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <DirectoryCsvMenu
              busy={csvBusy}
              onExport={() => void exportCsv("staff")}
              onImport={() => pickCsv("staff")}
            />
            <Button
              type="button"
              size="sm"
              disabled={saving || assignments.length === 0}
              onClick={() => void save({ assignments })}
            >
              <IconSave />
              Сохранить премии и монтажные
            </Button>
          </div>
        </div>
        {csvMessage && tab === "staff" ? (
          <p className="text-xs text-[var(--muted)]">{csvMessage}</p>
        ) : null}
        <Card>
          {(data?.calculation.montageBudget ||
            data?.calculation.montageActual ||
            data?.calculation.montageOverage) ? (
            <div className="grid gap-2 border-b border-[var(--line)] px-4 py-3 sm:grid-cols-3">
              <div>
                <p className="text-caption uppercase tracking-wider text-[var(--muted)]">
                  Бюджет монтажа (смета)
                </p>
                <p className="font-medium tabular-nums">
                  {formatMoney(data.calculation.montageBudget ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-caption uppercase tracking-wider text-[var(--muted)]">
                  Факт (монтажники)
                </p>
                <p className="font-medium tabular-nums">
                  {formatMoney(
                    data.calculation.montageActual ?? localMontageTotal,
                  )}
                </p>
              </div>
              <div>
                <p className="text-caption uppercase tracking-wider text-[var(--muted)]">
                  Перерасход
                </p>
                <p
                  className={`font-medium tabular-nums ${
                    (data.calculation.montageOverage ?? 0) > 0
                      ? "text-[var(--danger)]"
                      : ""
                  }`}
                >
                  {formatMoney(data.calculation.montageOverage ?? 0)}
                </p>
              </div>
            </div>
          ) : null}
          {assignments.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
              На смете никто не назначен — добавьте сотрудников в редакторе КП
            </p>
          ) : (
            <div className="data-table-shell">
              <table className="data-table data-table--editable w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3">Сотрудник</th>
                    <th className="px-4 py-3">Тип</th>
                    <th className="px-4 py-3">Фирма</th>
                    <th className="px-4 py-3">Должность</th>
                    <th className="px-4 py-3">Режим</th>
                    <th className="px-4 py-3 text-right">База</th>
                    <th className="px-4 py-3 text-right">Премия</th>
                    <th className="px-4 py-3 text-right">Монтажные</th>
                    <th className="px-4 py-3 text-right">Итого ЗП</th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map((a) => (
                    <tr
                      key={a.id}
                      className="border-t border-[var(--line)]"
                    >
                      <td className="px-4 py-3 font-medium">
                        {a.userName}
                        {a.isFreelancer ? (
                          <span className="ml-2 text-caption text-[var(--muted)]">
                            фриланс
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--muted)]">
                        {a.kind === "MOUNT" ? "монтаж" : "шоу"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex flex-wrap gap-0.5">
                          {normalizeOwners(a.owners).length === 0 ? (
                            <span className="text-[var(--muted)]">—</span>
                          ) : (
                            CATALOG_OWNERS.filter((o) =>
                              a.owners.includes(o.value),
                            ).map((o) => (
                              <span
                                key={o.value}
                                title={o.label}
                                className="rounded border border-[var(--solid)] bg-[var(--solid)] px-1.5 py-0.5 text-caption font-medium uppercase text-[var(--on-solid)]"
                              >
                                {o.short}
                              </span>
                            ))
                          )}
                        </span>
                      </td>
                      <td className="px-4 py-3">{a.specialtyName}</td>
                      <td className="px-4 py-3 text-[var(--muted)]">
                        {a.payMode === "HOURLY"
                          ? `${a.hours ?? 0} ч`
                          : "Смена"}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatMoney(a.basePay)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min={0}
                          className="field ml-auto max-w-[110px] text-right"
                          value={a.bonus || ""}
                          placeholder="0"
                          onChange={(e) =>
                            setAssignmentBonus(
                              a.id,
                              Number(e.target.value) || 0,
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <input
                          type="number"
                          min={0}
                          className="field ml-auto max-w-[110px] text-right"
                          value={a.montageAmount || ""}
                          placeholder="0"
                          title="Монтажные по факту"
                          onChange={(e) =>
                            setAssignmentMontage(
                              a.id,
                              Number(e.target.value) || 0,
                            )
                          }
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatMoney(a.basePay + (Number(a.bonus) || 0))}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[var(--ink)]/20 bg-[var(--selected)]/30">
                    <td className="px-4 py-3 font-medium" colSpan={6}>
                      Итого
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">
                      ЗП {formatMoney(localLaborTotal)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatMoney(localMontageTotal)}
                    </td>
                    <td className="px-4 py-3 text-right font-display text-lg tabular-nums">
                      {formatMoney(localLaborTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>
        </div>
      ) : null}

      {tab === "stats" ? (
        <div className="space-y-6 pt-4">
          <div className="flex items-center justify-end">
            <DirectoryCsvMenu
              busy={csvBusy}
              onExport={() => void exportCsv("stats")}
            />
          </div>
          {csvMessage && tab === "stats" ? (
            <p className="-mt-4 text-xs text-[var(--muted)]">{csvMessage}</p>
          ) : null}

          {agencyInfo ? (
            <Card className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-medium">
                    Агентские менеджера · {data.owner.name}
                  </h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {(agencyInfo.percent ?? agencyInfo.rate * 100).toLocaleString(
                      "ru-RU",
                    )}
                    % от (выручка − расходы − ЗП − монтажные) по каждой фирме. С
                    фирм менеджера (
                    {agencyInfo.managerOwners.length
                      ? agencyInfo.managerOwners
                          .map(
                            (o) =>
                              CATALOG_OWNERS.find((c) => c.value === o)?.short ??
                              o,
                          )
                          .join(", ")
                      : "не указаны"}
                    ) списываются в калькуляции; с остальных — только в ЗП
                    менеджера.
                  </p>
                </div>
                <p className="text-2xl font-medium tabular-nums text-[var(--accent-deep)]">
                  {formatMoney(agencyInfo.total)}
                </p>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                {agencyInfo.byCompany.map((a) => (
                  <div
                    key={a.company}
                    className="rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3"
                  >
                    <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
                      Аг. {a.short} · {a.label}
                    </p>
                    <p className="mt-1 text-xl font-medium tabular-nums">
                      {formatMoney(a.agency)}
                    </p>
                    <p className="mt-1 text-caption text-[var(--muted)]">
                      {a.agency <= 0
                        ? "нет базы"
                        : a.deductedFromFirm
                          ? "списано с фирмы в калькуляции"
                          : "в ЗП менеджера, без расхода фирмы"}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-medium">Расходы по сотрудникам</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Подробная разбивка базы, премий и монтажных. Выгрузка — иконка
                CSV сверху.
              </p>
            </div>
            <Card>
              {assignments.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
                  Нет назначений
                </p>
              ) : (
                <div className="data-table-shell">
                  <table className="data-table w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wider text-[var(--muted)]">
                      <tr>
                        <th className="px-4 py-3">Сотрудник</th>
                        <th className="px-4 py-3">Тип</th>
                        <th className="px-4 py-3">Должность</th>
                        <th className="px-4 py-3">Фирма</th>
                        <th className="px-4 py-3 text-right">База</th>
                        <th className="px-4 py-3 text-right">Премия</th>
                        <th className="px-4 py-3 text-right">Монтажные</th>
                        <th className="px-4 py-3 text-right">Итого</th>
                        <th className="px-4 py-3 text-right">% ЗП</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.map((a) => {
                        const totalPay = a.basePay + (Number(a.bonus) || 0);
                        const pct =
                          localLaborTotal > 0
                            ? Math.round((totalPay / localLaborTotal) * 1000) / 10
                            : 0;
                        return (
                          <tr
                            key={`stat-${a.id}`}
                            className="border-t border-[var(--line)]"
                          >
                            <td className="px-4 py-3 font-medium">
                              {a.userName}
                              {a.isFreelancer ? (
                                <span className="ml-2 text-caption text-[var(--muted)]">
                                  фриланс
                                </span>
                              ) : null}
                            </td>
                            <td className="px-4 py-3 text-xs text-[var(--muted)]">
                              {a.kind === "MOUNT" ? "монтаж" : "шоу"}
                            </td>
                            <td className="px-4 py-3">{a.specialtyName}</td>
                            <td className="px-4 py-3">
                              {normalizeOwners(a.owners).length === 0 ? (
                                <span className="text-[var(--muted)]">—</span>
                              ) : (
                                CATALOG_OWNERS.filter((o) =>
                                  a.owners.includes(o.value),
                                )
                                  .map((o) => o.short)
                                  .join(" · ")
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {formatMoney(a.basePay)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {formatMoney(a.bonus)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {formatMoney(a.montageAmount)}
                            </td>
                            <td className="px-4 py-3 text-right font-medium tabular-nums">
                              {formatMoney(totalPay)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-[var(--muted)]">
                              {a.kind === "MOUNT" || a.isFreelancer
                                ? "—"
                                : `${pct} %`}
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="border-t-2 border-[var(--ink)]/20 bg-[var(--selected)]/30">
                        <td className="px-4 py-3 font-medium" colSpan={4}>
                          Итого
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatMoney(
                            assignments.reduce((s, a) => s + a.basePay, 0),
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatMoney(
                            assignments.reduce(
                              (s, a) => s + (Number(a.bonus) || 0),
                              0,
                            ),
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatMoney(localMontageTotal)}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {formatMoney(localLaborTotal)}
                        </td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </section>

      <section className="mb-6 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Доли компаний (сводка)</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Считается из строк выше. Можно задать общие доли вручную — они
              перераспределят только долевые строки; натуральные суммы не
              трогаются.
            </p>
          </div>
          <div className="flex items-center gap-1">
            {!sharesCustom ? (
              <DirectoryIconButton
                title="Редактировать доли"
                onClick={enableCustomShares}
                className="text-[var(--ink)]"
              >
                <IconEdit />
              </DirectoryIconButton>
            ) : (
              <>
                <DirectoryIconButton
                  title="Сбросить на авто"
                  onClick={resetAutoShares}
                >
                  <IconReset />
                </DirectoryIconButton>
                <DirectoryIconButton
                  title="Сохранить доли"
                  disabled={saving || shareSum <= 0}
                  onClick={() => void save()}
                  className="text-[var(--ink)]"
                >
                  <IconSave />
                </DirectoryIconButton>
              </>
            )}
          </div>
        </div>

        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            {CATALOG_OWNERS.map((c) => {
              const row = shares.find((s) => s.company === c.value);
              const breakdown = calc.breakdown.find(
                (b) => b.company === c.value,
              );
              return (
                <div
                  key={c.value}
                  className="rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="font-medium">
                      {c.short}{" "}
                      <span className="text-xs font-normal text-[var(--muted)]">
                        {c.label}
                      </span>
                    </p>
                    {!sharesCustom && (
                      <span className="text-sm tabular-nums text-[var(--accent-deep)]">
                        {breakdown?.autoPercent ?? 0}%
                      </span>
                    )}
                  </div>
                  {sharesCustom ? (
                    <label className="mt-2 block text-sm">
                      <span className="text-xs text-[var(--muted)]">Доля %</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        className="field mt-1"
                        value={row?.percent ?? 0}
                        onChange={(e) =>
                          updateShare(c.value, Number(e.target.value) || 0)
                        }
                      />
                    </label>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      из строк сметы
                    </p>
                  )}
                  <div className="mt-3 space-y-1 text-sm">
                    <p>
                      Выручка (маржа):{" "}
                      <span className="tabular-nums">
                        {formatMoney(breakdown?.revenue ?? 0)}
                      </span>
                    </p>
                    <p>
                      Закуп:{" "}
                      <span className="tabular-nums">
                        {formatMoney(breakdown?.cogs ?? 0)}
                      </span>
                    </p>
                    <p>
                      Расходы:{" "}
                      <span className="tabular-nums">
                        {formatMoney(breakdown?.expenses ?? 0)}
                      </span>
                    </p>
                    <p>
                      ЗП:{" "}
                      <span className="tabular-nums">
                        {formatMoney(breakdown?.laborCost ?? 0)}
                      </span>
                    </p>
                    <p>
                      Монтажные:{" "}
                      <span className="tabular-nums">
                        {formatMoney(breakdown?.montageCost ?? 0)}
                      </span>
                    </p>
                    <p>
                      Агентские 5%:{" "}
                      <span className="tabular-nums">
                        {formatMoney(breakdown?.agency ?? 0)}
                      </span>
                      {breakdown?.agencyCost ? (
                        <span className="ml-1 text-caption text-[var(--muted)]">
                          (−{formatMoney(breakdown.agencyCost)} с фирмы)
                        </span>
                      ) : breakdown?.agencyToManagerOnly ? (
                        <span className="ml-1 text-caption text-[var(--muted)]">
                          (только ЗП менеджера)
                        </span>
                      ) : null}
                    </p>
                    <p className="font-medium">
                      Нетто:{" "}
                      <span className="tabular-nums text-[var(--accent-deep)]">
                        {formatMoney(breakdown?.net ?? 0)}
                      </span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          {sharesCustom && (
            <p
              className={`mt-3 text-xs ${
                Math.abs(shareSum - 100) < 0.05
                  ? "text-[var(--muted)]"
                  : "text-amber-700"
              }`}
            >
              Сумма долей: {shareSum.toFixed(2)}%
              {Math.abs(shareSum - 100) >= 0.05
                ? " (будет нормализована при расчёте)"
                : ""}
            </p>
          )}
        </Card>
      </section>

      <section className="mb-6 space-y-3">
        <div>
          <h2 className="text-lg font-medium">Фрилансеры (авто из назначений)</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Не правятся здесь: ставка и монтаж задаются в назначениях на смете.
            Если человек и работал, и монтировал — две строки в расходе.
          </p>
        </div>
        <Card>
          {(data.autoExpenses ?? []).length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--muted)]">
              Фрилансеров на смете нет
            </p>
          ) : (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {(data.autoExpenses ?? []).map((e, i) => (
                <li
                  key={`${e.name}-${i}`}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <span>{e.name}</span>
                  <span className="tabular-nums">{formatMoney(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      <section className="mb-6 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Дополнительные расходы</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Режим «Доли»: без тегов — по долям выручки; с тегами ШМ/ДК/NE —
              поровну между выбранными. Режим «Суммы» — натуральные суммы на
              компании.
            </p>
          </div>
          <DirectoryAddButton
            title="Добавить расход"
            icon={<IconPlusDoc />}
            onClick={() =>
              setExpenses((prev) => [
                ...prev,
                {
                  name: "",
                  amount: 0,
                  mode: "SHARE",
                  company: null,
                  owners: [],
                  amounts: emptyAmounts(),
                  sortOrder: prev.length,
                },
              ])
            }
          />
        </div>

        <Card>
          {expenses.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              Доп. расходов пока нет
            </p>
          ) : (
            <div className="data-table-shell">
              <table className="data-table data-table--editable w-full min-w-[600px] text-left text-sm">
                <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wider text-[var(--muted)]">
                  <tr>
                    <th className="px-4 py-3">Название</th>
                    <th className="px-4 py-3 w-28">Сумма</th>
                    <th className="px-4 py-3">Распределение</th>
                    <th className="px-4 py-3 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e, idx) => {
                    const amountSum =
                      e.amounts.SHOW_MASTER +
                      e.amounts.DIAKOM +
                      e.amounts.NE_EVENT;
                    return (
                      <tr
                        key={e.id ?? `new-${idx}`}
                        className="border-t border-[var(--line)] align-top"
                      >
                        <td className="px-4 py-2">
                          <input
                            className="field"
                            placeholder="Например, транспорт"
                            value={e.name}
                            onChange={(ev) =>
                              setExpenses((prev) =>
                                prev.map((row, i) =>
                                  i === idx
                                    ? { ...row, name: ev.target.value }
                                    : row,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="px-4 py-2">
                          {e.mode === "SHARE" ? (
                            <input
                              type="number"
                              min={0}
                              className="field"
                              value={e.amount}
                              onChange={(ev) =>
                                setExpenses((prev) =>
                                  prev.map((row, i) =>
                                    i === idx
                                      ? {
                                          ...row,
                                          amount: Number(ev.target.value) || 0,
                                        }
                                      : row,
                                  ),
                                )
                              }
                            />
                          ) : (
                            <div className="pt-1 text-right tabular-nums text-[var(--muted)]">
                              {formatMoney(amountSum)}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <div className="mb-2 inline-flex rounded-md border border-[var(--line)] p-0.5 text-caption">
                            <button
                              type="button"
                              className={`rounded px-2 py-0.5 ${
                                e.mode === "SHARE"
                                  ? "bg-[var(--solid)] text-[var(--on-solid)]"
                                  : "text-[var(--muted)] hover:text-[var(--ink)]"
                              }`}
                              onClick={() =>
                                setExpenses((prev) =>
                                  prev.map((row, i) =>
                                    i === idx
                                      ? { ...row, mode: "SHARE" }
                                      : row,
                                  ),
                                )
                              }
                            >
                              Доли
                            </button>
                            <button
                              type="button"
                              className={`rounded px-2 py-0.5 ${
                                e.mode === "AMOUNT"
                                  ? "bg-[var(--solid)] text-[var(--on-solid)]"
                                  : "text-[var(--muted)] hover:text-[var(--ink)]"
                              }`}
                              onClick={() =>
                                setExpenses((prev) =>
                                  prev.map((row, i) => {
                                    if (i !== idx) return row;
                                    const owners =
                                      row.owners.length > 0
                                        ? row.owners
                                        : CATALOG_OWNERS.map((o) => o.value);
                                    return {
                                      ...row,
                                      mode: "AMOUNT",
                                      amounts: seedAmounts(
                                        owners,
                                        row.amount || amountSum || 0,
                                      ),
                                    };
                                  }),
                                )
                              }
                            >
                              Суммы
                            </button>
                          </div>

                          {e.mode === "SHARE" ? (
                            <div>
                              <OwnerTagsPicker
                                label=""
                                compact
                                value={e.owners}
                                onChange={(owners) =>
                                  setExpenses((prev) =>
                                    prev.map((row, i) =>
                                      i === idx
                                        ? {
                                            ...row,
                                            owners: normalizeOwners(owners),
                                            company:
                                              owners.length === 1
                                                ? owners[0]
                                                : null,
                                          }
                                        : row,
                                    ),
                                  )
                                }
                              />
                              <p className="mt-1 text-caption text-[var(--muted)]">
                                {e.owners.length === 0
                                  ? "Без тегов — по долям выручки сметы"
                                  : `Поровну между ${e.owners.length}`}
                              </p>
                            </div>
                          ) : (
                            <div className="grid gap-2 sm:grid-cols-3">
                              {CATALOG_OWNERS.map((c) => (
                                <label key={c.value} className="block text-xs">
                                  <span className="text-[var(--muted)]">
                                    {c.short}
                                  </span>
                                  <input
                                    type="number"
                                    min={0}
                                    className="field mt-0.5"
                                    value={e.amounts[c.value]}
                                    onChange={(ev) =>
                                      setExpenses((prev) =>
                                        prev.map((row, i) =>
                                          i === idx
                                            ? {
                                                ...row,
                                                mode: "AMOUNT",
                                                amounts: {
                                                  ...row.amounts,
                                                  [c.value]:
                                                    Number(ev.target.value) ||
                                                    0,
                                                },
                                              }
                                            : row,
                                        ),
                                      )
                                    }
                                  />
                                </label>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <DirectoryIconButton
                            title="Удалить"
                            danger
                            onClick={() =>
                              setExpenses((prev) =>
                                prev.filter((_, i) => i !== idx),
                              )
                            }
                          >
                            <IconTrash />
                          </DirectoryIconButton>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end border-t border-[var(--line)] px-4 py-3">
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => void save()}
            >
              <IconSave />
              Сохранить расходы
            </Button>
          </div>
        </Card>
      </section>
        </div>
      ) : null}
    </div>
  );
}

function IconExcel() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M8 3.5h7.5L19.5 8v11.5A1.5 1.5 0 0 1 18 21H8A1.5 1.5 0 0 1 6.5 19.5v-15A1.5 1.5 0 0 1 8 3.5Z" />
      <path d="M15.5 3.5V8H19.5" />
      <path d="m9 12 2.2 3.5L9 19M14.5 12 12.3 15.5 14.5 19" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

function IconReset() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 5.5v5h5" />
    </svg>
  );
}

function Stat({
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
    <Card className="p-4">
      <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
        {label}
      </p>
      <p
        className={`mt-1 text-xl font-medium tracking-tight ${
            danger
            ? "text-[var(--danger)]"
            : accent
              ? "text-[var(--accent-deep)]"
              : ""
        }`}
      >
        {value}
      </p>
    </Card>
  );
}
