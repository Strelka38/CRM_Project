"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  DirectoryAddButton,
  DirectoryCardLink,
  DirectoryCsvMenu,
  DirectorySelectionActions,
  IconPlusDoc,
  IconPlusPerson,
  downloadCsvExport,
  postBulkAction,
  uploadCsvImport,
} from "@/components/DirectoryToolbar";
import { LegalCardImport } from "@/components/LegalCardImport";

type ClientRow = {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  inn: string;
  active: boolean;
  _count?: { quotes: number };
};

export function ClientsAdmin() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showCardImport, setShowCardImport] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const csvImportRef = useRef<HTMLInputElement>(null);

  async function load(search = q) {
    const params = new URLSearchParams();
    params.set("active", "0");
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/clients?${params}`);
    if (!res.ok) {
      setError("Не удалось загрузить клиентов");
      setClients([]);
      return;
    }
    const rows: ClientRow[] = await res.json();
    setClients(rows);
    setSelected((prev) => {
      const ids = new Set(rows.map((r) => r.id));
      return new Set([...prev].filter((id) => ids.has(id)));
    });
  }

  useEffect(() => {
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function createClient() {
    setError("");
    if (!companyName.trim()) {
      setError("Укажите название компании");
      return;
    }
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName, contactName, phone, email }),
    });
    if (!res.ok) {
      setError("Не удалось создать клиента");
      return;
    }
    setCompanyName("");
    setContactName("");
    setPhone("");
    setEmail("");
    setShowCreate(false);
    void load(q);
  }

  async function patchClient(id: string, data: Record<string, unknown>) {
    await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    void load(q);
  }

  function toggleAll() {
    const ids = clients.map((c) => c.id);
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

  async function bulk(action: "delete" | "copy") {
    if (selected.size === 0) return;
    setBusy(true);
    setError("");
    try {
      await postBulkAction("/api/clients/bulk", action, [...selected]);
      setSelected(new Set());
      setConfirmDelete(false);
      void load(q);
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
      setCsvMessage(await downloadCsvExport("/api/clients/csv"));
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
      setCsvMessage(await uploadCsvImport("/api/clients/csv", file));
      void load(q);
    } catch (e) {
      setCsvMessage(e instanceof Error ? e.message : "Не удалось импортировать");
    } finally {
      setCsvBusy(false);
    }
  }

  const allSelected =
    clients.length > 0 && clients.every((c) => selected.has(c.id));

  return (
    <div className="w-full px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          База данных
        </p>
        <h1 className="mt-1 text-3xl font-light tracking-tight">Клиенты</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Профили заказчиков для КП и статистики прибыльности проектов.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex w-full items-center gap-2 border-b border-[var(--line)] px-4 py-3">
          <DirectoryAddButton
            title="+ Клиент"
            icon={<IconPlusPerson />}
            onClick={() => setShowCreate((v) => !v)}
          />
          <DirectoryAddButton
            title="Карточка предприятия"
            icon={<IconPlusDoc />}
            onClick={() => setShowCardImport((v) => !v)}
          />
          <input
            type="search"
            className="field max-w-md py-1.5 text-sm"
            placeholder="Поиск по компании, контакту, телефону, ИНН…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="ml-auto flex items-center gap-1">
            <DirectorySelectionActions
              count={selected.size}
              disabled={busy}
              onDelete={() => setConfirmDelete(true)}
              onCopy={() => void bulk("copy")}
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
            <label className="text-sm md:col-span-2">
              <span className="text-[var(--muted)]">Название компании</span>
              <input
                className="field mt-1"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-[var(--muted)]">Контактное лицо</span>
              <input
                className="field mt-1"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-[var(--muted)]">Телефон</span>
              <input
                className="field mt-1"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="text-[var(--muted)]">Email</span>
              <input
                type="email"
                className="field mt-1"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={createClient}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white md:col-span-2 md:w-fit"
            >
              Создать клиента
            </button>
          </div>
        ) : null}

        {showCardImport ? (
          <div className="border-b border-[var(--line)] p-4">
            <LegalCardImport
              confirmLabel="Создать клиента"
              onConfirm={async (patch) => {
                if (!patch.companyName?.trim()) {
                  throw new Error(
                    "Нет наименования — укажите компанию в карточке или создайте клиента вручную",
                  );
                }
                const res = await fetch("/api/clients", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(patch),
                });
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  throw new Error(
                    typeof data.error === "string"
                      ? data.error
                      : "Не удалось создать клиента",
                  );
                }
                setShowCardImport(false);
                void load(q);
              }}
            />
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
                <th className="px-3 py-2 text-left">Компания</th>
                <th className="px-3 py-2 text-left">Контакт</th>
                <th className="px-3 py-2 text-left">Телефон</th>
                <th className="px-3 py-2 text-left">КП</th>
                <th className="px-3 py-2 text-left">Статус</th>
                <th className="w-12 px-3 py-2 text-left" />
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr
                  key={c.id}
                  className={`border-t border-[var(--line)] ${
                    selected.has(c.id) ? "bg-[var(--selected)]/40" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleOne(c.id)}
                      aria-label={`Выбрать ${c.companyName}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-left">
                    {c.companyName}
                    {c.inn ? (
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        ИНН {c.inn}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-left">{c.contactName || "—"}</td>
                  <td className="px-3 py-2 text-left">{c.phone || "—"}</td>
                  <td className="px-3 py-2 text-left tabular-nums">
                    {c._count?.quotes ?? 0}
                  </td>
                  <td className="px-3 py-2 text-left">
                    <button
                      type="button"
                      onClick={() => void patchClient(c.id, { active: !c.active })}
                      className={
                        c.active ? "text-[var(--accent)]" : "text-[var(--danger)]"
                      }
                    >
                      {c.active ? "Активен" : "Отключён"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-left">
                    <DirectoryCardLink href={`/clients/${c.id}`} />
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-left text-[var(--muted)]"
                  >
                    Клиентов пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Отключить клиентов"
        message={`Отключить выбранные карточки (${selected.size})? КП не удаляются.`}
        confirmLabel="Отключить"
        busy={busy}
        onConfirm={() => void bulk("delete")}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
