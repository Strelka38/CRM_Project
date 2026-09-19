"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataCards, SortableTh, useTableSort } from "@/components/ui";
import {
  DirectoryAddButton,
  DirectoryCardLink,
  DirectoryCsvMenu,
  DirectoryMobileBar,
  DirectorySelectionActions,
  IconPlusPerson,
  downloadCsvExport,
  postBulkAction,
  uploadCsvImport,
} from "@/components/DirectoryToolbar";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

type FreelancerRow = {
  id: string;
  name: string;
  comment: string;
  active: boolean;
  assignmentCount: number;
  eventCount: number;
  totalPay: number;
  specialties?: Array<{ id: string; name: string }>;
};

function freelancerSortValue(r: FreelancerRow, key: string) {
  switch (key) {
    case "name":
      return r.name;
    case "shifts":
      return r.assignmentCount;
    case "quotes":
      return r.eventCount;
    case "pay":
      return r.totalPay;
    case "status":
      return r.active ? 1 : 0;
    default:
      return null;
  }
}

export function FreelancersAdmin() {
  const [rows, setRows] = useState<FreelancerRow[]>([]);
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const csvImportRef = useRef<HTMLInputElement>(null);
  const { sorted, sort, onSort } = useTableSort(rows, freelancerSortValue);

  async function load(search = q) {
    const params = new URLSearchParams();
    params.set("active", "0");
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/freelancers?${params}`);
    if (!res.ok) {
      setError("Не удалось загрузить фрилансеров");
      setRows([]);
      return;
    }
    const list: FreelancerRow[] = await res.json();
    setRows(list);
    setSelected((prev) => {
      const ids = new Set(list.map((r) => r.id));
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

  async function createFreelancer() {
    setError("");
    if (!name.trim()) {
      setError("Укажите ФИО");
      return;
    }
    const res = await fetch("/api/freelancers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, comment }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string"
          ? data.error
          : "Не удалось создать фрилансера",
      );
      return;
    }
    setName("");
    setComment("");
    setShowCreate(false);
    void load(q);
  }

  async function patchFreelancer(id: string, data: Record<string, unknown>) {
    await fetch(`/api/freelancers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    void load(q);
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

  async function bulk(action: "delete" | "copy") {
    if (selected.size === 0) return;
    setBusy(true);
    setError("");
    try {
      await postBulkAction("/api/freelancers/bulk", action, [...selected]);
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
      setCsvMessage(await downloadCsvExport("/api/freelancers/csv"));
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
      setCsvMessage(await uploadCsvImport("/api/freelancers/csv", file));
      void load(q);
    } catch (e) {
      setCsvMessage(e instanceof Error ? e.message : "Не удалось импортировать");
    } finally {
      setCsvBusy(false);
    }
  }

  const allSelected =
    rows.length > 0 && rows.every((r) => selected.has(r.id));

  return (
    <div className="w-full px-4 py-6 md:px-6">
      <header className="animate-fade-up mb-5 md:mb-8">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          База данных
        </p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight md:text-3xl">
          Фрилансеры
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Справочник ФИО для автоподбора в смете и статистика выплат по
          назначениям.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <DirectoryMobileBar
          q={q}
          onQ={setQ}
          searchPlaceholder="Поиск по ФИО…"
          primary={{
            label: showCreate ? "Скрыть форму" : "Добавить фрилансера",
            onClick: () => setShowCreate((v) => !v),
          }}
          sheetTitle="Фрилансеры"
          csv={{
            busy: csvBusy,
            onExport: () => void exportCsv(),
            onImport: () => csvImportRef.current?.click(),
          }}
          selection={{
            count: selected.size,
            busy,
            onCopy: () => void bulk("copy"),
            onDelete: () => setConfirmDelete(true),
          }}
        />

        <div className="hidden w-full items-center gap-2 border-b border-[var(--line)] px-4 py-3 md:flex">
          <DirectoryAddButton
            title="+ Фрилансер"
            icon={<IconPlusPerson />}
            onClick={() => setShowCreate((v) => !v)}
          />
          <input
            type="search"
            className="field max-w-md py-1.5 text-sm"
            placeholder="Поиск по ФИО…"
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
              <span className="text-[var(--muted)]">ФИО</span>
              <input
                className="field mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Иванов Алексей"
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="text-[var(--muted)]">Комментарий</span>
              <input
                className="field mt-1"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={() => void createFreelancer()}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white md:col-span-2 md:w-fit"
            >
              Создать фрилансера
            </button>
          </div>
        ) : null}

        <div className="p-3 md:hidden">
          <DataCards
            items={sorted.map((r) => ({
              id: r.id,
              title: r.name,
              subtitle: r.specialties?.length
                ? r.specialties.map((s) => s.name).join(" · ")
                : r.comment || undefined,
              href: `/freelancers/${r.id}`,
              fields: [
                {
                  label: "Статус",
                  value: (
                    <button
                      type="button"
                      onClick={() =>
                        void patchFreelancer(r.id, { active: !r.active })
                      }
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-caption",
                        r.active
                          ? "border-[var(--accent)]/40 text-[var(--accent)]"
                          : "border-[var(--danger)]/40 text-[var(--danger)]",
                      )}
                    >
                      {r.active ? "Активен" : "Отключён"}
                    </button>
                  ),
                },
                {
                  label: "Смены / КП",
                  value: (
                    <span className="tabular-nums">
                      {r.assignmentCount} / {r.eventCount}
                    </span>
                  ),
                },
                ...(r.totalPay > 0
                  ? [
                      {
                        label: "Выплаты",
                        value: (
                          <span className="tabular-nums">
                            {formatMoney(r.totalPay)}
                          </span>
                        ),
                      },
                    ]
                  : []),
              ],
            }))}
            selectedIds={selected}
            onToggleSelect={toggleOne}
            emptyMessage="Фрилансеров пока нет"
          />
        </div>

        <div className="data-table-shell hidden overflow-x-auto md:block">
          <table className="data-table w-full text-left text-sm">
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
                <SortableTh
                  label="ФИО"
                  sortKey="name"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Смены"
                  sortKey="shifts"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="КП"
                  sortKey="quotes"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Выплаты"
                  sortKey="pay"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                  align="right"
                />
                <SortableTh
                  label="Статус"
                  sortKey="status"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <th className="w-12 px-3 py-2 text-left" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.id}
                  className={`border-t border-[var(--line)] ${
                    selected.has(r.id) ? "bg-[var(--selected)]/40" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      aria-label={`Выбрать ${r.name}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-left">
                    {r.name}
                    {r.comment ? (
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        {r.comment}
                      </span>
                    ) : null}
                    {r.specialties && r.specialties.length > 0 ? (
                      <span className="mt-0.5 block text-xs text-[var(--muted)]">
                        {r.specialties.map((s) => s.name).join(" · ")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-left tabular-nums">
                    {r.assignmentCount}
                  </td>
                  <td className="px-3 py-2 text-left tabular-nums">
                    {r.eventCount}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.totalPay > 0 ? formatMoney(r.totalPay) : "—"}
                  </td>
                  <td className="px-3 py-2 text-left">
                    <button
                      type="button"
                      onClick={() =>
                        void patchFreelancer(r.id, { active: !r.active })
                      }
                      className={
                        r.active
                          ? "text-[var(--accent)]"
                          : "text-[var(--danger)]"
                      }
                    >
                      {r.active ? "Активен" : "Отключён"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-left">
                    <DirectoryCardLink href={`/freelancers/${r.id}`} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-left text-[var(--muted)]"
                  >
                    Фрилансеров пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Отключить фрилансеров"
        message={`Отключить выбранные карточки (${selected.size})? Назначения в сметах не удаляются.`}
        confirmLabel="Отключить"
        busy={busy}
        onConfirm={() => void bulk("delete")}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
