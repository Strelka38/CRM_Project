"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { OwnerTagsPicker } from "@/components/OwnerTagsPicker";
import {
  normalizeOwners,
  ownerShorts,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { formatMoney } from "@/lib/format";
import { type AppRole, roleLabelRu } from "@/lib/roles";

type Specialty = {
  id: string;
  name: string;
  hourlyRate?: number;
  shiftRate?: number;
};

type UserSpecialtyRow = {
  specialtyId: string;
  hourlyRate: number;
  shiftRate: number;
  specialty: Specialty;
};

type UserDetail = {
  id: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  patronymic: string;
  phone: string;
  comment: string;
  role: AppRole;
  active: boolean;
  monthlySalary: number;
  owners: CatalogOwnerValue[];
  specialties: UserSpecialtyRow[];
  estimatedSalary?: number;
  payrollRows?: Array<{
    id: string;
    pay: number;
    specialty: Specialty;
    quote: { id: string; eventName: string; date: string; lifecycle: string };
  }>;
};

export function EmployeeEditor({
  userId,
  selfView = false,
  isManager = false,
}: {
  userId: string;
  selfView?: boolean;
  isManager?: boolean;
}) {
  const router = useRouter();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [allSpecialties, setAllSpecialties] = useState<Specialty[]>([]);
  const [rows, setRows] = useState<
    Array<{ specialtyId: string; hourlyRate: number; shiftRate: number; name: string }>
  >([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [addSpecialtyId, setAddSpecialtyId] = useState("");
  const [passwordOpen, setPasswordOpen] = useState(false);
  const canAdmin = isManager;

  useEffect(() => {
    (async () => {
      const [uRes, sRes] = await Promise.all([
        fetch(`/api/users/${userId}`),
        fetch("/api/specialties"),
      ]);
      if (!uRes.ok) {
        setError("Сотрудник не найден");
        return;
      }
      const u: UserDetail = await uRes.json();
      setUser({
        ...u,
        monthlySalary: u.monthlySalary ?? 0,
        owners: normalizeOwners(u.owners),
      });
      setRows(
        u.specialties.map((s) => ({
          specialtyId: s.specialtyId,
          hourlyRate: s.hourlyRate,
          shiftRate: s.shiftRate,
          name: s.specialty.name,
        })),
      );
      if (sRes.ok) setAllSpecialties(await sRes.json());
    })();
  }, [userId]);

  async function saveProfile() {
    if (!user) return;
    setSaving(true);
    setError("");
    const payload: Record<string, unknown> = {
      firstName: user.firstName,
      lastName: user.lastName,
      patronymic: user.patronymic,
      phone: user.phone,
      comment: user.comment,
    };
    if (canAdmin) {
      payload.role = user.role;
      payload.active = user.active;
      payload.monthlySalary = user.monthlySalary;
      payload.owners = normalizeOwners(user.owners);
    }
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Не удалось сохранить профиль");
      return;
    }
    const updated = await res.json();
    setUser((prev) => (prev ? { ...prev, ...updated } : prev));
  }

  async function saveSpecialties() {
    if (!canAdmin) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/users/${userId}/specialties`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        specialties: rows.map((r) => ({
          specialtyId: r.specialtyId,
          hourlyRate: r.hourlyRate,
          shiftRate: r.shiftRate,
        })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Не удалось сохранить специальности");
      return;
    }
  }

  function addSpecialty() {
    if (!addSpecialtyId) return;
    if (rows.some((r) => r.specialtyId === addSpecialtyId)) return;
    const spec = allSpecialties.find((s) => s.id === addSpecialtyId);
    if (!spec) return;
    setRows((prev) => [
      ...prev,
      {
        specialtyId: spec.id,
        name: spec.name,
        hourlyRate: spec.hourlyRate ?? 0,
        shiftRate: spec.shiftRate ?? 0,
      },
    ]);
    setAddSpecialtyId("");
  }

  if (!user && !error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 text-[var(--muted)]">
        Загрузка…
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 text-[var(--danger)]">{error}</div>
    );
  }

  const availableToAdd = allSpecialties.filter(
    (s) => !rows.some((r) => r.specialtyId === s.id),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
        <button
          type="button"
          onClick={() =>
            router.push(selfView ? "/quotes" : "/users")
          }
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-white/10"
        >
          ← Назад
        </button>
        <h1 className="font-display text-center text-2xl uppercase tracking-wide md:text-3xl">
          {selfView ? "Мой профиль" : "Редактирование сотрудника"}
        </h1>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            await saveProfile();
            await saveSpecialties();
          }}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </header>

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
            Основная информация
          </h2>
          <div className="space-y-3 p-4">
            {(
              [
                ["lastName", "Фамилия"],
                ["firstName", "Имя"],
                ["patronymic", "Отчество"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="text-[var(--muted)]">{label}</span>
                <input
                  className="field mt-1"
                  value={user[key]}
                  onChange={(e) =>
                    setUser({ ...user, [key]: e.target.value })
                  }
                />
              </label>
            ))}
            <label className="block text-sm">
              <span className="text-[var(--muted)]">Комментарий</span>
              <textarea
                className="field mt-1 min-h-[80px]"
                value={user.comment}
                onChange={(e) =>
                  setUser({ ...user, comment: e.target.value })
                }
              />
            </label>
            {canAdmin ? (
              <>
                <label className="block text-sm">
                  <span className="text-[var(--muted)]">Роль</span>
                  <select
                    className="field mt-1"
                    value={user.role}
                    onChange={(e) =>
                      setUser({
                        ...user,
                        role: e.target.value as AppRole,
                      })
                    }
                  >
                    <option value="EMPLOYEE">Сотрудник</option>
                    <option value="BRIGADIER">Бригадир</option>
                    <option value="MANAGER">Менеджер</option>
                  </select>
                </label>
                <OwnerTagsPicker
                  label="Фирмы"
                  value={user.owners}
                  onChange={(owners) => setUser({ ...user, owners })}
                />
                <p className="text-[11px] text-[var(--muted)]">
                  ЗП и монтажные списываются с этих фирм. У менеджера проекта
                  агентские 5% с его фирм минусуются в калькуляции; с чужих —
                  только в его ЗП.
                </p>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={user.active}
                    onChange={(e) =>
                      setUser({ ...user, active: e.target.checked })
                    }
                  />
                  Активен
                </label>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--muted)]">
                  Роль:{" "}
                  <span className="text-[var(--ink)]">
                    {roleLabelRu(user.role)}
                  </span>
                </p>
                <p className="text-sm text-[var(--muted)]">
                  Фирмы:{" "}
                  <span className="text-[var(--ink)]">
                    {ownerShorts(user.owners)}
                  </span>
                </p>
              </>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
              Телефон
            </h2>
            <div className="p-4">
              <input
                className="field"
                value={user.phone}
                onChange={(e) => setUser({ ...user, phone: e.target.value })}
                placeholder="+7…"
              />
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
              E-mail
            </h2>
            <div className="p-4 text-sm">
              <p className="font-medium">{user.email}</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Логин нельзя изменить здесь
              </p>
              {selfView && (
                <button
                  type="button"
                  onClick={() => setPasswordOpen(true)}
                  className="mt-3 rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-white/10"
                >
                  Сменить пароль
                </button>
              )}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
              Оклад и ЗП
            </h2>
            <div className="space-y-3 p-4">
              <label className="block text-sm">
                <span className="text-[var(--muted)]">
                  Фиксированный месячный оклад
                </span>
                {canAdmin ? (
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    className="field mt-1"
                    value={user.monthlySalary}
                    onChange={(e) =>
                      setUser({
                        ...user,
                        monthlySalary: Math.max(0, Number(e.target.value) || 0),
                      })
                    }
                  />
                ) : (
                  <p className="mt-1 font-display text-xl">
                    {formatMoney(user.monthlySalary)}
                  </p>
                )}
              </label>
              <div>
                <p className="text-xs text-[var(--muted)]">
                  Начисления по мероприятиям
                </p>
                <p className="font-display text-2xl">
                  {formatMoney(user.estimatedSalary ?? 0)}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  По подтверждённым и завершённым мероприятиям
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
            Специальности
          </h2>
          <div className="overflow-x-auto p-2">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-2 py-1 text-left">Специальность</th>
                  <th className="px-2 py-1 text-right">Ставка час</th>
                  <th className="px-2 py-1 text-right">Ставка смена</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.specialtyId} className="border-t border-[var(--line)]">
                    <td className="px-2 py-2">{r.name}</td>
                    <td className="px-2 py-2">
                      {canAdmin ? (
                        <input
                          type="number"
                          min={0}
                          className="field text-right"
                          value={r.hourlyRate}
                          onChange={(e) => {
                            const v = Math.max(0, Number(e.target.value) || 0);
                            setRows((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, hourlyRate: v } : x,
                              ),
                            );
                          }}
                        />
                      ) : (
                        <span className="block text-right tabular-nums">
                          {formatMoney(r.hourlyRate)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {canAdmin ? (
                        <input
                          type="number"
                          min={0}
                          className="field text-right"
                          value={r.shiftRate}
                          onChange={(e) => {
                            const v = Math.max(0, Number(e.target.value) || 0);
                            setRows((prev) =>
                              prev.map((x, i) =>
                                i === idx ? { ...x, shiftRate: v } : x,
                              ),
                            );
                          }}
                        />
                      ) : (
                        <span className="block text-right tabular-nums">
                          {formatMoney(r.shiftRate)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {canAdmin && (
                        <button
                          type="button"
                          className="btn-icon text-[var(--danger)]"
                          onClick={() =>
                            setRows((prev) => prev.filter((_, i) => i !== idx))
                          }
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="px-2 py-4 text-center text-[var(--muted)]"
                    >
                      Специальности не назначены
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {canAdmin && availableToAdd.length > 0 && (
              <div className="mt-3 flex gap-2 px-2 pb-2">
                <select
                  className="field"
                  value={addSpecialtyId}
                  onChange={(e) => setAddSpecialtyId(e.target.value)}
                >
                  <option value="">Добавить специальность…</option>
                  {availableToAdd.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={addSpecialty}
                  className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {(user.payrollRows?.length ?? 0) > 0 && (
        <section className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="mb-2 font-display text-lg">Назначения</h2>
          <table className="w-full text-sm">
            <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-2 py-2 text-left">Мероприятие</th>
                <th className="px-2 py-2 text-left">Дата</th>
                <th className="px-2 py-2 text-left">Должность</th>
                <th className="px-2 py-2 text-left">Статус</th>
                <th className="px-2 py-2 text-right">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {user.payrollRows!.map((r) => (
                <tr key={r.id} className="border-t border-[var(--line)]">
                  <td className="px-2 py-2">{r.quote.eventName || "—"}</td>
                  <td className="px-2 py-2">{r.quote.date || "—"}</td>
                  <td className="px-2 py-2">{r.specialty.name}</td>
                  <td className="px-2 py-2">{r.quote.lifecycle}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {formatMoney(r.pay)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {selfView && (
        <ChangePasswordModal
          open={passwordOpen}
          email={user.email}
          onClose={() => setPasswordOpen(false)}
        />
      )}
    </div>
  );
}
