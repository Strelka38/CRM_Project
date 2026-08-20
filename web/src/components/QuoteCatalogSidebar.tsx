"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ItemDrawer, type DrawerItem } from "@/components/ItemDrawer";
import { type PickedCatalogItem } from "@/components/CatalogPicker";
import { cn } from "@/lib/cn";

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
  onAdd,
  addTargetLabel,
}: {
  onAdd: (qty: number) => void;
  addTargetLabel: string;
}) {
  const [qty, setQty] = useState("1");
  const [justAdded, setJustAdded] = useState(false);

  function submit() {
    const n = Math.max(1, Math.round(Number(qty) || 1));
    onAdd(n);
    setQty("1");
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 1100);
  }

  return (
    <div className="flex items-center gap-1.5 py-0.5">
      <button
        type="button"
        title={`Добавить в ${addTargetLabel}`}
        aria-label={`Добавить в ${addTargetLabel}`}
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full text-sm font-semibold leading-none text-white transition-colors",
          justAdded ? "bg-emerald-600" : "bg-[var(--accent)] hover:opacity-90",
        )}
        onClick={submit}
      >
        {justAdded ? "✓" : "+"}
      </button>
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
        className="quote-catalog-qty field !h-7 !w-12 px-1 py-0 text-center text-sm font-semibold tabular-nums !text-[var(--ink)]"
        aria-label="Количество"
      />
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
    const available = item.available ?? item.stockQty;
    const low = available <= 0;
    const currentQty = currentQtyByItem?.get(item.id) || 0;
    return (
      <div key={item.id} className="relative">
        {branched ? (
          <span
            className="catalog-tree-guide catalog-tree-guide-h absolute -left-3 top-5 h-px w-3"
            aria-hidden
          />
        ) : null}
        <div className="flex min-w-0 items-start gap-1 border-b border-[var(--line)]/40 px-1 py-1 hover:bg-[var(--header-hover)]">
          <span className="mt-1 shrink-0 text-[11px] text-[var(--muted)]" aria-hidden>
            ▱
          </span>
          <div className="min-w-0 flex-1">
            <div className="grid min-w-0 grid-cols-[1.75rem_1.75rem_3.25rem_minmax(0,1fr)_1.25rem] items-center gap-1">
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
                className="min-w-0 truncate text-left text-xs font-medium text-[var(--ink)] hover:text-[var(--accent)] hover:underline"
                title={item.name}
                onClick={() => setDrawer(item)}
              >
                {item.name}
              </button>
              <button
                type="button"
                className="flex size-5 items-center justify-center rounded-full border border-[var(--line)] text-[10px] text-[var(--muted)] hover:text-[var(--ink)]"
                title="Карточка"
                aria-label={`Карточка ${item.name}`}
                onClick={() => setDrawer(item)}
              >
                i
              </button>
            </div>
            <div className="mt-0.5">
              <InlineQtyAdd
                addTargetLabel={addTargetLabel}
                onAdd={(qty) => {
                  onPickItem(item, qty);
                }}
              />
            </div>
          </div>
        </div>
      </div>
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
          onClick={() => (canExpand ? toggleExpand(cat) : undefined)}
          className={cn(
            "quote-catalog-folder relative z-[1] flex w-full items-center gap-1 py-1.5 pr-2 text-left transition-colors hover:bg-[var(--header-hover)]",
            depth === 0 && "mt-1 border-t border-[var(--line)] pt-2",
            isOpen && "text-[var(--accent-deep)]",
          )}
        >
          <span className="flex h-5 w-3 shrink-0 items-center justify-center text-[9px] text-[var(--muted)]">
            {canExpand ? (isOpen ? "▾" : "▸") : "·"}
          </span>
          <FolderIcon open={isOpen} />
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[var(--ink)]",
              depth === 0 ? "text-sm font-semibold" : "text-[13px] font-medium",
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
                className="px-2 py-1 text-[11px] text-[var(--muted)]"
              >
                Загрузка…
              </p>
            ) : null}
            {items?.map((item) => renderItem(item))}
            {items && items.length === 0 && !hasKids ? (
              <p
                className="px-2 py-1 text-[11px] text-[var(--muted)]"
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
      className={cn(
        "flex min-h-0 w-full flex-col overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]",
        embedded
          ? "h-full max-h-none"
          : "max-h-[46vh] lg:sticky lg:top-3 lg:h-[calc(100dvh-6.5rem)] lg:max-h-none lg:w-[340px] lg:shrink-0 xl:w-[360px]",
      )}
    >
      <div className="border-b border-[var(--line)] px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            id="quote-catalog-search"
            ref={searchRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск"
            className="field min-w-0 flex-1 py-1.5 text-sm"
            autoComplete="off"
          />
        </div>
        {zoneName ? (
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            Добавление в «{zoneName}» · ⌘K поиск
          </p>
        ) : (
          <p className="mt-1 text-[10px] text-[var(--muted)]">
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

      <div className="catalog-tree quote-catalog-tree min-h-[220px] flex-1 overflow-y-auto px-2 pb-2 text-sm lg:min-h-0">
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
