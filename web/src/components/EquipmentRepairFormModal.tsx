"use client";

import { useEffect, useState } from "react";
import { Button, Modal } from "@/components/ui";
import { EQUIPMENT_FAULT_TYPES } from "@/lib/equipment-repairs";

type Props = {
  open: boolean;
  unitLabel: string;
  token: string;
  onClose: () => void;
  onSubmitted: () => void;
};

export function EquipmentRepairFormModal({
  open,
  unitLabel,
  token,
  onClose,
  onSubmitted,
}: Props) {
  const [faultType, setFaultType] = useState<string>(EQUIPMENT_FAULT_TYPES[0].id);
  const [comment, setComment] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setFaultType(EQUIPMENT_FAULT_TYPES[0].id);
    setComment("");
    setFiles([]);
    setError("");
  }, [open, token]);

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const fd = new FormData();
      fd.set("faultType", faultType);
      fd.set("comment", comment);
      for (const file of files) fd.append("photos", file);
      const res = await fetch(`/api/q/${encodeURIComponent(token)}/repair`, {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Не удалось списать в ремонт");
        return;
      }
      setComment("");
      setFiles([]);
      onSubmitted();
    } catch {
      setError("Не удалось списать в ремонт");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Списать в ремонт"
      className="max-w-md"
    >
      <p className="mt-1 text-sm text-[var(--muted)]">
        Единица {unitLabel} будет снята со склада и попадёт в раздел «Ремонт».
      </p>
      <div className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Тип поломки</span>
          <select
            className="field mt-1"
            value={faultType}
            onChange={(e) => setFaultType(e.target.value)}
          >
            {EQUIPMENT_FAULT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Комментарий</span>
          <textarea
            className="field mt-1 min-h-24"
            placeholder="Что случилось, где, как проявляется…"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Фото (необязательно)</span>
          <input
            className="field mt-1"
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            multiple
            onChange={(e) => {
              setFiles(Array.from(e.target.files || []).slice(0, 8));
            }}
          />
          {files.length > 0 ? (
            <span className="mt-1 block text-xs text-[var(--muted)]">
              Выбрано: {files.length}
            </span>
          ) : null}
        </label>
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Отмена
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? "Отправка…" : "Списать в ремонт"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
