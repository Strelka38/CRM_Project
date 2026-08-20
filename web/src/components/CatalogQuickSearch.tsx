"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { PickedCatalogItem } from "@/components/CatalogPicker";
import { formatMoney } from "@/lib/format";

type Props = {
  onPickItem: (item: PickedCatalogItem, qty?: number) => void;
  eventDate?: string;
  durationDays?: number;
  zoneName?: string;
};

function rankScore(item: PickedCatalogItem, q: string): number {
  const query = q.toLowerCase();
  const fields = [item.name, item.model, item.manufacturer].filter(
    (v): v is string => Boolean(v),
  );
  let best = 99;
  for (const raw of fields) {
    const n = raw.toLowerCase();
    if (n === query) return 0;
    if (n.startsWith(query)) best = Math.min(best, 1);
    const idx = n.indexOf(query);
    if (idx >= 0) best = Math.min(best, 2 + idx / 100);
  }
  return best;
}

function parseQty(raw: string): number {
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function CatalogQuickSearch({
  onPickItem,
  eventDate,
  durationDays = 1,
  zoneName,
}: Props) {
  const [q, setQ] = useState("");
  const [qty, setQty] = useState("1");
  const [items, setItems] = useState<PickedCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 1) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const params = new URLSearchParams();
      params.set("q", trimmed);
      if (eventDate) params.set("eventDate", eventDate);
      params.set("days", String(durationDays));
      const res = await fetch(`/api/catalog/items?${params}`);
      const data: unknown = await res.json().catch(() => []);
      setItems(res.ok && Array.isArray(data) ? (data as PickedCatalogItem[]) : []);
      setLoading(false);
      setHighlight(0);
    }, 180);
    return () => clearTimeout(t);
  }, [q, eventDate, durationDays]);

  const ranked = useMemo(() => {
    const trimmed = q.trim();
    if (!trimmed) return [];
    return [...items]
      .sort(
        (a, b) =>
          rankScore(a, trimmed) - rankScore(b, trimmed) ||
          a.name.localeCompare(b.name, "ru"),
      )
      .slice(0, 8);
  }, [items, q]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(item: PickedCatalogItem) {
    onPickItem(item, parseQty(qty));
    setQ("");
    setItems([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || ranked.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, ranked.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = ranked[highlight];
      if (item) pick(item);
    }
  }

  const showDropdown = open && q.trim().length > 0;

  return (
    <div ref={rootRef} className="relative min-w-0 w-full flex-1 sm:min-w-[14rem] sm:max-w-lg">
      <div className="flex items-center gap-1.5">
        <input
          id="quote-catalog-search"
          ref={inputRef}
          type="search"
          className="field w-full"
          placeholder={
            zoneName
              ? `Поиск → Enter в «${zoneName}»`
              : "Быстрый поиск по каталогу…"
          }
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
        />
        <input
          type="number"
          min={1}
          step={1}
          className="field !w-14 shrink-0 px-1.5 text-center tabular-nums"
          value={qty}
          title="Количество"
          aria-label="Количество"
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={onKeyDown}
        />
      </div>
      {zoneName ? (
        <p className="mt-0.5 text-[10px] text-[var(--muted)]">
          / — поиск · ⌘K — каталог · qty {parseQty(qty)} в «{zoneName}»
        </p>
      ) : null}
      {showDropdown && (
        <div className="absolute bottom-full left-0 right-0 z-20 mb-1 max-h-72 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-lg">
          {loading && ranked.length === 0 && (
            <p className="px-3 py-2 text-xs text-[var(--muted)]">Поиск…</p>
          )}
          {!loading && ranked.length === 0 && (
            <p className="px-3 py-2 text-xs text-[var(--muted)]">
              Ничего не найдено
            </p>
          )}
          {ranked.map((item, i) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 border-b border-[var(--line)]/70 px-2 py-1.5 last:border-b-0 ${
                i === highlight ? "bg-[var(--selected)]/60" : ""
              }`}
              onMouseEnter={() => setHighlight(i)}
            >
              <button
                type="button"
                className="flex size-7 shrink-0 items-center justify-center rounded-md border border-[var(--line)] text-sm text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white"
                title={`Добавить ×${parseQty(qty)}`}
                onClick={() => pick(item)}
              >
                +
              </button>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => pick(item)}
              >
                <span className="block truncate text-sm">{item.name}</span>
                <span className="block truncate text-[10px] text-[var(--muted)]">
                  {item.category?.path || item.category?.name || ""}
                  {item.basePrice != null
                    ? ` · ${formatMoney(item.basePrice)}`
                    : ""}
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
