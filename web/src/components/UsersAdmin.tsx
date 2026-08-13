"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ResetUserPasswordModal } from "@/components/ResetUserPasswordModal";
import { ownerShorts, type CatalogOwnerValue } from "@/lib/catalog-owner";
import { formatMoney } from "@/lib/format";
import {
  assignableRoles,
  canEditUserRole,
  canResetUserPassword,
  roleLabelRuTitle,
  type AppRole,
} from "@/lib/roles";

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: AppRole;
  active: boolean;
  monthlySalary: number;
  owners: CatalogOwnerValue[];
  createdAt: string;
  specialties?: Array<{ specialty: { name: string } }>;
};

export function UsersAdmin({ actorRole }: { actorRole: string }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("EMPLOYEE");
  const [error, setError] = useState("");
  const [resetUser, setResetUser] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const createRoles = assignableRoles(actorRole);
  const canReset = canResetUserPassword(actorRole);

  async function load() {
    const res = await fetch("/api/users");
    if (!res.ok) {
      setError("Не удалось загрузить пользователей");
      setUsers([]);
      return;
    }
    setUsers(await res.json());
  }

  useEffect(() => {
    void load();
  }, []);

  async function createUser() {
    setError("");
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, password, role }),
    });
    if (!res.ok) {
      setError("Не удалось создать (проверьте email и пароль ≥ 6 символов)");
      return;
    }
    setEmail("");
    setName("");
    setPassword("");
    setRole("EMPLOYEE");
    void load();
  }

  async function patchUser(id: string, data: Record<string, unknown>) {
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(body?.error || "Не удалось сохранить");
      return;
    }
    setError("");
    void load();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">CRM</p>
        <h1 className="mt-1 text-3xl font-light tracking-tight">Пользователи</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Менеджеров назначает только админ. Базовые ставки — во вкладке
          «Ставки», индивидуальные — в карточке сотрудника.
        </p>
      </header>

      <section className="mb-6 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 md:grid-cols-2">
        <label className="text-sm">
          <span className="text-[var(--muted)]">Имя</span>
          <input
            className="field mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Email</span>
          <input
            type="email"
            className="field mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Пароль</span>
          <input
            type="text"
            className="field mt-1"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Роль</span>
          <select
            className="field mt-1"
            value={role}
            onChange={(e) => setRole(e.target.value as AppRole)}
          >
            {createRoles.map((r) => (
              <option key={r} value={r}>
                {roleLabelRuTitle(r)}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="text-sm text-[var(--danger)] md:col-span-2">{error}</p>}
        <button
          type="button"
          onClick={createUser}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white md:col-span-2 md:w-fit"
        >
          Создать пользователя
        </button>
      </section>

      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Имя</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Фирмы</th>
              <th className="px-4 py-3">Оклад</th>
              <th className="px-4 py-3">Специальности</th>
              <th className="px-4 py-3">Роль</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3">
                  <Link
                    href={`/users/${u.id}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {u.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3 text-xs font-medium uppercase tracking-wide">
                  {ownerShorts(u.owners)}
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--muted)]">
                  {u.monthlySalary > 0 ? formatMoney(u.monthlySalary) : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">
                  {(u.specialties || [])
                    .map((s) => s.specialty.name)
                    .join(", ") || "—"}
                </td>
                <td className="px-4 py-3">
                  {canEditUserRole(actorRole, u.role) ? (
                    <select
                      className="field"
                      value={u.role}
                      onChange={(e) =>
                        void patchUser(u.id, { role: e.target.value })
                      }
                    >
                      {assignableRoles(actorRole).map((r) => (
                        <option key={r} value={r}>
                          {roleLabelRuTitle(r)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span>{roleLabelRuTitle(u.role)}</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      void patchUser(u.id, { active: !u.active })
                    }
                    className={
                      u.active ? "text-[var(--accent)]" : "text-[var(--danger)]"
                    }
                  >
                    {u.active ? "Активен" : "Отключён"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <Link
                      href={`/users/${u.id}`}
                      className="text-sm text-[var(--muted)] underline"
                    >
                      Карточка
                    </Link>
                    {canReset && (
                      <button
                        type="button"
                        onClick={() =>
                          setResetUser({ id: u.id, name: u.name })
                        }
                        className="text-sm text-[var(--muted)] underline"
                      >
                        Сбросить пароль
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resetUser && (
        <ResetUserPasswordModal
          open
          userId={resetUser.id}
          userName={resetUser.name}
          onClose={() => setResetUser(null)}
        />
      )}
    </div>
  );
}
