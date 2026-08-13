"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { EquipmentCard, type EquipmentCardData } from "./EquipmentCard";
import {
  ItemDrawer,
  type DrawerItem,
  type DrawerItemPatch,
} from "./ItemDrawer";
import { Button, Modal } from "@/components/ui";

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

export function EquipmentItemPage({ itemId }: { itemId: string }) {
  const [item, setItem] = useState<ApiItem | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [writeOffId, setWriteOffId] = useState<string | null>(null);
  const [writeOffReason, setWriteOffReason] = useState<"DAMAGED" | "LOST">(
    "DAMAGED",
  );
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
      await load();
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
      await load();
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
    await load();
  }

  async function submitWriteOff() {
    if (!writeOffId) return;
    setBusy(true);
    setWriteOffError("");
    try {
      const res = await fetch(`/api/equipment/units/${writeOffId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          writeOff: true,
          reason: writeOffReason,
          comment: writeOffComment.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setWriteOffError(data.error || "Не удалось списать");
        return;
      }
      setWriteOffId(null);
      setWriteOffComment("");
      await load();
    } catch {
      setWriteOffError("Не удалось списать");
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
      await load();
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
      await load();
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
      await load();
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
      await load();
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
    await load();
    setDrawerOpen(false);
  }

  if (!item && !error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-[var(--muted)]">
        Загрузка…
      </div>
    );
  }

  if (!item) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6">
        <p className="text-sm text-[var(--danger)]">{error || "Не найдено"}</p>
        <Link href="/equipment" className="text-sm text-[var(--accent)]">
          ← К складу
        </Link>
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
      <EquipmentCard
        item={cardItem}
        documents={documents}
        units={item.equipmentUnits}
        editable
        busy={busy}
        onUploadPhoto={uploadPhoto}
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
        onSaveLabel={saveLabel}
      />

      {drawerOpen ? (
        <ItemDrawer
          item={item}
          categories={categories}
          lockStock
          onClose={() => setDrawerOpen(false)}
          onSave={saveItem}
          onPhotoChange={() => void load()}
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
          Единица будет снята со склада как повреждённая или утерянная и больше
          не попадёт в резерв.
        </p>
        <label className="mt-4 block text-sm">
          <span className="text-[var(--muted)]">Причина</span>
          <select
            className="field mt-1"
            value={writeOffReason}
            onChange={(e) =>
              setWriteOffReason(e.target.value === "LOST" ? "LOST" : "DAMAGED")
            }
          >
            <option value="DAMAGED">Повреждено</option>
            <option value="LOST">Утеряно</option>
          </select>
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-[var(--muted)]">Комментарий</span>
          <textarea
            className="field mt-1 min-h-24"
            placeholder="Что случилось, где, когда…"
            value={writeOffComment}
            onChange={(e) => setWriteOffComment(e.target.value)}
          />
        </label>
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
            {busy ? "Списание…" : "Списать"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
