"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  CatalogPicker,
  type PickedCatalogItem,
} from "@/components/CatalogPicker";
import { QuoteAssignments } from "@/components/QuoteAssignments";
import {
  StockHeaderCells,
  StockMarks,
  type StockInfo,
} from "@/components/StockMarks";
import { cn } from "@/lib/cn";
import { reorderBlocksByDrop } from "@/lib/quote-block-groups";

type SpecLine = {
  key: string;
  deriveKey: string | null;
  source: "derived" | "extra";
  type: "SECTION" | "ITEM";
  title: string | null;
  name: string | null;
  qty: number;
  comment: string;
  kitName: string | null;
  catalogItemId: string | null;
  extraId: string | null;
  hidden: boolean;
  isKitHeader?: boolean;
};

type Override = {
  deriveKey: string;
  action: "HIDE" | "SET_QTY" | "RENAME" | "SET_COMMENT" | "REPLACE";
  qty?: number | null;
  name?: string | null;
  catalogItemId?: string | null;
};

type Extra = {
  id: string;
  type: "SECTION" | "ITEM";
  sortOrder: number;
  title?: string | null;
  name?: string | null;
  qty?: number;
  comment?: string;
  catalogItemId?: string | null;
};

type EditableExtra = Extra & { key: string };

type StaffRow = {
  id: string;
  userId: string;
  name: string;
  specialtyId: string;
  specialtyName: string;
};

type ReplaceTarget =
  | { kind: "derived"; key: string; deriveKey: string }
  | { kind: "extra"; key: string };

type PickerMode =
  | { mode: "add" }
  | { mode: "replace"; target: ReplaceTarget }
  | { mode: "insert"; index: number };

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `x${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function extraKey(id: string) {
  return `extra:${id}`;
}

function EyeIcon({ crossed }: { crossed?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M4 4l16 16" />}
    </svg>
  );
}

function SwapIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M16 3l4 4-4 4" />
      <path d="M20 7H10" />
      <path d="M8 21l-4-4 4-4" />
      <path d="M4 17h10" />
    </svg>
  );
}

function DragHandle({
  label,
  onDragStart,
  onDragEnd,
}: {
  label: string;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <span
      draggable
      title={label}
      aria-label={label}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="mt-1 inline-flex cursor-grab select-none items-center justify-center rounded px-1 text-[var(--muted)] hover:bg-black/5 hover:text-[var(--ink)] active:cursor-grabbing"
    >
      ⠿
    </span>
  );
}

export function SpecEditor({
  quoteId,
  isManager = false,
}: {
  quoteId: string;
  isManager?: boolean;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState<{
    proposalNumber: string;
    eventName: string;
    date: string;
    place: string;
    client: string;
    durationDays: number;
  } | null>(null);
  const [derived, setDerived] = useState<SpecLine[]>([]);
  const [extras, setExtras] = useState<EditableExtra[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [lineOrder, setLineOrder] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [picker, setPicker] = useState<PickerMode | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [showHidden, setShowHidden] = useState(true);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, StockInfo | null>>(
    {},
  );
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [gapIndex, setGapIndex] = useState<number | null>(null);
  const dirtyRef = useRef(false);
  const lineOrderRef = useRef<string[]>([]);
  lineOrderRef.current = lineOrder;

  const applyPayload = useCallback((data: Record<string, unknown>) => {
    setMeta({
      proposalNumber: String(data.proposalNumber ?? ""),
      eventName: String(data.eventName ?? ""),
      date: String(data.date ?? ""),
      place: String(data.place ?? ""),
      client: String(data.client ?? ""),
      durationDays: Number(data.durationDays) || 1,
    });
    setCanEdit(Boolean(data.canEdit));
    const lines: SpecLine[] = ((data.lines as SpecLine[]) || []).map(
      (l): SpecLine => ({
        ...l,
        comment: l.comment ?? "",
      }),
    );
    setDerived(lines.filter((l) => l.source === "derived"));
    setExtras(
      ((data.extras as Array<Extra>) || []).map(
        (e): EditableExtra => ({
          key: extraKey(e.id),
          id: e.id,
          type: e.type,
          sortOrder: e.sortOrder,
          title: e.title,
          name: e.name,
          qty: e.qty,
          comment: e.comment ?? "",
          catalogItemId: e.catalogItemId,
        }),
      ),
    );
    setOverrides(
      ((data.overrides as Override[]) || []).map(
        (o): Override => ({
          deriveKey: o.deriveKey,
          action: o.action,
          qty: o.qty,
          name: o.name,
          catalogItemId: o.catalogItemId,
        }),
      ),
    );
    setLineOrder(
      Array.isArray(data.lineOrder)
        ? (data.lineOrder as string[])
        : lines.map((l) => l.key),
    );
    setAssignments((data.assignments as StaffRow[]) || []);
    dirtyRef.current = false;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/quotes/${quoteId}/spec`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMeta(null);
        setError(
          typeof data.error === "string"
            ? data.error
            : res.status === 404
              ? "Смета не найдена или нет доступа"
              : `Ошибка загрузки спецификации (${res.status})`,
        );
        return;
      }
      applyPayload(data);
    } catch {
      setMeta(null);
      setError("Не удалось связаться с сервером");
    } finally {
      setLoading(false);
    }
  }, [quoteId, applyPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (
      nextOverrides: Override[],
      nextExtras: EditableExtra[],
      nextOrder: string[],
    ) => {
      if (!canEdit || !dirtyRef.current) return;
      setSaving(true);
      setError("");
      const res = await fetch(`/api/quotes/${quoteId}/spec`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overrides: nextOverrides,
          extras: nextExtras.map((e, i) => ({
            id: e.id,
            type: e.type,
            sortOrder: i,
            title: e.title ?? null,
            name: e.name ?? null,
            qty: e.qty ?? 0,
            comment: e.comment ?? "",
            catalogItemId: e.catalogItemId ?? null,
          })),
          lineOrder: nextOrder,
        }),
      });
      setSaving(false);
      if (!res.ok) {
        setError("Не удалось сохранить");
        return;
      }
      const data = await res.json().catch(() => null);
      if (data) applyPayload(data);
      setSavedAt(new Date().toLocaleTimeString("ru-RU"));
    },
    [canEdit, quoteId, applyPayload],
  );

  useEffect(() => {
    if (loading || !canEdit || !dirtyRef.current) return;
    const t = setTimeout(() => {
      void persist(overrides, extras, lineOrder);
    }, 800);
    return () => clearTimeout(t);
  }, [overrides, extras, lineOrder, loading, canEdit, persist]);

  const allRows = useMemo(() => {
    const byKey = new Map<string, SpecLine>();
    for (const l of derived) byKey.set(l.key, l);
    for (const e of extras) {
      byKey.set(e.key, {
        key: e.key,
        deriveKey: null,
        source: "extra",
        type: e.type,
        title: e.title ?? null,
        name: e.name ?? null,
        qty: e.qty ?? 0,
        comment: e.comment ?? "",
        kitName: null,
        catalogItemId: e.catalogItemId ?? null,
        extraId: e.id,
        hidden: false,
      });
    }
    const ordered: SpecLine[] = [];
    const seen = new Set<string>();
    for (const key of lineOrder) {
      const row = byKey.get(key);
      if (row) {
        ordered.push(row);
        seen.add(key);
      }
    }
    for (const [key, row] of byKey) {
      if (!seen.has(key)) ordered.push(row);
    }
    return ordered;
  }, [derived, extras, lineOrder]);

  const displayRows = useMemo(() => {
    return allRows.filter((l) => {
      if (!l.hidden) return true;
      return canEdit && showHidden;
    });
  }, [allRows, canEdit, showHidden]);

  const neededByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of allRows) {
      if (l.hidden || l.type !== "ITEM" || !l.catalogItemId) continue;
      const q = Number(l.qty) || 0;
      if (q <= 0) continue;
      map.set(l.catalogItemId, (map.get(l.catalogItemId) || 0) + q);
    }
    return map;
  }, [allRows]);

  const catalogIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const l of allRows) {
      if (l.type === "ITEM" && l.catalogItemId) ids.add(l.catalogItemId);
    }
    return [...ids].sort().join(",");
  }, [allRows]);

  useEffect(() => {
    if (!meta || !catalogIdsKey || !canEdit) {
      setStockMap({});
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      params.set("ids", catalogIdsKey);
      if (meta.date) params.set("eventDate", meta.date);
      params.set("days", String(meta.durationDays || 1));
      params.set("excludeQuoteId", quoteId);
      void fetch(`/api/stock?${params}`)
        .then((r) => r.json())
        .then((data: Record<string, StockInfo | null>) => {
          if (data && typeof data === "object") setStockMap(data);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [meta, catalogIdsKey, quoteId, canEdit]);

  function markDirty() {
    dirtyRef.current = true;
  }

  function updateLineOrder(next: string[]) {
    markDirty();
    setLineOrder(next);
  }

  function setOverride(
    deriveKey: string,
    action: Override["action"],
    patch: {
      qty?: number | null;
      name?: string | null;
      catalogItemId?: string | null;
    },
  ) {
    markDirty();
    setOverrides((prev) => {
      const rest = prev.filter(
        (o) => !(o.deriveKey === deriveKey && o.action === action),
      );
      if (action === "HIDE") {
        return [...rest, { deriveKey, action: "HIDE" }];
      }
      if (action === "SET_QTY") {
        return [...rest, { deriveKey, action: "SET_QTY", qty: patch.qty ?? 0 }];
      }
      if (action === "SET_COMMENT") {
        return [
          ...rest,
          { deriveKey, action: "SET_COMMENT", name: patch.name ?? "" },
        ];
      }
      if (action === "REPLACE") {
        return [
          ...rest,
          {
            deriveKey,
            action: "REPLACE",
            name: patch.name ?? "",
            catalogItemId: patch.catalogItemId ?? null,
          },
        ];
      }
      return [
        ...rest,
        { deriveKey, action: "RENAME", name: patch.name ?? "" },
      ];
    });
  }

  function clearOverride(deriveKey: string, action: Override["action"]) {
    markDirty();
    setOverrides((prev) =>
      prev.filter((o) => !(o.deriveKey === deriveKey && o.action === action)),
    );
  }

  function hideLine(deriveKey: string) {
    setOverride(deriveKey, "HIDE", {});
    setDerived((prev) =>
      prev.map((l) =>
        l.deriveKey === deriveKey ? { ...l, hidden: true } : l,
      ),
    );
  }

  function unhideLine(deriveKey: string) {
    clearOverride(deriveKey, "HIDE");
    setDerived((prev) =>
      prev.map((l) =>
        l.deriveKey === deriveKey ? { ...l, hidden: false } : l,
      ),
    );
  }

  function displayName(line: SpecLine) {
    if (line.type === "SECTION") return line.title || "";
    return line.name || "";
  }

  function updateDerivedName(line: SpecLine, name: string) {
    if (!line.deriveKey) return;
    if (line.type === "SECTION") {
      setOverride(line.deriveKey, "RENAME", { name });
      setDerived((prev) =>
        prev.map((l) => (l.key === line.key ? { ...l, title: name } : l)),
      );
      return;
    }
    setOverride(line.deriveKey, "RENAME", { name });
    setDerived((prev) =>
      prev.map((l) => (l.key === line.key ? { ...l, name } : l)),
    );
  }

  function updateDerivedQty(line: SpecLine, qty: number) {
    if (!line.deriveKey || line.type !== "ITEM") return;
    setOverride(line.deriveKey, "SET_QTY", { qty });
    setDerived((prev) =>
      prev.map((l) => (l.key === line.key ? { ...l, qty } : l)),
    );
  }

  function updateDerivedComment(line: SpecLine, comment: string) {
    if (!line.deriveKey || line.type !== "ITEM") return;
    setOverride(line.deriveKey, "SET_COMMENT", { name: comment });
    setDerived((prev) =>
      prev.map((l) => (l.key === line.key ? { ...l, comment } : l)),
    );
  }

  function updateExtra(key: string, patch: Partial<EditableExtra>) {
    markDirty();
    setExtras((prev) =>
      prev.map((e) => (e.key === key ? { ...e, ...patch } : e)),
    );
  }

  function removeExtra(key: string) {
    markDirty();
    setExtras((prev) => prev.filter((e) => e.key !== key));
    updateLineOrder(lineOrderRef.current.filter((k) => k !== key));
  }

  function insertExtraAt(
    index: number,
    extra: Omit<EditableExtra, "key" | "sortOrder"> & { id: string },
  ) {
    const key = extraKey(extra.id);
    const row: EditableExtra = {
      ...extra,
      key,
      sortOrder: index,
    };
    markDirty();
    setExtras((prev) => [...prev, row]);
    const visibleKeys = displayRows.map((r) => r.key);
    const beforeKey = visibleKeys[index] ?? null;
    setLineOrder((prev) => {
      const base = prev.length ? [...prev] : allRows.map((r) => r.key);
      const without = base.filter((k) => k !== key);
      if (!beforeKey) {
        without.push(key);
        return without;
      }
      const at = without.indexOf(beforeKey);
      if (at < 0) without.push(key);
      else without.splice(at, 0, key);
      return without;
    });
  }

  function appendExtra(extra: Omit<EditableExtra, "key" | "sortOrder"> & { id: string }) {
    const key = extraKey(extra.id);
    markDirty();
    setExtras((prev) => [
      ...prev,
      { ...extra, key, sortOrder: prev.length },
    ]);
    setLineOrder((prev) => {
      const base = prev.length ? prev : allRows.map((r) => r.key);
      if (base.includes(key)) return base;
      return [...base, key];
    });
  }

  function addSection() {
    appendExtra({
      id: uid(),
      type: "SECTION",
      title: "Новый раздел",
      comment: "",
    });
  }

  function addCustomItem() {
    appendExtra({
      id: uid(),
      type: "ITEM",
      name: "Новая позиция",
      qty: 1,
      comment: "",
    });
  }

  function addFromCatalog(item: PickedCatalogItem, qty = 1) {
    const addQty = Math.max(1, Math.round(qty) || 1);
    const existing = extras.find(
      (e) => e.type === "ITEM" && e.catalogItemId === item.id,
    );
    if (existing) {
      updateExtra(existing.key, {
        qty: (Number(existing.qty) || 0) + addQty,
      });
      return;
    }
    appendExtra({
      id: uid(),
      type: "ITEM",
      name: item.name,
      qty: addQty,
      comment: "",
      catalogItemId: item.id,
    });
  }

  function insertFromCatalogAt(
    index: number,
    item: PickedCatalogItem,
    qty = 1,
  ) {
    const addQty = Math.max(1, Math.round(qty) || 1);
    insertExtraAt(index, {
      id: uid(),
      type: "ITEM",
      name: item.name,
      qty: addQty,
      comment: "",
      catalogItemId: item.id,
    });
  }

  function dropRow(fromKey: string, toKey: string) {
    const groupable = allRows.map((r, i) => ({
      key: r.key,
      type: r.isKitHeader ? "KIT_HEADER" : r.type,
      zoneId: "spec",
      sortOrder: i,
      row: r,
    }));
    const next = reorderBlocksByDrop(groupable, fromKey, toKey);
    if (!next) return;
    updateLineOrder(next.map((r) => r.key));
  }

  function onPickCatalog(item: PickedCatalogItem, qty?: number) {
    if (!picker) return;
    if (picker.mode === "replace") {
      const target = picker.target;
      if (target.kind === "derived") {
        setOverride(target.deriveKey, "REPLACE", {
          name: item.name,
          catalogItemId: item.id,
        });
        setOverride(target.deriveKey, "RENAME", { name: item.name });
        setDerived((prev) =>
          prev.map((l) =>
            l.key === target.key
              ? { ...l, name: item.name, catalogItemId: item.id }
              : l,
          ),
        );
      } else {
        updateExtra(target.key, {
          name: item.name,
          catalogItemId: item.id,
        });
      }
      setPicker(null);
      return;
    }
    if (picker.mode === "insert") {
      insertFromCatalogAt(picker.index, item, qty);
      setPicker(null);
      setGapIndex(null);
      return;
    }
    addFromCatalog(item, qty);
  }

  function exportLines(): SpecLine[] {
    return allRows.filter((l) => !l.hidden);
  }

  async function onExport(kind: "excel" | "pdf") {
    if (!meta) return;
    const lines = exportLines();
    if (lines.length === 0 && assignments.length === 0) return;
    setExporting(kind);
    try {
      const { exportSpecExcel, exportSpecPdf } = await import(
        "@/lib/export/spec"
      );
      const staff = assignments.map((a) => ({
        name: a.name,
        specialtyName: a.specialtyName,
      }));
      if (kind === "excel") await exportSpecExcel(meta, lines, staff);
      else await exportSpecPdf(meta, lines, staff);
    } finally {
      setExporting(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-[var(--muted)]">
        Загрузка спецификации…
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-[var(--danger)]">
        {error || "Ошибка"}
      </div>
    );
  }

  const hiddenCount = derived.filter((l) => l.hidden).length;
  const tableColSpan = canEdit ? 7 : 3;

  function renderGap(index: number) {
    if (!canEdit) return null;
    const active = gapIndex === index && !dragKey;
    return (
      <tr key={`gap-${index}`} className="relative h-0 border-0">
        <td colSpan={tableColSpan} className="relative h-0 p-0">
          <div
            className="absolute inset-x-0 z-20 -translate-y-1/2"
            style={{ height: 14, top: 0 }}
            onMouseEnter={() => setGapIndex(index)}
            onMouseLeave={() =>
              setGapIndex((g) => (g === index ? null : g))
            }
          >
            {active && (
              <>
                <div className="pointer-events-none absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-[var(--accent)]" />
                <button
                  type="button"
                  title="Добавить оборудование сюда"
                  className="absolute right-2 top-1/2 z-30 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold leading-none text-white shadow"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPicker({ mode: "insert", index });
                  }}
                >
                  +
                </button>
              </>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
          <button
            type="button"
            onClick={() =>
              router.push(isManager ? `/quotes/${quoteId}` : "/quotes")
            }
            className="text-sm text-[var(--muted)] hover:text-[var(--ink)]"
          >
            {isManager ? "← К смете" : "← К мероприятиям"}
          </button>
          <h1 className="font-display mt-1 text-3xl text-[var(--ink)]">
            Спецификация на погрузку
          </h1>
          <p className="text-sm text-[var(--muted)]">
            №{meta.proposalNumber} ·{" "}
            {meta.eventName || meta.client || "Мероприятие"}
            {meta.date ? ` · ${meta.date}` : ""}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {canEdit
              ? saving
                ? "Сохранение…"
                : savedAt
                  ? `Сохранено в ${savedAt}`
                  : "Автосохранение правок"
              : "Только просмотр"}
            {error ? ` · ${error}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={
              exporting !== null ||
              (allRows.length === 0 && assignments.length === 0)
            }
            onClick={() => void onExport("excel")}
            className="rounded-md bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)] disabled:opacity-40"
          >
            {exporting === "excel" ? "Excel…" : "Excel"}
          </button>
          <button
            type="button"
            disabled={
              exporting !== null ||
              (allRows.length === 0 && assignments.length === 0)
            }
            onClick={() => void onExport("pdf")}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {exporting === "pdf" ? "PDF…" : "PDF"}
          </button>
        </div>
      </header>

      <p className="text-sm text-[var(--muted)]">
        Отдельные позиции из сметы + разворот комплектов по составляющим. Цен
        нет. Услуги технического персонала из сметы не включаются — внизу
        указаны назначенные сотрудники.
        {canEdit ? " Правки поверх сметы сохраняются отдельно." : ""}
      </p>

      {canEdit && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            title={
              showHidden
                ? "Убрать отображение скрытых строк и разделов"
                : "Показать скрытые строки и разделы"
            }
            aria-label={
              showHidden
                ? "Убрать отображение скрытых строк и разделов"
                : "Показать скрытые строки и разделы"
            }
            aria-pressed={!showHidden}
            onClick={() => setShowHidden((v) => !v)}
            className={`btn-icon inline-flex items-center gap-1.5 px-2 ${
              !showHidden ? "text-[var(--accent)]" : "text-[var(--muted)]"
            }`}
          >
            <EyeIcon crossed={!showHidden} />
            <span className="text-xs font-normal normal-case tracking-normal">
              {showHidden
                ? hiddenCount > 0
                  ? `Скрытые (${hiddenCount})`
                  : "Скрытые"
                : "Скрытые спрятаны"}
            </span>
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 text-left">Название</th>
              <th className="w-24 px-3 py-2">Кол-во</th>
              {canEdit && <StockHeaderCells />}
              <th className="min-w-[10rem] px-3 py-2 text-left">Комментарий</th>
              {canEdit && <th className="w-28 px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {canEdit && renderGap(0)}
            {displayRows.map((line, index) => {
              const isSection = line.type === "SECTION";
              const isKitHeader = Boolean(line.isKitHeader);
              const isExtra = line.source === "extra";
              const itemId = line.catalogItemId || null;
              const stock = itemId ? stockMap[itemId] : null;
              const needed = itemId ? neededByItem.get(itemId) || 0 : 0;
              const isDragging = dragKey === line.key;
              const isDropTarget =
                dropKey === line.key && dragKey !== line.key;

              const rowDragProps = canEdit
                ? {
                    onDragOver: (e: React.DragEvent) => {
                      if (!dragKey || dragKey === line.key) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dropKey !== line.key) setDropKey(line.key);
                    },
                    onDragLeave: (e: React.DragEvent) => {
                      const related = e.relatedTarget as Node | null;
                      if (
                        related &&
                        (e.currentTarget as HTMLElement).contains(related)
                      ) {
                        return;
                      }
                      setDropKey((k) => (k === line.key ? null : k));
                    },
                    onDrop: (e: React.DragEvent) => {
                      e.preventDefault();
                      const from =
                        e.dataTransfer.getData("text/plain") || dragKey;
                      setDragKey(null);
                      setDropKey(null);
                      if (from) dropRow(from, line.key);
                    },
                  }
                : {};

              return (
                <Fragment key={line.key}>
                  <tr
                    {...rowDragProps}
                    className={cn(
                      line.hidden
                        ? "border-t border-[var(--line)] opacity-40"
                        : isKitHeader
                          ? "border-t border-[var(--line)] bg-[var(--accent)]/10"
                          : isSection
                            ? "border-t border-[var(--line)] bg-[var(--selected)]/50"
                            : "border-t border-[var(--line)]",
                      isDragging && "opacity-50",
                      isDropTarget &&
                        "ring-2 ring-inset ring-[var(--accent)]",
                    )}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-2">
                        {canEdit && (
                          <DragHandle
                            label={
                              isSection
                                ? "Перетащить раздел со всеми позициями"
                                : "Перетащить позицию"
                            }
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", line.key);
                              e.dataTransfer.effectAllowed = "move";
                              setDragKey(line.key);
                              setGapIndex(null);
                            }}
                            onDragEnd={() => {
                              setDragKey(null);
                              setDropKey(null);
                            }}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          {isKitHeader && (
                            <span className="mb-1 block w-fit rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--accent)]">
                              Комплект · развёртка
                            </span>
                          )}
                          {!isKitHeader && line.kitName && (
                            <span className="mb-1 block w-fit rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--accent)]">
                              из комплекта: {line.kitName}
                            </span>
                          )}
                          {canEdit ? (
                            <input
                              className={`field ${isSection ? "font-medium" : ""}`}
                              value={displayName(line)}
                              onChange={(e) => {
                                if (isExtra) {
                                  updateExtra(
                                    line.key,
                                    isSection
                                      ? { title: e.target.value }
                                      : { name: e.target.value },
                                  );
                                } else {
                                  updateDerivedName(line, e.target.value);
                                }
                              }}
                            />
                          ) : (
                            <span className={isSection ? "font-medium" : ""}>
                              {displayName(line)}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {!isSection &&
                        (canEdit ? (
                          <input
                            type="number"
                            min={0}
                            className="field"
                            value={line.qty}
                            onChange={(e) => {
                              const qty = Math.max(
                                0,
                                Number(e.target.value) || 0,
                              );
                              if (isExtra) updateExtra(line.key, { qty });
                              else updateDerivedQty(line, qty);
                            }}
                          />
                        ) : (
                          <span className="tabular-nums">{line.qty}</span>
                        ))}
                    </td>
                    {canEdit &&
                      (isSection ? (
                        <>
                          <td className="stock-cell">—</td>
                          <td className="stock-cell">—</td>
                          <td className="stock-cell">—</td>
                        </>
                      ) : (
                        <StockMarks needed={needed} info={stock} />
                      ))}
                    <td className="px-3 py-2">
                      {!isSection &&
                        (canEdit ? (
                          <input
                            className="field"
                            placeholder="Комментарий"
                            value={line.comment || ""}
                            onChange={(e) => {
                              if (isExtra) {
                                updateExtra(line.key, {
                                  comment: e.target.value,
                                });
                              } else {
                                updateDerivedComment(line, e.target.value);
                              }
                            }}
                          />
                        ) : (
                          <span className="text-[var(--muted)]">
                            {line.comment || ""}
                          </span>
                        ))}
                    </td>
                    {canEdit && (
                      <td className="px-2 py-2">
                        <div className="flex items-center justify-end gap-1">
                          {!isSection && !line.hidden && (
                            <button
                              type="button"
                              title="Заменить позицию из каталога"
                              className="btn-icon text-[var(--muted)]"
                              onClick={() =>
                                setPicker({
                                  mode: "replace",
                                  target: isExtra
                                    ? { kind: "extra", key: line.key }
                                    : {
                                        kind: "derived",
                                        key: line.key,
                                        deriveKey: line.deriveKey!,
                                      },
                                })
                              }
                            >
                              <SwapIcon />
                            </button>
                          )}
                          {isExtra ? (
                            <button
                              type="button"
                              className="btn-icon text-[var(--danger)]"
                              onClick={() => removeExtra(line.key)}
                            >
                              ×
                            </button>
                          ) : line.deriveKey ? (
                            line.hidden ? (
                              <button
                                type="button"
                                className="text-xs text-[var(--accent)]"
                                onClick={() => unhideLine(line.deriveKey!)}
                              >
                                Вернуть
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="btn-icon text-[var(--danger)]"
                                onClick={() => hideLine(line.deriveKey!)}
                              >
                                ×
                              </button>
                            )
                          ) : null}
                        </div>
                      </td>
                    )}
                  </tr>
                  {canEdit && renderGap(index + 1)}
                </Fragment>
              );
            })}

            {assignments.length > 0 && (
              <>
                <tr className="border-t border-[var(--line)] bg-[var(--selected)]/50">
                  <td className="px-3 py-2 font-medium" colSpan={tableColSpan}>
                    Технический персонал
                  </td>
                </tr>
                {assignments.map((a) => (
                  <tr key={a.id} className="border-t border-[var(--line)]">
                    <td className="px-3 py-2">
                      <span>{a.name}</span>
                      <span className="ml-2 text-[var(--muted)]">
                        — {a.specialtyName}
                      </span>
                    </td>
                    <td className="px-3 py-2" />
                    {canEdit && (
                      <>
                        <td className="stock-cell">—</td>
                        <td className="stock-cell">—</td>
                        <td className="stock-cell">—</td>
                      </>
                    )}
                    <td className="px-3 py-2" />
                    {canEdit && <td />}
                  </tr>
                ))}
              </>
            )}

            {displayRows.length === 0 && assignments.length === 0 && (
              <tr>
                <td
                  colSpan={tableColSpan}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  В смете пока нет позиций для спецификации
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addSection}
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
          >
            + Раздел
          </button>
          <button
            type="button"
            onClick={addCustomItem}
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
          >
            + Позиция
          </button>
          <button
            type="button"
            onClick={() => setPicker({ mode: "add" })}
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
          >
            + Из каталога
          </button>
        </div>
      )}

      {canEdit && !isManager && (
        <QuoteAssignments
          quoteId={quoteId}
          canEdit
          compact
          hidePay
          onChanged={() => void load()}
        />
      )}

      <CatalogPicker
        open={picker !== null}
        onClose={() => {
          setPicker(null);
          setGapIndex(null);
        }}
        onPickItem={onPickCatalog}
        eventDate={meta.date || undefined}
        durationDays={meta.durationDays}
      />
    </div>
  );
}
