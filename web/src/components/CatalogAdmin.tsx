"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
} from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  ItemDrawer,
  type DrawerItem,
  type DrawerItemPatch,
} from "@/components/ItemDrawer";
import {
  KitEditorModal,
  type EditableKit,
} from "@/components/KitEditorModal";
import { OwnerTagsPicker } from "@/components/OwnerTagsPicker";
import {
  inferCatalogOwners,
  normalizeOwners,
  ownerShorts,
} from "@/lib/catalog-owner";
import { formatMoney } from "@/lib/format";

const DRAG_MIME = "application/x-crm-catalog-move";

type DragPayload = {
  kind: "item" | "kit";
  id: string;
  categoryId?: string | null;
  name: string;
};

type PendingConfirm =
  | { kind: "item"; id: string; name: string }
  | { kind: "kit"; id: string; name: string }
  | { kind: "category"; id: string; name: string; path: string };

type CatalogKit = EditableKit & {
  computedPrice: number;
  category?: { id: string; name: string; path: string } | null;
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

type Item = DrawerItem & {
  cashlessOverride: number | null;
  active: boolean;
};

function ancestorPaths(path: string): string[] {
  const parts = path.split("/");
  const result: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    result.push(parts.slice(0, i).join("/"));
  }
  return result;
}

export function CatalogAdmin() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [drawer, setDrawer] = useState<DrawerItem | null>(null);
  const [newCat, setNewCat] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(
    null,
  );
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [kits, setKits] = useState<CatalogKit[]>([]);
  const [kitEditorOpen, setKitEditorOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<EditableKit | null>(null);
  const [dragging, setDragging] = useState<DragPayload | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function loadCats() {
    const res = await fetch("/api/catalog/categories?tree=1");
    setCategories(await res.json());
  }

  async function loadItems() {
    const params = new URLSearchParams();
    if (selectedPath) params.set("path", selectedPath);
    if (q) params.set("q", q);
    const res = await fetch(`/api/catalog/items?${params}`);
    setItems(await res.json());
  }

  async function loadKits() {
    const params = new URLSearchParams();
    if (selectedPath) params.set("path", selectedPath);
    if (q) params.set("q", q);
    const res = await fetch(`/api/kits?${params}`);
    setKits(await res.json());
  }

  useEffect(() => {
    void loadCats();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadItems();
      void loadKits();
    }, 150);
    return () => clearTimeout(t);
  }, [selectedPath, q]);

  useEffect(() => {
    if (!selectedPath) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(selectedPath);
      for (const p of ancestorPaths(selectedPath)) next.add(p);
      return next;
    });
  }, [selectedPath]);

  useEffect(() => {
    return () => {
      if (expandTimerRef.current) clearTimeout(expandTimerRef.current);
    };
  }, []);

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

  async function addCategory() {
    if (!newCat.trim()) return;
    const parent = categories.find((c) => c.path === selectedPath);
    await fetch("/api/catalog/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newCat.trim(),
        parentId: parent?.id ?? null,
        kind: "EQUIPMENT",
      }),
    });
    setNewCat("");
    if (parent) {
      setExpanded((prev) => new Set(prev).add(parent.path));
    }
    void loadCats();
  }

  async function renameCategory(cat: Category) {
    const name = renameValue.trim();
    if (!name || name === cat.name) {
      setRenamingId(null);
      return;
    }
    const res = await fetch(`/api/catalog/categories/${cat.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const updated = (await res.json()) as Category;
      if (selectedPath === cat.path || selectedPath.startsWith(cat.path + "/")) {
        setSelectedPath(
          selectedPath === cat.path
            ? updated.path
            : updated.path + selectedPath.slice(cat.path.length),
        );
      }
      setExpanded((prev) => {
        const next = new Set<string>();
        for (const p of prev) {
          if (p === cat.path) next.add(updated.path);
          else if (p.startsWith(cat.path + "/")) {
            next.add(updated.path + p.slice(cat.path.length));
          } else next.add(p);
        }
        return next;
      });
      void loadCats();
      void loadItems();
    }
    setRenamingId(null);
  }

  function requestHideCategory(cat: Category) {
    setPendingConfirm({
      kind: "category",
      id: cat.id,
      name: cat.name,
      path: cat.path,
    });
  }

  async function executeHideCategory(cat: {
    id: string;
    name: string;
    path: string;
  }) {
    await fetch(`/api/catalog/categories/${cat.id}`, { method: "DELETE" });
    if (
      selectedPath === cat.path ||
      selectedPath.startsWith(cat.path + "/")
    ) {
      setSelectedPath("");
    }
    void loadCats();
    void loadItems();
  }

  async function addItem() {
    const cat =
      categories.find((c) => c.path === selectedPath) ||
      categories.find((c) => !c.parentId);
    if (!cat) return;
    const res = await fetch("/api/catalog/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: cat.id,
        name: "Новая позиция",
        basePrice: 0,
        stockQty: 0,
        owners: inferCatalogOwners(cat.path, "Новая позиция"),
      }),
    });
    if (res.ok) {
      const created = (await res.json()) as Item;
      const withCat: Item = {
        ...created,
        owners: normalizeOwners(created.owners, created.owner),
        category: created.category ?? {
          name: cat.name,
          path: cat.path,
        },
      };
      setDrawer(withCat);
      void loadItems();
      void loadCats();
    }
  }

  async function patchItem(id: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/catalog/items/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (res.ok) {
      const updated = await res.json();
      const movedAway =
        typeof data.categoryId === "string" &&
        selectedPath &&
        updated.category?.path &&
        updated.category.path !== selectedPath &&
        !updated.category.path.startsWith(`${selectedPath}/`);

      if (movedAway) {
        setItems((prev) => prev.filter((item) => item.id !== id));
        if (drawer?.id === id) setDrawer(null);
      } else {
        setItems((prev) =>
          prev.map((item) =>
            item.id === id ? { ...item, ...updated } : item,
          ),
        );
        setDrawer((prev) =>
          prev?.id === id ? { ...prev, ...updated } : prev,
        );
      }
      void loadCats();
    }
  }

  async function saveDrawerItem(id: string, data: DrawerItemPatch) {
    await patchItem(id, data);
  }

  async function moveItemToCategory(itemId: string, categoryId: string) {
    await patchItem(itemId, { categoryId });
  }

  async function moveKitToCategory(kitId: string, categoryId: string) {
    const res = await fetch(`/api/kits/${kitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId: categoryId || null }),
    });
    if (res.ok) {
      void loadKits();
      void loadCats();
    }
  }

  function clearExpandTimer() {
    if (expandTimerRef.current) {
      clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
  }

  function startDrag(e: DragEvent, payload: DragPayload) {
    e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.setData("text/plain", payload.name);
    e.dataTransfer.effectAllowed = "move";
    setDragging(payload);
  }

  function endDrag() {
    clearExpandTimer();
    setDragging(null);
    setDropTargetId(null);
  }

  function parseDragPayload(e: DragEvent): DragPayload | null {
    const raw =
      e.dataTransfer.getData(DRAG_MIME) ||
      (dragging ? JSON.stringify(dragging) : "");
    if (!raw) return null;
    try {
      return JSON.parse(raw) as DragPayload;
    } catch {
      return null;
    }
  }

  function onCategoryDragOver(e: DragEvent, cat: Category) {
    if (!dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropTargetId !== cat.id) {
      clearExpandTimer();
      setDropTargetId(cat.id);
    }

    const kids = byParent.get(cat.id) ?? [];
    if (kids.length > 0 && !expanded.has(cat.path) && !expandTimerRef.current) {
      expandTimerRef.current = setTimeout(() => {
        setExpanded((prev) => new Set(prev).add(cat.path));
        expandTimerRef.current = null;
      }, 450);
    }
  }

  function onCategoryDragLeave(e: DragEvent, catId: string) {
    const related = e.relatedTarget as Node | null;
    if (related && (e.currentTarget as HTMLElement).contains(related)) return;
    clearExpandTimer();
    setDropTargetId((prev) => (prev === catId ? null : prev));
  }

  async function onCategoryDrop(e: DragEvent, cat: Category) {
    e.preventDefault();
    e.stopPropagation();
    const payload = parseDragPayload(e) || dragging;
    endDrag();
    if (!payload) return;
    if (payload.categoryId === cat.id) return;

    if (payload.kind === "item") {
      await moveItemToCategory(payload.id, cat.id);
    } else {
      await moveKitToCategory(payload.id, cat.id);
    }
  }

  function requestHideItem(item: { id: string; name: string }) {
    setPendingConfirm({ kind: "item", id: item.id, name: item.name });
  }

  function requestHideKit(kit: { id: string; name: string }) {
    setPendingConfirm({ kind: "kit", id: kit.id, name: kit.name });
  }

  async function executeHideItem(id: string) {
    await fetch(`/api/catalog/items/${id}`, { method: "DELETE" });
    if (drawer?.id === id) setDrawer(null);
    void loadItems();
    void loadCats();
  }

  async function executeHideKit(id: string) {
    await fetch(`/api/kits/${id}`, { method: "DELETE" });
    void loadKits();
  }

  async function runConfirmedAction() {
    if (!pendingConfirm) return;
    setConfirmBusy(true);
    try {
      if (pendingConfirm.kind === "item") {
        await executeHideItem(pendingConfirm.id);
      } else if (pendingConfirm.kind === "kit") {
        await executeHideKit(pendingConfirm.id);
      } else {
        await executeHideCategory(pendingConfirm);
      }
      setPendingConfirm(null);
    } finally {
      setConfirmBusy(false);
    }
  }

  const selectedCategory =
    categories.find((c) => c.path === selectedPath) || null;

  function openNewKit() {
    const cat =
      selectedCategory || categories.find((c) => !c.parentId) || null;
    if (!cat) {
      alert("Сначала выберите раздел в дереве слева");
      return;
    }
    setEditingKit(null);
    setKitEditorOpen(true);
  }

  function openEditKit(kit: CatalogKit) {
    setEditingKit(kit);
    setKitEditorOpen(true);
  }

  const kitCategory =
    editingKit?.categoryId
      ? categories.find((c) => c.id === editingKit.categoryId) ||
        selectedCategory
      : selectedCategory || categories.find((c) => !c.parentId) || null;

  function applyPhotoChange(updated: DrawerItem) {
    setItems((prev) =>
      prev.map((item) =>
        item.id === updated.id ? { ...item, ...updated } : item,
      ),
    );
    setDrawer((prev) =>
      prev?.id === updated.id ? { ...prev, ...updated } : prev,
    );
  }

  function startRename(cat: Category, e: MouseEvent) {
    e.stopPropagation();
    setRenamingId(cat.id);
    setRenameValue(cat.name);
  }

  function renderNode(cat: Category, depth: number) {
    const kids = byParent.get(cat.id) ?? [];
    const hasKids = kids.length > 0;
    const isOpen = expanded.has(cat.path);
    const isSelected = selectedPath === cat.path;
    const isRenaming = renamingId === cat.id;
    const isDropTarget = dropTargetId === cat.id && dragging != null;
    const isSameCategory =
      dragging != null && dragging.categoryId === cat.id;

    return (
      <div key={cat.id}>
        <div
          onDragOver={(e) => onCategoryDragOver(e, cat)}
          onDragLeave={(e) => onCategoryDragLeave(e, cat.id)}
          onDrop={(e) => void onCategoryDrop(e, cat)}
          className={`group flex items-center gap-0.5 rounded-md transition-colors ${
            isDropTarget && !isSameCategory
              ? "bg-[var(--accent)]/15 ring-2 ring-[var(--accent)] ring-inset"
              : isDropTarget && isSameCategory
                ? "bg-[var(--selected)] opacity-60"
                : isSelected
                  ? "bg-[var(--selected)]"
                  : "hover:bg-white/10"
          }`}
          style={{ paddingLeft: `${depth * 0.5}rem` }}
        >
          <button
            type="button"
            className="flex h-6 w-5 shrink-0 items-center justify-center text-[10px] text-[var(--muted)]"
            onClick={(e) => (hasKids ? toggleExpand(cat.path, e) : undefined)}
            aria-label={isOpen ? "Свернуть" : "Развернуть"}
          >
            {hasKids ? (isOpen ? "▾" : "▸") : ""}
          </button>

          {isRenaming ? (
            <input
              className="field my-0.5 min-w-0 flex-1 py-0.5 text-sm"
              value={renameValue}
              autoFocus
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => void renameCategory(cat)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void renameCategory(cat);
                }
                if (e.key === "Escape") setRenamingId(null);
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <button
              type="button"
              onClick={() => setSelectedPath(cat.path)}
              className={`min-w-0 flex-1 truncate py-1.5 text-left font-semibold text-[var(--ink)] ${
                depth === 0 ? "text-sm" : "text-sm"
              } ${depth >= 2 ? "text-xs" : ""}`}
            >
              {cat.name}
            </button>
          )}

          {!isRenaming && (
            <div
              className={`flex shrink-0 gap-0.5 pr-1 ${
                isSelected || isDropTarget
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100"
              }`}
            >
              <button
                type="button"
                title="Переименовать"
                className="rounded px-1 text-xs text-[var(--muted)] hover:bg-white/10 hover:text-[var(--ink)]"
                onClick={(e) => startRename(cat, e)}
              >
                ✎
              </button>
              <button
                type="button"
                title="Удалить"
                className="rounded px-1 text-xs text-[var(--danger)] hover:bg-white/10"
                onClick={(e) => {
                  e.stopPropagation();
                  requestHideCategory(cat);
                }}
              >
                ×
              </button>
            </div>
          )}
        </div>
        {hasKids && isOpen && (
          <div>{kids.map((child) => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  }

  const selectedLabel = selectedPath || "весь каталог";

  type TableRow =
    | { kind: "item"; item: Item; sortName: string }
    | { kind: "kit"; kit: CatalogKit; sortName: string };

  const tableRows = useMemo(() => {
    const rows: TableRow[] = [
      ...items.map(
        (item): TableRow => ({
          kind: "item",
          item,
          sortName: item.name.toLowerCase(),
        }),
      ),
      ...kits.map(
        (kit): TableRow => ({
          kind: "kit",
          kit,
          sortName: kit.name.toLowerCase(),
        }),
      ),
    ];
    rows.sort((a, b) => a.sortName.localeCompare(b.sortName, "ru"));
    return rows;
  }, [items, kits]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">CRM</p>
        <h1 className="mt-1 text-3xl font-light tracking-tight">Каталог</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Перетащите позицию или комплект на раздел слева · склад и карточка
          позиции
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside
          className={`rounded-xl border bg-[var(--panel)] p-3 transition-colors ${
            dragging
              ? "border-[var(--accent)] border-dashed"
              : "border-[var(--line)]"
          }`}
        >
          {dragging && (
            <p className="mb-2 rounded-md bg-[var(--accent)]/10 px-2 py-1.5 text-xs text-[var(--accent)]">
              Отпустите на раздел, чтобы переместить «{dragging.name}»
            </p>
          )}
          <button
            type="button"
            onClick={() => setSelectedPath("")}
            className={`mb-2 w-full rounded-md px-2 py-1.5 text-left text-sm ${!selectedPath ? "bg-[var(--selected)]" : ""}`}
          >
            Все разделы
          </button>
          <div className="max-h-[60vh] space-y-0.5 overflow-y-auto text-sm">
            {roots.map((root) => renderNode(root, 0))}
          </div>
          <div className="mt-3 flex gap-2 border-t border-[var(--line)] pt-3">
            <input
              className="field"
              placeholder={
                selectedPath
                  ? `Подраздел в «${selectedPath.split("/").pop()}»`
                  : "Новый раздел"
              }
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void addCategory();
              }}
            />
            <button
              type="button"
              onClick={() => void addCategory()}
              className="rounded-md bg-[var(--solid)] px-3 text-sm text-[var(--on-solid)]"
            >
              +
            </button>
          </div>
        </aside>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3">
            <input
              className="field max-w-sm"
              placeholder="Поиск…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <span className="text-xs text-[var(--muted)]">
              {selectedLabel} · {tableRows.length} поз.
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openNewKit}
                className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
              >
                + Комплект
              </button>
              <button
                type="button"
                onClick={() => void addItem()}
                className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
              >
                + Позиция
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-sm">
              <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="w-8 px-2 py-2" />
                  <th className="px-3 py-2 text-left">Название</th>
                  <th className="w-28 px-3 py-2">Цена</th>
                  <th className="w-24 px-3 py-2">Склад</th>
                  <th className="w-24 px-3 py-2">Своб.</th>
                  <th className="w-36 px-3 py-2 text-left">Чья?</th>
                  <th className="px-3 py-2 text-left">Путь</th>
                  <th className="w-20 px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-3 py-10 text-center text-sm text-[var(--muted)]"
                    >
                      Нет позиций в этом разделе
                    </td>
                  </tr>
                ) : (
                  tableRows.map((row) => {
                    if (row.kind === "kit") {
                      const { kit } = row;
                      const isDragging =
                        dragging?.kind === "kit" && dragging.id === kit.id;
                      return (
                        <tr
                          key={`kit-${kit.id}`}
                          className={`border-t border-[var(--line)] hover:bg-[var(--panel-muted)] ${
                            isDragging ? "opacity-40" : ""
                          }`}
                        >
                          <td className="px-1 py-2 text-center">
                            <span
                              draggable
                              title="Перетащить в раздел"
                              onDragStart={(e) =>
                                startDrag(e, {
                                  kind: "kit",
                                  id: kit.id,
                                  categoryId: kit.categoryId,
                                  name: kit.name,
                                })
                              }
                              onDragEnd={endDrag}
                              className="inline-block cursor-grab select-none px-1 text-[var(--muted)] active:cursor-grabbing"
                            >
                              ⠿
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="text-left font-semibold text-[var(--ink)] hover:underline"
                              onClick={() => openEditKit(kit)}
                            >
                              <span title="Комплект" className="mr-1" aria-hidden>
                                🔧
                              </span>
                              {kit.name}
                            </button>
                            <div className="mt-0.5 text-xs text-[var(--muted)]">
                              {formatMoney(kit.computedPrice)} ·{" "}
                              {kit.components.length} в сост.
                            </div>
                          </td>
                          <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                            {formatMoney(kit.computedPrice)}
                          </td>
                          <td className="px-3 py-2 text-[var(--muted)]">—</td>
                          <td className="px-3 py-2 text-[var(--muted)]">—</td>
                          <td className="px-3 py-2 text-[var(--muted)]">—</td>
                          <td className="px-3 py-2 text-xs text-[var(--muted)]">
                            {kit.category?.path || "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              className="text-sm text-[var(--danger)]"
                              onClick={() =>
                                requestHideKit({
                                  id: kit.id,
                                  name: kit.name,
                                })
                              }
                            >
                              Удалить
                            </button>
                          </td>
                        </tr>
                      );
                    }

                    const { item } = row;
                    const isDragging =
                      dragging?.kind === "item" && dragging.id === item.id;
                    return (
                      <tr
                        key={`item-${item.id}`}
                        className={`border-t border-[var(--line)] hover:bg-[var(--panel-muted)] ${
                          isDragging ? "opacity-40" : ""
                        }`}
                      >
                        <td className="px-1 py-2 text-center">
                          <span
                            draggable
                            title="Перетащить в раздел"
                            onDragStart={(e) =>
                              startDrag(e, {
                                kind: "item",
                                id: item.id,
                                categoryId:
                                  item.categoryId || item.category?.id,
                                name: item.name,
                              })
                            }
                            onDragEnd={endDrag}
                            className="inline-block cursor-grab select-none px-1 text-[var(--muted)] active:cursor-grabbing"
                          >
                            ⠿
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="text-left font-semibold text-[var(--ink)] hover:underline"
                            onClick={() => setDrawer(item)}
                          >
                            {normalizeOwners(item.owners, item.owner).length >
                            0 ? (
                              <span
                                className="mr-1.5 inline-block rounded border border-[var(--line)] bg-[var(--panel-muted)] px-1 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--ink)]"
                                title={ownerShorts(
                                  normalizeOwners(item.owners, item.owner),
                                )}
                              >
                                {ownerShorts(
                                  normalizeOwners(item.owners, item.owner),
                                )}
                              </span>
                            ) : null}
                            {item.name}
                          </button>
                          <div className="mt-0.5 text-xs text-[var(--muted)]">
                            {formatMoney(item.basePrice)}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            className="field"
                            defaultValue={item.basePrice}
                            key={`${item.id}-price-${item.basePrice}`}
                            onBlur={(e) => {
                              const v = Number(e.target.value) || 0;
                              if (v !== item.basePrice) {
                                void patchItem(item.id, { basePrice: v });
                              }
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            className="field"
                            defaultValue={item.stockQty}
                            key={`${item.id}-stock-${item.stockQty}`}
                            onBlur={(e) => {
                              const v = Math.max(
                                0,
                                Number(e.target.value) || 0,
                              );
                              if (v !== item.stockQty) {
                                void patchItem(item.id, { stockQty: v });
                              }
                            }}
                          />
                        </td>
                        <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                          {item.available ?? "—"}
                        </td>
                        <td className="px-3 py-2">
                          <OwnerTagsPicker
                            compact
                            label=""
                            value={normalizeOwners(item.owners, item.owner)}
                            onChange={(owners) =>
                              void patchItem(item.id, { owners })
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--muted)]">
                          {item.category?.path}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            className="text-sm text-[var(--danger)]"
                            onClick={() =>
                              requestHideItem({
                                id: item.id,
                                name: item.name,
                              })
                            }
                          >
                            Удалить
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <ItemDrawer
        item={drawer}
        onClose={() => setDrawer(null)}
        onHide={() =>
          drawer && requestHideItem({ id: drawer.id, name: drawer.name })
        }
        onSave={saveDrawerItem}
        onPhotoChange={applyPhotoChange}
        categories={categories}
      />

      <KitEditorModal
        open={kitEditorOpen}
        categoryId={kitCategory?.id ?? null}
        categoryPath={kitCategory?.path}
        categories={categories}
        kit={editingKit}
        onClose={() => {
          setKitEditorOpen(false);
          setEditingKit(null);
        }}
        onSaved={() => {
          void loadKits();
          void loadCats();
        }}
      />

      <ConfirmDialog
        open={pendingConfirm != null}
        title={
          pendingConfirm?.kind === "category"
            ? "Удалить раздел?"
            : pendingConfirm?.kind === "kit"
              ? "Удалить комплект?"
              : "Удалить позицию?"
        }
        message={
          pendingConfirm?.kind === "category"
            ? `Раздел «${pendingConfirm.name}», все подразделы и позиции в них исчезнут из каталога. Продолжить?`
            : pendingConfirm?.kind === "kit"
              ? `Комплект «${pendingConfirm.name}» будет удалён из каталога. Продолжить?`
              : `Позиция «${pendingConfirm?.name ?? ""}» будет удалена из каталога. Продолжить?`
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        busy={confirmBusy}
        onCancel={() => {
          if (!confirmBusy) setPendingConfirm(null);
        }}
        onConfirm={() => void runConfirmedAction()}
      />
    </div>
  );
}
