"use client";

import { FormEvent, useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type Props = {
  open: boolean;
  email: string;
  onClose: () => void;
};

export function ChangePasswordModal({ open, email, onClose }: Props) {
  const [formEmail, setFormEmail] = useState(email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFormEmail(email);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowPasswords(false);
    setError("");
    setSuccess(false);
    setBusy(false);
  }, [open, email]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess(false);

    if (newPassword !== confirmPassword) {
      setError("Новый пароль и подтверждение не совпадают");
      return;
    }
    if (newPassword.length < 6) {
      setError("Новый пароль должен быть не короче 6 символов");
      return;
    }

    setBusy(true);
    const res = await fetch("/api/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: formEmail,
        currentPassword,
        newPassword,
        confirmPassword,
      }),
    });
    setBusy(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(data?.error || "Не удалось сменить пароль");
      return;
    }

    setSuccess(true);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  return (
    <Modal open={open} onClose={onClose} title="Смена пароля" className="max-w-md">
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block text-sm">
          <span className="text-[var(--muted)]">E-mail</span>
          <input
            className="field mt-1"
            type="email"
            autoComplete="username"
            value={formEmail}
            onChange={(e) => setFormEmail(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Текущий пароль</span>
          <input
            className="field mt-1"
            type={showPasswords ? "text" : "password"}
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </label>
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
          <span className="text-[var(--muted)]">Подтверждение нового пароля</span>
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
          <p className="text-sm text-[var(--accent)]">Пароль успешно изменён</p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={onClose}>
            Закрыть
          </Button>
          <Button type="submit" variant="primary" size="sm" disabled={busy}>
            {busy ? "Сохранение…" : "Сменить пароль"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
