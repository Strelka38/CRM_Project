"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";
import { formatYearMonthLabel, parseYearMonth } from "@/lib/period";
import {
  Card,
  EmptyState,
  PageHeader,
} from "@/components/ui";
import {
  DirectoryCardLink,
  DirectoryCsvMenu,
  DirectoryIconButton,
  DirectorySelectionActions,
  IconCheck,
  downloadCsvRows,
} from "@/components/DirectoryToolbar";

type Breakdown = {
  monthlySalary: number;
  assignmentPay: number;
  montage: number;
  agency: number;
};

type QueueRow = {
  sourceKey: string;
  kind: "STAFF_MONTH" | "FREELANCER_EVENT";
  periodYm: string;
  payeeName: string;
  userId: string | null;
  quoteId: string | null;
  quoteName: string;
  quoteDate: string;
  specialtyName: string;
  amount: number;
  breakdown: Breakdown | null;
};

type HistoryRow = QueueRow & {
  id: string;
  paidAt: string | null;
  paidByName: string | null;
  liveAmount: number | null;
};

type Board = {
  previousYm: string;
  previousLabel: string;
  queue: {
    staff: QueueRow[];
    freelancers: QueueRow[];
    staffTotal: number;
    freelancerTotal: number;
    total: number;
  };
  history: HistoryRow[];
  historyTotal: number;
};

function formatPaidAt(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

function staffHint(row: QueueRow) {
  const b = row.breakdown;
  if (!b) return "";
  const parts: string[] = [];
  if (b.monthlySalary) parts.push(`оклад ${formatMoney(b.monthlySalary)}`);
  if (b.assignmentPay) parts.push(`смены ${formatMoney(b.assignmentPay)}`);
  if (b.montage) parts.push(`монтаж ${formatMoney(b.montage)}`);
  if (b.agency) parts.push(`агентские ${formatMoney(b.agency)}`);
  return parts.join(" · ");
}

export function PayoutsView({ canOpenUsers = false }: { canOpenUsers?: boolean }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"queue" | "history">("queue");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/payouts");
    if (!res.ok) {
      setError("Нет доступа или не удалось загрузить оплаты");
      return;
    }
    const data = (await res.json()) as Board;
    setBoard(data);
    setError("");
    setSelected((prev) => {
      const ids = new Set([
        ...data.queue.staff.map((r) => r.sourceKey),
        ...data.queue.freelancers.map((r) => r.sourceKey),
        ...data.history.map((r) => r.sourceKey),
      ]);
      return new Set([...prev].filter((id) => ids.has(id)));
    });
  }

  useEffect(() => {
    void load();
  }, []);

  const visibleRows = useMemo(() => {
    if (!board) return [];
    return tab === "queue"
      ? [...board.queue.staff, ...board.queue.freelancers]
      : board.history;
  }, [board, tab]);

  const allSelected =
    visibleRows.length > 0 &&
    visibleRows.every((r) => selected.has(r.sourceKey));

  function toggleAll() {
    const ids = visibleRows.map((r) => r.sourceKey);
    setSelected(allSelected ? new Set() : new Set(ids));
  }

  function toggleOne(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function mark(sourceKeys: string[], paid: boolean) {
    if (sourceKeys.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/payouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceKeys, paid }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        setError(data.error || "Не удалось сохранить");
      }
      await load();
    } catch {
      setError("Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  function exportCsv() {
    if (!board) return;
    setCsvBusy(true);
    try {
      const rows =
        tab === "queue"
          ? [
              ["Тип", "Период", "Кому", "Мероприятие", "Дата", "Сумма", "Расшифровка"],
              ...board.queue.staff.map((r) => [
                "ЗП",
                r.periodYm,
                r.payeeName,
                "",
                "",
                String(Math.round(r.amount)),
                staffHint(r),
              ]),
              ...board.queue.freelancers.map((r) => [
                "Фрилансер",
                r.periodYm,
                r.payeeName,
                r.quoteName,
                r.quoteDate,
                String(Math.round(r.amount)),
                r.specialtyName,
              ]),
            ]
          : [
              ["Тип", "Период", "Кому", "Сумма", "Оплачено", "Кто"],
              ...board.history.map((r) => [
                r.kind === "STAFF_MONTH" ? "ЗП" : "Фрилансер",
                r.periodYm,
                r.payeeName,
                String(Math.round(r.amount)),
                formatPaidAt(r.paidAt),
                r.paidByName || "",
              ]),
            ];
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsvRows(
        tab === "queue" ? `payouts-${stamp}.csv` : `payouts-history-${stamp}.csv`,
        rows,
      );
    } finally {
      setCsvBusy(false);
    }
  }

  return (
    <div className="w-full px-4 py-6 md:px-6">
      <PageHeader
        title="Оплаты"
        subtitle={
          board
            ? `ЗП сотрудников за ${board.previousLabel} и выплаты фрилансерам с мероприятий`
            : "ЗП за прошлый месяц и выплаты фрилансерам"
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-[var(--line)] p-0.5">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === "queue"
                ? "bg-[var(--selected)] text-[var(--ink)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
            onClick={() => {
              setTab("queue");
              setSelected(new Set());
            }}
          >
            К оплате
            {board ? ` · ${formatMoney(board.queue.total)}` : ""}
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm ${
              tab === "history"
                ? "bg-[var(--selected)] text-[var(--ink)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
            onClick={() => {
              setTab("history");
              setSelected(new Set());
            }}
          >
            История
          </button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <DirectorySelectionActions
            count={selected.size}
            disabled={busy}
            extra={
              tab === "queue" ? (
                <DirectoryIconButton
                  title="Отметить оплаченными"
                  disabled={busy}
                  onClick={() => void mark([...selected], true)}
                  className="text-[var(--accent)]"
                >
                  <IconCheck />
                </DirectoryIconButton>
              ) : (
                <DirectoryIconButton
                  title="Снять отметку оплаты"
                  disabled={busy}
                  onClick={() => void mark([...selected], false)}
                >
                  ×
                </DirectoryIconButton>
              )
            }
          />
          <DirectoryCsvMenu
            busy={csvBusy}
            onExport={() => exportCsv()}
          />
        </div>
      </div>

      {error ? (
        <p className="mb-3 text-sm text-[var(--danger)]">{error}</p>
      ) : null}

      {!board ? (
        <p className="text-[var(--muted)]">Загрузка…</p>
      ) : tab === "queue" ? (
        <div className="space-y-4">
          <PayableTable
            title="Сотрудники"
            subtitle={`Оклад, смены, монтаж и агентские за закрытые месяцы. Неоплаченное за ${board.previousLabel} и раньше.`}
            rows={board.queue.staff}
            total={board.queue.staffTotal}
            empty="Нет ЗП к выплате"
            selected={selected}
            onToggleAll={(rows) => {
              const ids = rows.map((r) => r.sourceKey);
              const all =
                ids.length > 0 && ids.every((id) => selected.has(id));
              setSelected((prev) => {
                const next = new Set(prev);
                if (all) ids.forEach((id) => next.delete(id));
                else ids.forEach((id) => next.add(id));
                return next;
              });
            }}
            onToggle={toggleOne}
            onPaid={(key) => void mark([key], true)}
            busy={busy}
            canOpenUsers={canOpenUsers}
            kind="staff"
            highlightYm={board.previousYm}
          />
          <PayableTable
            title="Фрилансеры"
            subtitle="Оплаты с подтверждённых и завершённых мероприятий"
            rows={board.queue.freelancers}
            total={board.queue.freelancerTotal}
            empty="Нет выплат фрилансерам"
            selected={selected}
            onToggleAll={(rows) => {
              const ids = rows.map((r) => r.sourceKey);
              const all =
                ids.length > 0 && ids.every((id) => selected.has(id));
              setSelected((prev) => {
                const next = new Set(prev);
                if (all) ids.forEach((id) => next.delete(id));
                else ids.forEach((id) => next.add(id));
                return next;
              });
            }}
            onToggle={toggleOne}
            onPaid={(key) => void mark([key], true)}
            busy={busy}
            canOpenUsers={false}
            kind="freelancer"
          />
        </div>
      ) : board.history.length === 0 ? (
        <Card>
          <EmptyState
            title="История пуста"
            description="Отмеченные выплаты появятся здесь и в карточке сотрудника"
          />
        </Card>
      ) : (
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h2 className="text-sm font-medium">Выплачено</h2>
            <p className="text-sm tabular-nums text-[var(--muted)]">
              {formatMoney(board.historyTotal)}
            </p>
          </div>
          <div className="data-table-shell overflow-x-auto">
            <table className="data-table w-full text-left text-sm">
              <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wider text-[var(--muted)]">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Выбрать все"
                    />
                  </th>
                  <th className="px-3 py-2">Кому</th>
                  <th className="px-3 py-2">Период</th>
                  <th className="px-3 py-2">Тип</th>
                  <th className="px-3 py-2 text-right">Сумма</th>
                  <th className="px-3 py-2">Когда</th>
                  <th className="w-12 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {board.history.map((r) => (
                  <tr
                    key={r.sourceKey}
                    className={`border-t border-[var(--line)] ${
                      selected.has(r.sourceKey) ? "bg-[var(--selected)]/40" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(r.sourceKey)}
                        onChange={() => toggleOne(r.sourceKey)}
                        aria-label={`Выбрать ${r.payeeName}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <p>{r.payeeName}</p>
                      {r.quoteName ? (
                        <p className="text-caption text-[var(--muted)]">
                          {r.quoteName}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">
                      {formatYearMonthLabel(parseYearMonth(r.periodYm))}
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">
                      {r.kind === "STAFF_MONTH" ? "ЗП" : "Фрилансер"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(r.amount)}
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">
                      {formatPaidAt(r.paidAt)}
                      {r.paidByName ? ` · ${r.paidByName}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      {r.kind === "STAFF_MONTH" && canOpenUsers && r.userId ? (
                        <DirectoryCardLink href={`/users/${r.userId}`} />
                      ) : r.quoteId ? (
                        <DirectoryCardLink href={`/quotes/${r.quoteId}`} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function PayableTable({
  title,
  subtitle,
  rows,
  total,
  empty,
  selected,
  onToggleAll,
  onToggle,
  onPaid,
  busy,
  canOpenUsers,
  kind,
  highlightYm,
}: {
  title: string;
  subtitle: string;
  rows: QueueRow[];
  total: number;
  empty: string;
  selected: Set<string>;
  onToggleAll: (rows: QueueRow[]) => void;
  onToggle: (key: string) => void;
  onPaid: (key: string) => void;
  busy: boolean;
  canOpenUsers: boolean;
  kind: "staff" | "freelancer";
  highlightYm?: string;
}) {
  const all =
    rows.length > 0 && rows.every((r) => selected.has(r.sourceKey));
  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          <p className="mt-0.5 text-caption text-[var(--muted)]">{subtitle}</p>
        </div>
        <p className="text-sm tabular-nums">{formatMoney(total)}</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <div className="data-table-shell overflow-x-auto">
          <table className="data-table w-full text-left text-sm">
            <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={all}
                    onChange={() => onToggleAll(rows)}
                    aria-label="Выбрать все"
                  />
                </th>
                <th className="px-3 py-2">Кому</th>
                <th className="px-3 py-2">Период</th>
                {kind === "freelancer" ? (
                  <th className="px-3 py-2">Мероприятие</th>
                ) : (
                  <th className="px-3 py-2">Состав</th>
                )}
                <th className="px-3 py-2 text-right">Сумма</th>
                <th className="px-3 py-2">Оплачено</th>
                <th className="w-12 px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.sourceKey}
                  className={`border-t border-[var(--line)] ${
                    selected.has(r.sourceKey) ? "bg-[var(--selected)]/40" : ""
                  }`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(r.sourceKey)}
                      onChange={() => onToggle(r.sourceKey)}
                      aria-label={`Выбрать ${r.payeeName}`}
                    />
                  </td>
                  <td className="px-3 py-2">{r.payeeName}</td>
                  <td className="px-3 py-2 text-[var(--muted)]">
                    {formatYearMonthLabel(parseYearMonth(r.periodYm))}
                    {highlightYm && r.periodYm === highlightYm ? (
                      <span className="ml-2 text-caption text-[var(--accent)]">
                        прошлый
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-[var(--muted)]">
                    {kind === "freelancer" ? (
                      <>
                        {r.quoteName || "—"}
                        {r.quoteDate ? ` · ${r.quoteDate}` : ""}
                        {r.specialtyName ? (
                          <span className="block text-caption">
                            {r.specialtyName}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      staffHint(r) || "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(r.amount)}
                  </td>
                  <td className="px-3 py-2">
                    <label className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={false}
                        disabled={busy}
                        onChange={() => onPaid(r.sourceKey)}
                        aria-label={`Оплачено: ${r.payeeName}`}
                      />
                    </label>
                  </td>
                  <td className="px-3 py-2">
                    {kind === "staff" && canOpenUsers && r.userId ? (
                      <DirectoryCardLink href={`/users/${r.userId}`} />
                    ) : r.quoteId ? (
                      <DirectoryCardLink href={`/quotes/${r.quoteId}`} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
