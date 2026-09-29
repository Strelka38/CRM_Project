"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { EquipmentCard, type EquipmentCardData } from "./EquipmentCard";
import {
  ItemDrawer,
  type DrawerItem,
  type DrawerItemPatch,
} from "./ItemDrawer";
import { Button, Modal, SideDrawer } from "@/components/ui";
import type { CatalogOwnerValue } from "@/lib/catalog-owner";
import { isAdmin } from "@/lib/roles";

type Doc = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  description?: string | null;
  createdAt?: string;
  uploader?: { id: string; name: string } | null;
};

type Unit = {
  id: string;
  unitNumber: number;
  qrToken: string;
  label?: string | null;
  owner?: CatalogOwnerValue | null;
  inRepair?: boolean;
  active?: boolean;
  writeOffReason?: string | null;
  writeOffComment?: string | null;
};

type Category = {
  id: string;
  name: string;
  path: string;
  parentId: string | null;
};

type ApiItem = EquipmentCardData &
  DrawerItem & {
    photoPath?: string | null;
    equipmentUnits: Unit[];
    equipmentDocuments: Doc[];
  };

export function EquipmentItemPage({
  itemId,
  variant = "page",
  onClose,
  onChanged,
}: {
  itemId: string;
  variant?: "page" | "drawer";
  onClose?: () => void;
  onChanged?: () => void;
}) {
  const { data: session } = useSession();
  const admin = isAdmin(session?.user?.role);
  const [item, setItem] = useState<ApiItem | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [writeOffId, setWriteOffId] = useState<string | null>(null);
  const [writeOffReason, setWriteOffReason] = useState<
    "DAMAGED" | "LOST" | "CREATED_BY_MISTAKE"
  >("DAMAGED");
  const [writeOffComment, setWriteOffComment] = useState("");
  const [writeOffError, setWriteOffError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const res = await fetch(`/api/equipment/items/${itemId}`);
    if (!res.ok) {
      setError("Не удалось загрузить карточку");
      setItem(null);
      return;
    }
    setItem(await res.json());
  }, [itemId]);

  const reload = useCallback(async () => {
    await load();
    onChanged?.();
  }, [load, onChanged]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/catalog/categories?tree=1", {
        credentials: "same-origin",
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setCategories(data);
    })();
  }, []);

  async function addUnit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/equipment/items/${itemId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addUnit: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Не удалось добавить единицу");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function syncUnits() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/equipment/items/${itemId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sync: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Не удалось создать единицы");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function saveLabel(unitId: string, label: string) {
    const res = await fetch(`/api/equipment/units/${unitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) {
      setError("Не удалось сохранить метку");
      return;
    }
    await reload();
  }

  async function saveOwner(unitId: string, owner: CatalogOwnerValue | null) {
    const res = await fetch(`/api/equipment/units/${unitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ owner }),
    });
    if (!res.ok) {
      setError("Не удалось сохранить склад");
      return;
    }
    await reload();
  }

  async function submitWriteOff() {
    if (!writeOffId) return;
    setBusy(true);
    setWriteOffError("");
    try {
      const res = await fetch(`/api/equipment/units/${writeOffId}`, {
        method: writeOffReason === "CREATED_BY_MISTAKE" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body:
          writeOffReason === "CREATED_BY_MISTAKE"
            ? undefined
            : JSON.stringify({
                writeOff: true,
                reason: writeOffReason,
                comment: writeOffComment.trim(),
              }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setWriteOffError(
          data.error ||
            (writeOffReason === "CREATED_BY_MISTAKE"
              ? "Не удалось удалить единицу"
              : "Не удалось списать"),
        );
        return;
      }
      setWriteOffId(null);
      setWriteOffComment("");
      await reload();
    } catch {
      setWriteOffError(
        writeOffReason === "CREATED_BY_MISTAKE"
          ? "Не удалось удалить единицу"
          : "Не удалось списать",
      );
    } finally {
      setBusy(false);
    }
  }

  async function restoreWriteOff(unitId: string) {
    if (!confirm("Вернуть списанную единицу на склад?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/equipment/units/${unitId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restoreWriteOff: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Не удалось вернуть единицу на склад");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function uploadPhoto(file: File) {
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/catalog/items/${itemId}/photo`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Не удалось загрузить фото");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function importPhotoUrl(url: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/catalog/items/${itemId}/photo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Не удалось скачать фото");
        return false;
      }
      await reload();
      return true;
    } finally {
      setBusy(false);
    }
  }

  async function removePhoto() {
    if (!confirm("Убрать фото?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/catalog/items/${itemId}/photo`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Не удалось удалить фото");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function uploadDoc(file: File) {
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch(`/api/equipment/items/${itemId}/documents`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Не удалось загрузить файл");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function deleteDoc(docId: string) {
    if (!confirm("Удалить файл?")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(
        `/api/equipment/items/${itemId}/documents?docId=${encodeURIComponent(docId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        setError("Не удалось удалить файл");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function saveItem(_id: string, data: DrawerItemPatch) {
    const res = await fetch(`/api/catalog/items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      throw new Error(payload.error || "Не удалось сохранить");
    }
    await reload();
    setDrawerOpen(false);
  }

  async function toggleShowInCatalog(value: boolean) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/catalog/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ showInCatalog: value }),
      });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        setError(payload.error || "Не удалось сохранить");
        return;
      }
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const isDrawer = variant === "drawer";

  if (!item && !error) {
    return (
      <div
        className={
          isDrawer
            ? "px-4 py-6 text-sm text-[var(--muted)]"
            : "mx-auto max-w-3xl px-4 py-6 text-sm text-[var(--muted)]"
        }
      >
        Загрузка…
      </div>
    );
  }

  if (!item) {
    return (
      <div
        className={
          isDrawer
            ? "space-y-3 px-4 py-6"
            : "mx-auto max-w-3xl space-y-3 px-4 py-6"
        }
      >
        <p className="text-sm text-[var(--danger)]">{error || "Не найдено"}</p>
        {isDrawer ? (
          <button
            type="button"
            className="text-sm text-[var(--accent)]"
            onClick={onClose}
          >
            Закрыть
          </button>
        ) : (
          <Link href="/equipment" className="text-sm text-[var(--accent)]">
            ← К складу
          </Link>
        )}
      </div>
    );
  }

  const cardItem: EquipmentCardData = {
    ...item,
    photoUrl: item.photoPath
      ? `/api/catalog/items/${item.id}/photo?v=${encodeURIComponent(item.photoPath)}`
      : null,
  };

  const documents = item.equipmentDocuments.map((d) => ({
    ...d,
    fileUrl: `/api/equipment/items/${item.id}/documents/${d.id}/file`,
  }));

  const editors = (
    <>
      {drawerOpen ? (
        <ItemDrawer
          item={item}
          categories={categories}
          lockStock
          embedded={isDrawer}
          onClose={() => setDrawerOpen(false)}
          onSave={saveItem}
          onPhotoChange={() => void reload()}
        />
      ) : null}

      <Modal
        open={!!writeOffId}
        onClose={() => {
          if (!busy) setWriteOffId(null);
        }}
        title="Списать единицу"
        className="max-w-md"
      >
        <p className="mt-1 text-sm text-[var(--muted)]">
          {writeOffReason === "CREATED_BY_MISTAKE"
            ? "Единица будет полностью удалена вместе с QR-кодом и историей. Это действие нельзя отменить."
            : "Единица будет снята со склада как повреждённая или утерянная и больше не попадёт в резерв."}
        </p>
        <label className="mt-4 block text-sm">
          <span className="text-[var(--muted)]">Причина</span>
          <select
            className="field mt-1"
            value={writeOffReason}
            onChange={(e) => {
              const value = e.target.value;
              setWriteOffReason(
                value === "LOST"
                  ? "LOST"
                  : value === "CREATED_BY_MISTAKE" && admin
                    ? "CREATED_BY_MISTAKE"
                    : "DAMAGED",
              );
            }}
          >
            <option value="DAMAGED">Повреждено</option>
            <option value="LOST">Утеряно</option>
            {admin ? (
              <option value="CREATED_BY_MISTAKE">
                Случайно создано — удалить полностью
              </option>
            ) : null}
          </select>
        </label>
        {writeOffReason !== "CREATED_BY_MISTAKE" ? (
          <label className="mt-3 block text-sm">
            <span className="text-[var(--muted)]">Комментарий</span>
            <textarea
              className="field mt-1 min-h-24"
              placeholder="Что случилось, где, когда…"
              value={writeOffComment}
              onChange={(e) => setWriteOffComment(e.target.value)}
            />
          </label>
        ) : null}
        {writeOffError ? (
          <p className="mt-2 text-sm text-[var(--danger)]">{writeOffError}</p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setWriteOffId(null)}
          >
            Отмена
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={busy}
            onClick={() => void submitWriteOff()}
          >
            {busy
              ? writeOffReason === "CREATED_BY_MISTAKE"
                ? "Удаление…"
                : "Списание…"
              : writeOffReason === "CREATED_BY_MISTAKE"
                ? "Удалить полностью"
                : "Списать"}
          </Button>
        </div>
      </Modal>
    </>
  );

  const card = (
    <EquipmentCard
      item={cardItem}
      documents={documents}
      units={item.equipmentUnits}
      editable
      busy={busy}
      onUploadPhoto={uploadPhoto}
      onImportPhotoUrl={importPhotoUrl}
      onRemovePhoto={removePhoto}
      onUploadDoc={uploadDoc}
      onDeleteDoc={deleteDoc}
      onSyncUnits={syncUnits}
      onAddUnit={addUnit}
      onWriteOff={(id) => {
        setWriteOffId(id);
        setWriteOffReason("DAMAGED");
        setWriteOffComment("");
        setWriteOffError("");
      }}
      onRestoreWriteOff={admin ? restoreWriteOff : undefined}
      onSaveLabel={saveLabel}
      onSaveOwner={saveOwner}
      onToggleShowInCatalog={toggleShowInCatalog}
    />
  );

  if (isDrawer) {
    if (drawerOpen) {
      return <div className="h-full min-h-0 overflow-hidden">{editors}</div>;
    }

    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] px-3 py-3">
          <button
            type="button"
            onClick={onClose}
            className="drawer-close flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-lg leading-none text-[var(--muted)] hover:bg-[var(--ink)]/10 hover:text-[var(--ink)]"
            aria-label="Закрыть"
          >
            ×
          </button>
          <h2
            id="equipment-card-title"
            className="min-w-0 flex-1 truncate text-base font-semibold"
          >
            Карточка
          </h2>
          <button
            type="button"
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--panel-muted)]"
            onClick={() => setDrawerOpen(true)}
          >
            Редактировать
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {error ? (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          ) : null}
          {card}
        </div>
        {editors}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/equipment"
          className="inline-block text-sm text-[var(--muted)] hover:text-[var(--accent)]"
        >
          ← Склад
        </Link>
        <button
          type="button"
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-[var(--panel-muted)]"
          onClick={() => setDrawerOpen(true)}
        >
          Редактировать позицию
        </button>
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      {card}
      {editors}
    </div>
  );
}

export function EquipmentCardDrawer({
  itemId,
  onClose,
  onChanged,
}: {
  itemId: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  return (
    <SideDrawer
      open={!!itemId}
      onClose={onClose}
      side="right"
      wide
      modal={false}
      labelledBy="equipment-card-title"
      className="!max-w-[min(42rem,100%)]"
    >
      {itemId ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <EquipmentItemPage
            itemId={itemId}
            variant="drawer"
            onClose={onClose}
            onChanged={onChanged}
          />
        </div>
      ) : null}
    </SideDrawer>
  );
}
