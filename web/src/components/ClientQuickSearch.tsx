"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export type PickedClient = {
  id: string;
  companyName: string;
  contactName?: string;
  phone?: string;
  inn?: string;
};

type Props = {
  value: string;
  onChange: (text: string) => void;
  onPick: (client: PickedClient) => void;
  disabled?: boolean;
};

function rankScore(name: string, q: string): number {
  const n = name.toLowerCase();
  const query = q.toLowerCase();
  if (n === query) return 0;
  if (n.startsWith(query)) return 1;
  const idx = n.indexOf(query);
  if (idx >= 0) return 2 + idx / 100;
  return 99;
}

export function ClientQuickSearch({
  value,
  onChange,
  onPick,
  disabled,
}: Props) {
  const [items, setItems] = useState<PickedClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < 1) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const params = new URLSearchParams();
      params.set("q", trimmed);
      const res = await fetch(`/api/clients?${params}`);
      const data: unknown = await res.json().catch(() => []);
      setItems(
        Array.isArray(data)
          ? (data as PickedClient[]).map((c) => ({
              id: c.id,
              companyName: c.companyName,
              contactName: c.contactName,
              phone: c.phone,
              inn: c.inn,
            }))
          : [],
      );
      setLoading(false);
      setHighlight(0);
    }, 180);
    return () => clearTimeout(t);
  }, [value]);

  const ranked = useMemo(() => {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return [...items]
      .sort(
        (a, b) =>
          rankScore(a.companyName, trimmed) -
            rankScore(b.companyName, trimmed) ||
          a.companyName.localeCompare(b.companyName, "ru"),
      )
      .slice(0, 8);
  }, [items, value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(client: PickedClient) {
    onPick(client);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
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
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown = open && value.trim().length > 0;

  return (
    <div ref={rootRef} className="relative mt-1">
      <input
        className="field w-full"
        value={value}
        disabled={disabled}
        placeholder="Начните вводить название…"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-lg">
          {loading && ranked.length === 0 && (
            <p className="px-3 py-2 text-xs text-[var(--muted)]">Поиск…</p>
          )}
          {!loading && ranked.length === 0 && (
            <p className="px-3 py-2 text-xs text-[var(--muted)]">
              Клиент не найден — можно оставить текстом
            </p>
          )}
          {ranked.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={`block w-full border-b border-[var(--line)]/70 px-3 py-2 text-left last:border-b-0 ${
                i === highlight ? "bg-[var(--selected)]/60" : "hover:bg-white/10"
              }`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => pick(item)}
            >
              <span className="block truncate text-sm">{item.companyName}</span>
              <span className="block truncate text-[10px] text-[var(--muted)]">
                {[item.contactName, item.phone, item.inn ? `ИНН ${item.inn}` : ""]
                  .filter(Boolean)
                  .join(" · ") || "Без контакта"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
