"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button, DataCards, SortableTh, useTableSort } from "@/components/ui";
import {
  DirectoryAddButton,
  DirectoryCardLink,
  DirectoryCsvMenu,
  DirectoryIconButton,
  DirectoryMobileBar,
  DirectorySelectionActions,
  IconKey,
  IconPlusPerson,
  downloadCsvExport,
  postBulkAction,
  uploadCsvImport,
} from "@/components/DirectoryToolbar";
import { ResetUserPasswordModal } from "@/components/ResetUserPasswordModal";
import { ownerShorts, type CatalogOwnerValue } from "@/lib/catalog-owner";
import { cn } from "@/lib/cn";
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
  specialties?: Array<{ specialty: { id?: string; name: string } }>;
};

function userSortValue(u: UserRow, key: string) {
  switch (key) {
    case "name":
      return u.name;
    case "email":
      return u.email;
    case "owners":
      return ownerShorts(u.owners);
    case "salary":
      return u.monthlySalary;
    case "specialties":
      return (u.specialties || []).map((s) => s.specialty.name).join(", ");
    case "role":
      return roleLabelRuTitle(u.role);
    case "status":
      return u.active ? 1 : 0;
    default:
      return null;
  }
}

type SpecialtyOpt = { id: string; name: string };

const BULK_SELECT =
  "max-w-[10.5rem] rounded-md border border-[var(--line)] bg-[var(--panel)] px-1.5 py-1 text-xs text-[var(--ink)] disabled:opacity-40";

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
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const csvImportRef = useRef<HTMLInputElement>(null);
  const [resetUser, setResetUser] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [specialties, setSpecialties] = useState<SpecialtyOpt[]>([]);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const createRoles = assignableRoles(actorRole);
  const canReset = canResetUserPassword(actorRole);
  const { sorted, sort, onSort } = useTableSort(users, userSortValue);

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
    void fetch("/api/specialties")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: SpecialtyOpt[]) => {
        if (Array.isArray(rows)) setSpecialties(rows);
      })
      .catch(() => setSpecialties([]));
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

  async function bulk(
    action: "delete" | "activate" | "deactivate" | "role" | "addSpecialty",
    extra?: Record<string, unknown>,
  ) {
    if (selected.size === 0) return;
    setBusy(true);
    setError("");
    try {
      const result = await postBulkAction(
        "/api/users/bulk",
        action,
        [...selected],
        extra,
      );
      setConfirmDelete(false);
      setConfirmDeactivate(false);
      void load();
      if (result.skipped) {
        setCsvMessage(
          `Обновлено ${result.count ?? 0}, пропущено ${result.skipped}`,
        );
      }
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
  const someSelected = selected.size > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  return (
    <div className="w-full px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          База данных
        </p>
        <h1 className="mt-1 text-2xl font-medium tracking-tight md:text-3xl">
          Пользователи
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Менеджеров назначает только админ. Базовые ставки — во вкладке
          «Ставки», индивидуальные — в карточке сотрудника.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <DirectoryMobileBar
          primary={{
            label: showCreate ? "Скрыть форму" : "Добавить пользователя",
            onClick: () => setShowCreate((v) => !v),
          }}
          sheetTitle="Пользователи"
          csv={{
            busy: csvBusy,
            onExport: () => void exportCsv(),
            onImport: () => csvImportRef.current?.click(),
          }}
          selection={{
            count: selected.size,
            busy,
            onDelete: () => setConfirmDelete(true),
            deleteLabel: "Удалить",
            // Три селекта не влезают в строку счётчика, поэтому идут под ней
            // на всю ширину — каждый подписан своим первым пунктом.
            extra: (
              <div className="grid gap-2">
                <select
                  className="field text-sm"
                  defaultValue=""
                  disabled={busy}
                  aria-label="Роль выбранных"
                  onChange={(e) => {
                    const role = e.target.value as AppRole;
                    e.target.value = "";
                    if (role) void bulk("role", { role });
                  }}
                >
                  <option value="">Роль…</option>
                  {createRoles.map((r) => (
                    <option key={r} value={r}>
                      {roleLabelRuTitle(r)}
                    </option>
                  ))}
                </select>
                <select
                  className="field text-sm"
                  defaultValue=""
                  disabled={busy || specialties.length === 0}
                  aria-label="Должность выбранных"
                  onChange={(e) => {
                    const specialtyId = e.target.value;
                    e.target.value = "";
                    if (specialtyId) void bulk("addSpecialty", { specialtyId });
                  }}
                >
                  <option value="">Должность…</option>
                  {specialties.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <select
                  className="field text-sm"
                  defaultValue=""
                  disabled={busy}
                  aria-label="Статус выбранных"
                  onChange={(e) => {
                    const value = e.target.value;
                    e.target.value = "";
                    if (value === "on") void bulk("activate");
                    if (value === "off") setConfirmDeactivate(true);
                  }}
                >
                  <option value="">Статус…</option>
                  <option value="on">Активен</option>
                  <option value="off">Отключён</option>
                </select>
              </div>
            ),
          }}
        />

        <div className="hidden w-full items-center gap-2 border-b border-[var(--line)] px-4 py-3 md:flex">
          <DirectoryAddButton
            title="+ Пользователь"
            icon={<IconPlusPerson />}
            onClick={() => setShowCreate((v) => !v)}
          />
          <div className="ml-auto flex items-center gap-1">
            <DirectorySelectionActions
              count={selected.size}
              disabled={busy}
              deleteTitle="Удалить выбранные"
              onDelete={() => setConfirmDelete(true)}
              extra={
                <>
                  <span className="px-1.5 text-xs tabular-nums text-[var(--accent)]">
                    {selected.size}
                  </span>
                  <select
                    className={BULK_SELECT}
                    defaultValue=""
                    disabled={busy}
                    aria-label="Роль выбранных"
                    onChange={(e) => {
                      const role = e.target.value as AppRole;
                      e.target.value = "";
                      if (role) void bulk("role", { role });
                    }}
                  >
                    <option value="">Роль…</option>
                    {createRoles.map((r) => (
                      <option key={r} value={r}>
                        {roleLabelRuTitle(r)}
                      </option>
                    ))}
                  </select>
                  <select
                    className={BULK_SELECT}
                    defaultValue=""
                    disabled={busy || specialties.length === 0}
                    aria-label="Должность выбранных"
                    onChange={(e) => {
                      const specialtyId = e.target.value;
                      e.target.value = "";
                      if (specialtyId) {
                        void bulk("addSpecialty", { specialtyId });
                      }
                    }}
                  >
                    <option value="">Должность…</option>
                    {specialties.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className={BULK_SELECT}
                    defaultValue=""
                    disabled={busy}
                    aria-label="Статус выбранных"
                    onChange={(e) => {
                      const value = e.target.value;
                      e.target.value = "";
                      if (value === "on") void bulk("activate");
                      if (value === "off") setConfirmDeactivate(true);
                    }}
                  >
                    <option value="">Статус…</option>
                    <option value="on">Активен</option>
                    <option value="off">Отключён</option>
                  </select>
                </>
              }
            />
            <DirectoryCsvMenu
              busy={csvBusy}
              onExport={() => void exportCsv()}
              onImport={() => csvImportRef.current?.click()}
            />
          </div>
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

        <div className="p-3 md:hidden">
          <DataCards
            items={sorted.map((u) => ({
              id: u.id,
              title: u.name,
              subtitle: u.email || undefined,
              href: `/users/${u.id}`,
              fields: [
                {
                  label: "Статус",
                  value: (
                    <button
                      type="button"
                      onClick={() => void patchUser(u.id, { active: !u.active })}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-caption",
                        u.active
                          ? "border-[var(--accent)]/40 text-[var(--accent)]"
                          : "border-[var(--danger)]/40 text-[var(--danger)]",
                      )}
                    >
                      {u.active ? "Активен" : "Отключён"}
                    </button>
                  ),
                },
                // Роль остаётся редактируемой прямо в списке: это самое
                // частое действие на этом экране.
                {
                  label: "Роль",
                  value: canEditUserRole(actorRole, u.role) ? (
                    <select
                      className="field text-sm"
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
                    roleLabelRuTitle(u.role)
                  ),
                },
                ...(ownerShorts(u.owners)
                  ? [{ label: "Фирмы", value: ownerShorts(u.owners) }]
                  : []),
                ...(u.monthlySalary > 0
                  ? [
                      {
                        label: "Оклад",
                        value: (
                          <span className="tabular-nums">
                            {formatMoney(u.monthlySalary)}
                          </span>
                        ),
                      },
                    ]
                  : []),
                ...((u.specialties || []).length
                  ? [
                      {
                        label: "Специальности",
                        value: (u.specialties || [])
                          .map((s) => s.specialty.name)
                          .join(", "),
                        block: true,
                      },
                    ]
                  : []),
              ],
              actions: canReset ? (
                <Button
                  variant="secondary"
                  className="tap-target"
                  onClick={() => setResetUser({ id: u.id, name: u.name })}
                >
                  Сбросить пароль
                </Button>
              ) : undefined,
            }))}
            selectedIds={selected}
            onToggleSelect={toggleOne}
            emptyMessage="Пользователей пока нет"
          />
        </div>

        <div className="data-table-shell hidden overflow-x-auto md:block">
          <table className="data-table data-table--editable w-full text-left text-sm">
            <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="w-10 px-3 py-2 text-left">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Выбрать все"
                  />
                </th>
                <SortableTh
                  label="Имя"
                  sortKey="name"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Email"
                  sortKey="email"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Фирмы"
                  sortKey="owners"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Оклад"
                  sortKey="salary"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Специальности"
                  sortKey="specialties"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Роль"
                  sortKey="role"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <SortableTh
                  label="Статус"
                  sortKey="status"
                  state={sort}
                  onSort={onSort}
                  className="px-3 py-2"
                />
                <th className="w-20 px-3 py-2 text-left" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((u) => (
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
        title="Удалить пользователей"
        message={`Удалить выбранные учётки (${selected.size})? Последний админ не удаляется. Сметы и назначения в сметах сохранятся.`}
        confirmLabel="Удалить"
        busy={busy}
        onConfirm={() => void bulk("delete")}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmDeactivate}
        title="Отключить пользователей"
        message={`Отключить выбранные учётки (${selected.size})? Последний админ не отключается.`}
        confirmLabel="Отключить"
        busy={busy}
        onConfirm={() => void bulk("deactivate")}
        onCancel={() => setConfirmDeactivate(false)}
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
