"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  CATALOG_ADD_ACTIONS,
  CatalogAddToolbar,
  CatalogExportMenu,
  CatalogSelectionActions,
  type AddAction,
} from "@/components/CatalogAddToolbar";
import { Button } from "@/components/ui/Button";
import { ActionSheet, SideDrawer, SortableTh, useTableSort } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
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
import {
  inferCatalogOwners,
  normalizeOwners,
  ownerShorts,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { EquipmentCardDrawer } from "@/components/EquipmentItemPage";
import { formatUnitId } from "@/lib/equipment-id";
import { formatMoney } from "@/lib/format";

const DRAG_MIME = "application/x-crm-catalog-move";
const TREE_INDENT = 18;
const GUIDE_X = 10;

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
  _count: { items: number; children: number; kits: number };
};

type Item = DrawerItem & {
  cashlessOverride: number | null;
  active: boolean;
  showInCatalog?: boolean;
  equipmentCode?: number | null;
};

type EquipUnit = {
  id: string;
  unitNumber: number;
  qrToken: string;
  label?: string | null;
  owner?: CatalogOwnerValue | null;
  inRepair?: boolean;
  active?: boolean;
};

function ancestorPaths(path: string): string[] {
  const parts = path.split("/");
  const result: string[] = [];
  for (let i = 1; i < parts.length; i++) {
    result.push(parts.slice(0, i).join("/"));
  }
  return result;
}

function FolderGlyph({ open }: { open?: boolean }) {
  return (
    <svg
      viewBox="0 0 20 16"
      className="size-3.5 shrink-0 text-[var(--muted)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path
        d={
          open
            ? "M1.5 5.5h17l-1.6 8.5H3L1.5 5.5Zm1-3.5h5l1.5 2h8v1.5H2.5V2Z"
            : "M1.5 2h6L9 4h9.5v10H1.5V2Z"
        }
      />
    </svg>
  );
}

function TypeGlyph({
  kind,
  open,
}: {
  kind: "folder" | "kit" | "unit" | string;
  open?: boolean;
}) {
  const cls = "size-3.5";
  let icon = (
    <svg
      viewBox="0 0 24 24"
      className={cls}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <rect x="4" y="6" width="16" height="13" rx="2" />
      <path d="M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" />
    </svg>
  );
  if (kind === "folder") {
    icon = <FolderGlyph open={open} />;
  } else if (kind === "kit") {
    icon = (
      <svg
        viewBox="0 0 24 24"
        className={cls}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
      >
        <ellipse cx="12" cy="6" rx="7" ry="2.5" />
        <path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
        <path d="M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
      </svg>
    );
  } else if (kind === "SERVICE") {
    icon = (
      <svg
        viewBox="0 0 24 24"
        className={cls}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
      >
        <path d="M14.7 6.3a3 3 0 0 1 0 4.2l-1.4 1.4-4.2-4.2 1.4-1.4a3 3 0 0 1 4.2 0Z" />
        <path d="m9 11-5.5 5.5a2 2 0 1 0 2.8 2.8L12 13.5" />
      </svg>
    );
  } else if (kind === "CONSUMABLE") {
    icon = (
      <svg
        viewBox="0 0 24 24"
        className={cls}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
      >
        <path d="M14 4 7 18" />
        <path d="M9.5 7.5 15 5l2 5.5" />
      </svg>
    );
  } else if (kind === "COMPONENT") {
    icon = (
      <svg
        viewBox="0 0 24 24"
        className={cls}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
      >
        <rect x="3" y="7" width="11" height="11" rx="2" />
        <rect x="10" y="4" width="11" height="11" rx="2" />
      </svg>
    );
  } else if (kind === "PERSONNEL") {
    icon = (
      <svg
        viewBox="0 0 24 24"
        className={cls}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
      >
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 19c1.2-3 3.8-4.5 7-4.5S17.8 16 19 19" />
      </svg>
    );
  } else if (kind === "unit") {
    icon = (
      <svg
        viewBox="0 0 24 24"
        className={cls}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        aria-hidden
      >
        <rect x="4" y="4" width="16" height="16" rx="1.5" />
        <path d="M8 8h.01M12 8h.01M16 8h.01M8 12h.01M12 12h.01M16 12h.01M8 16h.01M12 16h.01M16 16h.01" />
      </svg>
    );
  }
  return (
    <span className="inline-flex size-6 shrink-0 items-center justify-center rounded border border-[var(--line)] bg-[var(--panel-muted)] text-[var(--ink)]">
      {icon}
    </span>
  );
}

function CardProfileButton({
  onClick,
  label,
}: {
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className="tap-target inline-flex items-center gap-1.5 rounded-md text-sm text-[var(--accent)] hover:bg-[var(--header-hover)] md:p-1"
      onClick={onClick}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M7 3.5h10a3.5 3.5 0 0 1 3.5 3.5v7A3.5 3.5 0 0 1 17 17.5h-3.2L12 21l-1.8-3.5H7A3.5 3.5 0 0 1 3.5 14V7A3.5 3.5 0 0 1 7 3.5Z" />
        <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
        <path d="M12 11v4" />
      </svg>
      {/* На телефоне иконка без подписи не читается, на десктопе хватает title. */}
      <span className="md:hidden">{label}</span>
    </button>
  );
}

function FirmTag({
  owners,
  owner,
}: {
  owners?: Item["owners"];
  owner?: Item["owner"];
}) {
  const shorts = ownerShorts(normalizeOwners(owners, owner));
  if (!shorts || shorts === "—") return null;
  return (
    <span
      className="ml-1.5 inline-block rounded border border-[var(--line)] bg-[var(--panel-muted)] px-1 py-0.5 text-caption font-medium uppercase tracking-wide text-[var(--ink)]"
      title={shorts}
    >
      {shorts}
    </span>
  );
}

function TreeConnectors({
  depth,
  isLast,
  isFirst,
  ancestorContinue,
}: {
  depth: number;
  isLast: boolean;
  isFirst: boolean;
  ancestorContinue: boolean[];
}) {
  if (depth <= 0) return null;
  const parentLevel = depth - 1;
  const guideLeft = parentLevel * TREE_INDENT + GUIDE_X;
  const elbowWidth = TREE_INDENT - 2;
  return (
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
  );
}

export function CatalogAdmin() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedKitId, setSelectedKitId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [itemsByCat, setItemsByCat] = useState<Record<string, Item[]>>({});
  const [kitsByCat, setKitsByCat] = useState<Record<string, CatalogKit[]>>(
    {},
  );
  const [unitsByItem, setUnitsByItem] = useState<Record<string, EquipUnit[]>>(
    {},
  );
  const [q, setQ] = useState("");
  const [drawer, setDrawer] = useState<DrawerItem | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** На телефоне дерево разделов живёт в выдвижном ящике, а не в колонке слева. */
  const [treeOpen, setTreeOpen] = useState(false);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
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
  const csvImportRef = useRef<HTMLInputElement>(null);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedKitIds, setSelectedKitIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);
  const [writeOffReason, setWriteOffReason] = useState<"DAMAGED" | "LOST">(
    "DAMAGED",
  );
  const [writeOffComment, setWriteOffComment] = useState("");
  const [writeOffError, setWriteOffError] = useState("");
  const [cardItemId, setCardItemId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<{
    itemIds: string[];
    kitIds: string[];
    categoryIds: string[];
    label: string;
  } | null>(null);
  const [sectionDraft, setSectionDraft] = useState<string | null>(null);
  const [sectionBusy, setSectionBusy] = useState(false);
  const [sectionError, setSectionError] = useState("");

  async function loadCats() {
    const res = await fetch("/api/catalog/categories?tree=1");
    const data: unknown = await res.json().catch(() => null);
    setCategories(Array.isArray(data) ? (data as Category[]) : []);
  }

  async function loadItems() {
    const params = new URLSearchParams();
    params.set("includeHidden", "1");
    const cat = categories.find((c) => c.path === selectedPath);
    if (q.trim()) {
      params.set("q", q.trim());
      if (selectedPath) params.set("path", selectedPath);
    } else if (cat) {
      params.set("categoryId", cat.id);
    } else {
      setItems([]);
      return;
    }
    const res = await fetch(`/api/catalog/items?${params}`);
    const data: unknown = await res.json();
    const list = Array.isArray(data) ? (data as Item[]) : [];
    setItems(list);
    if (cat && !q.trim()) {
      setItemsByCat((prev) => ({ ...prev, [cat.id]: list }));
    }
  }

  async function loadKits() {
    const params = new URLSearchParams();
    const cat = categories.find((c) => c.path === selectedPath);
    if (q.trim()) {
      params.set("q", q.trim());
      if (selectedPath) params.set("path", selectedPath);
    } else if (cat) {
      params.set("categoryId", cat.id);
    } else {
      setKits([]);
      return;
    }
    const res = await fetch(`/api/kits?${params}`);
    const data: unknown = await res.json();
    const list = Array.isArray(data) ? (data as CatalogKit[]) : [];
    setKits(list);
    if (cat && !q.trim()) {
      setKitsByCat((prev) => ({ ...prev, [cat.id]: list }));
    }
  }

  async function ensureCatItems(categoryId: string) {
    if (itemsByCat[categoryId]) return;
    const params = new URLSearchParams({
      categoryId,
      includeHidden: "1",
    });
    const res = await fetch(`/api/catalog/items?${params}`);
    const data: unknown = await res.json();
    if (Array.isArray(data)) {
      setItemsByCat((prev) => ({ ...prev, [categoryId]: data as Item[] }));
    }
  }

  async function ensureCatKits(categoryId: string) {
    if (kitsByCat[categoryId]) return;
    const res = await fetch(
      `/api/kits?${new URLSearchParams({ categoryId })}`,
    );
    const data: unknown = await res.json();
    if (Array.isArray(data)) {
      setKitsByCat((prev) => ({ ...prev, [categoryId]: data as CatalogKit[] }));
    }
  }

  async function ensureItemUnits(itemId: string, force = false) {
    if (!force && unitsByItem[itemId]) return;
    const res = await fetch(`/api/equipment/items/${itemId}`);
    if (!res.ok) {
      setUnitsByItem((prev) => ({ ...prev, [itemId]: [] }));
      return;
    }
    const data = await res.json();
    const units = Array.isArray(data.equipmentUnits)
      ? (data.equipmentUnits as EquipUnit[])
      : [];
    setUnitsByItem((prev) => ({ ...prev, [itemId]: units }));
    if (data.equipmentCode != null) {
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId ? { ...it, equipmentCode: data.equipmentCode } : it,
        ),
      );
      setItemsByCat((prev) => {
        const next = { ...prev };
        for (const [cid, list] of Object.entries(next)) {
          next[cid] = list.map((it) =>
            it.id === itemId ? { ...it, equipmentCode: data.equipmentCode } : it,
          );
        }
        return next;
      });
    }
  }

  async function exportCsv() {
    setCsvBusy(true);
    setCsvMessage("");
    try {
      const res = await fetch("/api/catalog/export", {
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCsvMessage(data.error || "Не удалось экспортировать");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] || "catalog.csv";
      a.click();
      URL.revokeObjectURL(url);
      setCsvMessage("CSV скачан");
    } catch {
      setCsvMessage("Не удалось экспортировать");
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
      const res = await fetch("/api/catalog/import", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCsvMessage(data.error || "Не удалось импортировать");
        return;
      }
      const errHint =
        data.errorCount > 0 ? ` · ошибок: ${data.errorCount}` : "";
      if (data.kind === "units" || data.kind === "types") {
        setCsvMessage(
          `Импорт склада (${data.kind}): создано ${data.created}, обновлено ${data.updated}${errHint}`,
        );
      } else {
        setCsvMessage(
          `Импорт: создано ${data.created}, обновлено ${data.updated}${errHint}`,
        );
      }
      await loadCats();
      await loadItems();
      await loadKits();
    } catch {
      setCsvMessage("Не удалось импортировать");
    } finally {
      setCsvBusy(false);
    }
  }

  async function exportWarehouseCsv() {
    setCsvBusy(true);
    setCsvMessage("");
    try {
      for (const [url, name] of [
        ["/api/equipment/export", "warehouse.csv"],
        ["/api/equipment/export?kind=units", "warehouse-units.csv"],
      ] as const) {
        const res = await fetch(url, { credentials: "same-origin" });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Не удалось экспортировать склад");
        }
        const blob = await res.blob();
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download =
          res.headers
            .get("Content-Disposition")
            ?.match(/filename="([^"]+)"/)?.[1] || name;
        a.click();
        URL.revokeObjectURL(href);
      }
      setCsvMessage("Скачаны типы и единицы склада");
    } catch (e) {
      setCsvMessage(e instanceof Error ? e.message : "Не удалось экспортировать");
    } finally {
      setCsvBusy(false);
    }
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath, q, categories]);

  useEffect(() => {
    if (!selectedItemId) return;
    void ensureItemUnits(selectedItemId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItemId]);

  useEffect(() => {
    if (!selectedPath) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(selectedPath);
      for (const p of ancestorPaths(selectedPath)) next.add(p);
      return next;
    });
    const cat = categories.find((c) => c.path === selectedPath);
    if (cat) {
      void ensureCatItems(cat.id);
      void ensureCatKits(cat.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPath, categories]);

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

  function selectFolder(path: string) {
    setTreeOpen(false);
    setSelectedPath(path);
    setSelectedItemId(null);
    setSelectedKitId(null);
    setSelectedItemIds(new Set());
    setSelectedKitIds(new Set());
    setSelectedUnitIds(new Set());
    setSelectedCategoryIds(new Set());
  }

  function selectItem(item: Item) {
    setSelectedItemId(item.id);
    setSelectedKitId(null);
    if (item.category?.path) setSelectedPath(item.category.path);
    void ensureItemUnits(item.id);
    setSelectedItemIds(new Set());
    setSelectedKitIds(new Set());
    setSelectedUnitIds(new Set());
    setSelectedCategoryIds(new Set());
  }

  function selectKit(kit: CatalogKit) {
    setSelectedKitId(kit.id);
    setSelectedItemId(null);
    if (kit.category?.path) setSelectedPath(kit.category.path);
    setSelectedItemIds(new Set());
    setSelectedKitIds(new Set());
    setSelectedUnitIds(new Set());
    setSelectedCategoryIds(new Set());
  }

  function toggleExpand(path: string, e: MouseEvent) {
    e.stopPropagation();
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    const cat = categories.find((c) => c.path === path);
    if (cat) {
      void ensureCatItems(cat.id);
      void ensureCatKits(cat.id);
    }
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
      setSelectedItemId(null);
    }
    void loadCats();
    void loadItems();
  }

  async function addItemOfKind(
    itemKind:
      | "EQUIPMENT"
      | "SERVICE"
      | "CONSUMABLE"
      | "COMPONENT"
      | "OTHER",
  ) {
    const cat =
      categories.find((c) => c.path === selectedPath) ||
      categories.find((c) => !c.parentId);
    if (!cat) return;
    const labels: Record<string, string> = {
      EQUIPMENT: "Новое оборудование",
      SERVICE: "Новая услуга",
      CONSUMABLE: "Новый расходный материал",
      COMPONENT: "Новые комплектующие",
      OTHER: "Новая позиция",
    };
    const name = labels[itemKind] || "Новая позиция";
    const res = await fetch("/api/catalog/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId: cat.id,
        name,
        basePrice: 0,
        stockQty: 0,
        itemKind,
        owners: inferCatalogOwners(cat.path, name),
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

  async function addItem() {
    await addItemOfKind("EQUIPMENT");
  }

  async function createSection() {
    const name = sectionDraft?.trim();
    if (!name) {
      setSectionError("Введите название");
      return;
    }
    setSectionBusy(true);
    setSectionError("");
    try {
      const parent = categories.find((c) => c.path === selectedPath);
      const res = await fetch("/api/catalog/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          parentId: parent?.id ?? null,
          kind: "EQUIPMENT",
        }),
      });
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : "Не удалось создать раздел";
        setSectionError(message);
        return;
      }
      const created = data as { path?: string };
      setSectionDraft(null);
      if (parent) {
        setExpanded((prev) => new Set(prev).add(parent.path));
      }
      await loadCats();
      if (created.path) selectFolder(created.path);
    } finally {
      setSectionBusy(false);
    }
  }

  function onAddAction(action: AddAction) {
    if (action === "section") {
      setSectionError("");
      setSectionDraft("");
      return;
    }
    if (action === "kit") {
      openNewKit();
      return;
    }
    if (action === "equipment") void addItemOfKind("EQUIPMENT");
    if (action === "service") void addItemOfKind("SERVICE");
    if (action === "consumable") void addItemOfKind("CONSUMABLE");
    if (action === "component") void addItemOfKind("COMPONENT");
  }

  function toggleItemSelected(id: string) {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleKitSelected(id: string) {
    setSelectedKitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleUnitSelected(id: string) {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleCategorySelected(id: string) {
    setSelectedCategoryIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedCount =
    selectedItemIds.size +
    selectedKitIds.size +
    selectedUnitIds.size +
    selectedCategoryIds.size;

  function toggleSelectAllVisible() {
    const itemIds = tableRows
      .filter((r) => r.kind === "item")
      .map((r) => (r as { kind: "item"; item: Item }).item.id);
    const kitIds = tableRows
      .filter((r) => r.kind === "kit")
      .map((r) => (r as { kind: "kit"; kit: CatalogKit }).kit.id);
    const unitIds = tableRows
      .filter((r) => r.kind === "unit")
      .map((r) => (r as { kind: "unit"; unit: EquipUnit }).unit.id);
    const categoryIds = tableRows
      .filter((r) => r.kind === "folder")
      .map((r) => (r as { kind: "folder"; cat: Category }).cat.id);
    const allSelected =
      itemIds.every((id) => selectedItemIds.has(id)) &&
      kitIds.every((id) => selectedKitIds.has(id)) &&
      unitIds.every((id) => selectedUnitIds.has(id)) &&
      categoryIds.every((id) => selectedCategoryIds.has(id)) &&
      itemIds.length + kitIds.length + unitIds.length + categoryIds.length >
        0;
    if (allSelected) {
      setSelectedItemIds(new Set());
      setSelectedKitIds(new Set());
      setSelectedUnitIds(new Set());
      setSelectedCategoryIds(new Set());
    } else {
      setSelectedItemIds(new Set(itemIds));
      setSelectedKitIds(new Set(kitIds));
      setSelectedUnitIds(new Set(unitIds));
      setSelectedCategoryIds(new Set(categoryIds));
    }
  }

  async function bulkAction(action: "delete" | "copy") {
    if (selectedCount === 0) return;
    if (action === "delete") {
      if (selectedUnitIds.size > 0 && selectedItemIds.size === 0 && selectedKitIds.size === 0 && selectedCategoryIds.size === 0) {
        setWriteOffReason("DAMAGED");
        setWriteOffComment("");
        setWriteOffError("");
        setWriteOffOpen(true);
        return;
      }
      const ok = window.confirm(
        `Удалить выбранные объекты (${selectedCount})?`,
      );
      if (!ok) return;
    }
    setBulkBusy(true);
    try {
      const res = await fetch("/api/catalog/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          itemIds: [...selectedItemIds],
          kitIds: [...selectedKitIds],
          unitIds: [...selectedUnitIds],
          categoryIds: [...selectedCategoryIds],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Не удалось выполнить действие");
        return;
      }
      setSelectedItemIds(new Set());
      setSelectedKitIds(new Set());
      setSelectedUnitIds(new Set());
      if (selectedCategoryIds.size) {
        const deleted = categories.filter((c) =>
          selectedCategoryIds.has(c.id),
        );
        if (
          deleted.some(
            (c) =>
              selectedPath === c.path ||
              selectedPath.startsWith(`${c.path}/`),
          )
        ) {
          setSelectedPath("");
          setSelectedItemId(null);
        }
      }
      setSelectedCategoryIds(new Set());
      if (selectedItemId) void ensureItemUnits(selectedItemId, true);
      void loadItems();
      void loadKits();
      void loadCats();
    } finally {
      setBulkBusy(false);
    }
  }

  function clipboardLabelForSelection() {
    const catCount = selectedCategoryIds.size;
    const itemCount = selectedItemIds.size;
    const kitCount = selectedKitIds.size;
    if (catCount === 1 && itemCount === 0 && kitCount === 0) {
      return (
        categories.find((c) => selectedCategoryIds.has(c.id))?.name || "раздел"
      );
    }
    if (itemCount === 1 && catCount === 0 && kitCount === 0) {
      const id = [...selectedItemIds][0];
      const item =
        items.find((it) => it.id === id) ||
        Object.values(itemsByCat)
          .flat()
          .find((it) => it.id === id);
      return item?.name || "позиция";
    }
    if (kitCount === 1 && catCount === 0 && itemCount === 0) {
      const id = [...selectedKitIds][0];
      const kit =
        kits.find((k) => k.id === id) ||
        Object.values(kitsByCat)
          .flat()
          .find((k) => k.id === id);
      return kit?.name || "комплект";
    }
    const n = catCount + itemCount + kitCount;
    return `${n} объект${n === 1 ? "" : n < 5 ? "а" : "ов"}`;
  }

  function cutSelection() {
    const itemIds = [...selectedItemIds];
    const kitIds = [...selectedKitIds];
    const categoryIds = [...selectedCategoryIds];
    if (itemIds.length + kitIds.length + categoryIds.length === 0) {
      alert("Вырезать можно раздел, позицию или комплект");
      return;
    }
    setClipboard({
      itemIds,
      kitIds,
      categoryIds,
      label: clipboardLabelForSelection(),
    });
    setSelectedItemIds(new Set());
    setSelectedKitIds(new Set());
    setSelectedUnitIds(new Set());
    setSelectedCategoryIds(new Set());
  }

  function pasteTargetCategoryId() {
    return categories.find((c) => c.path === selectedPath)?.id ?? null;
  }

  async function pasteClipboard() {
    if (!clipboard) return;
    const targetCategoryId = pasteTargetCategoryId();
    setBulkBusy(true);
    try {
      const res = await fetch("/api/catalog/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "move",
          itemIds: clipboard.itemIds,
          kitIds: clipboard.kitIds,
          categoryIds: clipboard.categoryIds,
          targetCategoryId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Не удалось вставить");
        return;
      }
      setClipboard(null);
      setItemsByCat({});
      setKitsByCat({});
      void loadItems();
      void loadKits();
      void loadCats();
    } finally {
      setBulkBusy(false);
    }
  }

  async function confirmWriteOffUnits() {
    if (selectedUnitIds.size === 0) return;
    setBulkBusy(true);
    setWriteOffError("");
    try {
      const res = await fetch("/api/catalog/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "delete",
          unitIds: [...selectedUnitIds],
          writeOffReason,
          writeOffComment: writeOffComment.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setWriteOffError(data.error || "Не удалось списать");
        return;
      }
      setWriteOffOpen(false);
      setSelectedUnitIds(new Set());
      if (selectedItemId) void ensureItemUnits(selectedItemId, true);
      void loadItems();
      void loadCats();
    } catch {
      setWriteOffError("Не удалось списать");
    } finally {
      setBulkBusy(false);
    }
  }

  function printSelectedQr() {
    if (selectedUnitIds.size > 0 && selectedItemId) {
      window.open(
        `/catalog/print-qr?ids=${encodeURIComponent(selectedItemId)}&unitIds=${encodeURIComponent(
          [...selectedUnitIds].join(","),
        )}`,
        "_blank",
      );
      return;
    }
    const ids =
      selectedItemIds.size > 0
        ? [...selectedItemIds]
        : selectedItemId
          ? [selectedItemId]
          : [];
    if (ids.length === 0) {
      alert("Выберите позиции или единицы для печати QR");
      return;
    }
    window.open(
      `/catalog/print-qr?ids=${encodeURIComponent(ids.join(","))}`,
      "_blank",
    );
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
    if (selectedItemId === id) setSelectedItemId(null);
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

  function startRename(cat: Category, e?: MouseEvent) {
    e?.stopPropagation();
    setRenamingId(cat.id);
    setRenameValue(cat.name);
  }

  function renameSelectedFolder() {
    if (selectedCategoryIds.size !== 1) return;
    const id = [...selectedCategoryIds][0];
    const cat = categories.find((c) => c.id === id);
    if (cat) startRename(cat);
  }

  function renderItemNode(
    item: Item,
    depth: number,
    isLast: boolean,
    isFirst: boolean,
    ancestorContinue: boolean[],
  ) {
    const isSelected = selectedItemId === item.id;
    const isEquipment = item.itemKind === "EQUIPMENT" || !item.itemKind;

    return (
      <div key={`item-${item.id}`} className="relative">
        <TreeConnectors
          depth={depth}
          isLast={isLast}
          isFirst={isFirst}
          ancestorContinue={ancestorContinue}
        />
        <div
          className={`group relative z-[1] flex items-center gap-1 rounded-md ${
            isSelected ? "bg-[var(--selected)]" : "hover:bg-[var(--header-hover)]"
          }`}
          style={{ paddingLeft: depth * TREE_INDENT }}
        >
          <span className="w-5 shrink-0" aria-hidden />
          <button
            type="button"
            onClick={() => (isEquipment ? selectItem(item) : setDrawer(item))}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-1 text-left text-xs font-medium text-[var(--ink)]"
            title={item.name}
          >
            <TypeGlyph kind={item.itemKind || "EQUIPMENT"} />
            <span className="min-w-0 truncate">{item.name}</span>
            <FirmTag owners={item.owners} owner={item.owner} />
          </button>
        </div>
      </div>
    );
  }

  function renderKitNode(
    kit: CatalogKit,
    depth: number,
    isLast: boolean,
    isFirst: boolean,
    ancestorContinue: boolean[],
  ) {
    const isSelected = selectedKitId === kit.id;
    return (
      <div key={`kit-${kit.id}`} className="relative">
        <TreeConnectors
          depth={depth}
          isLast={isLast}
          isFirst={isFirst}
          ancestorContinue={ancestorContinue}
        />
        <div
          className={`group relative z-[1] flex items-center gap-1 rounded-md ${
            isSelected ? "bg-[var(--selected)]" : "hover:bg-[var(--header-hover)]"
          }`}
          style={{ paddingLeft: depth * TREE_INDENT }}
        >
          <span className="w-5 shrink-0" aria-hidden />
          <button
            type="button"
            onClick={() => selectKit(kit)}
            className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pr-1 text-left text-xs font-medium text-[var(--ink)]"
            title={kit.name}
          >
            <TypeGlyph kind="kit" />
            <span className="min-w-0 truncate">{kit.name}</span>
          </button>
        </div>
      </div>
    );
  }

  function renderNode(
    cat: Category,
    depth: number,
    isLast = true,
    isFirst = true,
    ancestorContinue: boolean[] = [],
  ) {
    const kids = byParent.get(cat.id) ?? [];
    const catItems = itemsByCat[cat.id];
    const catKits = kitsByCat[cat.id];
    const isOpen = expanded.has(cat.path);
    const isSelected =
      selectedPath === cat.path && !selectedItemId && !selectedKitId;
    const isRenaming = renamingId === cat.id;
    const isDropTarget = dropTargetId === cat.id && dragging != null;
    const isSameCategory =
      dragging != null && dragging.categoryId === cat.id;
    const kitCount = cat._count.kits ?? 0;
    const canExpand =
      kids.length > 0 || cat._count.items > 0 || kitCount > 0;
    const nested = [
      ...kids.map((child) => ({ kind: "folder" as const, child })),
      ...(catItems ?? []).map((item) => ({ kind: "item" as const, item })),
      ...(catKits ?? []).map((kit) => ({ kind: "kit" as const, kit })),
    ];

    return (
      <div key={cat.id} className="relative">
        <TreeConnectors
          depth={depth}
          isLast={isLast}
          isFirst={isFirst}
          ancestorContinue={ancestorContinue}
        />
        <div
          onDragOver={(e) => onCategoryDragOver(e, cat)}
          onDragLeave={(e) => onCategoryDragLeave(e, cat.id)}
          onDrop={(e) => void onCategoryDrop(e, cat)}
          className={`group relative z-[1] flex items-center gap-0.5 rounded-md transition-colors ${
            isDropTarget && !isSameCategory
              ? "bg-[var(--accent)]/15 ring-2 ring-[var(--accent)] ring-inset"
              : isDropTarget && isSameCategory
                ? "bg-[var(--selected)] opacity-60"
                : isSelected
                  ? "bg-[var(--selected)]"
                  : "hover:bg-[var(--header-hover)]"
          }`}
          style={{ paddingLeft: depth * TREE_INDENT }}
        >
          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center text-caption text-[var(--muted)] md:h-6 md:w-5"
            onClick={(e) => (canExpand ? toggleExpand(cat.path, e) : undefined)}
            aria-label={isOpen ? "Свернуть" : "Развернуть"}
          >
            {canExpand ? (isOpen ? "▾" : "▸") : "·"}
          </button>
          <TypeGlyph kind="folder" open={isOpen} />

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
              onClick={() => selectFolder(cat.path)}
              className={`min-w-0 flex-1 truncate py-1.5 text-left font-semibold text-[var(--ink)] ${
                depth >= 2 ? "text-xs" : "text-sm"
              }`}
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
                className="rounded px-1 text-xs text-[var(--muted)] hover:bg-[var(--header-hover)] hover:text-[var(--ink)]"
                onClick={(e) => startRename(cat, e)}
              >
                ✎
              </button>
            </div>
          )}
        </div>
        {canExpand && isOpen && (
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
            {nested.map((node, i) => {
              const last = i === nested.length - 1;
              const first = i === 0;
              const cont = [...ancestorContinue, depth === 0 ? false : !isLast];
              if (node.kind === "folder") {
                return renderNode(
                  node.child,
                  depth + 1,
                  last,
                  first,
                  cont,
                );
              }
              if (node.kind === "kit") {
                return renderKitNode(
                  node.kit,
                  depth + 1,
                  last,
                  first,
                  cont,
                );
              }
              return renderItemNode(
                node.item,
                depth + 1,
                last,
                first,
                cont,
              );
            })}
            {isOpen &&
            ((cat._count.items > 0 && catItems === undefined) ||
              ((cat._count.kits ?? 0) > 0 && catKits === undefined)) ? (
              <p
                className="py-0.5 text-caption text-[var(--muted)]"
                style={{ paddingLeft: (depth + 1) * TREE_INDENT }}
              >
                Загрузка…
              </p>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  const selectedLabel = selectedPath || "весь каталог";
  const selectedItem =
    (selectedItemId &&
      (items.find((it) => it.id === selectedItemId) ||
        Object.values(itemsByCat)
          .flat()
          .find((it) => it.id === selectedItemId))) ||
    null;
  const selectedKit =
    (selectedKitId &&
      (kits.find((k) => k.id === selectedKitId) ||
        Object.values(kitsByCat)
          .flat()
          .find((k) => k.id === selectedKitId))) ||
    null;
  const selectedUnits = selectedItemId
    ? (unitsByItem[selectedItemId] ?? []).filter((u) => u.active !== false)
    : [];
  const childFolders = selectedCategory
    ? (byParent.get(selectedCategory.id) ?? [])
    : roots;

  type TableRow =
    | { kind: "folder"; cat: Category; sortName: string }
    | { kind: "item"; item: Item; sortName: string }
    | { kind: "kit"; kit: CatalogKit; sortName: string }
    | { kind: "kit-part"; kit: CatalogKit; part: CatalogKit["components"][number] }
    | { kind: "unit"; unit: EquipUnit; item: Item };

  const tableRows = useMemo(() => {
    if (q.trim()) {
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
      rows.sort((a, b) =>
        "sortName" in a && "sortName" in b
          ? a.sortName.localeCompare(b.sortName, "ru")
          : 0,
      );
      return rows;
    }

    if (selectedKitId && selectedKit) {
      return selectedKit.components.map(
        (part): TableRow => ({ kind: "kit-part", kit: selectedKit, part }),
      );
    }

    if (selectedItemId && selectedItem) {
      return selectedUnits.map(
        (unit): TableRow => ({ kind: "unit", unit, item: selectedItem }),
      );
    }

    const rows: TableRow[] = [];
    for (const cat of childFolders) {
      rows.push({
        kind: "folder",
        cat,
        sortName: cat.name.toLowerCase(),
      });
    }
    rows.push(
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
    );
    rows.sort((a, b) => {
      const order = { folder: 0, item: 1, kit: 2, unit: 3 };
      const oa = order[a.kind];
      const ob = order[b.kind];
      if (oa !== ob) return oa - ob;
      const sa = "sortName" in a ? a.sortName : "";
      const sb = "sortName" in b ? b.sortName : "";
      return sa.localeCompare(sb, "ru");
    });
    return rows;
  }, [
    q,
    items,
    kits,
    selectedItemId,
    selectedItem,
    selectedUnits,
    selectedKitId,
    selectedKit,
    childFolders,
  ]);

  const { sorted: sortedTableRows, sort, onSort } = useTableSort(
    tableRows,
    (row, key) => {
      if (key === "id") {
        if (row.kind === "item") return row.item.equipmentCode ?? row.item.id;
        if (row.kind === "unit") return row.unit.unitNumber;
        if (row.kind === "kit-part") {
          const ci = row.part.catalogItem as { equipmentCode?: number | null; id: string };
          return ci.equipmentCode ?? ci.id;
        }
        return "";
      }
      if (key === "name") {
        if (row.kind === "folder") return row.cat.name;
        if (row.kind === "item") return row.item.name;
        if (row.kind === "kit") return row.kit.name;
        if (row.kind === "kit-part") return row.part.catalogItem.name;
        if (row.kind === "unit") return row.unit.label || String(row.unit.unitNumber);
      }
      if (key === "price") {
        if (row.kind === "item") return row.item.basePrice;
        if (row.kind === "kit") return row.kit.computedPrice;
        if (row.kind === "kit-part") {
          const ci = row.part.catalogItem as { basePrice?: number };
          return (ci.basePrice ?? 0) * row.part.qty;
        }
        return null;
      }
      if (key === "qty") {
        if (row.kind === "item") return row.item.stockQty;
        if (row.kind === "kit") return row.kit.components.length;
        if (row.kind === "folder")
          return row.cat._count.items + row.cat._count.children + row.cat._count.kits;
        if (row.kind === "kit-part") return row.part.qty;
        if (row.kind === "unit") return 1;
      }
      return null;
    },
  );

  /**
   * Строка таблицы как карточка: на 390px пять колонок не помещаются,
   * поэтому ID и количество уходят в подпись под названием.
   */
  function renderMobileRow(row: TableRow) {
    const shell = (
      key: string,
      opts: {
        checked?: boolean;
        onCheck?: () => void;
        glyph: ReactNode;
        title: ReactNode;
        meta?: ReactNode;
        price?: string;
        qty?: ReactNode;
        actions?: ReactNode;
      },
    ) => (
      <li
        key={key}
        className={`px-3 py-2.5 ${opts.checked ? "bg-[var(--selected)]/40" : ""}`}
      >
        <div className="flex items-start gap-2.5">
          {opts.onCheck ? (
            <input
              type="checkbox"
              checked={opts.checked ?? false}
              onChange={opts.onCheck}
              className="mt-1 size-4 shrink-0"
              aria-label="Выбрать"
            />
          ) : (
            <span className="mt-1 size-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 shrink-0 text-[var(--muted)]">
                {opts.glyph}
              </span>
              <div className="min-w-0 flex-1">{opts.title}</div>
            </div>
            {opts.meta ? (
              <p className="mt-0.5 text-caption text-[var(--muted)]">
                {opts.meta}
              </p>
            ) : null}
            {opts.price || opts.qty !== undefined ? (
              <p className="mt-1 flex items-baseline gap-3 text-sm tabular-nums">
                {opts.price ? <span>{opts.price}</span> : null}
                {opts.qty !== undefined ? (
                  <span className="text-[var(--muted)]">{opts.qty}</span>
                ) : null}
              </p>
            ) : null}
            {opts.actions ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-3">
                {opts.actions}
              </div>
            ) : null}
          </div>
        </div>
      </li>
    );

    if (row.kind === "folder") {
      const { cat } = row;
      return shell(`m-folder-${cat.id}`, {
        checked: selectedCategoryIds.has(cat.id),
        onCheck: () => toggleCategorySelected(cat.id),
        glyph: <TypeGlyph kind="folder" />,
        title: (
          <button
            type="button"
            className="text-left font-semibold text-[var(--ink)]"
            onClick={() => selectFolder(cat.path)}
          >
            {cat.name}
          </button>
        ),
        meta: `${cat._count.children} разд. · ${cat._count.items} поз. · ${cat._count.kits} компл.`,
      });
    }

    if (row.kind === "kit-part") {
      const { kit, part } = row;
      const ci = part.catalogItem;
      return shell(`m-kit-part-${kit.id}-${ci.id}`, {
        glyph: (
          <TypeGlyph
            kind={
              "itemKind" in ci && typeof ci.itemKind === "string"
                ? ci.itemKind
                : "EQUIPMENT"
            }
          />
        ),
        title: <span className="font-semibold">{ci.name}</span>,
        meta:
          "equipmentCode" in ci && ci.equipmentCode
            ? String(ci.equipmentCode)
            : ci.id.slice(-6),
        price: formatMoney(ci.basePrice),
        qty: `${part.qty} шт.`,
        actions: (
          <CardProfileButton
            label="Карточка"
            onClick={() => setCardItemId(ci.id)}
          />
        ),
      });
    }

    if (row.kind === "unit") {
      const { unit, item } = row;
      const article = formatUnitId(item.equipmentCode, unit.unitNumber);
      return shell(`m-unit-${unit.id}`, {
        checked: selectedUnitIds.has(unit.id),
        onCheck: () => toggleUnitSelected(unit.id),
        glyph: <TypeGlyph kind="unit" />,
        title: (
          <Link
            href={`/q/${unit.qrToken}`}
            target="_blank"
            className="font-semibold text-[var(--ink)]"
          >
            {unit.label || `Ед. №${unit.unitNumber}`}
            <FirmTag owners={unit.owner ? [unit.owner] : []} />
          </Link>
        ),
        meta: article,
        actions: (
          <CardProfileButton
            label="Карточка"
            onClick={() => setCardItemId(item.id)}
          />
        ),
      });
    }

    if (row.kind === "kit") {
      const { kit } = row;
      return shell(`m-kit-${kit.id}`, {
        checked: selectedKitIds.has(kit.id),
        onCheck: () => toggleKitSelected(kit.id),
        glyph: <TypeGlyph kind="kit" />,
        title: (
          <button
            type="button"
            className="text-left font-semibold text-[var(--ink)]"
            onClick={() => selectKit(kit)}
          >
            {kit.name}
            {kit.showInCatalog !== true ? (
              <span className="ml-1.5 rounded border border-[var(--line)] px-1 py-0.5 text-caption font-normal uppercase tracking-wide text-[var(--muted)]">
                не в смете
              </span>
            ) : null}
          </button>
        ),
        meta: `${kit.components.length} в составе`,
        price: formatMoney(kit.computedPrice),
        actions: (
          <>
            <button
              type="button"
              className="text-sm text-[var(--accent)]"
              onClick={() => openEditKit(kit)}
            >
              Изменить
            </button>
            <button
              type="button"
              className="text-sm text-[var(--danger)]"
              onClick={() => requestHideKit({ id: kit.id, name: kit.name })}
            >
              Удалить
            </button>
          </>
        ),
      });
    }

    const { item } = row;
    const isEquipment = item.itemKind === "EQUIPMENT" || !item.itemKind;
    return shell(`m-item-${item.id}`, {
      checked: selectedItemIds.has(item.id),
      onCheck: () => toggleItemSelected(item.id),
      glyph: <TypeGlyph kind={item.itemKind || "EQUIPMENT"} />,
      title: (
        <button
          type="button"
          className="text-left font-semibold text-[var(--ink)]"
          onClick={() => (isEquipment ? selectItem(item) : setDrawer(item))}
        >
          {item.name}
          <FirmTag owners={item.owners} owner={item.owner} />
          {item.showInCatalog === false ? (
            <span className="ml-1.5 rounded border border-[var(--line)] px-1 py-0.5 text-caption font-normal uppercase tracking-wide text-[var(--muted)]">
              не в смете
            </span>
          ) : null}
        </button>
      ),
      meta: item.equipmentCode ?? item.id.slice(-6),
      price: formatMoney(item.basePrice),
      qty: `${item.stockQty} шт.`,
      actions: isEquipment ? (
        <CardProfileButton
          label="Карточка"
          onClick={() => setCardItemId(item.id)}
        />
      ) : (
        <button
          type="button"
          className="text-sm text-[var(--danger)]"
          onClick={() => requestHideItem({ id: item.id, name: item.name })}
        >
          Удалить
        </button>
      ),
    });
  }

  /**
   * Одно дерево на два места: колонка слева на десктопе и выдвижной ящик
   * на телефоне. В ящике список занимает всю высоту, в колонке — ограничен.
   */
  function treePane(variant: "desktop" | "drawer") {
    return (
      <>
        {dragging && (
          <p className="mx-3 mt-2 rounded-md bg-[var(--accent)]/10 px-2 py-1.5 text-xs text-[var(--accent)]">
            Отпустите на раздел, чтобы переместить «{dragging.name}»
          </p>
        )}
        <div className="border-b border-[var(--line)] px-3 py-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск"
            className="field min-w-0 w-full py-1.5 text-sm"
            autoComplete="off"
          />
          <p className="mt-1 text-caption text-[var(--muted)]">
            {selectedLabel} · {tableRows.length} поз.
          </p>
        </div>
        <button
          type="button"
          onClick={() => selectFolder("")}
          className={`mx-2 mt-2 rounded-md px-2 py-1.5 text-left text-sm ${!selectedPath && !selectedItemId && !selectedKitId ? "bg-[var(--selected)]" : "hover:bg-[var(--header-hover)]"}`}
        >
          Все разделы
        </button>
        <div
          className={`catalog-tree flex-1 overflow-y-auto px-2 pb-2 text-sm ${
            variant === "desktop" ? "max-h-[60vh]" : "min-h-0"
          }`}
        >
          {roots.map((root, i) =>
            renderNode(root, 0, i === roots.length - 1, i === 0, []),
          )}
        </div>
      </>
    );
  }

  return (
    <div className="w-full px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">CRM</p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight md:text-3xl">
          Каталог
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Структура разделов, позиции, комплекты и карточки оборудования.
          Комплектующие не попадают в каталог сметы.
        </p>
      </header>

      <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <aside
          className={`hidden min-h-0 flex-col overflow-hidden rounded-xl border bg-[var(--panel)] transition-colors lg:flex ${
            dragging
              ? "border-[var(--accent)] border-dashed"
              : "border-[var(--line)]"
          }`}
        >
          {treePane("desktop")}
        </aside>

        <SideDrawer
          open={treeOpen}
          onClose={() => setTreeOpen(false)}
          labelledBy="catalog-tree-sheet"
          side="left"
        >
          <div className="flex min-h-0 flex-col">
            <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
              <h2
                id="catalog-tree-sheet"
                className="min-w-0 flex-1 truncate text-title font-medium"
              >
                Разделы
              </h2>
              <button
                type="button"
                onClick={() => setTreeOpen(false)}
                className="tap-target -mr-1 rounded-md px-3 text-sm text-[var(--accent)]"
              >
                Готово
              </button>
            </div>
            {treePane("drawer")}
          </div>
        </SideDrawer>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <div className="border-b border-[var(--line)] px-4 py-2 text-xs uppercase tracking-wide text-[var(--muted)]">
            / Каталог
            {selectedPath
              ? selectedPath.split("/").map((part, i, arr) => {
                  const path = arr.slice(0, i + 1).join("/");
                  return (
                    <span key={path}>
                      {" / "}
                      <button
                        type="button"
                        className="hover:text-[var(--accent)] hover:underline"
                        onClick={() => selectFolder(path)}
                      >
                        {part}
                      </button>
                    </span>
                  );
                })
              : null}
            {selectedItem ? (
              <>
                {" / "}
                <span className="text-[var(--ink)]">{selectedItem.name}</span>
              </>
            ) : null}
            {selectedKit ? (
              <>
                {" / "}
                <span className="text-[var(--ink)]">{selectedKit.name}</span>
                <button
                  type="button"
                  className="ml-2 normal-case tracking-normal text-[var(--accent)] hover:underline"
                  onClick={() => openEditKit(selectedKit)}
                >
                  Изменить
                </button>
              </>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 border-b border-[var(--line)] p-3 md:hidden">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setTreeOpen(true)}
                className="field flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-4 shrink-0 text-[var(--muted)]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  aria-hidden
                >
                  <path d="M3 7.5V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8.5" />
                </svg>
                <span className="truncate">
                  {selectedPath ? selectedPath.split("/").pop() : "Все разделы"}
                </span>
                <span className="ml-auto shrink-0 text-caption text-[var(--muted)]">
                  {tableRows.length}
                </span>
              </button>
              <Button
                variant="secondary"
                onClick={() => setMobileMoreOpen(true)}
                aria-label="Ещё действия"
                className="shrink-0 px-3"
              >
                …
              </Button>
            </div>
            <Button onClick={() => setAddSheetOpen(true)} className="w-full">
              Добавить в каталог
            </Button>
            {selectedCount > 0 ? (
              <p className="text-caption text-[var(--muted)]">
                Выбрано: {selectedCount} — действия в меню «…»
              </p>
            ) : null}
          </div>

          <div className="hidden w-full items-center gap-2 border-b border-[var(--line)] px-4 py-3 md:flex">
            <CatalogAddToolbar onAction={onAddAction} />
            <div className="ml-auto flex items-center gap-1">
              <CatalogSelectionActions
                count={selectedCount}
                disabled={bulkBusy}
                clipboardLabel={clipboard?.label ?? null}
                canRename={selectedCategoryIds.size === 1}
                onDelete={() => void bulkAction("delete")}
                onCut={cutSelection}
                onPaste={() => void pasteClipboard()}
                onPrintQr={printSelectedQr}
                onRename={renameSelectedFolder}
              />
              <CatalogExportMenu
                csvBusy={csvBusy}
                onExportCsv={() => void exportCsv()}
                onImportCsv={() => csvImportRef.current?.click()}
                onExportWarehouse={() => void exportWarehouseCsv()}
              />
            </div>
          </div>

          {sectionDraft !== null ? (
            <form
              className="flex flex-wrap items-center gap-1 border-b border-[var(--line)] px-4 py-3"
              onSubmit={(e) => {
                e.preventDefault();
                void createSection();
              }}
            >
              <input
                autoFocus
                value={sectionDraft}
                onChange={(e) => setSectionDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setSectionDraft(null);
                    setSectionError("");
                  }
                }}
                placeholder={
                  selectedPath
                    ? `Подраздел в «${selectedPath.split("/").pop()}»`
                    : "Название раздела"
                }
                className="field w-full py-1 text-sm md:w-52"
                disabled={sectionBusy}
              />
              <button
                type="submit"
                disabled={sectionBusy}
                className="rounded-md border border-[var(--line)] px-2 py-1 text-xs disabled:opacity-50"
              >
                {sectionBusy ? "…" : "Создать"}
              </button>
              <button
                type="button"
                className="rounded-md px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
                onClick={() => {
                  setSectionDraft(null);
                  setSectionError("");
                }}
              >
                Отмена
              </button>
              {sectionError ? (
                <span className="text-xs text-[var(--danger)]">
                  {sectionError}
                </span>
              ) : null}
            </form>
          ) : null}

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

          <ul className="divide-y divide-[var(--line)] md:hidden">
            {sortedTableRows.length === 0 ? (
              <li className="px-4 py-10 text-center text-sm text-[var(--muted)]">
                Нет позиций в этом разделе
              </li>
            ) : (
              sortedTableRows.map((row) => renderMobileRow(row))
            )}
          </ul>

          <div className="data-table-shell hidden overflow-x-auto md:block">
            <table className="data-table w-full text-sm">
              <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="w-10 px-2 py-2">
                    <input
                      type="checkbox"
                      checked={
                        tableRows.some(
                          (r) =>
                            r.kind === "item" ||
                            r.kind === "kit" ||
                            r.kind === "unit" ||
                            r.kind === "folder",
                        ) &&
                        tableRows.every((r) =>
                          r.kind === "item"
                            ? selectedItemIds.has(r.item.id)
                            : r.kind === "kit"
                              ? selectedKitIds.has(r.kit.id)
                              : r.kind === "unit"
                                ? selectedUnitIds.has(r.unit.id)
                                : r.kind === "folder"
                                  ? selectedCategoryIds.has(r.cat.id)
                                  : true,
                        )
                      }
                      onChange={toggleSelectAllVisible}
                      aria-label="Выбрать все"
                    />
                  </th>
                  <SortableTh
                    label="ID"
                    sortKey="id"
                    state={sort}
                    onSort={onSort}
                    className="w-16 px-2 py-2"
                  />
                  <SortableTh
                    label="Наименование"
                    sortKey="name"
                    state={sort}
                    onSort={onSort}
                    className="min-w-[14rem] px-3 py-2"
                  />
                  <SortableTh
                    label="Цена"
                    sortKey="price"
                    state={sort}
                    onSort={onSort}
                    className="w-24 px-2 py-2"
                  />
                  <SortableTh
                    label="Кол-во"
                    sortKey="qty"
                    state={sort}
                    onSort={onSort}
                    className="w-16 px-2 py-2"
                  />
                  <th className="w-12 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {sortedTableRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-10 text-center text-sm text-[var(--muted)]"
                    >
                      Нет позиций в этом разделе
                    </td>
                  </tr>
                ) : (
                  sortedTableRows.map((row) => {
                    if (row.kind === "folder") {
                      const { cat } = row;
                      const isRenaming = renamingId === cat.id;
                      return (
                        <tr
                          key={`folder-${cat.id}`}
                          className={`border-t border-[var(--line)] hover:bg-[var(--panel-muted)] ${
                            selectedCategoryIds.has(cat.id)
                              ? "bg-[var(--selected)]/40"
                              : ""
                          }`}
                        >
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={selectedCategoryIds.has(cat.id)}
                              onChange={() => toggleCategorySelected(cat.id)}
                              aria-label={`Выбрать ${cat.name}`}
                            />
                          </td>
                          <td className="px-2 py-2 text-[var(--muted)]">—</td>
                          <td className="px-3 py-2" colSpan={3}>
                            {isRenaming ? (
                              <input
                                className="field my-0.5 min-w-0 w-full max-w-sm py-0.5 text-sm"
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
                                className="inline-flex items-center gap-2 font-semibold text-[var(--ink)] hover:underline"
                                onClick={() => selectFolder(cat.path)}
                              >
                                <TypeGlyph kind="folder" />
                                {cat.name}
                              </button>
                            )}
                          </td>
                          <td />
                        </tr>
                      );
                    }

                    if (row.kind === "kit-part") {
                      const { kit, part } = row;
                      const ci = part.catalogItem;
                      return (
                        <tr
                          key={`kit-part-${kit.id}-${ci.id}`}
                          className="border-t border-[var(--line)] hover:bg-[var(--panel-muted)]"
                        >
                          <td className="px-2 py-2" />
                          <td className="px-2 py-2 tabular-nums text-xs text-[var(--muted)]">
                            {"equipmentCode" in ci && ci.equipmentCode
                              ? String(ci.equipmentCode)
                              : ci.id.slice(-6)}
                          </td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-2 font-semibold text-[var(--ink)]">
                              <TypeGlyph
                                kind={
                                  "itemKind" in ci && typeof ci.itemKind === "string"
                                    ? ci.itemKind
                                    : "EQUIPMENT"
                                }
                              />
                              {ci.name}
                            </span>
                          </td>
                          <td className="px-2 py-2 tabular-nums">
                            {formatMoney(ci.basePrice)}
                          </td>
                          <td className="px-2 py-2 text-center tabular-nums">
                            {part.qty}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <CardProfileButton
                              label="Карточка"
                              onClick={() => setCardItemId(ci.id)}
                            />
                          </td>
                        </tr>
                      );
                    }

                    if (row.kind === "unit") {
                      const { unit, item } = row;
                      const article = formatUnitId(
                        item.equipmentCode,
                        unit.unitNumber,
                      );
                      return (
                        <tr
                          key={`unit-${unit.id}`}
                          className={`border-t border-[var(--line)] hover:bg-[var(--panel-muted)] ${
                            selectedUnitIds.has(unit.id)
                              ? "bg-[var(--selected)]/40"
                              : ""
                          }`}
                        >
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={selectedUnitIds.has(unit.id)}
                              onChange={() => toggleUnitSelected(unit.id)}
                              aria-label={`Выбрать ${article}`}
                            />
                          </td>
                          <td className="px-2 py-2 tabular-nums text-xs text-[var(--muted)]">
                            {article}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/q/${unit.qrToken}`}
                              target="_blank"
                              className="inline-flex items-center gap-2 font-semibold text-[var(--ink)] hover:underline"
                            >
                              <TypeGlyph kind="unit" />
                              {unit.label || `Ед. №${unit.unitNumber}`}
                              <FirmTag
                                owners={unit.owner ? [unit.owner] : []}
                              />
                            </Link>
                          </td>
                          <td className="px-2 py-2 text-[var(--muted)]">—</td>
                          <td className="px-2 py-2 text-center tabular-nums">
                            1
                          </td>
                          <td className="px-2 py-2 text-right">
                            <CardProfileButton
                              label="Карточка"
                              onClick={() => setCardItemId(item.id)}
                            />
                          </td>
                        </tr>
                      );
                    }

                    if (row.kind === "kit") {
                      const { kit } = row;
                      const isDragging =
                        dragging?.kind === "kit" && dragging.id === kit.id;
                      return (
                        <tr
                          key={`kit-${kit.id}`}
                          className={`border-t border-[var(--line)] hover:bg-[var(--panel-muted)] ${
                            isDragging ? "opacity-40" : ""
                          } ${selectedKitIds.has(kit.id) || selectedKitId === kit.id ? "bg-[var(--selected)]/40" : ""}`}
                        >
                          <td className="px-2 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={selectedKitIds.has(kit.id)}
                              onChange={() => toggleKitSelected(kit.id)}
                              aria-label={`Выбрать ${kit.name}`}
                            />
                          </td>
                          <td className="px-2 py-2 text-[var(--muted)]">—</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 text-left font-semibold text-[var(--ink)] hover:underline"
                              onClick={() => selectKit(kit)}
                            >
                              <TypeGlyph kind="kit" />
                              <span className="min-w-0">
                                {kit.name}
                                {kit.showInCatalog !== true ? (
                                  <span className="ml-1.5 rounded border border-[var(--line)] px-1 py-0.5 text-caption font-normal uppercase tracking-wide text-[var(--muted)]">
                                    не в смете
                                  </span>
                                ) : null}
                              </span>
                            </button>
                            <div className="mt-0.5 text-xs text-[var(--muted)]">
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
                                className="mr-1 inline-block cursor-grab select-none active:cursor-grabbing"
                              >
                                ⠿
                              </span>
                              {kit.components.length} в сост.
                            </div>
                          </td>
                          <td className="px-2 py-2 tabular-nums text-[var(--muted)]">
                            {formatMoney(kit.computedPrice)}
                          </td>
                          <td className="px-2 py-2 text-center text-[var(--muted)]">
                            —
                          </td>
                          <td className="px-2 py-2 text-right">
                            <button
                              type="button"
                              className="mr-2 text-sm text-[var(--accent)] hover:underline"
                              onClick={() => openEditKit(kit)}
                            >
                              Изменить
                            </button>
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
                    return (
                      <tr
                        key={`item-${item.id}`}
                        className={`border-t border-[var(--line)] hover:bg-[var(--panel-muted)] ${
                          selectedItemIds.has(item.id)
                            ? "bg-[var(--selected)]/40"
                            : ""
                        }`}
                      >
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedItemIds.has(item.id)}
                            onChange={() => toggleItemSelected(item.id)}
                            aria-label={`Выбрать ${item.name}`}
                          />
                        </td>
                        <td className="px-2 py-2 tabular-nums text-xs text-[var(--muted)]">
                          {item.equipmentCode ?? item.id.slice(-6)}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="inline-flex max-w-full items-center gap-2 text-left font-semibold text-[var(--ink)] hover:underline"
                            onClick={() =>
                              item.itemKind === "EQUIPMENT" || !item.itemKind
                                ? selectItem(item)
                                : setDrawer(item)
                            }
                          >
                            <TypeGlyph kind={item.itemKind || "EQUIPMENT"} />
                            <span className="min-w-0">
                              {item.name}
                              <FirmTag owners={item.owners} owner={item.owner} />
                              {item.showInCatalog === false ? (
                                <span className="ml-1.5 rounded border border-[var(--line)] px-1 py-0.5 text-caption font-normal uppercase tracking-wide text-[var(--muted)]">
                                  не в смете
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </td>
                        <td className="px-2 py-2 tabular-nums">
                          {formatMoney(item.basePrice)}
                        </td>
                        <td className="px-2 py-2 text-center tabular-nums">
                          {item.stockQty}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {item.itemKind === "EQUIPMENT" || !item.itemKind ? (
                            <CardProfileButton
                              label="Карточка"
                              onClick={() => setCardItemId(item.id)}
                            />
                          ) : (
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
                          )}
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

      <ActionSheet
        open={addSheetOpen}
        onClose={() => setAddSheetOpen(false)}
        title="Добавить в каталог"
        groups={[
          {
            items: CATALOG_ADD_ACTIONS.map((a) => ({
              label: a.title.replace(/^\+\s*/, ""),
              onSelect: () => onAddAction(a.id),
            })),
          },
        ]}
      />

      <ActionSheet
        open={mobileMoreOpen}
        onClose={() => setMobileMoreOpen(false)}
        title={
          selectedCount > 0 ? `Выбрано: ${selectedCount}` : "Каталог"
        }
        groups={[
          ...(selectedCount > 0
            ? [
                {
                  items: [
                    {
                      label: "Печать QR",
                      onSelect: printSelectedQr,
                    },
                    {
                      label: "Вырезать",
                      onSelect: cutSelection,
                    },
                    ...(selectedCategoryIds.size === 1
                      ? [
                          {
                            label: "Переименовать раздел",
                            onSelect: renameSelectedFolder,
                          },
                        ]
                      : []),
                    {
                      label: "Удалить",
                      danger: true,
                      disabled: bulkBusy,
                      onSelect: () => void bulkAction("delete"),
                    },
                  ],
                },
              ]
            : []),
          ...(clipboard
            ? [
                {
                  items: [
                    {
                      label: `Вставить: ${clipboard.label}`,
                      onSelect: () => void pasteClipboard(),
                    },
                  ],
                },
              ]
            : []),
          {
            title: "Файлы",
            items: [
              {
                label: "Экспорт CSV",
                disabled: csvBusy,
                onSelect: () => void exportCsv(),
              },
              {
                label: "Импорт CSV",
                disabled: csvBusy,
                onSelect: () => csvImportRef.current?.click(),
              },
              {
                label: "Складской отчёт",
                disabled: csvBusy,
                onSelect: () => void exportWarehouseCsv(),
              },
            ],
          },
        ]}
      />

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

      <Modal
        open={writeOffOpen}
        onClose={() => {
          if (!bulkBusy) setWriteOffOpen(false);
        }}
        title="Списать единицы"
        className="max-w-md"
      >
        <p className="mt-1 text-sm text-[var(--muted)]">
          Выбранные единицы будут сняты со склада как повреждённые или
          утерянные и больше не попадут в резерв.
        </p>
        <label className="mt-4 block text-sm">
          <span className="text-[var(--muted)]">Причина</span>
          <select
            className="field mt-1"
            value={writeOffReason}
            onChange={(e) =>
              setWriteOffReason(e.target.value === "LOST" ? "LOST" : "DAMAGED")
            }
          >
            <option value="DAMAGED">Повреждено</option>
            <option value="LOST">Утеряно</option>
          </select>
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-[var(--muted)]">Комментарий</span>
          <textarea
            className="field mt-1 min-h-24"
            placeholder="Что случилось, где, когда…"
            value={writeOffComment}
            onChange={(e) => setWriteOffComment(e.target.value)}
          />
        </label>
        {writeOffError ? (
          <p className="mt-2 text-sm text-[var(--danger)]">{writeOffError}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={bulkBusy}
            onClick={() => setWriteOffOpen(false)}
          >
            Отмена
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={bulkBusy}
            onClick={() => void confirmWriteOffUnits()}
          >
            {bulkBusy ? "…" : `Списать (${selectedUnitIds.size})`}
          </Button>
        </div>
      </Modal>

      <EquipmentCardDrawer
        itemId={cardItemId}
        onClose={() => setCardItemId(null)}
        onChanged={() => {
          if (cardItemId) void ensureItemUnits(cardItemId, true);
          void loadItems();
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
