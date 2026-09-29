"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  CategorySelect,
  type CategoryOption,
} from "@/components/CategorySelect";
import { OwnerTagsPicker } from "@/components/OwnerTagsPicker";
import {
  normalizeOwners,
  ownerLabels,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { formatMoney } from "@/lib/format";
import { SideDrawer } from "@/components/ui/SideDrawer";

export type DrawerItem = {
  id: string;
  name: string;
  categoryId?: string;
  model?: string | null;
  manufacturer?: string | null;
  basePrice: number;
  estimatedValue?: number | null;
  costPrice?: number | null;
  stockQty: number;
  available?: number;
  reserved?: number;
  width?: number | null;
  height?: number | null;
  depth?: number | null;
  power?: number | null;
  weight?: number | null;
  comment?: string | null;
  photoPath?: string | null;
  owners?: CatalogOwnerValue[] | null;
  /** @deprecated */
  owner?: CatalogOwnerValue | null;
  itemKind: string;
  dayMode: string;
  showInCatalog?: boolean;
  category?: { id?: string; name: string; path: string };
};

export type DrawerItemPatch = {
  name?: string;
  categoryId?: string;
  basePrice?: number;
  estimatedValue?: number | null;
  costPrice?: number | null;
  stockQty?: number;
  width?: number | null;
  height?: number | null;
  depth?: number | null;
  power?: number | null;
  weight?: number | null;
  comment?: string | null;
  owners?: CatalogOwnerValue[];
  showInCatalog?: boolean;
};

type Props = {
  item: DrawerItem | null;
  onClose: () => void;
  onAdd?: (item: DrawerItem) => void;
  onHide?: () => void;
  onSave?: (id: string, data: DrawerItemPatch) => Promise<void> | void;
  onPhotoChange?: (item: DrawerItem) => void;
  categories?: CategoryOption[];
  /** Количество задаётся единицами на складе, не вручную */
  lockStock?: boolean;
  /** Render inside an existing drawer instead of opening a second overlay. */
  embedded?: boolean;
  /** false — карточка справа, каталог остаётся кликабельным. */
  modal?: boolean;
};

type Draft = {
  name: string;
  categoryId: string;
  owners: CatalogOwnerValue[];
  showInCatalog: boolean;
  basePrice: string;
  estimatedValue: string;
  costPrice: string;
  stockQty: string;
  width: string;
  height: string;
  depth: string;
  power: string;
  weight: string;
  comment: string;
};

function toDraft(item: DrawerItem): Draft {
  return {
    name: item.name,
    categoryId: item.categoryId || item.category?.id || "",
    owners: normalizeOwners(item.owners, item.owner),
    showInCatalog: item.showInCatalog !== false,
    basePrice: String(item.basePrice ?? 0),
    estimatedValue:
      item.estimatedValue != null ? String(item.estimatedValue) : "",
    costPrice: item.costPrice != null ? String(item.costPrice) : "",
    stockQty: String(item.stockQty ?? 0),
    width: item.width != null ? String(item.width) : "",
    height: item.height != null ? String(item.height) : "",
    depth: item.depth != null ? String(item.depth) : "",
    power: item.power != null ? String(item.power) : "",
    weight: item.weight != null ? String(item.weight) : "",
    comment: item.comment ?? "",
  };
}

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function photoUrl(itemId: string, photoPath?: string | null) {
  if (!photoPath) return null;
  return `/api/catalog/items/${itemId}/photo?v=${encodeURIComponent(photoPath)}`;
}

export function ItemDrawer({
  item,
  onClose,
  onAdd,
  onHide,
  onSave,
  onPhotoChange,
  categories = [],
  lockStock = false,
  embedded = false,
  modal = true,
}: Props) {
  const editable = Boolean(onSave);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) setDraft(toDraft(item));
    else setDraft(null);
  }, [item]);

  useEffect(() => {
    setLinkOpen(false);
    setLinkValue("");
  }, [item?.id]);

  if (!item || !draft) return null;

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function save() {
    if (!onSave || !item || !draft) return;
    const name = draft.name.trim();
    if (!name) return;

    const data: DrawerItemPatch = {
      name,
      ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
      owners: draft.owners,
      showInCatalog: draft.showInCatalog,
      basePrice: Math.max(0, Number(draft.basePrice) || 0),
      estimatedValue: parseOptionalNumber(draft.estimatedValue),
      costPrice: parseOptionalNumber(draft.costPrice),
      ...(lockStock
        ? {}
        : { stockQty: Math.max(0, Math.round(Number(draft.stockQty) || 0)) }),
      width: parseOptionalNumber(draft.width),
      height: parseOptionalNumber(draft.height),
      depth: parseOptionalNumber(draft.depth),
      power: parseOptionalNumber(draft.power),
      weight: parseOptionalNumber(draft.weight),
      comment: draft.comment.trim() || null,
    };

    setSaving(true);
    try {
      await onSave(item.id, data);
    } finally {
      setSaving(false);
    }
  }

  async function uploadPhoto(file: File) {
    if (!item) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/catalog/items/${item.id}/photo`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(
          typeof data.error === "string" ? data.error : "Не удалось загрузить",
        );
        return;
      }
      const updated = (await res.json()) as DrawerItem;
      onPhotoChange?.(updated);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function importPhotoUrl(url: string) {
    if (!item) return false;
    setUploading(true);
    try {
      const res = await fetch(`/api/catalog/items/${item.id}/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(
          typeof data.error === "string" ? data.error : "Не удалось скачать фото",
        );
        return false;
      }
      const updated = (await res.json()) as DrawerItem;
      onPhotoChange?.(updated);
      return true;
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto() {
    if (!item?.photoPath) return;
    setUploading(true);
    try {
      const res = await fetch(`/api/catalog/items/${item.id}/photo`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      const updated = (await res.json()) as DrawerItem;
      onPhotoChange?.(updated);
    } finally {
      setUploading(false);
    }
  }

  const dims = [item.width, item.height, item.depth]
    .filter((v) => v != null)
    .join(" × ");
  const imgSrc = photoUrl(item.id, item.photoPath);

  const content = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-start gap-2 border-b border-[var(--line)] px-3 py-3">
          <button type="button" onClick={onClose} className="drawer-close btn-icon shrink-0" aria-label="Закрыть">
            ×
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
              {item.category?.path || "Каталог"}
            </p>
            {editable ? (
              <input
                className="field mt-1 w-full font-display text-xl font-semibold"
                value={draft.name}
                onChange={(e) => setField("name", e.target.value)}
                placeholder="Название позиции"
              />
            ) : (
            <h3 className="font-display mt-1 text-xl font-semibold leading-snug text-[var(--ink)]">
              {item.name}
            </h3>
            )}
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm">
          <section className="space-y-2">
            <h4 className="text-xs uppercase text-[var(--muted)]">Фото</h4>
            {imgSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imgSrc}
                alt={item.name}
                className="max-h-48 w-full rounded-lg border border-[var(--line)] object-contain bg-[var(--panel-muted)]"
              />
            ) : (
              <div className="flex h-32 items-center justify-center rounded-lg border border-dashed border-[var(--line)] text-xs text-[var(--muted)]">
                Нет фото
              </div>
            )}
            {editable && (
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadPhoto(file);
                  }}
                />
                <button
                  type="button"
                  disabled={uploading}
                  className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50"
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading
                    ? "Загрузка…"
                    : imgSrc
                      ? "Заменить фото"
                      : "Загрузить фото"}
                </button>
                <button
                  type="button"
                  disabled={uploading}
                  className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--panel-muted)] disabled:opacity-50"
                  onClick={() => setLinkOpen((open) => !open)}
                >
                  По ссылке
                </button>
                {linkOpen ? (
                  <form
                    className="flex min-w-[16rem] flex-1 basis-full gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const url = linkValue.trim();
                      if (!url) return;
                      void (async () => {
                        const ok = await importPhotoUrl(url);
                        if (ok) {
                          setLinkValue("");
                          setLinkOpen(false);
                        }
                      })();
                    }}
                  >
                    <input
                      type="url"
                      inputMode="url"
                      required
                      autoFocus
                      disabled={uploading}
                      placeholder="https://…"
                      value={linkValue}
                      onChange={(e) => setLinkValue(e.target.value)}
                      className="field min-w-0 flex-1 px-2 py-1.5 text-sm"
                      aria-label="Ссылка на фото"
                    />
                    <button
                      type="submit"
                      disabled={uploading || !linkValue.trim()}
                      className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--panel-muted)] disabled:opacity-50"
                    >
                      {uploading ? "Скачивание…" : "Скачать"}
                    </button>
                  </form>
                ) : null}
                {imgSrc && (
                  <button
                    type="button"
                    disabled={uploading}
                    className="rounded-md px-3 py-1.5 text-sm text-[var(--danger)] disabled:opacity-50"
                    onClick={() => void removePhoto()}
                  >
                    Убрать фото
                  </button>
                )}
              </div>
            )}
          </section>

          {editable ? (
            <section className="space-y-3">
              {categories.length > 0 && (
                <CategorySelect
                  categories={categories}
                  value={draft.categoryId}
                  onChange={(id) => setField("categoryId", id)}
                  label="Раздел / подраздел"
                />
              )}
              <OwnerTagsPicker
                value={draft.owners}
                onChange={(owners) => setField("owners", owners)}
                label="Чья? (можно несколько — общая покупка)"
              />
              <label className="flex items-start gap-3 rounded-lg border border-[var(--line)] px-3 py-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={draft.showInCatalog}
                  onChange={(e) => setField("showInCatalog", e.target.checked)}
                />
                <span>
                  <span className="block font-medium">
                    Отражать товар в каталоге
                  </span>
                  <span className="text-caption text-[var(--muted)]">
                    Если выключить, менеджер не увидит позицию в каталоге сметы.
                    В комплекты и спецификации её по-прежнему можно добавлять.
                  </span>
                </span>
              </label>
              <h4 className="text-xs uppercase text-[var(--muted)]">
                Характеристики
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Цена аренды"
                  type="number"
                  value={draft.basePrice}
                  onChange={(v) => setField("basePrice", v)}
                />
                <Field
                  label="Оценочная стоимость"
                  type="number"
                  value={draft.estimatedValue}
                  onChange={(v) => setField("estimatedValue", v)}
                />
                <Field
                  label="Себестоимость (закуп)"
                  type="number"
                  value={draft.costPrice}
                  onChange={(v) => setField("costPrice", v)}
                />
                {lockStock ? (
                  <Stat label="На складе" value={String(item.stockQty)} />
                ) : (
                  <Field
                    label="Кол-во"
                    type="number"
                    value={draft.stockQty}
                    onChange={(v) => setField("stockQty", v)}
                  />
                )}
                <Field
                  label="Ширина"
                  type="number"
                  value={draft.width}
                  onChange={(v) => setField("width", v)}
                />
                <Field
                  label="Высота"
                  type="number"
                  value={draft.height}
                  onChange={(v) => setField("height", v)}
                />
                <Field
                  label="Глубина"
                  type="number"
                  value={draft.depth}
                  onChange={(v) => setField("depth", v)}
                />
                <Field
                  label="Мощность"
                  type="number"
                  value={draft.power}
                  onChange={(v) => setField("power", v)}
                />
                <Field
                  label="Вес"
                  type="number"
                  value={draft.weight}
                  onChange={(v) => setField("weight", v)}
                />
              </div>
              <label className="block">
                <span className="mb-1 block text-caption uppercase text-[var(--muted)]">
                  Комментарий
                </span>
                <textarea
                  className="field min-h-[88px] w-full resize-y"
                  value={draft.comment}
                  onChange={(e) => setField("comment", e.target.value)}
                />
              </label>
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Stat label="Тип" value={item.itemKind} />
                <Stat label="День" value={item.dayMode} />
                {item.available != null && (
                  <Stat label="Свободно" value={String(item.available)} />
                )}
                {item.reserved != null && item.reserved > 0 && (
                  <Stat label="В бронях" value={String(item.reserved)} />
                )}
              </div>
            </section>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Аренда" value={formatMoney(item.basePrice)} />
                <Stat
                  label="На складе"
                  value={`${item.stockQty}${
                    item.available != null ? ` · своб. ${item.available}` : ""
                  }`}
                />
                <Stat
                  label="Чья?"
                  value={ownerLabels(
                    normalizeOwners(item.owners, item.owner),
                  )}
                />
                {item.reserved != null && item.reserved > 0 && (
                  <Stat label="В бронях" value={String(item.reserved)} />
                )}
                {item.estimatedValue != null && item.estimatedValue > 0 && (
                  <Stat
                    label="Оценка"
                    value={formatMoney(item.estimatedValue)}
                  />
                )}
                <Stat label="Тип" value={item.itemKind} />
                <Stat label="День" value={item.dayMode} />
              </div>

              {(item.model || item.manufacturer) && (
                <section>
                  <h4 className="mb-1 text-xs uppercase text-[var(--muted)]">
                    Описание
                  </h4>
                  {item.model && <p>{item.model}</p>}
                  {item.manufacturer && (
                    <p className="text-[var(--muted)]">{item.manufacturer}</p>
                  )}
                </section>
              )}

              {(dims || item.power != null || item.weight != null) && (
                <section>
                  <h4 className="mb-1 text-xs uppercase text-[var(--muted)]">
                    Характеристики
                  </h4>
                  <ul className="space-y-1 text-[var(--ink)]">
                    {dims && <li>Габариты: {dims}</li>}
                    {item.power != null && <li>Мощность: {item.power}</li>}
                    {item.weight != null && <li>Вес: {item.weight} кг</li>}
                  </ul>
                </section>
              )}

              {item.comment && (
                <section>
                  <h4 className="mb-1 text-xs uppercase text-[var(--muted)]">
                    Комментарий
                  </h4>
                  <p>{item.comment}</p>
                </section>
              )}
            </>
          )}

          {editable && (item.model || item.manufacturer) && (
            <section>
              <h4 className="mb-1 text-xs uppercase text-[var(--muted)]">
                Описание
              </h4>
              {item.model && <p>{item.model}</p>}
              {item.manufacturer && (
                <p className="text-[var(--muted)]">{item.manufacturer}</p>
              )}
            </section>
          )}

          {item.itemKind === "EQUIPMENT" && (
            <section>
              <Link
                href={`/equipment/${item.id}`}
                className="inline-flex rounded-md border border-[var(--line)] px-3 py-2 text-sm text-[var(--accent)] hover:bg-[var(--panel-muted)]"
              >
                Карточка склада →
              </Link>
            </section>
          )}
        </div>

        {(onAdd || onHide || onSave) && (
          <div className="flex flex-col gap-2 border-t border-[var(--line)] p-4">
            {onSave && (
              <button
                type="button"
                disabled={saving || !draft.name.trim()}
                className="w-full rounded-md bg-[var(--solid)] px-4 py-2.5 text-sm font-medium text-[var(--on-solid)] disabled:opacity-50"
                onClick={() => void save()}
              >
                {saving ? "Сохранение…" : "Сохранить"}
              </button>
            )}
            {onAdd && (
              <button
                type="button"
                className="w-full rounded-md bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-white"
                onClick={() => onAdd(item)}
              >
                Добавить в смету
              </button>
            )}
            {onHide && (
              <button
                type="button"
                className="w-full rounded-md px-4 py-2 text-sm text-[var(--danger)]"
                onClick={onHide}
              >
                Удалить позицию
              </button>
            )}
          </div>
        )}
    </div>
  );

  if (embedded) return content;

  return (
    <SideDrawer open onClose={onClose} zIndex={80} modal={modal}>
      {content}
    </SideDrawer>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-caption uppercase text-[var(--muted)]">
        {label}
      </span>
      <input
        type={type}
        className="field w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] px-3 py-2">
      <p className="text-caption uppercase text-[var(--muted)]">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}
