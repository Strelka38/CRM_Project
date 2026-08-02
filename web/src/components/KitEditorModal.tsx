"use client";

import { useEffect, useState } from "react";
import {
  CategorySelect,
  type CategoryOption,
} from "@/components/CategorySelect";
import { formatMoney } from "@/lib/format";

type CatItem = {
  id: string;
  name: string;
  basePrice: number;
  category?: { path: string };
};

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
  const [q, setQ] = useState("");
  const [search, setSearch] = useState<CatItem[]>([]);
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
    setQ("");
    setSearch([]);
  }, [open, kit, categoryId]);

  useEffect(() => {
    if (!open || !q.trim()) {
      setSearch([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/catalog/items?q=${encodeURIComponent(q)}`);
      setSearch(await res.json());
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  if (!open) return null;

  function addComponent(item: CatItem) {
    setComponents((prev) => {
      const existing = prev.find((c) => c.catalogItemId === item.id);
      if (existing) {
        return prev.map((c) =>
          c.catalogItemId === item.id ? { ...c, qty: c.qty + 1 } : c,
        );
      }
      return [
        ...prev,
        {
          catalogItemId: item.id,
          name: item.name,
          qty: 1,
          price: item.basePrice,
        },
      ];
    });
  }

  const total = components.reduce((s, c) => s + c.qty * c.price, 0);
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
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-xl"
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

        <div className="space-y-3 overflow-y-auto px-4 py-4 text-sm">
          <label className="block">
            <span className="text-[10px] uppercase text-[var(--muted)]">
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

          {categories.length > 0 && (
            <CategorySelect
              categories={categories}
              value={selectedCategoryId}
              onChange={setSelectedCategoryId}
              allowEmpty
              emptyLabel="Без раздела"
              label="Раздел / подраздел"
            />
          )}

          <label className="block">
            <span className="text-[10px] uppercase text-[var(--muted)]">
              Добавить позицию
            </span>
            <input
              className="field mt-1 w-full"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по каталогу…"
            />
          </label>

          {search.length > 0 && (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--line)]">
              {search.slice(0, 20).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-white/10"
                  onClick={() => addComponent(item)}
                >
                  <span className="min-w-0 flex-1 break-words text-[var(--ink)]">
                    {item.name}
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      {item.category?.path}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums text-[var(--ink)]">
                    {formatMoney(item.basePrice)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {components.length > 0 && (
            <ul className="space-y-2">
              {components.map((c) => (
                <li
                  key={c.catalogItemId}
                  className="grid grid-cols-[minmax(0,1fr)_4.5rem_1.75rem] items-center gap-2 rounded-lg border border-[var(--line)] px-3 py-2"
                >
                  <span className="break-words text-sm leading-snug text-[var(--ink)]">
                    {c.name}
                  </span>
                  <input
                    type="number"
                    min={0.1}
                    step={1}
                    className="field !w-full shrink-0"
                    value={c.qty}
                    onChange={(e) =>
                      setComponents((prev) =>
                        prev.map((x) =>
                          x.catalogItemId === c.catalogItemId
                            ? { ...x, qty: Number(e.target.value) || 1 }
                            : x,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    className="justify-self-center text-[var(--danger)]"
                    onClick={() =>
                      setComponents((prev) =>
                        prev.filter(
                          (x) => x.catalogItemId !== c.catalogItemId,
                        ),
                      )
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
              <li className="font-medium text-[var(--ink)]">
                Итого: {formatMoney(total)}
              </li>
            </ul>
          )}
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
