"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataCards, SortableTh, useTableSort } from "@/components/ui";
import {
  DirectoryAddButton,
  DirectoryCsvMenu,
  DirectoryIconButton,
  DirectoryMobileBar,
  DirectorySelectionActions,
  IconPlusFolder,
  IconEdit,
  downloadCsvExport,
  postBulkAction,
  uploadCsvImport,
} from "@/components/DirectoryToolbar";
import {
  KitEditorModal,
  type EditableKit,
} from "@/components/KitEditorModal";
import { formatMoney } from "@/lib/format";

type Category = {
  id: string;
  name: string;
  path: string;
};

type Kit = EditableKit & {
  computedPrice: number;
  category?: { id: string; name: string; path: string } | null;
};

function kitSortValue(kit: Kit, key: string) {
  switch (key) {
    case "name":
      return kit.name;
    case "category":
      return kit.category?.path || "";
    case "parts":
      return kit.components.length;
    case "price":
      return kit.computedPrice;
    default:
      return null;
  }
}

export function KitsAdmin() {
  const [kits, setKits] = useState<Kit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<EditableKit | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const csvImportRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [kitsRes, catsRes] = await Promise.all([
      fetch("/api/kits"),
      fetch("/api/catalog/categories?tree=1"),
    ]);
    if (!kitsRes.ok) {
      setError("Не удалось загрузить комплекты");
      setKits([]);
      return;
    }
    const rows: Kit[] = await kitsRes.json();
    setKits(Array.isArray(rows) ? rows : []);
    setCategories(await catsRes.json());
    setSelected((prev) => {
      const ids = new Set(rows.map((r) => r.id));
      return new Set([...prev].filter((id) => ids.has(id)));
    });
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedCategory = categories.find((c) => c.id === categoryId) || null;
  const filtered = kits.filter((k) => {
    const needle = q.trim().toLowerCase();
    if (!needle) return true;
    return (
      k.name.toLowerCase().includes(needle) ||
      (k.category?.path || "").toLowerCase().includes(needle)
    );
  });
  const { sorted, sort, onSort } = useTableSort(filtered, kitSortValue);

  function toggleAll() {
    const ids = filtered.map((k) => k.id);
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
      await postBulkAction("/api/kits/bulk", action, [...selected]);
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
      setCsvMessage(await downloadCsvExport("/api/kits/csv"));
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
      setCsvMessage(await uploadCsvImport("/api/kits/csv", file));
      void load();
    } catch (e) {
      setCsvMessage(e instanceof Error ? e.message : "Не удалось импортировать");
    } finally {
      setCsvBusy(false);
    }
  }

  const allSelected =
    filtered.length > 0 && filtered.every((k) => selected.has(k.id));

  return (
    <div className="w-full px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          Склад
        </p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight md:text-3xl">
          Комплекты
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Набор из существующих позиций каталога. В смету добавляется целиком
          и разворачивается в строки.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <DirectoryMobileBar
          q={q}
          onQ={setQ}
          searchPlaceholder="Поиск по комплектам…"
          filter={
            <label className="block text-caption uppercase tracking-[0.04em] text-[var(--muted)]">
              Раздел для нового комплекта
              <select
                className="field mt-1 w-full text-sm"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Без раздела</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.path}
                  </option>
                ))}
              </select>
            </label>
          }
          primary={{
            label: "Добавить комплект",
            onClick: () => {
              setEditingKit(null);
              setEditorOpen(true);
            },
          }}
          sheetTitle="Комплекты"
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

        <div className="hidden w-full flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3 md:flex">
          <DirectoryAddButton
            title="+ Комплект"
            icon={<IconPlusFolder />}
            onClick={() => {
              setEditingKit(null);
              setEditorOpen(true);
            }}
          />
          <select
            className="field max-w-xs py-1.5 text-sm"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            title="Раздел для нового комплекта"
          >
            <option value="">Без раздела</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.path}
              </option>
            ))}
          </select>
          <input
            type="search"
            className="field max-w-md py-1.5 text-sm"
            placeholder="Поиск…"
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

        <div className="p-3 md:hidden">
          <DataCards
            items={sorted.map((kit) => ({
              id: kit.id,
              title: kit.name,
              subtitle: kit.category?.path,
              onPress: () => {
                setEditingKit(kit);
                setEditorOpen(true);
              },
              fields: [
                {
                  label: "Цена",
                  value: (
                    <span className="tabular-nums">
                      {formatMoney(kit.computedPrice)}
                    </span>
                  ),
                },
                {
                  label: `Состав · ${kit.components.length}`,
                  value:
                    kit.components
                      .slice(0, 4)
                      .map((c) => `${c.qty}× ${c.catalogItem.name}`)
                      .join(" · ") +
                    (kit.components.length > 4 ? " …" : ""),
                  block: true,
                },
              ],
            }))}
            selectedIds={selected}
            onToggleSelect={toggleOne}
            emptyMessage="Комплектов пока нет"
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
                  label="Название"
                  sortKey="name"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Раздел"
                  sortKey="category"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Позиций"
                  sortKey="parts"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Цена"
                  sortKey="price"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <th className="w-12 px-3 py-2 text-left" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((kit) => (
                <tr
                  key={kit.id}
                  className={`border-t border-[var(--line)] ${
                    selected.has(kit.id) ? "bg-[var(--selected)]/40" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selected.has(kit.id)}
                      onChange={() => toggleOne(kit.id)}
                      aria-label={`Выбрать ${kit.name}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-left">
                    <button
                      type="button"
                      className="text-left font-medium text-[var(--ink)] hover:underline"
                      onClick={() => {
                        setEditingKit(kit);
                        setEditorOpen(true);
                      }}
                    >
                      {kit.name}
                    </button>
                    <p className="text-xs text-[var(--muted)]">
                      {kit.components
                        .slice(0, 3)
                        .map((c) => `${c.qty}× ${c.catalogItem.name}`)
                        .join(" · ")}
                      {kit.components.length > 3 ? "…" : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-left text-[var(--muted)]">
                    {kit.category?.path || "—"}
                  </td>
                  <td className="px-3 py-2 text-left tabular-nums">
                    {kit.components.length}
                  </td>
                  <td className="px-3 py-2 text-left tabular-nums">
                    {formatMoney(kit.computedPrice)}
                  </td>
                  <td className="px-3 py-2 text-left">
                    <DirectoryIconButton
                      title="Редактировать"
                      onClick={() => {
                        setEditingKit(kit);
                        setEditorOpen(true);
                      }}
                    >
                      <IconEdit />
                    </DirectoryIconButton>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-left text-[var(--muted)]">
                    Комплектов пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <KitEditorModal
        open={editorOpen}
        categoryId={editingKit?.categoryId ?? (categoryId || null)}
        categoryPath={
          editingKit
            ? categories.find((c) => c.id === editingKit.categoryId)?.path
            : selectedCategory?.path
        }
        categories={categories}
        kit={editingKit}
        onClose={() => {
          setEditorOpen(false);
          setEditingKit(null);
        }}
        onSaved={() => void load()}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Отключить комплекты"
        message={`Отключить выбранные комплекты (${selected.size})?`}
        confirmLabel="Отключить"
        busy={busy}
        onConfirm={() => void bulk("delete")}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
