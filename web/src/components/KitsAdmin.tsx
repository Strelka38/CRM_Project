"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  KitEditorModal,
  type EditableKit,
} from "@/components/KitEditorModal";
import { formatMoney } from "@/lib/format";

type Category = {
  id: string;
  name: string;
  path: string;
};

type Kit = EditableKit & {
  computedPrice: number;
  category?: { id: string; name: string; path: string } | null;
};

export function KitsAdmin() {
  const [kits, setKits] = useState<Kit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState<string>("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingKit, setEditingKit] = useState<EditableKit | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Kit | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  async function load() {
    const [kitsRes, catsRes] = await Promise.all([
      fetch("/api/kits"),
      fetch("/api/catalog/categories?tree=1"),
    ]);
    setKits(await kitsRes.json());
    setCategories(await catsRes.json());
  }

  useEffect(() => {
    void load();
  }, []);

  const selectedCategory =
    categories.find((c) => c.id === categoryId) || null;

  async function removeKit() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    try {
      await fetch(`/api/kits/${pendingDelete.id}`, { method: "DELETE" });
      setPendingDelete(null);
      void load();
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div className="animate-fade-up">
          <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">CRM</p>
          <h1 className="mt-1 text-3xl font-light tracking-tight">Комплекты</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Набор из существующих позиций каталога. В смету добавляется целиком
            и разворачивается в строки. Создавать можно и из раздела Каталог.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="field max-w-xs text-sm"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
          >
            <option value="">Без раздела</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.path}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="bg-cta rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg shadow-[#009ee3]/20 transition-transform hover:scale-[1.02]"
            onClick={() => {
              setEditingKit(null);
              setEditorOpen(true);
            }}
          >
            + Комплект
          </button>
        </div>
      </header>

      <div className="space-y-3">
        {kits.length === 0 ? (
          <p className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-8 text-center text-sm text-[var(--muted)]">
            Комплектов пока нет
          </p>
        ) : (
          kits.map((kit) => (
            <article
              key={kit.id}
              className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => {
                    setEditingKit(kit);
                    setEditorOpen(true);
                  }}
                >
                  <h2 className="font-display text-xl text-[var(--accent)] hover:underline">
                    {kit.name}
                  </h2>
                  <p className="text-sm text-[var(--muted)]">
                    {formatMoney(kit.computedPrice)} · {kit.components.length}{" "}
                    поз.
                    {kit.category?.path ? ` · ${kit.category.path}` : ""}
                  </p>
                  <ul className="mt-2 text-sm text-[var(--muted)]">
                    {kit.components.map((c) => (
                      <li key={c.catalogItem.id}>
                        {c.qty}× {c.catalogItem.name}
                      </li>
                    ))}
                  </ul>
                </button>
                <button
                  type="button"
                  className="text-sm text-[var(--danger)]"
                  onClick={() => setPendingDelete(kit)}
                >
                  Удалить
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      <KitEditorModal
        open={editorOpen}
        categoryId={
          editingKit?.categoryId ?? (categoryId || null)
        }
        categoryPath={
          editingKit
            ? categories.find((c) => c.id === editingKit.categoryId)?.path
            : selectedCategory?.path
        }
        categories={categories}
        kit={editingKit}
        onClose={() => {
          setEditorOpen(false);
          setEditingKit(null);
        }}
        onSaved={() => void load()}
      />

      <ConfirmDialog
        open={pendingDelete != null}
        title="Удалить комплект?"
        message={`Комплект «${pendingDelete?.name ?? ""}» будет удалён. Продолжить?`}
        confirmLabel="Удалить"
        busy={deleteBusy}
        onCancel={() => {
          if (!deleteBusy) setPendingDelete(null);
        }}
        onConfirm={() => void removeKit()}
      />
    </div>
  );
}
