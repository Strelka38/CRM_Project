"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ItemDrawer, type DrawerItem } from "@/components/ItemDrawer";
import { type PickedCatalogItem } from "@/components/CatalogPicker";
import { cn } from "@/lib/cn";
import {
  beginCatalogDrag,
  endCatalogDrag,
  setCatalogDragData,
} from "@/lib/catalog-dnd";

type CategoryNode = {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
  _count: { items: number; children: number };
};

type Props = {
  onPickItem: (item: PickedCatalogItem, qty?: number) => void;
  eventDate?: string;
  durationDays?: number;
  zoneName?: string;
  includeHidden?: boolean;
  selectionLabel?: string;
  onCancelSelection?: () => void;
  currentQtyByItem?: ReadonlyMap<string, number>;
  currentQtyLabel?: string;
  embedded?: boolean;
  addTargetLabel?: string;
};

const CATALOG_NAV = "[data-catalog-nav]";

function bumpCatalogQty(raw: string, dir: -1 | 1): string {
  const n = Math.round(Number(raw));
  const base = Number.isFinite(n) && n > 0 ? n : 1;
  return String(Math.max(1, base + dir));
}

function focusCatalogNav(from: HTMLElement, dir: -1 | 1) {
  const tree = from.closest("[data-catalog-tree]");
  const sidebar = from.closest("[data-catalog-sidebar]");
  const list = Array.from(
    tree?.querySelectorAll<HTMLElement>(CATALOG_NAV) ?? [],
  );
  const index = list.indexOf(from);
  const next = index >= 0 ? list[index + dir] : undefined;
  if (!next) {
    if (dir === -1) {
      sidebar
        ?.querySelector<HTMLInputElement>("input[type='search']")
        ?.focus();
    }
    return;
  }
  next.focus();
  if (next instanceof HTMLInputElement) next.select();
  next.scrollIntoView({ block: "nearest" });
}

function focusFirstCatalogNav(sidebar: HTMLElement) {
  const first = sidebar
    .querySelector("[data-catalog-tree]")
    ?.querySelector<HTMLElement>(CATALOG_NAV);
  if (!first) return;
  first.focus();
  if (first instanceof HTMLInputElement) first.select();
  first.scrollIntoView({ block: "nearest" });
}

function FolderIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 16"
      className="size-4 shrink-0"
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

function InlineQtyAdd({
  qty,
  onQtyChange,
  onAdd,
  addTargetLabel,
}: {
  qty: string;
  onQtyChange: (qty: string) => void;
  onAdd: (qty: number) => void;
  addTargetLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [justAdded, setJustAdded] = useState(false);
  const reselect = useRef(false);

  useLayoutEffect(() => {
    if (!reselect.current) return;
    reselect.current = false;
    inputRef.current?.select();
  }, [qty]);

  function submit() {
    const n = Math.max(1, Math.round(Number(qty) || 1));
    onAdd(n);
    onQtyChange("");
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1100);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  return (
    <div className="flex items-center gap-1 py-0.5">
      <button
        type="button"
        tabIndex={-1}
        title={`Добавить в ${addTargetLabel}`}
        aria-label={`Добавить в ${addTargetLabel}`}
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold leading-none text-white transition-colors",
          justAdded ? "bg-emerald-600" : "bg-[var(--accent)] hover:opacity-90",
        )}
        onClick={submit}
      >
        {justAdded ? "✓" : "+"}
      </button>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        data-catalog-nav="qty"
        value={qty}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw !== "" && !/^\d+$/.test(raw)) return;
          onQtyChange(raw);
        }}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
            return;
          }
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            reselect.current = true;
            onQtyChange(
              bumpCatalogQty(qty, e.key === "ArrowLeft" ? -1 : 1),
            );
            return;
          }
          if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            focusCatalogNav(e.currentTarget, e.key === "ArrowUp" ? -1 : 1);
          }
        }}
        className="quote-catalog-qty field !h-6 !w-10 px-1 py-0 text-center text-xs font-semibold tabular-nums !text-[var(--ink)]"
        aria-label="Количество"
      />
    </div>
  );
}

function CatalogItemRow({
  item,
  branched,
  addTargetLabel,
  currentQty,
  currentQtyLabel,
  onPickItem,
  onOpenDrawer,
}: {
  item: PickedCatalogItem;
  branched: boolean;
  addTargetLabel: string;
  currentQty: number;
  currentQtyLabel: string;
  onPickItem: (item: PickedCatalogItem, qty?: number) => void;
  onOpenDrawer: (item: PickedCatalogItem) => void;
}) {
  const [qty, setQty] = useState("1");
  const [dragging, setDragging] = useState(false);
  const available = item.available ?? item.stockQty;
  const low = available <= 0;
  const addQty = Math.max(1, Math.round(Number(qty) || 1));

  return (
    <div className="relative">
      {branched ? (
        <span
          className="catalog-tree-guide catalog-tree-guide-h absolute -left-3 top-5 h-px w-3"
          aria-hidden
        />
      ) : null}
      <div
        draggable
        title={`Перетащить в ${addTargetLabel}`}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("input, button, [data-no-drag]")) return;
          const qtyInput = e.currentTarget.querySelector<HTMLInputElement>(
            'input[data-catalog-nav="qty"]',
          );
          qtyInput?.focus();
        }}
        onDragStart={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest("input, [data-no-drag]")) {
            e.preventDefault();
            return;
          }
          const payload = beginCatalogDrag(item, addQty);
          setCatalogDragData(e.dataTransfer, payload);
          setDragging(true);
        }}
        onDragEnd={() => {
          endCatalogDrag();
          setDragging(false);
        }}
        className={cn(
          "flex min-w-0 cursor-grab items-start gap-1 border-b border-[var(--line)]/50 px-1 py-0.5 hover:bg-[var(--header-hover)] active:cursor-grabbing",
          dragging && "opacity-50",
        )}
      >
        <span className="mt-1 shrink-0 text-caption text-[var(--muted)]" aria-hidden>
          ▱
        </span>
        <div className="min-w-0 flex-1">
          <div className="grid min-w-0 grid-cols-[1.5rem_1.5rem_2.75rem_minmax(0,1fr)_1.1rem] items-center gap-0.5">
            <span
              className={cn(
                "text-right text-xs font-bold tabular-nums",
                low ? "text-amber-400" : "text-sky-400",
              )}
              title={
                item.available != null
                  ? `На складе ${item.stockQty} · свободно ${available}`
                  : `На складе ${item.stockQty}`
              }
            >
              {item.stockQty}
            </span>
            <span
              className="text-right text-xs font-semibold tabular-nums text-[var(--muted)]"
              title={currentQtyLabel}
            >
              {currentQty}
            </span>
            <span
              className="text-right text-xs font-bold tabular-nums text-emerald-500 dark:text-emerald-400"
              title="Цена за штуку"
            >
              {Math.round(item.basePrice)}
            </span>
            <button
              type="button"
              tabIndex={-1}
              className="min-w-0 truncate text-left text-xs font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
              title={item.name}
              onClick={() => onOpenDrawer(item)}
            >
              {item.name}
            </button>
            <button
              type="button"
              tabIndex={-1}
              data-no-drag
              className="flex size-5 items-center justify-center rounded-full border border-[var(--line)] text-caption text-[var(--muted)] hover:text-[var(--ink)]"
              title="Карточка"
              aria-label={`Карточка ${item.name}`}
              onClick={() => onOpenDrawer(item)}
            >
              i
            </button>
          </div>
          <div className="mt-0.5" data-no-drag>
            <InlineQtyAdd
              qty={qty}
              onQtyChange={setQty}
              addTargetLabel={addTargetLabel}
              onAdd={(n) => {
                onPickItem(item, n);
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function QuoteCatalogSidebar({
  onPickItem,
  eventDate,
  durationDays = 1,
  zoneName,
  includeHidden = false,
  selectionLabel,
  onCancelSelection,
  currentQtyByItem,
  currentQtyLabel = "Уже в текущем документе",
  embedded = false,
  addTargetLabel = "смету",
}: Props) {
  const [q, setQ] = useState("");
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [itemsByCat, setItemsByCat] = useState<Record<string, PickedCatalogItem[]>>(
    {},
  );
  const [loadingCats, setLoadingCats] = useState<Record<string, boolean>>({});
  const [searchItems, setSearchItems] = useState<PickedCatalogItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [drawer, setDrawer] = useState<DrawerItem | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const inFlightRef = useRef(new Set<string>());
  const loadedRef = useRef(new Set<string>());
  const fetchGen = useRef(0);

  const searching = q.trim().length > 0;

  useEffect(() => {
    const qs = includeHidden
      ? "/api/catalog/categories?tree=1"
      : "/api/catalog/categories?tree=1&forQuote=1";
    void fetch(qs)
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setCategories(data as CategoryNode[]);
      });
  }, [includeHidden]);

  const byParent = useMemo(() => {
    const map = new Map<string | null, CategoryNode[]>();
    for (const cat of categories) {
      const key = cat.parentId;
      const list = map.get(key) ?? [];
      list.push(cat);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, "ru"));
    }
    return map;
  }, [categories]);

  const roots = byParent.get(null) ?? [];

  const loadCategoryItems = useCallback(
    async (categoryId: string) => {
      if (
        loadedRef.current.has(categoryId) ||
        inFlightRef.current.has(categoryId)
      ) {
        return;
      }
      const gen = fetchGen.current;
      inFlightRef.current.add(categoryId);
      setLoadingCats((prev) => ({ ...prev, [categoryId]: true }));
      const params = new URLSearchParams();
      params.set("categoryId", categoryId);
      if (eventDate) params.set("eventDate", eventDate);
      params.set("days", String(durationDays));
      if (includeHidden) params.set("includeHidden", "1");
      try {
        const res = await fetch(`/api/catalog/items?${params}`);
        const data: unknown = await res.json().catch(() => []);
        if (gen !== fetchGen.current) return;
        loadedRef.current.add(categoryId);
        setItemsByCat((prev) => ({
          ...prev,
          [categoryId]:
            res.ok && Array.isArray(data) ? (data as PickedCatalogItem[]) : [],
        }));
      } finally {
        if (gen === fetchGen.current) {
          inFlightRef.current.delete(categoryId);
          setLoadingCats((prev) => ({ ...prev, [categoryId]: false }));
        }
      }
    },
    [durationDays, eventDate, includeHidden],
  );

  useEffect(() => {
    fetchGen.current += 1;
    inFlightRef.current.clear();
    loadedRef.current.clear();
    setItemsByCat({});
    setLoadingCats({});
  }, [eventDate, durationDays, includeHidden]);

  useEffect(() => {
    for (const id of expanded) {
      void loadCategoryItems(id);
    }
  }, [expanded, eventDate, durationDays, loadCategoryItems]);

  useEffect(() => {
    if (!searching) {
      setSearchItems([]);
      setSearchLoading(false);
      return;
    }
    const trimmed = q.trim();
    setSearchLoading(true);
    const t = window.setTimeout(async () => {
      const params = new URLSearchParams();
      params.set("q", trimmed);
      if (eventDate) params.set("eventDate", eventDate);
      params.set("days", String(durationDays));
      if (includeHidden) params.set("includeHidden", "1");
      const res = await fetch(`/api/catalog/items?${params}`);
      const data: unknown = await res.json().catch(() => []);
      setSearchItems(res.ok && Array.isArray(data) ? (data as PickedCatalogItem[]) : []);
      setSearchLoading(false);
    }, 180);
    return () => window.clearTimeout(t);
  }, [durationDays, eventDate, includeHidden, q, searching]);

  function toggleExpand(cat: CategoryNode) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat.id)) next.delete(cat.id);
      else next.add(cat.id);
      return next;
    });
  }

  function renderItem(item: PickedCatalogItem, branched = true) {
    return (
      <CatalogItemRow
        key={item.id}
        item={item}
        branched={branched}
        addTargetLabel={addTargetLabel}
        currentQty={currentQtyByItem?.get(item.id) || 0}
        currentQtyLabel={currentQtyLabel}
        onPickItem={onPickItem}
        onOpenDrawer={setDrawer}
      />
    );
  }

  function renderNode(
    cat: CategoryNode,
    depth: number,
  ) {
    const kids = byParent.get(cat.id) ?? [];
    const hasKids = kids.length > 0;
    const isOpen = expanded.has(cat.id);
    const items = itemsByCat[cat.id];
    const loading = loadingCats[cat.id];
    const itemCount = items?.length ?? cat._count.items;
    const canExpand = hasKids || cat._count.items > 0;

    return (
      <div key={cat.id} className="relative">
        {depth > 0 ? (
          <span
            className="catalog-tree-guide catalog-tree-guide-h absolute -left-3 top-4 h-px w-3"
            aria-hidden
          />
        ) : null}
        <button
          type="button"
          data-catalog-nav="folder"
          data-catalog-id={cat.id}
          data-catalog-parent={cat.parentId ?? ""}
          aria-expanded={canExpand ? isOpen : undefined}
          onClick={() => (canExpand ? toggleExpand(cat) : undefined)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              if (!canExpand) return;
              e.preventDefault();
              toggleExpand(cat);
              return;
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              focusCatalogNav(e.currentTarget, e.key === "ArrowUp" ? -1 : 1);
              return;
            }
            if (e.key === "ArrowRight") {
              e.preventDefault();
              if (canExpand && !isOpen) toggleExpand(cat);
              else focusCatalogNav(e.currentTarget, 1);
              return;
            }
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              if (isOpen) {
                toggleExpand(cat);
                return;
              }
              if (!cat.parentId) {
                searchRef.current?.focus();
                return;
              }
              const tree = e.currentTarget.closest("[data-catalog-tree]");
              const parent = tree?.querySelector<HTMLElement>(
                `[data-catalog-nav="folder"][data-catalog-id="${CSS.escape(cat.parentId)}"]`,
              );
              parent?.focus();
              parent?.scrollIntoView({ block: "nearest" });
            }
          }}
          className={cn(
            "quote-catalog-folder relative z-[1] flex w-full items-center gap-1 rounded-md py-1 pr-1.5 text-left transition-colors hover:bg-[var(--header-hover)]",
            depth === 0 && "mt-0.5 border-t border-[var(--line)] pt-1.5",
            isOpen && "text-[var(--accent-deep)]",
          )}
        >
          <span className="flex h-5 w-3 shrink-0 items-center justify-center text-caption text-[var(--muted)]">
            {canExpand ? (isOpen ? "▾" : "▸") : "·"}
          </span>
          <FolderIcon open={isOpen} />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[var(--ink)]",
              depth === 0 ? "text-xs font-semibold" : "text-xs font-medium",
            )}
          >
            {cat.name}
          </span>
          {itemCount > 0 ? (
            <span className="min-w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--muted)]">
              {itemCount}
            </span>
          ) : null}
        </button>
        {isOpen && (
          <div className="relative ml-1.5 border-l border-dotted border-[var(--tree-line)] pl-3">
            {kids.map((child) => renderNode(child, depth + 1))}
            {loading && !items ? (
              <p
                className="px-2 py-1 text-caption text-[var(--muted)]"
              >
                Загрузка…
              </p>
            ) : null}
            {items?.map((item) => renderItem(item))}
            {items && items.length === 0 && !hasKids ? (
              <p
                className="px-2 py-1 text-caption text-[var(--muted)]"
              >
                Нет позиций
              </p>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <aside
      data-catalog-sidebar
      className={cn(
        "flex min-h-0 w-full flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]",
        embedded
          ? "h-full max-h-none"
          : "max-h-[46vh] lg:sticky lg:top-2 lg:h-[calc(100dvh-5.5rem)] lg:max-h-none lg:w-[280px] lg:shrink-0 xl:w-[300px]",
      )}
    >
      <div className="border-b border-[var(--line)] px-2 py-1.5">
        <div className="flex items-center gap-2">
          <input
            id="quote-catalog-search"
            ref={searchRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                const sidebar = e.currentTarget.closest("[data-catalog-sidebar]");
                if (!sidebar) return;
                e.preventDefault();
                focusFirstCatalogNav(sidebar);
              }
            }}
            placeholder="Поиск"
            className="field min-w-0 flex-1 px-2 py-1 text-xs"
            autoComplete="off"
          />
        </div>
        {zoneName ? (
          <p className="mt-1 text-caption text-[var(--muted)]">
            Добавление в «{zoneName}» · перетащите или + · ⌘K поиск
          </p>
        ) : (
          <p className="mt-1 text-caption text-[var(--muted)]">
            Раскройте раздел — позиции внутри дерева
          </p>
        )}
      </div>

      {selectionLabel ? (
        <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[var(--selected)] px-3 py-2">
          <p className="min-w-0 flex-1 text-xs font-medium text-[var(--accent-deep)]">
            {selectionLabel}
          </p>
          {onCancelSelection ? (
            <button
              type="button"
              onClick={onCancelSelection}
              className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--ink)]"
            >
              Отмена
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        data-catalog-tree
        className="catalog-tree quote-catalog-tree min-h-[220px] flex-1 overflow-y-auto px-1.5 pb-1.5 text-xs lg:min-h-0"
      >
        {searching ? (
          <>
            {searchLoading && searchItems.length === 0 ? (
              <p className="px-2 py-3 text-xs text-[var(--muted)]">Поиск…</p>
            ) : null}
            {!searchLoading && searchItems.length === 0 ? (
              <p className="px-2 py-3 text-xs text-[var(--muted)]">
                Ничего не найдено
              </p>
            ) : null}
            {searchItems.map((item) => renderItem(item, false))}
          </>
        ) : null}

        {!searching ? (
          roots.length === 0 ? (
            <p className="px-2 py-3 text-xs text-[var(--muted)]">Нет разделов</p>
          ) : (
            roots.map((root) => renderNode(root, 0))
          )
        ) : null}

      </div>

      <ItemDrawer
        item={drawer}
        onClose={() => setDrawer(null)}
        onAdd={(item) => {
          onPickItem(item as PickedCatalogItem, 1);
          setDrawer(null);
        }}
      />
    </aside>
  );
}
