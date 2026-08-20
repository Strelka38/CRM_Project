"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  DirectoryAddButton,
  DirectoryCardLink,
  DirectoryCsvMenu,
  DirectorySelectionActions,
  IconPlusDoc,
  downloadCsvExport,
  postBulkAction,
  uploadCsvImport,
} from "@/components/DirectoryToolbar";
import { CATALOG_OWNERS } from "@/lib/catalog-owner";

type Account = {
  id: string;
  label: string;
  bankName: string;
  account: string;
  isDefault: boolean;
};

type EntityRow = {
  id: string;
  shortName: string;
  inn: string;
  ogrnip: string;
  catalogOwner: string | null;
  active: boolean;
  sealPath: string | null;
  signaturePath: string | null;
  bankAccounts: Account[];
};

const OWNER_LABEL: Record<string, string> = Object.fromEntries(
  CATALOG_OWNERS.map((o) => [o.value, o.short]),
);

export function LegalEntitiesAdmin() {
  const [rows, setRows] = useState<EntityRow[]>([]);
  const [shortName, setShortName] = useState("");
  const [inn, setInn] = useState("");
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const csvImportRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch("/api/legal-entities?active=0");
    if (!res.ok) {
      setError("Не удалось загрузить юрлица");
      setRows([]);
      return;
    }
    const data: EntityRow[] = await res.json();
    setRows(data);
    setSelected((prev) => {
      const ids = new Set(data.map((r) => r.id));
      return new Set([...prev].filter((id) => ids.has(id)));
    });
  }

  useEffect(() => {
    void load();
  }, []);

  async function createEntity() {
    setError("");
    if (!shortName.trim() || !inn.trim()) {
      setError("Укажите наименование и ИНН");
      return;
    }
    const res = await fetch("/api/legal-entities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortName, inn }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Не удалось создать");
      return;
    }
    setShortName("");
    setInn("");
    setShowCreate(false);
    void load();
  }

  function toggleAll() {
    const ids = rows.map((r) => r.id);
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

  async function bulkDelete() {
    if (selected.size === 0) return;
    setBusy(true);
    setError("");
    try {
      await postBulkAction("/api/legal-entities/bulk", "delete", [...selected]);
      setSelected(new Set());
      setConfirmDelete(false);
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
      setCsvMessage(await downloadCsvExport("/api/legal-entities/csv"));
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
      setCsvMessage(await uploadCsvImport("/api/legal-entities/csv", file));
      void load();
    } catch (e) {
      setCsvMessage(e instanceof Error ? e.message : "Не удалось импортировать");
    } finally {
      setCsvBusy(false);
    }
  }

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="w-full px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          База данных
        </p>
        <h1 className="mt-1 text-3xl font-light tracking-tight">Юрлица</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Реквизиты исполнителей для договора, счёта и акта. Рядом с тегами склада
          ШМ / ДК / NE, не вместо них.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex w-full items-center gap-2 border-b border-[var(--line)] px-4 py-3">
          <DirectoryAddButton
            title="+ Юрлицо"
            icon={<IconPlusDoc />}
            onClick={() => setShowCreate((v) => !v)}
          />
          <div className="ml-auto flex items-center gap-1">
            <DirectorySelectionActions
              count={selected.size}
              disabled={busy}
              onDelete={() => setConfirmDelete(true)}
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

        {showCreate ? (
          <div className="grid gap-3 border-b border-[var(--line)] p-4 md:grid-cols-2">
            <label className="text-sm">
              <span className="text-[var(--muted)]">Наименование</span>
              <input
                className="field mt-1"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="ИП …"
              />
            </label>
            <label className="text-sm">
              <span className="text-[var(--muted)]">ИНН</span>
              <input
                className="field mt-1"
                value={inn}
                onChange={(e) => setInn(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => void createEntity()}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white md:w-fit"
            >
              Создать
            </button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="w-10 px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Выбрать все"
                  />
                </th>
                <th className="px-3 py-2 text-left">Контора</th>
                <th className="px-3 py-2 text-left">ИНН</th>
                <th className="px-3 py-2 text-left">Склад</th>
                <th className="px-3 py-2 text-left">Счета</th>
                <th className="px-3 py-2 text-left">Факсимиле</th>
                <th className="w-12 px-3 py-2 text-left" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-t border-[var(--line)] ${
                    selected.has(row.id) ? "bg-[var(--selected)]/40" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      aria-label={`Выбрать ${row.shortName}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-left">
                    {row.shortName}
                    {!row.active && (
                      <span className="ml-2 text-xs text-[var(--muted)]">выкл</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-left font-mono text-xs">{row.inn}</td>
                  <td className="px-3 py-2 text-left">
                    {row.catalogOwner
                      ? OWNER_LABEL[row.catalogOwner] || row.catalogOwner
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-left text-xs text-[var(--muted)]">
                    {row.bankAccounts
                      .map((a) => a.label || a.account.slice(-4))
                      .join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-left text-xs">
                    {row.sealPath ? "печать" : ""}
                    {row.sealPath && row.signaturePath ? " · " : ""}
                    {row.signaturePath ? "подпись" : ""}
                    {!row.sealPath && !row.signaturePath ? "—" : ""}
                  </td>
                  <td className="px-3 py-2 text-left">
                    <DirectoryCardLink href={`/legal-entities/${row.id}`} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="px-3 py-6 text-left text-[var(--muted)]" colSpan={7}>
                    Пока пусто — создайте карточку или импортируйте CSV.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Отключить юрлица"
        message={`Отключить выбранные карточки (${selected.size})?`}
        confirmLabel="Отключить"
        busy={busy}
        onConfirm={() => void bulkDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
