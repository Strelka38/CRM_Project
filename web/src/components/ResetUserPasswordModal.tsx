"use client";

import { FormEvent, useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type Props = {
  open: boolean;
  userId: string;
  userName: string;
  onClose: () => void;
  onDone?: () => void;
};

export function ResetUserPasswordModal({
  open,
  userId,
  userName,
  onClose,
  onDone,
}: Props) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNewPassword("");
    setConfirmPassword("");
    setShowPasswords(false);
    setError("");
    setSuccess(false);
    setBusy(false);
  }, [open, userId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("Пароль и подтверждение не совпадают");
      return;
    }
    if (newPassword.length < 6) {
      setError("Пароль должен быть не короче 6 символов");
      return;
    }

    setBusy(true);
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    setBusy(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error || "Не удалось сбросить пароль");
      return;
    }

    setSuccess(true);
    setNewPassword("");
    setConfirmPassword("");
    onDone?.();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Сброс пароля"
      className="max-w-md"
    >
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <p className="text-sm text-[var(--muted)]">
          Новый пароль для{" "}
          <span className="text-[var(--ink)]">{userName}</span>
        </p>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Новый пароль</span>
          <input
            className="field mt-1"
            type={showPasswords ? "text" : "password"}
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Подтверждение</span>
          <input
            className="field mt-1"
            type={showPasswords ? "text" : "password"}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={6}
            required
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={showPasswords}
            onChange={(e) => setShowPasswords(e.target.checked)}
          />
          Показать пароли
        </label>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        {success && (
          <p className="text-sm text-[var(--accent)]">Пароль сброшен</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            Закрыть
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={busy}>
            {busy ? "Сохранение…" : "Сбросить пароль"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
