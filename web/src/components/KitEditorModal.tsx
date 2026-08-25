"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CategorySelect,
  type CategoryOption,
} from "@/components/CategorySelect";
import { type PickedCatalogItem } from "@/components/CatalogPicker";
import { QuoteCatalogSidebar } from "@/components/QuoteCatalogSidebar";
import { formatMoney } from "@/lib/format";

type KitComponentRow = {
  catalogItemId: string;
  name: string;
  qty: number;
  price: number;
};

export type EditableKit = {
  id: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  components: Array<{
    qty: number;
    catalogItem: { id: string; name: string; basePrice: number };
  }>;
};

type Props = {
  open: boolean;
  categoryId: string | null;
  categoryPath?: string;
  categories?: CategoryOption[];
  kit?: EditableKit | null;
  onClose: () => void;
  onSaved: () => void;
};

export function KitEditorModal({
  open,
  categoryId,
  categoryPath,
  categories = [],
  kit,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [components, setComponents] = useState<KitComponentRow[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (kit) {
      setName(kit.name);
      setSelectedCategoryId(kit.categoryId || categoryId || "");
      setComponents(
        kit.components.map((c) => ({
          catalogItemId: c.catalogItem.id,
          name: c.catalogItem.name,
          qty: c.qty,
          price: c.catalogItem.basePrice,
        })),
      );
    } else {
      setName("");
      setSelectedCategoryId(categoryId || "");
      setComponents([]);
    }
  }, [open, kit, categoryId]);

  const currentQtyByItem = useMemo(
    () => new Map(components.map((c) => [c.catalogItemId, c.qty])),
    [components],
  );

  if (!open) return null;

  function addComponent(item: PickedCatalogItem, qty = 1) {
    const addQty = Math.max(1, Math.round(qty) || 1);
    setComponents((prev) => {
      const existing = prev.find((c) => c.catalogItemId === item.id);
      if (existing) {
        return prev.map((c) =>
          c.catalogItemId === item.id
            ? { ...c, qty: c.qty + addQty }
            : c,
        );
      }
      return [
        ...prev,
        {
          catalogItemId: item.id,
          name: item.name,
          qty: addQty,
          price: item.basePrice,
        },
      ];
    });
  }

  const canSave = name.trim().length > 0 && components.length > 0;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        categoryId: selectedCategoryId || null,
        components: components.map((c) => ({
          catalogItemId: c.catalogItemId,
          qty: c.qty,
        })),
      };
      const res = await fetch(kit ? `/api/kits/${kit.id}` : "/api/kits", {
        method: kit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(
          typeof data.error === "string"
            ? data.error
            : "Не удалось сохранить комплект",
        );
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex h-[90vh] max-h-[90vh] w-full max-w-[1680px] flex-col rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <div>
            <h3 className="font-display text-lg">
              {kit ? "Редактировать комплект" : "Новый комплект"}
            </h3>
            {!categories.length && categoryPath && (
              <p className="mt-0.5 text-xs text-[var(--muted)]">
                Раздел: {categoryPath}
              </p>
            )}
          </div>
          <button type="button" className="btn-icon" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[minmax(220px,38vh)_minmax(0,1fr)] gap-3 overflow-hidden p-3 lg:grid-cols-[360px_minmax(0,1fr)] lg:grid-rows-1">
          <div className="min-h-0">
            <QuoteCatalogSidebar
              embedded
              includeHidden
              zoneName="комплект"
              addTargetLabel="комплект"
              currentQtyByItem={currentQtyByItem}
              currentQtyLabel="Уже в комплекте"
              onPickItem={addComponent}
            />
          </div>

          <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg)]/45 p-3">
            <div className="grid shrink-0 gap-3 xl:grid-cols-2">
              <label className="block">
                <span className="text-caption uppercase text-[var(--muted)]">
                  Название
                </span>
                <input
                  className="field mt-1 w-full"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="LED экран 5×3 м"
                  autoFocus
                />
              </label>

              {categories.length > 0 ? (
                <CategorySelect
                  categories={categories}
                  value={selectedCategoryId}
                  onChange={setSelectedCategoryId}
                  allowEmpty
                  emptyLabel="Без раздела"
                  label="Раздел / подраздел"
                />
              ) : categoryPath ? (
                <div className="text-sm">
                  <span className="text-caption uppercase text-[var(--muted)]">
                    Раздел / подраздел
                  </span>
                  <p className="field mt-1">{categoryPath}</p>
                </div>
              ) : null}
            </div>

            <div className="data-table-shell min-h-0 flex-1 overflow-auto">
              <table className="data-table data-table--editable data-table--sticky w-full min-w-[580px] table-fixed text-sm">
                <colgroup>
                  <col />
                  <col className="w-20" />
                  <col className="w-28" />
                  <col className="w-12" />
                </colgroup>
                <thead className="sticky top-0 z-[1] bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="px-3 py-2 text-left">Комплектующая позиция</th>
                    <th className="px-2 py-2">Кол-во</th>
                    <th className="px-2 py-2 text-right">Цена за ед.</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {components.map((component) => (
                    <tr
                      key={component.catalogItemId}
                      className="border-t border-[var(--line)]"
                    >
                      <td className="px-3 py-2">
                        <p className="line-clamp-4 break-words leading-5 text-[var(--ink)]">
                          {component.name}
                        </p>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0.1}
                          step={1}
                          aria-label={`Количество ${component.name}`}
                          className="field text-center tabular-nums"
                          value={component.qty}
                          onChange={(e) =>
                            setComponents((prev) =>
                              prev.map((row) =>
                                row.catalogItemId === component.catalogItemId
                                  ? {
                                      ...row,
                                      qty: Math.max(
                                        0.1,
                                        Number(e.target.value) || 1,
                                      ),
                                    }
                                  : row,
                              ),
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">
                        {formatMoney(component.price)}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          className="btn-icon text-[var(--danger)]"
                          aria-label={`Удалить ${component.name}`}
                          onClick={() =>
                            setComponents((prev) =>
                              prev.filter(
                                (row) =>
                                  row.catalogItemId !== component.catalogItemId,
                              ),
                            )
                          }
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                  {components.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-12 text-center text-[var(--muted)]"
                      >
                        Добавьте комплектующие из каталога слева
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <p className="shrink-0 text-xs text-[var(--muted)]">
              Позиций в комплекте: {components.length}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[var(--line)] p-4">
          <button
            type="button"
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
            onClick={onClose}
            disabled={saving}
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={!canSave || saving}
            className="rounded-md bg-[var(--accent)] px-4 py-1.5 text-sm text-white disabled:opacity-50"
            onClick={() => void save()}
          >
            {saving ? "Сохранение…" : kit ? "Сохранить" : "Создать"}
          </button>
        </div>
      </div>
    </div>
  );
}
