"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CatalogPicker,
  type PickedCatalogItem,
} from "@/components/CatalogPicker";

type SpecLine = {
  key: string;
  deriveKey: string | null;
  source: "derived" | "extra";
  type: "SECTION" | "ITEM";
  title: string | null;
  name: string | null;
  qty: number;
  kitName: string | null;
  catalogItemId: string | null;
  extraId: string | null;
  hidden: boolean;
  isKitHeader?: boolean;
};

type Override = {
  deriveKey: string;
  action: "HIDE" | "SET_QTY" | "RENAME";
  qty?: number | null;
  name?: string | null;
};

type Extra = {
  id?: string;
  type: "SECTION" | "ITEM";
  sortOrder: number;
  title?: string | null;
  name?: string | null;
  qty?: number;
  catalogItemId?: string | null;
};

type EditableExtra = Extra & { key: string };

function uid() {
  return `tmp-${Math.random().toString(36).slice(2, 10)}`;
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
  } | null>(null);
  const [derived, setDerived] = useState<SpecLine[]>([]);
  const [extras, setExtras] = useState<EditableExtra[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
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
      });
      setCanEdit(Boolean(data.canEdit && isManager));
      const lines: SpecLine[] = data.lines || [];
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
          }),
        ),
      );
      dirtyRef.current = false;
    } catch {
      setMeta(null);
      setError("Не удалось связаться с сервером");
    } finally {
      setLoading(false);
    }
  }, [quoteId, isManager]);

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

  function markDirty() {
    dirtyRef.current = true;
  }

  function setOverride(
    deriveKey: string,
    action: Override["action"],
    patch: { qty?: number | null; name?: string | null },
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
      // sections use title via RENAME storing in name field applied as title in build
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
          catalogItemId: item.id,
        },
      ];
    });
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
    if (lines.length === 0) return;
    setExporting(kind);
    try {
      const { exportSpecExcel, exportSpecPdf } = await import(
        "@/lib/export/spec"
      );
      if (kind === "excel") await exportSpecExcel(meta, lines);
      else await exportSpecPdf(meta, lines);
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

  const visibleDerived = canEdit
    ? derived
    : derived.filter((l) => !l.hidden);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
          <button
            type="button"
            onClick={() => router.push(isManager ? `/quotes/${quoteId}` : "/calendar")}
            className="text-sm text-[var(--muted)] hover:text-[var(--ink)]"
          >
            {isManager ? "← К смете" : "← К календарю"}
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
            disabled={exporting !== null || (derived.length === 0 && extras.length === 0)}
            onClick={() => void onExport("excel")}
            className="rounded-md bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)] disabled:opacity-40"
          >
            {exporting === "excel" ? "Excel…" : "Excel"}
          </button>
          <button
            type="button"
            disabled={exporting !== null || (derived.length === 0 && extras.length === 0)}
            onClick={() => void onExport("pdf")}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            {exporting === "pdf" ? "PDF…" : "PDF"}
          </button>
        </div>
      </header>

      <p className="text-sm text-[var(--muted)]">
        Отдельные позиции из сметы + разворот комплектов по составляющим. Цен нет.
        {canEdit ? " Правки поверх сметы сохраняются отдельно." : ""}
      </p>

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 text-left">Название</th>
              <th className="w-28 px-3 py-2">Кол-во</th>
              {canEdit && <th className="w-28 px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {visibleDerived.map((line) => {
              const isSection = line.type === "SECTION";
              const isKitHeader = Boolean(line.isKitHeader);
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
                  {canEdit && (
                    <td className="px-3 py-2">
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
                    </td>
                  )}
                </tr>
              );
            })}

            {extras.map((extra) => {
              const isSection = extra.type === "SECTION";
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
                  {canEdit && (
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="btn-icon text-[var(--danger)]"
                        onClick={() => removeExtra(extra.key)}
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}

            {visibleDerived.length === 0 && extras.length === 0 && (
              <tr>
                <td
                  colSpan={canEdit ? 3 : 2}
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
            onClick={() => setPickerOpen(true)}
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
          >
            + Из каталога
          </button>
        </div>
      )}

      <CatalogPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPickItem={addFromCatalog}
      />
    </div>
  );
}
