"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  id?: string;
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

function uid() {
  return `tmp-${Math.random().toString(36).slice(2, 10)}`;
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
  const [assignments, setAssignments] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<ReplaceTarget | null>(
    null,
  );
  const [canEdit, setCanEdit] = useState(false);
  const [showHidden, setShowHidden] = useState(true);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, StockInfo | null>>(
    {},
  );
  const dirtyRef = useRef(false);

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
      setMeta({
        proposalNumber: data.proposalNumber,
        eventName: data.eventName,
        date: data.date,
        place: data.place,
        client: data.client,
        durationDays: Number(data.durationDays) || 1,
      });
      setCanEdit(Boolean(data.canEdit));
      const lines: SpecLine[] = (data.lines || []).map(
        (l: SpecLine): SpecLine => ({
          ...l,
          comment: l.comment ?? "",
        }),
      );
      setDerived(lines.filter((l) => l.source === "derived"));
      setExtras(
        (data.extras || []).map(
          (e: Extra & { id: string }): EditableExtra => ({
            key: e.id,
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
        (data.overrides || []).map(
          (o: Override): Override => ({
            deriveKey: o.deriveKey,
            action: o.action,
            qty: o.qty,
            name: o.name,
            catalogItemId: o.catalogItemId,
          }),
        ),
      );
      setAssignments(data.assignments || []);
      dirtyRef.current = false;
    } catch {
      setMeta(null);
      setError("Не удалось связаться с сервером");
    } finally {
      setLoading(false);
    }
  }, [quoteId]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (nextOverrides: Override[], nextExtras: EditableExtra[]) => {
      if (!canEdit || !dirtyRef.current) return;
      setSaving(true);
      setError("");
      const res = await fetch(`/api/quotes/${quoteId}/spec`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overrides: nextOverrides,
          extras: nextExtras.map((e, i) => ({
            type: e.type,
            sortOrder: i,
            title: e.title ?? null,
            name: e.name ?? null,
            qty: e.qty ?? 0,
            comment: e.comment ?? "",
            catalogItemId: e.catalogItemId ?? null,
          })),
        }),
      });
      setSaving(false);
      if (!res.ok) {
        setError("Не удалось сохранить");
        return;
      }
      dirtyRef.current = false;
      setSavedAt(new Date().toLocaleTimeString("ru-RU"));
    },
    [canEdit, quoteId],
  );

  useEffect(() => {
    if (loading || !canEdit || !dirtyRef.current) return;
    const t = setTimeout(() => {
      void persist(overrides, extras);
    }, 800);
    return () => clearTimeout(t);
  }, [overrides, extras, loading, canEdit, persist]);

  const neededByItem = useMemo(() => {
    const map = new Map<string, number>();
    const add = (catalogItemId: string | null | undefined, qty: number) => {
      if (!catalogItemId || qty <= 0) return;
      map.set(catalogItemId, (map.get(catalogItemId) || 0) + qty);
    };
    for (const l of derived) {
      if (l.hidden || l.type !== "ITEM") continue;
      add(l.catalogItemId, Number(l.qty) || 0);
    }
    for (const e of extras) {
      if (e.type !== "ITEM") continue;
      add(e.catalogItemId, Number(e.qty) || 0);
    }
    return map;
  }, [derived, extras]);

  const catalogIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const l of derived) {
      if (l.type === "ITEM" && l.catalogItemId) ids.add(l.catalogItemId);
    }
    for (const e of extras) {
      if (e.type === "ITEM" && e.catalogItemId) ids.add(e.catalogItemId);
    }
    return [...ids].sort().join(",");
  }, [derived, extras]);

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

  function displayQty(line: SpecLine) {
    return line.qty;
  }

  function updateDerivedName(line: SpecLine, name: string) {
    if (!line.deriveKey) return;
    if (line.type === "SECTION") {
      setOverride(line.deriveKey, "RENAME", { name });
      setDerived((prev) =>
        prev.map((l) =>
          l.key === line.key ? { ...l, title: name } : l,
        ),
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
  }

  function addSection() {
    markDirty();
    setExtras((prev) => [
      ...prev,
      {
        key: uid(),
        type: "SECTION",
        sortOrder: prev.length,
        title: "Доп. раздел",
      },
    ]);
  }

  function addCustomItem() {
    markDirty();
    setExtras((prev) => [
      ...prev,
      {
        key: uid(),
        type: "ITEM",
        sortOrder: prev.length,
        name: "Доп. позиция",
        qty: 1,
        comment: "",
      },
    ]);
  }

  function addFromCatalog(item: PickedCatalogItem, qty = 1) {
    markDirty();
    const addQty = Math.max(1, Math.round(qty) || 1);
    setExtras((prev) => {
      const existing = prev.find(
        (e) => e.type === "ITEM" && e.catalogItemId === item.id,
      );
      if (existing) {
        return prev.map((e) =>
          e.key === existing.key
            ? { ...e, qty: (Number(e.qty) || 0) + addQty }
            : e,
        );
      }
      return [
        ...prev,
        {
          key: uid(),
          type: "ITEM",
          sortOrder: prev.length,
          name: item.name,
          qty: addQty,
          comment: "",
          catalogItemId: item.id,
        },
      ];
    });
  }

  function openReplace(
    target: ReplaceTarget,
  ) {
    setReplaceTarget(target);
    setPickerOpen(true);
  }

  function openAddFromCatalog() {
    setReplaceTarget(null);
    setPickerOpen(true);
  }

  function onPickCatalog(item: PickedCatalogItem, qty?: number) {
    if (replaceTarget) {
      if (replaceTarget.kind === "derived") {
        setOverride(replaceTarget.deriveKey, "REPLACE", {
          name: item.name,
          catalogItemId: item.id,
        });
        // Keep an explicit rename so the shown name matches the new catalog item
        setOverride(replaceTarget.deriveKey, "RENAME", { name: item.name });
        setDerived((prev) =>
          prev.map((l) =>
            l.key === replaceTarget.key
              ? {
                  ...l,
                  name: item.name,
                  catalogItemId: item.id,
                }
              : l,
          ),
        );
      } else {
        updateExtra(replaceTarget.key, {
          name: item.name,
          catalogItemId: item.id,
        });
      }
      setReplaceTarget(null);
      setPickerOpen(false);
      return;
    }
    addFromCatalog(item, qty);
  }

  function exportLines(): SpecLine[] {
    const fromDerived = derived.filter((l) => !l.hidden);
    const fromExtras: SpecLine[] = extras.map((e) => ({
      key: e.key,
      deriveKey: null,
      source: "extra" as const,
      type: e.type,
      title: e.title ?? null,
      name: e.name ?? null,
      qty: e.qty ?? 0,
      comment: e.comment ?? "",
      kitName: null,
      catalogItemId: e.catalogItemId ?? null,
      extraId: e.id ?? null,
      hidden: false,
    }));
    return [...fromDerived, ...fromExtras];
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

  const visibleDerived = (
    canEdit ? derived : derived.filter((l) => !l.hidden)
  ).filter((l) => (canEdit && showHidden ? true : !l.hidden));

  const hiddenCount = derived.filter((l) => l.hidden).length;
  const tableColSpan = canEdit ? 7 : 3;

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
            №{meta.proposalNumber} · {meta.eventName || meta.client || "Мероприятие"}
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
              (derived.length === 0 &&
                extras.length === 0 &&
                assignments.length === 0)
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
              (derived.length === 0 &&
                extras.length === 0 &&
                assignments.length === 0)
            }
            onClick={() => void onExport("pdf")}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {exporting === "pdf" ? "PDF…" : "PDF"}
          </button>
        </div>
      </header>

      <p className="text-sm text-[var(--muted)]">
        Отдельные позиции из сметы + разворот комплектов по составляющим. Цен нет.
        Услуги технического персонала из сметы не включаются — внизу указаны назначенные сотрудники.
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
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 text-left">Название</th>
              <th className="w-24 px-3 py-2">Кол-во</th>
              {canEdit && <StockHeaderCells />}
              <th className="min-w-[10rem] px-3 py-2 text-left">Комментарий</th>
              {canEdit && <th className="w-24 px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {visibleDerived.map((line) => {
              const isSection = line.type === "SECTION";
              const isKitHeader = Boolean(line.isKitHeader);
              const itemId = line.catalogItemId || null;
              const stock = itemId ? stockMap[itemId] : null;
              const needed = itemId ? neededByItem.get(itemId) || 0 : 0;
              return (
                <tr
                  key={line.key}
                  className={
                    line.hidden
                      ? "border-t border-[var(--line)] opacity-40"
                      : isKitHeader
                        ? "border-t border-[var(--line)] bg-[var(--accent)]/10"
                        : isSection
                          ? "border-t border-[var(--line)] bg-[var(--selected)]/50"
                          : "border-t border-[var(--line)]"
                  }
                >
                  <td className="px-3 py-2">
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
                        onChange={(e) =>
                          updateDerivedName(line, e.target.value)
                        }
                      />
                    ) : (
                      <span className={isSection ? "font-medium" : ""}>
                        {displayName(line)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {!isSection &&
                      (canEdit ? (
                        <input
                          type="number"
                          min={0}
                          className="field"
                          value={displayQty(line)}
                          onChange={(e) =>
                            updateDerivedQty(
                              line,
                              Math.max(0, Number(e.target.value) || 0),
                            )
                          }
                        />
                      ) : (
                        <span className="tabular-nums">{displayQty(line)}</span>
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
                          onChange={(e) =>
                            updateDerivedComment(line, e.target.value)
                          }
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
                        {!isSection && line.deriveKey && !line.hidden && (
                          <button
                            type="button"
                            title="Заменить позицию из каталога"
                            className="btn-icon text-[var(--muted)]"
                            onClick={() =>
                              openReplace({
                                kind: "derived",
                                key: line.key,
                                deriveKey: line.deriveKey!,
                              })
                            }
                          >
                            <SwapIcon />
                          </button>
                        )}
                        {line.deriveKey &&
                          (line.hidden ? (
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
                          ))}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}

            {extras.map((extra) => {
              const isSection = extra.type === "SECTION";
              const itemId = extra.catalogItemId || null;
              const stock = itemId ? stockMap[itemId] : null;
              const needed = itemId ? neededByItem.get(itemId) || 0 : 0;
              return (
                <tr
                  key={extra.key}
                  className={
                    isSection
                      ? "border-t border-[var(--line)] bg-[var(--selected)]/50"
                      : "border-t border-[var(--line)]"
                  }
                >
                  <td className="px-3 py-2">
                    <span className="mb-1 block w-fit rounded bg-[var(--ink)]/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                      Доп. к смете
                    </span>
                    {canEdit ? (
                      <input
                        className={`field ${isSection ? "font-medium" : ""}`}
                        value={
                          isSection ? extra.title || "" : extra.name || ""
                        }
                        onChange={(e) =>
                          updateExtra(
                            extra.key,
                            isSection
                              ? { title: e.target.value }
                              : { name: e.target.value },
                          )
                        }
                      />
                    ) : (
                      <span className={isSection ? "font-medium" : ""}>
                        {isSection ? extra.title : extra.name}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {!isSection &&
                      (canEdit ? (
                        <input
                          type="number"
                          min={0}
                          className="field"
                          value={extra.qty ?? 0}
                          onChange={(e) =>
                            updateExtra(extra.key, {
                              qty: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      ) : (
                        <span className="tabular-nums">{extra.qty ?? 0}</span>
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
                          value={extra.comment || ""}
                          onChange={(e) =>
                            updateExtra(extra.key, {
                              comment: e.target.value,
                            })
                          }
                        />
                      ) : (
                        <span className="text-[var(--muted)]">
                          {extra.comment || ""}
                        </span>
                      ))}
                  </td>
                  {canEdit && (
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        {!isSection && (
                          <button
                            type="button"
                            title="Заменить позицию из каталога"
                            className="btn-icon text-[var(--muted)]"
                            onClick={() =>
                              openReplace({ kind: "extra", key: extra.key })
                            }
                          >
                            <SwapIcon />
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-icon text-[var(--danger)]"
                          onClick={() => removeExtra(extra.key)}
                        >
                          ×
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}

            {assignments.length > 0 && (
              <>
                <tr className="border-t border-[var(--line)] bg-[var(--selected)]/50">
                  <td
                    className="px-3 py-2 font-medium"
                    colSpan={tableColSpan}
                  >
                    Технический персонал
                  </td>
                </tr>
                {assignments.map((a) => (
                  <tr
                    key={a.id}
                    className="border-t border-[var(--line)]"
                  >
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

            {visibleDerived.length === 0 &&
              extras.length === 0 &&
              assignments.length === 0 && (
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
            onClick={openAddFromCatalog}
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
          onChanged={() => void load()}
        />
      )}

      <CatalogPicker
        open={pickerOpen}
        onClose={() => {
          setPickerOpen(false);
          setReplaceTarget(null);
        }}
        onPickItem={onPickCatalog}
        eventDate={meta.date || undefined}
        durationDays={meta.durationDays}
      />
    </div>
  );
}
