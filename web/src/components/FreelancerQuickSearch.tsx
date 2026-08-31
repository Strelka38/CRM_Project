"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

export type PickedFreelancer = {
  id: string;
  name: string;
};

type Props = {
  value: string;
  onChange: (text: string) => void;
  onPick?: (freelancer: PickedFreelancer) => void;
  onBlur?: () => void;
  disabled?: boolean;
  placeholder?: string;
  inputClassName?: string;
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

export function FreelancerQuickSearch({
  value,
  onChange,
  onPick,
  onBlur,
  disabled,
  placeholder = "Начните вводить ФИО…",
  inputClassName = "field mt-1 w-full",
}: Props) {
  const [items, setItems] = useState<PickedFreelancer[]>([]);
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
      params.set("suggest", "1");
      const res = await fetch(`/api/freelancers?${params}`);
      const data: unknown = await res.json().catch(() => []);
      setItems(
        Array.isArray(data)
          ? (data as PickedFreelancer[]).map((f) => ({
              id: f.id,
              name: f.name,
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
          rankScore(a.name, trimmed) - rankScore(b.name, trimmed) ||
          a.name.localeCompare(b.name, "ru"),
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

  function pick(freelancer: PickedFreelancer) {
    onChange(freelancer.name);
    onPick?.(freelancer);
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
    <div ref={rootRef} className="relative">
      <input
        className={inputClassName}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
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
              Фрилансер не найден — можно оставить текстом
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
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(item)}
            >
              <span className="block truncate text-sm">{item.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
