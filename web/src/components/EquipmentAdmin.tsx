"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import {
  ItemDrawer,
  type DrawerItem,
  type DrawerItemPatch,
} from "@/components/ItemDrawer";
import { inferCatalogOwners, normalizeOwners } from "@/lib/catalog-owner";

type Row = {
  id: string;
  name: string;
  model: string | null;
  stockQty: number;
  equipmentCode: number | null;
  photoPath: string | null;
  category: { id: string; path: string; name: string } | null;
  _count: { equipmentUnits: number };
};

type Category = {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  kind: string;
  active: boolean;
  _count: { items: number; children: number };
};

export function EquipmentAdmin() {
  const [items, setItems] = useState<Row[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncInfo, setSyncInfo] = useState("");
  const [drawer, setDrawer] = useState<DrawerItem | null>(null);
  const csvImportRef = useRef<HTMLInputElement>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");

  async function loadCats() {
    const res = await fetch("/api/catalog/categories?tree=1", {
      credentials: "same-origin",
    });
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) setCategories(data);
  }

  async function load(search = q, path = selectedPath) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (path.trim()) params.set("path", path.trim());
      const res = await fetch(`/api/equipment?${params}`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Не удалось загрузить список (${res.status})`);
        setItems([]);
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        setError("Некорректный ответ сервера");
        setItems([]);
        return;
      }
      setItems(data);
    } catch {
      setError("Не удалось загрузить список");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  async function downloadCsv(url: string, fallbackName: string) {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Не удалось экспортировать");
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download =
      res.headers
        .get("Content-Disposition")
        ?.match(/filename="([^"]+)"/)?.[1] || fallbackName;
    a.click();
    URL.revokeObjectURL(href);
  }

  async function exportCsv() {
    setCsvBusy(true);
    setCsvMessage("");
    try {
      await downloadCsv("/api/equipment/export", "warehouse.csv");
      await downloadCsv("/api/equipment/export?kind=units", "warehouse-units.csv");
      setCsvMessage("Скачаны типы и единицы склада");
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
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/equipment/import", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCsvMessage(data.error || "Не удалось импортировать");
        return;
      }
      const kindLabel = data.kind === "units" ? "единиц" : "типов";
      const errHint =
        data.errorCount > 0 ? ` · ошибок: ${data.errorCount}` : "";
      setCsvMessage(
        `Импорт ${kindLabel}: создано ${data.created}, обновлено ${data.updated}${errHint}`,
      );
      await loadCats();
      await load(q, selectedPath);
    } catch {
      setCsvMessage("Не удалось импортировать");
    } finally {
      setCsvBusy(false);
    }
  }

  async function addType() {
    const cat =
      categories.find((c) => c.path === selectedPath) ||
      categories.find((c) => !c.parentId);
    if (!cat) {
      setError("Сначала выберите раздел слева");
      return;
    }
    setError("");
    const res = await fetch("/api/catalog/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: cat.id,
        name: "Новый тип оборудования",
        basePrice: 0,
        stockQty: 0,
        itemKind: "EQUIPMENT",
        owners: inferCatalogOwners(cat.path, "Новый тип оборудования"),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось создать тип");
      return;
    }
    const created = (await res.json()) as DrawerItem;
    setDrawer({
      ...created,
      owners: normalizeOwners(created.owners, created.owner),
      category: created.category ?? { name: cat.name, path: cat.path },
      itemKind: created.itemKind || "EQUIPMENT",
      dayMode: created.dayMode || "HALF_EXTRA",
    });
    await load(q, selectedPath);
  }

  async function saveDrawer(id: string, data: DrawerItemPatch) {
    const res = await fetch(`/api/catalog/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error || "Не удалось сохранить");
      return;
    }
    const updated = (await res.json()) as DrawerItem;
    setDrawer((prev) => (prev?.id === id ? { ...prev, ...updated } : prev));
    await load(q, selectedPath);
  }

  async function syncFromCatalog() {
    setSyncing(true);
    setSyncInfo("");
    setError("");
    try {
      const res = await fetch("/api/equipment", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ syncAll: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Не удалось синхронизировать");
        return;
      }
      setSyncInfo(
        `Готово: позиций ${data.items}, новых ID ${data.codesAssigned}, новых единиц ${data.unitsCreated}`,
      );
      await load(q, selectedPath);
    } catch {
      setError("Не удалось синхронизировать");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    void loadCats();
    void load("", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q, selectedPath), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, selectedPath]);

  const byParent = useMemo(() => {
    const map = new Map<string | null, Category[]>();
    for (const c of categories) {
      const key = c.parentId;
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    return map;
  }, [categories]);

  const roots = byParent.get(null) ?? [];

  function toggleExpand(path: string, e: MouseEvent) {
    e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderNode(
    cat: Category,
    depth: number,
    isLast = true,
    isFirst = true,
    ancestorContinue: boolean[] = [],
  ) {
    const TREE_INDENT = 18;
    const GUIDE_X = 10;
    const kids = byParent.get(cat.id) ?? [];
    const hasKids = kids.length > 0;
    const isOpen = expanded.has(cat.path);
    const isSelected = selectedPath === cat.path;
    const parentLevel = depth - 1;
    const guideLeft = parentLevel * TREE_INDENT + GUIDE_X;
    const elbowWidth = TREE_INDENT - 2;

    return (
      <div key={cat.id} className="relative">
        {depth > 0 && (
          <>
            {ancestorContinue.map((cont, level) =>
              cont ? (
                <span
                  key={`anc-${level}`}
                  className="catalog-tree-guide"
                  style={{
                    left: level * TREE_INDENT + GUIDE_X,
                    top: 0,
                    bottom: 0,
                    width: 1,
                  }}
                  aria-hidden
                />
              ) : null,
            )}
            <span
              className="catalog-tree-guide"
              style={{
                left: guideLeft,
                top: isFirst ? -6 : 0,
                width: 1,
                height: isLast
                  ? isFirst
                    ? "calc(50% + 6px)"
                    : "50%"
                  : isFirst
                    ? "calc(100% + 6px)"
                    : "100%",
              }}
              aria-hidden
            />
            <span
              className="catalog-tree-guide"
              style={{
                left: guideLeft,
                top: "50%",
                width: elbowWidth,
                height: 1,
              }}
              aria-hidden
            />
          </>
        )}
        <div
          className={`group relative z-[1] flex items-center gap-0.5 rounded-md transition-colors ${
            isSelected ? "bg-[var(--selected)]" : "hover:bg-[var(--header-hover)]"
          }`}
          style={{ paddingLeft: depth * TREE_INDENT }}
        >
          <button
            type="button"
            className="flex h-6 w-5 shrink-0 items-center justify-center text-caption text-[var(--muted)]"
            onClick={(e) => (hasKids ? toggleExpand(cat.path, e) : undefined)}
            aria-label={isOpen ? "Свернуть" : "Развернуть"}
          >
            {hasKids ? (isOpen ? "▾" : "▸") : "·"}
          </button>
          <button
            type="button"
            onClick={() => setSelectedPath(cat.path)}
            className={`min-w-0 flex-1 truncate py-1.5 text-left font-semibold text-[var(--ink)] ${
              depth >= 2 ? "text-xs" : "text-sm"
            }`}
          >
            {cat.name}
          </button>
        </div>
        {hasKids && isOpen && (
          <div className="relative">
            {depth > 0 && !isLast ? (
              <span
                className="catalog-tree-guide"
                style={{
                  left: (depth - 1) * TREE_INDENT + GUIDE_X,
                  top: 0,
                  bottom: 0,
                  width: 1,
                }}
                aria-hidden
              />
            ) : null}
            {kids.map((child, i) =>
              renderNode(
                child,
                depth + 1,
                i === kids.length - 1,
                i === 0,
                [...ancestorContinue, depth === 0 ? false : !isLast],
              ),
            )}
          </div>
        )}
      </div>
    );
  }

  const selectedLabel = selectedPath || "все разделы";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          CRM
        </p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">Склад</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Типы оборудования, единицы, QR и списание. Каталог берёт остатки отсюда.
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <button
            type="button"
            onClick={() => setSelectedPath("")}
            className={`mb-2 w-full rounded-md px-2 py-1.5 text-left text-sm ${
              !selectedPath ? "bg-[var(--selected)]" : ""
            }`}
          >
            Все разделы
          </button>
          <div className="catalog-tree max-h-[60vh] overflow-y-auto text-sm">
            {roots.map((root, i) =>
              renderNode(root, 0, i === roots.length - 1, i === 0, []),
            )}
          </div>
        </aside>

        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="field w-full max-w-xs"
              placeholder="Поиск…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <span className="text-xs text-[var(--muted)]">
              {selectedLabel} · {items.length} поз.
            </span>
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
            <button
              type="button"
              disabled={csvBusy}
              className="ml-auto rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-[var(--panel-muted)]"
              onClick={() => void exportCsv()}
            >
              Экспорт CSV
            </button>
            <button
              type="button"
              disabled={csvBusy}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-[var(--panel-muted)]"
              onClick={() => csvImportRef.current?.click()}
            >
              {csvBusy ? "CSV…" : "Импорт CSV"}
            </button>
            <button
              type="button"
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--panel-muted)]"
              onClick={() => void addType()}
            >
              + Тип оборудования
            </button>
            <button
              type="button"
              disabled={syncing}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50 hover:bg-[var(--panel-muted)]"
              onClick={() => void syncFromCatalog()}
            >
              {syncing ? "Синхронизация…" : "Догнать единицы"}
            </button>
          </div>

          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          {csvMessage ? (
            <p className="text-sm text-[var(--muted)]">{csvMessage}</p>
          ) : null}
          {syncInfo ? (
            <p className="text-sm text-[var(--muted)]">{syncInfo}</p>
          ) : null}

          {loading ? (
            <p className="text-sm text-[var(--muted)]">Загрузка…</p>
          ) : items.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Ничего не найдено</p>
          ) : (
            <div className="data-table-shell overflow-x-auto">
              <table className="data-table w-full text-left text-sm">
                <thead className="bg-[var(--panel-muted)] text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 font-medium">ID</th>
                    <th className="px-3 py-2 font-medium">Название</th>
                    <th className="px-3 py-2 font-medium">Категория</th>
                    <th className="px-3 py-2 font-medium">Склад</th>
                    <th className="px-3 py-2 font-medium">Единиц</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {items.map((row) => (
                    <tr key={row.id} className="hover:bg-[var(--panel-muted)]/60">
                      <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                        {row.equipmentCode ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/equipment/${row.id}`}
                          className="font-medium text-[var(--ink)] hover:text-[var(--accent)]"
                        >
                          {row.name}
                        </Link>
                        {row.model ? (
                          <span className="ml-2 text-xs text-[var(--muted)]">
                            {row.model}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-[var(--muted)]">
                        {row.category?.path || "—"}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{row.stockQty}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {row._count.equipmentUnits}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {drawer ? (
        <ItemDrawer
          item={drawer}
          categories={categories}
          lockStock
          onClose={() => setDrawer(null)}
          onSave={saveDrawer}
          onPhotoChange={(updated) =>
            setDrawer((prev) => (prev ? { ...prev, ...updated } : prev))
          }
        />
      ) : null}
    </div>
  );
}
