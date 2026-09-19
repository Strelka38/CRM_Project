"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataCards, SortableTh, useTableSort } from "@/components/ui";
import { cn } from "@/lib/cn";
import {
  DirectoryAddButton,
  DirectoryCardLink,
  DirectoryCsvMenu,
  DirectoryMobileBar,
  DirectorySelectionActions,
  IconPlusFolder,
  downloadCsvExport,
  postBulkAction,
  uploadCsvImport,
} from "@/components/DirectoryToolbar";

type VenueRow = {
  id: string;
  name: string;
  address: string;
  mapUrl: string;
  active: boolean;
  _count?: { quotes: number; photos: number };
};

function venueSortValue(v: VenueRow, key: string) {
  switch (key) {
    case "name":
      return v.name;
    case "address":
      return v.address;
    case "photos":
      return v._count?.photos ?? 0;
    case "quotes":
      return v._count?.quotes ?? 0;
    case "status":
      return v.active ? 1 : 0;
    default:
      return null;
  }
}

export function VenuesAdmin() {
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const csvImportRef = useRef<HTMLInputElement>(null);
  const { sorted, sort, onSort } = useTableSort(venues, venueSortValue);

  async function load(search = q) {
    const params = new URLSearchParams();
    params.set("active", "0");
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/venues?${params}`);
    if (!res.ok) {
      setError("Не удалось загрузить площадки");
      setVenues([]);
      return;
    }
    const rows: VenueRow[] = await res.json();
    setVenues(rows);
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

  async function createVenue() {
    setError("");
    if (!name.trim()) {
      setError("Укажите название площадки");
      return;
    }
    const res = await fetch("/api/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, address, mapUrl }),
    });
    if (!res.ok) {
      setError("Не удалось создать площадку");
      return;
    }
    setName("");
    setAddress("");
    setMapUrl("");
    setShowCreate(false);
    void load(q);
  }

  async function patchVenue(id: string, data: Record<string, unknown>) {
    await fetch(`/api/venues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    void load(q);
  }

  function toggleAll() {
    const ids = venues.map((v) => v.id);
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
      await postBulkAction("/api/venues/bulk", action, [...selected]);
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
      setCsvMessage(await downloadCsvExport("/api/venues/csv"));
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
      setCsvMessage(await uploadCsvImport("/api/venues/csv", file));
      void load(q);
    } catch (e) {
      setCsvMessage(e instanceof Error ? e.message : "Не удалось импортировать");
    } finally {
      setCsvBusy(false);
    }
  }

  const allSelected =
    venues.length > 0 && venues.every((v) => selected.has(v.id));

  return (
    <div className="w-full px-4 py-6 md:px-6">
      <header className="animate-fade-up mb-5 md:mb-8">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          База данных
        </p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight md:text-3xl">
          Площадки
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Профили мест проведения для автоподбора в поле «Место» при составлении
          КП.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <DirectoryMobileBar
          q={q}
          onQ={setQ}
          searchPlaceholder="Название, адрес, комментарий…"
          primary={{
            label: showCreate ? "Скрыть форму" : "Добавить площадку",
            onClick: () => setShowCreate((v) => !v),
          }}
          sheetTitle="Площадки"
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
            title="+ Площадка"
            icon={<IconPlusFolder />}
            onClick={() => setShowCreate((v) => !v)}
          />
          <input
            type="search"
            className="field max-w-md py-1.5 text-sm"
            placeholder="Поиск по названию, адресу, комментарию…"
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
              <span className="text-[var(--muted)]">Название площадки</span>
              <input
                className="field mt-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Крокус Сити Холл, зал A…"
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="text-[var(--muted)]">Адрес</span>
              <input
                className="field mt-1"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
            <label className="text-sm md:col-span-2">
              <span className="text-[var(--muted)]">Ссылка на точку</span>
              <input
                className="field mt-1"
                value={mapUrl}
                onChange={(e) => setMapUrl(e.target.value)}
                placeholder="https://yandex.ru/maps/…"
              />
            </label>
            <button
              type="button"
              onClick={createVenue}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white md:col-span-2 md:w-fit"
            >
              Создать площадку
            </button>
          </div>
        ) : null}

        <div className="p-3 md:hidden">
          <DataCards
            items={sorted.map((v) => ({
              id: v.id,
              title: v.name,
              href: `/venues/${v.id}`,
              fields: [
                {
                  label: "Статус",
                  value: (
                    <button
                      type="button"
                      onClick={() => void patchVenue(v.id, { active: !v.active })}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-caption",
                        v.active
                          ? "border-[var(--accent)]/40 text-[var(--accent)]"
                          : "border-[var(--danger)]/40 text-[var(--danger)]",
                      )}
                    >
                      {v.active ? "Активна" : "Отключена"}
                    </button>
                  ),
                },
                // Адрес переносим целиком: обрезанный по ширине адрес
                // бесполезен, а именно по нему площадку и узнают.
                ...(v.address
                  ? [{ label: "Адрес", value: v.address, block: true }]
                  : []),
                {
                  label: "КП / фото",
                  value: (
                    <span className="tabular-nums">
                      {v._count?.quotes ?? 0} / {v._count?.photos ?? 0}
                    </span>
                  ),
                },
              ],
            }))}
            selectedIds={selected}
            onToggleSelect={toggleOne}
            emptyMessage="Площадок пока нет"
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
                  label="Площадка"
                  sortKey="name"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Адрес"
                  sortKey="address"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Фото"
                  sortKey="photos"
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
              {sorted.map((v) => (
                <tr
                  key={v.id}
                  className={`border-t border-[var(--line)] ${
                    selected.has(v.id) ? "bg-[var(--selected)]/40" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selected.has(v.id)}
                      onChange={() => toggleOne(v.id)}
                      aria-label={`Выбрать ${v.name}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-left">{v.name}</td>
                  <td className="px-3 py-2 text-left text-[var(--muted)]">
                    {v.address || "—"}
                  </td>
                  <td className="px-3 py-2 text-left tabular-nums">
                    {v._count?.photos ?? 0}
                  </td>
                  <td className="px-3 py-2 text-left tabular-nums">
                    {v._count?.quotes ?? 0}
                  </td>
                  <td className="px-3 py-2 text-left">
                    <button
                      type="button"
                      onClick={() => void patchVenue(v.id, { active: !v.active })}
                      className={
                        v.active ? "text-[var(--accent)]" : "text-[var(--danger)]"
                      }
                    >
                      {v.active ? "Активна" : "Отключена"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-left">
                    <DirectoryCardLink href={`/venues/${v.id}`} />
                  </td>
                </tr>
              ))}
              {venues.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-8 text-left text-[var(--muted)]"
                  >
                    Площадок пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Отключить площадки"
        message={`Отключить выбранные площадки (${selected.size})? КП не удаляются.`}
        confirmLabel="Отключить"
        busy={busy}
        onConfirm={() => void bulk("delete")}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
