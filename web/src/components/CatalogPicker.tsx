"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ItemDrawer, type DrawerItem } from "@/components/ItemDrawer";
import { formatMoney } from "@/lib/format";

export type PickedCatalogItem = DrawerItem & {
  cashlessOverride: number | null;
  dayMode: string;
  category: { id: string; name: string; path: string; subtotalLabel: string };
};

export type PickedKit = {
  id: string;
  name: string;
  categoryId: string | null;
  category?: { id: string; name: string; path: string; subtotalLabel: string } | null;
  components: Array<{
    qty: number;
    catalogItem: PickedCatalogItem;
  }>;
  computedPrice: number;
};

type CategoryNode = {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  _count: { items: number; children: number };
};

type Props = {
  open: boolean;
  onClose: () => void;
  onPickItem: (item: PickedCatalogItem, qty?: number) => void;
  onPickKit?: (kit: PickedKit, qty?: number) => void;
  eventDate?: string;
  durationDays?: number;
};

function QtyAddControl({
  onAdd,
  addedTotal = 0,
}: {
  onAdd: (qty: number) => void;
  addedTotal?: number;
}) {
  const [qty, setQty] = useState("1");
  const [justAdded, setJustAdded] = useState(false);

  function submit() {
    const n = Math.max(1, Math.round(Number(qty) || 1));
    onAdd(n);
    setQty("1");
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1200);
  }

  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5">
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={1}
          step={1}
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          className="field !w-14 px-1.5 py-1 text-center text-sm tabular-nums"
          aria-label="Количество"
        />
        <button
          type="button"
          title="Добавить в смету"
          aria-label="Добавить в смету"
          className={`flex h-8 w-8 items-center justify-center rounded-md text-lg font-semibold leading-none text-white transition-colors ${
            justAdded ? "bg-emerald-600" : "bg-[var(--accent)]"
          }`}
          onClick={submit}
        >
          {justAdded ? "✓" : "+"}
        </button>
      </div>
      {addedTotal > 0 && (
        <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
          добавлено: {addedTotal}
        </span>
      )}
    </div>
  );
}

export function CatalogPicker({
  open,
  onClose,
  onPickItem,
  onPickKit,
  eventDate,
  durationDays = 1,
}: Props) {
  const [tab, setTab] = useState<"items" | "kits">("items");
  const [kind, setKind] = useState<"ALL" | "EQUIPMENT" | "PERSONNEL" | "SERVICE">(
    "ALL",
  );
  const [q, setQ] = useState("");
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [pathFilter, setPathFilter] = useState("");
  const [items, setItems] = useState<PickedCatalogItem[]>([]);
  const [kits, setKits] = useState<PickedKit[]>([]);
  const [loading, setLoading] = useState(false);
  const [drawer, setDrawer] = useState<DrawerItem | null>(null);
  const [addedCounts, setAddedCounts] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<{ text: string; key: number } | null>(
    null,
  );

  function noteAdded(id: string, name: string, qty: number) {
    setAddedCounts((prev) => ({
      ...prev,
      [id]: (prev[id] || 0) + qty,
    }));
    setToast({ text: `Добавлено: ${name} × ${qty}`, key: Date.now() });
  }

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!open) {
      setAddedCounts({});
      setToast(null);
    }
  }, [open]);

  const roots = useMemo(
    () => categories.filter((c) => !c.parentId).sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [categories],
  );

  const childrenOf = (parentPath: string) =>
    categories
      .filter(
        (c) =>
          c.parentId &&
          c.path.startsWith(parentPath + "/") &&
          c.path.split("/").length === parentPath.split("/").length + 1,
      )
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));

  useEffect(() => {
    if (!open) return;
    void fetch("/api/catalog/categories?tree=1")
      .then((r) => r.json())
      .then(setCategories);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      setLoading(true);
      if (tab === "kits") {
        const res = await fetch("/api/kits");
        setKits(await res.json());
        setLoading(false);
        return;
      }
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (kind !== "ALL") params.set("kind", kind);
      if (pathFilter) params.set("path", pathFilter);
      if (eventDate) params.set("eventDate", eventDate);
      params.set("days", String(durationDays));
      const res = await fetch(`/api/catalog/items?${params}`);
      setItems(await res.json());
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [open, q, kind, pathFilter, tab, eventDate, durationDays]);

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-4 sm:items-center"
        onClick={onClose}
      >
        <div
          className="relative flex max-h-[85vh] w-full max-w-5xl flex-col rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {toast && (
            <div
              key={toast.key}
              className="pointer-events-none absolute left-3 top-3 z-20 max-w-sm rounded-lg border border-emerald-600/40 bg-emerald-950/95 px-3 py-2 text-sm font-medium text-emerald-200 shadow-lg"
              role="status"
            >
              {toast.text}
            </div>
          )}

          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <h3 className="font-display text-xl font-semibold">Добавить в смету</h3>
            <button type="button" onClick={onClose} className="text-[var(--muted)]">
              Закрыть
            </button>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-[var(--line)] px-4 py-3">
            <button
              type="button"
              onClick={() => setTab("items")}
              className={`rounded-md px-3 py-1.5 text-sm ${tab === "items" ? "bg-[var(--accent)] text-white" : "border border-[var(--line)]"}`}
            >
              Позиции
            </button>
            <button
              type="button"
              onClick={() => setTab("kits")}
              className={`rounded-md px-3 py-1.5 text-sm ${tab === "kits" ? "bg-[var(--accent)] text-white" : "border border-[var(--line)]"}`}
            >
              Комплекты
            </button>
            {tab === "items" &&
              (
                [
                  ["ALL", "Все"],
                  ["EQUIPMENT", "Оборудование"],
                  ["PERSONNEL", "Персонал"],
                  ["SERVICE", "Услуги"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={`rounded-md px-3 py-1.5 text-sm ${kind === value ? "bg-[var(--solid)] text-[var(--on-solid)]" : "border border-[var(--line)]"}`}
                >
                  {label}
                </button>
              ))}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск…"
              className="field ml-auto max-w-xs"
            />
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[220px_1fr]">
            {tab === "items" && (
              <div className="overflow-y-auto border-r border-[var(--line)] p-2 text-sm">
                <button
                  type="button"
                  onClick={() => setPathFilter("")}
                  className={`mb-1 w-full rounded-md px-2 py-1.5 text-left font-semibold text-[var(--ink)] ${!pathFilter ? "bg-[var(--selected)]" : "hover:bg-white/10"}`}
                >
                  Весь каталог
                </button>
                {roots.map((root) => (
                  <div key={root.id} className="mb-2">
                    <button
                      type="button"
                      onClick={() => setPathFilter(root.path)}
                      className={`w-full rounded-md px-2 py-1.5 text-left font-semibold text-[var(--ink)] ${pathFilter === root.path ? "bg-[var(--selected)]" : "hover:bg-white/10"}`}
                    >
                      {root.name}
                    </button>
                    {childrenOf(root.path).map((child) => (
                      <button
                        key={child.id}
                        type="button"
                        onClick={() => setPathFilter(child.path)}
                        className={`ml-2 w-[calc(100%-0.5rem)] rounded-md px-2 py-1 text-left font-medium text-[var(--ink)] ${pathFilter === child.path ? "bg-[var(--selected)]" : "hover:bg-white/10"}`}
                      >
                        {child.name}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}

            <div className="overflow-y-auto p-2">
              {loading && (
                <p className="p-4 text-sm text-[var(--muted)]">Загрузка…</p>
              )}

              {tab === "items" &&
                !loading &&
                items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-white/10"
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setDrawer(item)}
                    >
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        {item.name}
                      </p>
                      <p className="text-xs text-[var(--muted)]">
                        {item.category.path}
                        {" · склад "}
                        {item.stockQty}
                        {item.available != null ? ` · своб. ${item.available}` : ""}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-medium tabular-nums text-[var(--ink)]">
                        {formatMoney(item.basePrice)}
                      </span>
                      <QtyAddControl
                        addedTotal={addedCounts[item.id] || 0}
                        onAdd={(qty) => {
                          onPickItem(item, qty);
                          noteAdded(item.id, item.name, qty);
                        }}
                      />
                    </div>
                  </div>
                ))}

              {tab === "kits" &&
                !loading &&
                kits.map((kit) => (
                  <div
                    key={kit.id}
                    className="mb-2 rounded-lg border border-[var(--line)] px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[var(--ink)]">{kit.name}</p>
                        <p className="text-xs text-[var(--muted)]">
                          {kit.components.length} позиций ·{" "}
                          {formatMoney(kit.computedPrice)}
                        </p>
                        <ul className="mt-1 text-xs text-[var(--muted)]">
                          {kit.components.map((c) => (
                            <li key={c.catalogItem.id}>
                              {c.qty}× {c.catalogItem.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-2">
                        <span className="text-sm font-medium tabular-nums">
                          {formatMoney(kit.computedPrice)}
                        </span>
                        <QtyAddControl
                          addedTotal={addedCounts[`kit:${kit.id}`] || 0}
                          onAdd={(qty) => {
                            onPickKit?.(kit, qty);
                            noteAdded(`kit:${kit.id}`, kit.name, qty);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>

      <ItemDrawer
        item={drawer}
        onClose={() => setDrawer(null)}
        onAdd={(item) => {
          onPickItem(item as PickedCatalogItem, 1);
          noteAdded(item.id, item.name, 1);
          setDrawer(null);
        }}
      />
    </>,
    document.body,
  );
}
