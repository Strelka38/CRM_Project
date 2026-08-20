"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  DirectoryAddButton,
  DirectoryCardLink,
  DirectoryCsvMenu,
  DirectoryIconButton,
  DirectorySelectionActions,
  IconKey,
  IconPlusPerson,
  downloadCsvExport,
  postBulkAction,
  uploadCsvImport,
} from "@/components/DirectoryToolbar";
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
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const csvImportRef = useRef<HTMLInputElement>(null);
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
    const rows: UserRow[] = await res.json();
    setUsers(rows);
    setSelected((prev) => {
      const ids = new Set(rows.map((r) => r.id));
      return new Set([...prev].filter((id) => ids.has(id)));
    });
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
    setShowCreate(false);
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

  function toggleAll() {
    const ids = users.map((u) => u.id);
    const all = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected(all ? new Set() : new Set(ids));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkDelete() {
    if (selected.size === 0) return;
    setBusy(true);
    setError("");
    try {
      await postBulkAction("/api/users/bulk", "delete", [...selected]);
      setSelected(new Set());
      setConfirmDelete(false);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось выполнить");
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setCsvBusy(true);
    setCsvMessage("");
    try {
      setCsvMessage(await downloadCsvExport("/api/users/csv"));
    } catch (e) {
      setCsvMessage(e instanceof Error ? e.message : "Не удалось экспортировать");
    } finally {
      setCsvBusy(false);
    }
  }

  async function importCsv(file: File) {
    setCsvBusy(true);
    setCsvMessage("");
    try {
      setCsvMessage(await uploadCsvImport("/api/users/csv", file));
      void load();
    } catch (e) {
      setCsvMessage(e instanceof Error ? e.message : "Не удалось импортировать");
    } finally {
      setCsvBusy(false);
    }
  }

  const allSelected = users.length > 0 && users.every((u) => selected.has(u.id));

  return (
    <div className="w-full px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          База данных
        </p>
        <h1 className="mt-1 text-3xl font-light tracking-tight">Пользователи</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Менеджеров назначает только админ. Базовые ставки — во вкладке
          «Ставки», индивидуальные — в карточке сотрудника.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex w-full items-center gap-2 border-b border-[var(--line)] px-4 py-3">
          <DirectoryAddButton
            title="+ Пользователь"
            icon={<IconPlusPerson />}
            onClick={() => setShowCreate((v) => !v)}
          />
          <div className="ml-auto flex items-center gap-1">
            <DirectorySelectionActions
              count={selected.size}
              disabled={busy}
              onDelete={() => setConfirmDelete(true)}
            />
            <DirectoryCsvMenu
              busy={csvBusy}
              onExport={() => void exportCsv()}
              onImport={() => csvImportRef.current?.click()}
            />
          </div>
          <input
            ref={csvImportRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importCsv(file);
            }}
          />
        </div>
        {csvMessage ? (
          <p className="border-b border-[var(--line)] px-4 py-2 text-xs text-[var(--muted)]">
            {csvMessage}
          </p>
        ) : null}
        {error ? (
          <p className="border-b border-[var(--line)] px-4 py-2 text-sm text-[var(--danger)]">
            {error}
          </p>
        ) : null}

        {showCreate ? (
          <div className="grid gap-3 border-b border-[var(--line)] p-4 md:grid-cols-2">
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
            <button
              type="button"
              onClick={createUser}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white md:col-span-2 md:w-fit"
            >
              Создать пользователя
            </button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="w-10 px-3 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Выбрать все"
                  />
                </th>
                <th className="px-3 py-2 text-left">Имя</th>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Фирмы</th>
                <th className="px-3 py-2 text-left">Оклад</th>
                <th className="px-3 py-2 text-left">Специальности</th>
                <th className="px-3 py-2 text-left">Роль</th>
                <th className="px-3 py-2 text-left">Статус</th>
                <th className="w-20 px-3 py-2 text-left" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className={`border-t border-[var(--line)] ${
                    selected.has(u.id) ? "bg-[var(--selected)]/40" : ""
                  }`}
                >
                  <td className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selected.has(u.id)}
                      onChange={() => toggleOne(u.id)}
                      aria-label={`Выбрать ${u.name}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-left">{u.name}</td>
                  <td className="px-3 py-2 text-left">{u.email}</td>
                  <td className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide">
                    {ownerShorts(u.owners)}
                  </td>
                  <td className="px-3 py-2 text-left tabular-nums text-[var(--muted)]">
                    {u.monthlySalary > 0 ? formatMoney(u.monthlySalary) : "—"}
                  </td>
                  <td className="px-3 py-2 text-left text-xs text-[var(--muted)]">
                    {(u.specialties || [])
                      .map((s) => s.specialty.name)
                      .join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-left">
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
                  <td className="px-3 py-2 text-left">
                    <button
                      type="button"
                      onClick={() => void patchUser(u.id, { active: !u.active })}
                      className={
                        u.active ? "text-[var(--accent)]" : "text-[var(--danger)]"
                      }
                    >
                      {u.active ? "Активен" : "Отключён"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-left">
                    <div className="flex items-center gap-0.5">
                      <DirectoryCardLink href={`/users/${u.id}`} />
                      {canReset ? (
                        <DirectoryIconButton
                          title="Сбросить пароль"
                          onClick={() =>
                            setResetUser({ id: u.id, name: u.name })
                          }
                        >
                          <IconKey />
                        </DirectoryIconButton>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Отключить пользователей"
        message={`Отключить выбранные учётки (${selected.size})? Последний админ не отключается.`}
        confirmLabel="Отключить"
        busy={busy}
        onConfirm={() => void bulkDelete()}
        onCancel={() => setConfirmDelete(false)}
      />

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
