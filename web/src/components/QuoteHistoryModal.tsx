"use client";

import { useCallback, useEffect, useState } from "react";
import { isQuoteSnapshotPayload, MAX_QUOTE_SNAPSHOTS, MAX_SPEC_SNAPSHOTS } from "@/lib/quote-history";

type SnapshotRow = {
  id: string;
  title: string;
  createdAt: string;
  createdByName: string;
  payload?: unknown;
  itemCount?: number;
};

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function quoteHint(payload: unknown): string {
  if (!isQuoteSnapshotPayload(payload)) return "";
  const items = payload.blocks.filter((b) => b.type === "ITEM").length;
  return `${items} поз.`;
}

function SnapshotColumn({
  title,
  count,
  max,
  placeholder,
  emptyText,
  value,
  onChange,
  onSave,
  saving,
  items,
  busyId,
  onRestore,
  hint,
}: {
  title: string;
  count: number;
  max: number;
  placeholder: string;
  emptyText: string;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  items: SnapshotRow[];
  busyId: string | null;
  onRestore: (id: string) => void;
  hint: (row: SnapshotRow) => string;
}) {
  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <h3 className="text-xs uppercase tracking-wider text-[var(--muted)]">
        {title} ({count} из {max})
      </h3>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <input
          className="field min-w-0 flex-1 py-1.5 text-sm"
          value={value}
          maxLength={80}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="submit"
          disabled={saving || !value.trim()}
          className="shrink-0 rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-40"
        >
          {saving ? "…" : "Снимок"}
        </button>
      </form>
      {count >= max ? (
        <p className="mt-2 text-caption text-[var(--muted)]">
          Лимит {max}. Новый снимок вытеснит самый старый.
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">{emptyText}</p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--line)]">
          {items.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {s.title?.trim() || "Без названия"}
                </p>
                <p className="truncate text-caption text-[var(--muted)]">
                  {formatWhen(s.createdAt)}
                  {" · "}
                  {s.createdByName}
                  {hint(s) ? ` · ${hint(s)}` : ""}
                </p>
              </div>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => onRestore(s.id)}
                className="shrink-0 rounded-md border border-[var(--line)] px-2.5 py-1 text-xs disabled:opacity-40"
              >
                {busyId === s.id ? "Откат…" : "Вернуть"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function QuoteHistoryPanel({
  quoteId,
  onRestored,
  onBeforeQuoteSnapshot,
  onBeforeSpecSnapshot,
}: {
  quoteId: string;
  onRestored: (kind: "quote" | "spec") => void;
  onBeforeQuoteSnapshot?: () => Promise<boolean | void>;
  onBeforeSpecSnapshot?: () => Promise<boolean | void>;
}) {
  const [quoteSnaps, setQuoteSnaps] = useState<SnapshotRow[]>([]);
  const [specSnaps, setSpecSnaps] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [quoteTitle, setQuoteTitle] = useState("");
  const [specTitle, setSpecTitle] = useState("");
  const [savingKind, setSavingKind] = useState<"quote" | "spec" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const res = await fetch(`/api/quotes/${quoteId}/history`);
    if (!res.ok) {
      setError("Не удалось загрузить историю");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setQuoteSnaps(Array.isArray(data.snapshots) ? data.snapshots : []);
    setSpecSnaps(Array.isArray(data.specSnapshots) ? data.specSnapshots : []);
    setLoading(false);
  }, [quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSnapshot(kind: "quote" | "spec") {
    const name = (kind === "quote" ? quoteTitle : specTitle).trim();
    if (!name) {
      setError("Дайте название снимку");
      return;
    }
    setSavingKind(kind);
    setError("");
    const before = kind === "quote" ? onBeforeQuoteSnapshot : onBeforeSpecSnapshot;
    if (before) {
      const ok = await before();
      if (ok === false) {
        setSavingKind(null);
        return;
      }
    }
    const res = await fetch(`/api/quotes/${quoteId}/history`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: name, kind }),
    });
    setSavingKind(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string" ? data.error : "Не удалось сохранить снимок",
      );
      return;
    }
    if (kind === "quote") setQuoteTitle("");
    else setSpecTitle("");
    void load();
  }

  async function restore(kind: "quote" | "spec", id: string) {
    const label = kind === "quote" ? "смету" : "спецификацию";
    if (!confirm(`Вернуть ${label} к этому снимку? Текущие правки заменятся.`)) {
      return;
    }
    setBusyId(id);
    setError("");
    const res = await fetch(`/api/quotes/${quoteId}/history/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshotId: id, kind }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string" ? data.error : "Не удалось откатить",
      );
      return;
    }
    onRestored(kind);
    void load();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {error ? (
        <p className="text-sm text-[var(--danger)] lg:col-span-2">{error}</p>
      ) : null}
      {loading ? (
        <p className="text-sm text-[var(--muted)] lg:col-span-2">Загрузка…</p>
      ) : (
        <>
          <SnapshotColumn
            title="Смета"
            count={quoteSnaps.length}
            max={MAX_QUOTE_SNAPSHOTS}
            placeholder="Название снимка сметы"
            emptyText="Пока нет снимков сметы."
            value={quoteTitle}
            onChange={setQuoteTitle}
            onSave={() => void saveSnapshot("quote")}
            saving={savingKind === "quote"}
            items={quoteSnaps}
            busyId={busyId}
            onRestore={(id) => void restore("quote", id)}
            hint={(row) => quoteHint(row.payload)}
          />
          <SnapshotColumn
            title="Спецификация"
            count={specSnaps.length}
            max={MAX_SPEC_SNAPSHOTS}
            placeholder="Название снимка спеки"
            emptyText="Пока нет снимков спецификации."
            value={specTitle}
            onChange={setSpecTitle}
            onSave={() => void saveSnapshot("spec")}
            saving={savingKind === "spec"}
            items={specSnaps}
            busyId={busyId}
            onRestore={(id) => void restore("spec", id)}
            hint={(row) =>
              typeof row.itemCount === "number" ? `${row.itemCount} поз.` : ""
            }
          />
        </>
      )}
    </div>
  );
}
