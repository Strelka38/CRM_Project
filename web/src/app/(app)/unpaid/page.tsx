"use client";

import { useEffect, useRef, useState } from "react";
import {
  EmptyState,
  PageHeader,
  PaymentFlags,
  StatusBadge,
  type LifecycleStatus,
  LIFECYCLE_LABELS,
} from "@/components/ui";
import {
  DirectoryCardLink,
  DirectoryCsvMenu,
  DirectoryIconButton,
  DirectorySelectionActions,
  IconCheck,
  downloadCsvExport,
  postBulkAction,
  uploadCsvImport,
} from "@/components/DirectoryToolbar";

type Quote = {
  id: string;
  proposalNumber: string;
  eventName: string;
  client: string;
  date: string;
  invoiceSent: boolean;
  paid: boolean;
  paymentComment: string;
  lifecycle: string;
};

export default function UnpaidPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const [error, setError] = useState("");
  const csvImportRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/quotes?unpaid=1");
    const data: unknown = await res.json().catch(() => []);
    const rows = Array.isArray(data) ? (data as Quote[]) : [];
    setQuotes(rows);
    setSelected((prev) => {
      const ids = new Set(rows.map((r) => r.id));
      return new Set([...prev].filter((id) => ids.has(id)));
    });
  }

  useEffect(() => {
    void load();
  }, []);

  async function patch(id: string, data: Record<string, unknown>) {
    await fetch(`/api/quotes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    void load();
  }

  function toggleAll() {
    const ids = quotes.map((q) => q.id);
    const all = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected(all ? new Set() : new Set(ids));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulk(action: "paid" | "invoice") {
    if (selected.size === 0) return;
    setBusy(true);
    setError("");
    try {
      await postBulkAction("/api/quotes/bulk", action, [...selected]);
      setSelected(new Set());
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить");
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setCsvBusy(true);
    setCsvMessage("");
    try {
      setCsvMessage(await downloadCsvExport("/api/quotes/csv?unpaid=1"));
    } catch (e) {
      setCsvMessage(e instanceof Error ? e.message : "Не удалось экспортировать");
    } finally {
      setCsvBusy(false);
    }
  }

  async function importCsv(file: File) {
    setCsvBusy(true);
    setCsvMessage("");
    try {
      setCsvMessage(await uploadCsvImport("/api/quotes/csv", file));
      void load();
    } catch (e) {
      setCsvMessage(e instanceof Error ? e.message : "Не удалось импортировать");
    } finally {
      setCsvBusy(false);
    }
  }

  const allSelected =
    quotes.length > 0 && quotes.every((q) => selected.has(q.id));

  return (
    <div className="w-full px-4 py-6 md:px-6">
      <PageHeader
        title="Неоплаченные проекты"
        subtitle="Подтверждённые мероприятия после даты проведения — контроль оплаты"
      />

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex w-full items-center gap-2 border-b border-[var(--line)] px-4 py-3">
          <div className="ml-auto flex items-center gap-1">
            <DirectorySelectionActions
              count={selected.size}
              disabled={busy}
              extra={
                <>
                  <DirectoryIconButton
                    title="Счёт отправлен"
                    disabled={busy}
                    onClick={() => void bulk("invoice")}
                  >
                    <IconCheck />
                  </DirectoryIconButton>
                  <DirectoryIconButton
                    title="Отметить оплаченными"
                    disabled={busy}
                    onClick={() => void bulk("paid")}
                    className="text-[var(--accent)]"
                  >
                    <IconCheck />
                  </DirectoryIconButton>
                </>
              }
            />
            <DirectoryCsvMenu
              busy={csvBusy}
              onExport={() => void exportCsv()}
              onImport={() => csvImportRef.current?.click()}
            />
          </div>
          <input
            ref={csvImportRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importCsv(file);
            }}
          />
        </div>
        {csvMessage ? (
          <p className="border-b border-[var(--line)] px-4 py-2 text-xs text-[var(--muted)]">
            {csvMessage}
          </p>
        ) : null}
        {error ? (
          <p className="border-b border-[var(--line)] px-4 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        {quotes.length === 0 ? (
          <EmptyState
            title="Список пуст"
            description="Неоплаченных проектов сейчас нет"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--table-head)] text-[11px] uppercase tracking-wider text-[var(--muted)]">
                <tr>
                  <th className="w-10 px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Выбрать все"
                    />
                  </th>
                  <th className="px-3 py-2 text-left">КП</th>
                  <th className="px-3 py-2 text-left">Дата</th>
                  <th className="px-3 py-2 text-left">Клиент</th>
                  <th className="px-3 py-2 text-left">Статус</th>
                  <th className="px-3 py-2 text-left">Оплата</th>
                  <th className="w-12 px-3 py-2 text-left" />
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr
                    key={q.id}
                    className={`border-t border-[var(--line)] transition-colors hover:bg-subtle ${
                      selected.has(q.id) ? "bg-[var(--selected)]/40" : ""
                    }`}
                  >
                    <td className="px-3 py-2 text-left">
                      <input
                        type="checkbox"
                        checked={selected.has(q.id)}
                        onChange={() => toggleOne(q.id)}
                        aria-label={`Выбрать № ${q.proposalNumber}`}
                      />
                    </td>
                    <td className="px-3 py-2 text-left">
                      № {q.proposalNumber}
                      {q.eventName ? ` — ${q.eventName}` : ""}
                    </td>
                    <td className="px-3 py-2 text-left text-[var(--muted)]">
                      {q.date || "—"}
                    </td>
                    <td className="px-3 py-2 text-left">{q.client || "—"}</td>
                    <td className="px-3 py-2 text-left">
                      {q.lifecycle in LIFECYCLE_LABELS ? (
                        <StatusBadge status={q.lifecycle as LifecycleStatus} />
                      ) : (
                        q.lifecycle
                      )}
                    </td>
                    <td className="px-3 py-2 text-left">
                      <PaymentFlags
                        invoiceSent={q.invoiceSent}
                        paid={q.paid}
                        paymentComment={q.paymentComment || ""}
                        onChange={(data) => patch(q.id, data)}
                      />
                    </td>
                    <td className="px-3 py-2 text-left">
                      <DirectoryCardLink href={`/quotes/${q.id}`} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mt-3 text-xs text-[var(--muted)]">
        Красный — не оплачено · Жёлтый — счёт отправлен · Зелёный — оплачено
        (можно указать «наличкой»)
      </p>
    </div>
  );
}
