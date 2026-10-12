"use client";

import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import { formatIsoRuDate } from "@/lib/dates";
import type { ZonePricing } from "@/lib/zone-pricing";

type Hit = {
  id: string;
  eventName: string;
  date: string;
  proposalNumber: string;
  client: string;
  managerName: string;
};

type BlockPayload = {
  type: string;
  sortOrder: number;
  title?: string | null;
  name?: string | null;
  qty?: number | null;
  unitPrice?: number | null;
  cashlessOverride?: number | null;
  dayMode?: string | null;
  dayCoefOverride?: number | null;
  catalogItemId?: string | null;
  kitId?: string | null;
};

type EventGroup = {
  key: string;
  eventName: string;
  date: string;
  quotes: Hit[];
};

function groupHits(hits: Hit[]): EventGroup[] {
  const groups = new Map<string, EventGroup>();
  for (const hit of hits) {
    const eventName = hit.eventName.trim() || "Без названия";
    const rawDate = hit.date.trim();
    const date = /^\d{4}-\d{2}-\d{2}/.test(rawDate)
      ? formatIsoRuDate(rawDate)
      : rawDate || "без даты";
    const key = `${eventName}||${date}`;
    const group = groups.get(key) ?? { key, eventName, date, quotes: [] };
    group.quotes.push(hit);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function QuoteCopySheetModal({
  open,
  quoteId,
  zoneName,
  active,
  pricing,
  blocks,
  onClose,
  onCopied,
}: {
  open: boolean;
  quoteId: string;
  zoneName: string;
  active: boolean;
  pricing: ZonePricing;
  blocks: BlockPayload[];
  onClose: () => void;
  onCopied: (message: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [eventKey, setEventKey] = useState("");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHits([]);
    setEventKey("");
    setTargetId("");
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 1) {
      setHits([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      setLoading(true);
      void fetch(`/api/quotes?q=${encodeURIComponent(q)}`)
        .then(async (res) => {
          const data = await res.json().catch(() => []);
          if (!res.ok) {
            setError(
              typeof data.error === "string" ? data.error : "Не удалось найти сметы",
            );
            setHits([]);
            return;
          }
          setError("");
          setHits(Array.isArray(data) ? (data as Hit[]) : []);
        })
        .catch(() => setError("Не удалось найти сметы"))
        .finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(timer);
  }, [open, query]);

  const groups = useMemo(() => groupHits(hits), [hits]);
  const selected = groups.find((group) => group.key === eventKey) ?? null;
  const quoteOptions = (selected?.quotes ?? []).filter((hit) => hit.id !== quoteId);
  const optionKey = quoteOptions.map((hit) => hit.id).join(",");

  useEffect(() => {
    if (!selected) {
      setTargetId("");
      return;
    }
    const ids = optionKey ? optionKey.split(",") : [];
    setTargetId((prev) => (ids.includes(prev) ? prev : (ids[0] ?? "")));
  }, [selected, optionKey]);

  async function submit() {
    if (!targetId) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/quotes/${quoteId}/zones/copy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetQuoteId: targetId,
          name: zoneName,
          active,
          pricing,
          blocks: blocks.map((b, index) => ({
            type: b.type,
            sortOrder: b.sortOrder ?? index,
            title: b.title ?? null,
            name: b.name ?? null,
            qty: b.qty ?? 0,
            unitPrice: b.unitPrice ?? 0,
            cashlessOverride: b.cashlessOverride ?? null,
            dayMode: b.dayMode ?? "HALF_EXTRA",
            dayCoefOverride: b.dayCoefOverride ?? null,
            catalogItemId: b.catalogItemId ?? null,
            kitId: b.kitId ?? null,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось скопировать");
        return;
      }
      const label = [data.eventName, data.date].filter(Boolean).join(", ");
      onCopied(
        `Лист «${zoneName}» скопирован в КП №${data.proposalNumber || "—"}${
          label ? ` · ${label}` : ""
        }`,
      );
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Копировать лист в…" className="max-w-lg">
      <p className="text-sm text-[var(--muted)]">
        Найдите мероприятие по названию или дате и выберите, в какую смету положить лист «{zoneName}».
      </p>
      <label className="mt-3 block text-sm">
        <span className="text-[var(--muted)]">Мероприятие</span>
        <input
          className="field mt-1"
          value={query}
          placeholder="Название или дата"
          autoFocus
          onChange={(e) => {
            setQuery(e.target.value);
            setEventKey("");
          }}
        />
      </label>

      {query.trim() ? (
        <div className="mt-2 max-h-52 overflow-y-auto rounded-md border border-[var(--line)]">
          {loading ? (
            <p className="px-3 py-2 text-sm text-[var(--muted)]">Ищем…</p>
          ) : groups.length === 0 ? (
            <p className="px-3 py-2 text-sm text-[var(--muted)]">Ничего не нашлось</p>
          ) : (
            groups.map((group) => (
              <button
                key={group.key}
                type="button"
                className={cn(
                  "flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--selected)]/40",
                  eventKey === group.key && "bg-[var(--selected)]/50",
                )}
                onClick={() => setEventKey(group.key)}
              >
                <span className="min-w-0 truncate">{group.eventName}</span>
                <span className="shrink-0 text-caption text-[var(--muted)]">{group.date}</span>
              </button>
            ))
          )}
        </div>
      ) : null}

      {selected ? (
        <label className="mt-3 block text-sm">
          <span className="text-[var(--muted)]">Смета</span>
          {quoteOptions.length === 0 ? (
            <p className="mt-1 text-sm text-[var(--muted)]">
              На этом мероприятии только текущая смета.
            </p>
          ) : (
            <select
              className="field mt-1"
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
            >
              {quoteOptions.map((hit) => (
                <option key={hit.id} value={hit.id}>
                  КП №{hit.proposalNumber || "—"}
                  {hit.client ? ` · ${hit.client}` : ""}
                  {hit.managerName ? ` · ${hit.managerName}` : ""}
                </option>
              ))}
            </select>
          )}
        </label>
      ) : null}

      {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
          onClick={onClose}
        >
          Отмена
        </button>
        <button
          type="button"
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
          disabled={!targetId || busy}
          onClick={() => void submit()}
        >
          {busy ? "Копируем…" : "Копировать"}
        </button>
      </div>
    </Modal>
  );
}
