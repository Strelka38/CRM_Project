"use client";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Удалить",
  cancelLabel = "Отмена",
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal open={open} onClose={onCancel} title={title} className="max-w-sm">
      <p className="mt-2 text-sm text-[var(--muted)]">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          size="sm"
          disabled={busy}
          onClick={onConfirm}
        >
          {busy ? "…" : confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
