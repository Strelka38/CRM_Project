"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChangePasswordModal } from "@/components/ChangePasswordModal";
import { ResetUserPasswordModal } from "@/components/ResetUserPasswordModal";
import { OwnerTagsPicker } from "@/components/OwnerTagsPicker";
import { Button, PageHeader, SortableTh, useTableSort, lifecycleLabel } from "@/components/ui";
import {
  normalizeOwners,
  ownerShorts,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { formatMoney } from "@/lib/format";
import { formatYearMonthLabel, parseYearMonth } from "@/lib/period";
import { DEFAULT_AGENCY_PERCENT } from "@/lib/calc-agency";
import {
  assignableRoles,
  canEditUserRole,
  isManager as roleIsManager,
  roleLabelRu,
  roleLabelRuTitle,
  type AppRole,
} from "@/lib/roles";
import { DEFAULT_TIMEZONE, TIMEZONES } from "@/lib/timezone";
import { dateSortValue } from "@/lib/table-sort";

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
  agencyPercent: number;
  owners: CatalogOwnerValue[];
  timezone: string;
  weatherPlace: "IRKUTSK" | "IRKUTSK_OBLAST";
  canAccessPayments: boolean;
  specialties: UserSpecialtyRow[];
  estimatedSalary?: number;
  payrollRows?: Array<{
    id: string;
    pay: number;
    specialty: Specialty;
    quote: { id: string; eventName: string; date: string; lifecycle: string };
  }>;
  payoutHistory?: Array<{
    id: string;
    kind: "STAFF_MONTH" | "FREELANCER_EVENT";
    periodYm: string;
    amount: number;
    paidAt: string | null;
    paidByName: string | null;
    quoteId: string | null;
  }>;
};

type EmployeePayrollRow = NonNullable<UserDetail["payrollRows"]>[number];
type EmployeePayoutRow = NonNullable<UserDetail["payoutHistory"]>[number];

function employeePayrollSortValue(r: EmployeePayrollRow, key: string) {
  switch (key) {
    case "event":
      return r.quote.eventName;
    case "date":
      return dateSortValue(r.quote.date);
    case "role":
      return r.specialty.name;
    case "lifecycle":
      return lifecycleLabel(r.quote.lifecycle);
    case "amount":
      return r.pay;
    default:
      return null;
  }
}

function employeePayoutSortValue(r: EmployeePayoutRow, key: string) {
  switch (key) {
    case "period":
      return r.periodYm;
    case "kind":
      return r.kind;
    case "amount":
      return r.amount;
    case "paidAt":
      return dateSortValue(r.paidAt);
    default:
      return null;
  }
}

function ProfileCard({
  title,
  action,
  children,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-xl border border-[var(--line)] bg-[var(--panel)] ${className}`}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2">
        <h2 className="text-sm font-medium">{title}</h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function EmployeeEditor({
  userId,
  selfView = false,
  isManager = false,
  isAdmin = false,
  canEditAgency,
}: {
  userId: string;
  selfView?: boolean;
  isManager?: boolean;
  isAdmin?: boolean;
  /** Менять % агентских могут только менеджеры и админ */
  canEditAgency?: boolean;
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
  const [resetOpen, setResetOpen] = useState(false);
  const [masterTimezone, setMasterTimezone] = useState(DEFAULT_TIMEZONE);
  const [specQuery, setSpecQuery] = useState("");
  const payrollRows = user?.payrollRows ?? [];
  const payoutHistory = user?.payoutHistory ?? [];
  const { sorted: sortedPayroll, sort: payrollSort, onSort: onPayrollSort } =
    useTableSort(payrollRows, employeePayrollSortValue);
  const { sorted: sortedPayouts, sort: payoutSort, onSort: onPayoutSort } =
    useTableSort(payoutHistory, employeePayoutSortValue);
  const canAdmin = isManager;
  const canChangeAgency = canEditAgency ?? isManager;
  const canChangeRole = canEditUserRole(
    isAdmin ? "ADMIN" : isManager ? "MANAGER" : "EMPLOYEE",
    user?.role,
  );
  const actorRole = isAdmin ? "ADMIN" : isManager ? "MANAGER" : "EMPLOYEE";

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
        agencyPercent: u.agencyPercent ?? DEFAULT_AGENCY_PERCENT,
        owners: normalizeOwners(u.owners),
        timezone: u.timezone || DEFAULT_TIMEZONE,
        weatherPlace: u.weatherPlace || "IRKUTSK",
        canAccessPayments: Boolean(u.canAccessPayments),
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
      if (isAdmin) {
        const st = await fetch("/api/settings");
        if (st.ok) {
          const data = (await st.json()) as { masterTimezone?: string };
          if (data.masterTimezone) setMasterTimezone(data.masterTimezone);
        }
      }
    })();
  }, [userId, isAdmin]);

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
      timezone: user.timezone,
      weatherPlace: user.weatherPlace,
    };
    if (canAdmin) {
      if (canChangeRole) payload.role = user.role;
      payload.active = user.active;
      payload.monthlySalary = user.monthlySalary;
      payload.owners = normalizeOwners(user.owners);
      if (canChangeAgency && roleIsManager(user.role)) {
        payload.agencyPercent = Math.min(
          100,
          Math.max(0, Number(user.agencyPercent) || 0),
        );
      }
    }
    if (isAdmin) {
      payload.canAccessPayments = user.canAccessPayments;
      payload.email = user.email.trim();
    }
    const res = await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as
        | { error?: unknown }
        | null;
      setError(
        typeof data?.error === "string"
          ? data.error
          : "Не удалось сохранить профиль",
      );
      return;
    }
    const updated = await res.json();
    setUser((prev) => (prev ? { ...prev, ...updated } : prev));
    router.refresh();
    if (isAdmin && selfView) {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterTimezone }),
      });
    }
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
  const specNeedle = specQuery.trim().toLowerCase();
  const visibleRows = specNeedle
    ? rows.filter((r) => r.name.toLowerCase().includes(specNeedle))
    : rows;

  function patchSpecialty(
    specialtyId: string,
    patch: { hourlyRate?: number; shiftRate?: number },
  ) {
    setRows((prev) =>
      prev.map((x) => (x.specialtyId === specialtyId ? { ...x, ...patch } : x)),
    );
  }

  const displayName =
    [user.lastName, user.firstName, user.patronymic]
      .map((x) => x.trim())
      .filter(Boolean)
      .join(" ") || user.name;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
      <PageHeader
        eyebrow={selfView ? "Аккаунт" : "Сотрудники"}
        title={selfView ? "Мой профиль" : displayName || "Сотрудник"}
        subtitle={`${roleLabelRuTitle(user.role)} · ${user.email}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => router.push(selfView ? "/calendar" : "/users")}
            >
              ← Назад
            </Button>
            <Button
              disabled={saving}
              onClick={async () => {
                await saveProfile();
                await saveSpecialties();
              }}
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        }
      />

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <ProfileCard title="Основная информация">
          <div className="space-y-3 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
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
            </div>
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
                  {canChangeRole ? (
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
                      {assignableRoles(actorRole).map((r) => (
                        <option key={r} value={r}>
                          {roleLabelRuTitle(r)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--ink)]">
                      {roleLabelRuTitle(user.role)}
                    </p>
                  )}
                </label>
                <OwnerTagsPicker
                  label="Фирмы"
                  value={user.owners}
                  onChange={(owners) => setUser({ ...user, owners })}
                />
                <p className="text-caption text-[var(--muted)]">
                  ЗП и монтажные списываются с этих фирм. У менеджера проекта
                  агентские с его фирм минусуются в калькуляции; с чужих —
                  только в его ЗП.
                </p>
                {roleIsManager(user.role) &&
                  (canChangeAgency ? (
                    <label className="block text-sm">
                      <span className="text-[var(--muted)]">
                        Агентские, %
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        className="field mt-1 max-w-[8rem]"
                        value={user.agencyPercent}
                        onChange={(e) =>
                          setUser({
                            ...user,
                            agencyPercent: Math.min(
                              100,
                              Math.max(0, Number(e.target.value) || 0),
                            ),
                          })
                        }
                      />
                      <p className="mt-1 text-caption text-[var(--muted)]">
                        База 5%. Считается от (выручка − расходы − ЗП −
                        монтажные) по каждой фирме.
                      </p>
                    </label>
                  ) : (
                    <p className="text-sm text-[var(--muted)]">
                      Агентские:{" "}
                      <span className="text-[var(--ink)]">
                        {user.agencyPercent}%
                      </span>
                    </p>
                  ))}
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
                {isAdmin ? (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={user.canAccessPayments}
                        onChange={(e) =>
                          setUser({
                            ...user,
                            canAccessPayments: e.target.checked,
                          })
                        }
                      />
                      Раздел «Оплаты»
                    </label>
                    <p className="text-caption text-[var(--muted)]">
                      ЗП сотрудников за прошлый месяц и выплаты фрилансерам с
                      мероприятий
                    </p>
                  </>
                ) : null}
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
                {roleIsManager(user.role) && (
                  <p className="text-sm text-[var(--muted)]">
                    Агентские:{" "}
                    <span className="text-[var(--ink)]">
                      {user.agencyPercent}%
                    </span>
                  </p>
                )}
              </>
            )}
          </div>
        </ProfileCard>

        <div className="space-y-4">
          <ProfileCard
            title="Контакты"
            action={
              selfView ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPasswordOpen(true)}
                >
                  Сменить пароль
                </Button>
              ) : isAdmin ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResetOpen(true)}
                >
                  Сбросить пароль
                </Button>
              ) : undefined
            }
          >
            <div className="space-y-3 p-4">
              <label className="block text-sm">
                <span className="text-[var(--muted)]">Телефон</span>
                <input
                  className="field mt-1"
                  value={user.phone}
                  onChange={(e) => setUser({ ...user, phone: e.target.value })}
                  placeholder="+7…"
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">E-mail</span>
                {isAdmin ? (
                  <>
                    <input
                      type="email"
                      className="field mt-1"
                      autoComplete="off"
                      value={user.email}
                      onChange={(e) =>
                        setUser({ ...user, email: e.target.value })
                      }
                    />
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Логин для входа. После смены сотрудник входит по новому
                      адресу.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-1 font-medium">{user.email}</p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      Логин нельзя изменить здесь
                    </p>
                  </>
                )}
              </label>
            </div>
          </ProfileCard>

          <ProfileCard title="Локация и время">
            <div className="grid gap-3 p-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-[var(--muted)]">Погода</span>
                <select
                  className="field mt-1"
                  value={user.weatherPlace}
                  onChange={(e) =>
                    setUser({
                      ...user,
                      weatherPlace: e.target.value as UserDetail["weatherPlace"],
                    })
                  }
                >
                  <option value="IRKUTSK">Иркутск</option>
                  <option value="IRKUTSK_OBLAST">Иркутская область</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">Часовой пояс</span>
                <select
                  className="field mt-1"
                  value={user.timezone}
                  onChange={(e) =>
                    setUser({ ...user, timezone: e.target.value })
                  }
                >
                  {TIMEZONES.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.label} ({z.offset})
                    </option>
                  ))}
                </select>
              </label>
              {isAdmin && selfView ? (
                <label className="block text-sm sm:col-span-2">
                  <span className="text-[var(--muted)]">
                    Мастер-часовой пояс компании
                  </span>
                  <select
                    className="field mt-1"
                    value={masterTimezone}
                    onChange={(e) => setMasterTimezone(e.target.value)}
                  >
                    {TIMEZONES.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.label} ({z.offset})
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-caption text-[var(--muted)]">
                    Для новых сотрудников и если в профиле не выбран свой пояс.
                    По умолчанию Иркутск, UTC+8.
                  </p>
                </label>
              ) : null}
            </div>
          </ProfileCard>

          <ProfileCard title="Оклад и ЗП">
            <div className="grid gap-4 p-4 sm:grid-cols-2">
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
          </ProfileCard>
        </div>
      </div>

      <ProfileCard
        className="mt-4"
        title={`Специальности${rows.length ? ` · ${rows.length}` : ""}`}
        action={
          rows.length > 0 ? (
            <input
              className="field w-44 py-1 text-sm"
              value={specQuery}
              onChange={(e) => setSpecQuery(e.target.value)}
              placeholder="Найти…"
              aria-label="Поиск специальности"
            />
          ) : undefined
        }
      >
        <div className="max-h-[min(32rem,60vh)] overflow-auto">
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              Специальности не назначены
            </p>
          ) : visibleRows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              Ничего не найдено
            </p>
          ) : (
            <>
              <ul className="divide-y divide-[var(--line)] md:hidden">
                {visibleRows.map((r) => (
                  <li key={r.specialtyId} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 font-medium">{r.name}</p>
                      {canAdmin ? (
                        <button
                          type="button"
                          className="btn-icon shrink-0 text-[var(--danger)]"
                          aria-label={`Убрать ${r.name}`}
                          onClick={() =>
                            setRows((prev) =>
                              prev.filter((x) => x.specialtyId !== r.specialtyId),
                            )
                          }
                        >
                          ×
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="block text-xs text-[var(--muted)]">
                        Час
                        {canAdmin ? (
                          <input
                            type="number"
                            min={0}
                            className="field mt-1 text-right tabular-nums"
                            value={r.hourlyRate}
                            onChange={(e) =>
                              patchSpecialty(r.specialtyId, {
                                hourlyRate: Math.max(
                                  0,
                                  Number(e.target.value) || 0,
                                ),
                              })
                            }
                          />
                        ) : (
                          <span className="mt-1 block text-sm text-[var(--ink)] tabular-nums">
                            {formatMoney(r.hourlyRate)}
                          </span>
                        )}
                      </label>
                      <label className="block text-xs text-[var(--muted)]">
                        Смена
                        {canAdmin ? (
                          <input
                            type="number"
                            min={0}
                            className="field mt-1 text-right tabular-nums"
                            value={r.shiftRate}
                            onChange={(e) =>
                              patchSpecialty(r.specialtyId, {
                                shiftRate: Math.max(
                                  0,
                                  Number(e.target.value) || 0,
                                ),
                              })
                            }
                          />
                        ) : (
                          <span className="mt-1 block text-sm text-[var(--ink)] tabular-nums">
                            {formatMoney(r.shiftRate)}
                          </span>
                        )}
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
              <table className="data-table data-table--editable data-table--sticky hidden w-full text-sm md:table">
                <thead>
                  <tr>
                    <th className="text-left">Специальность</th>
                    <th className="w-28 text-right">Час</th>
                    <th className="w-28 text-right">Смена</th>
                    {canAdmin ? <th className="w-10" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((r) => (
                    <tr key={r.specialtyId}>
                      <td>{r.name}</td>
                      <td>
                        {canAdmin ? (
                          <input
                            type="number"
                            min={0}
                            className="field py-1 text-right tabular-nums"
                            value={r.hourlyRate}
                            onChange={(e) =>
                              patchSpecialty(r.specialtyId, {
                                hourlyRate: Math.max(
                                  0,
                                  Number(e.target.value) || 0,
                                ),
                              })
                            }
                          />
                        ) : (
                          <span className="block text-right tabular-nums">
                            {formatMoney(r.hourlyRate)}
                          </span>
                        )}
                      </td>
                      <td>
                        {canAdmin ? (
                          <input
                            type="number"
                            min={0}
                            className="field py-1 text-right tabular-nums"
                            value={r.shiftRate}
                            onChange={(e) =>
                              patchSpecialty(r.specialtyId, {
                                shiftRate: Math.max(
                                  0,
                                  Number(e.target.value) || 0,
                                ),
                              })
                            }
                          />
                        ) : (
                          <span className="block text-right tabular-nums">
                            {formatMoney(r.shiftRate)}
                          </span>
                        )}
                      </td>
                      {canAdmin ? (
                        <td>
                          <button
                            type="button"
                            className="btn-icon text-[var(--danger)]"
                            aria-label={`Убрать ${r.name}`}
                            onClick={() =>
                              setRows((prev) =>
                                prev.filter(
                                  (x) => x.specialtyId !== r.specialtyId,
                                ),
                              )
                            }
                          >
                            ×
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
        {canAdmin && availableToAdd.length > 0 ? (
          <div className="flex gap-2 border-t border-[var(--line)] p-3">
            <select
              className="field min-w-0 flex-1"
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
            <Button variant="outline" onClick={addSpecialty}>
              +
            </Button>
          </div>
        ) : null}
      </ProfileCard>

      {(user.payrollRows?.length ?? 0) > 0 && (
        <section className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="mb-2 font-display text-lg">Назначения</h2>
          <div className="data-table-shell overflow-x-auto">
            <table className="data-table w-full min-w-[600px] text-sm">
              <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <SortableTh
                    label="Мероприятие"
                    sortKey="event"
                    state={payrollSort}
                    onSort={onPayrollSort}
                    className="px-2 py-2"
                  />
                  <SortableTh
                    label="Дата"
                    sortKey="date"
                    state={payrollSort}
                    onSort={onPayrollSort}
                    className="px-2 py-2"
                  />
                  <SortableTh
                    label="Должность"
                    sortKey="role"
                    state={payrollSort}
                    onSort={onPayrollSort}
                    className="px-2 py-2"
                  />
                  <SortableTh
                    label="Статус"
                    sortKey="lifecycle"
                    state={payrollSort}
                    onSort={onPayrollSort}
                    className="px-2 py-2"
                  />
                  <SortableTh
                    label="Сумма"
                    sortKey="amount"
                    state={payrollSort}
                    onSort={onPayrollSort}
                    className="px-2 py-2"
                    align="right"
                  />
                </tr>
              </thead>
              <tbody>
                {sortedPayroll.map((r) => (
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
          </div>
        </section>
      )}

      {!selfView && (user.payoutHistory?.length ?? 0) > 0 && (
        <section className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
          <h2 className="mb-2 font-display text-lg">История выплат</h2>
          <div className="data-table-shell overflow-x-auto">
            <table className="data-table w-full min-w-[520px] text-sm">
              <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <SortableTh
                    label="Период"
                    sortKey="period"
                    state={payoutSort}
                    onSort={onPayoutSort}
                    className="px-2 py-2"
                  />
                  <SortableTh
                    label="Тип"
                    sortKey="kind"
                    state={payoutSort}
                    onSort={onPayoutSort}
                    className="px-2 py-2"
                  />
                  <SortableTh
                    label="Сумма"
                    sortKey="amount"
                    state={payoutSort}
                    onSort={onPayoutSort}
                    className="px-2 py-2"
                    align="right"
                  />
                  <SortableTh
                    label="Когда"
                    sortKey="paidAt"
                    state={payoutSort}
                    onSort={onPayoutSort}
                    className="px-2 py-2"
                  />
                  <th className="px-2 py-2 text-left">Кто отметил</th>
                </tr>
              </thead>
              <tbody>
                {sortedPayouts.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--line)]">
                    <td className="px-2 py-2">
                      {formatYearMonthLabel(parseYearMonth(r.periodYm))}
                    </td>
                    <td className="px-2 py-2">
                      {r.kind === "STAFF_MONTH" ? "ЗП" : "Фрилансер"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatMoney(r.amount)}
                    </td>
                    <td className="px-2 py-2 text-[var(--muted)]">
                      {r.paidAt
                        ? new Date(r.paidAt).toLocaleDateString("ru-RU")
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-[var(--muted)]">
                      {r.paidByName || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selfView && (
        <ChangePasswordModal
          open={passwordOpen}
          email={user.email}
          onClose={() => setPasswordOpen(false)}
        />
      )}
      {isAdmin && !selfView && (
        <ResetUserPasswordModal
          open={resetOpen}
          userId={user.id}
          userName={user.name}
          onClose={() => setResetOpen(false)}
        />
      )}
    </div>
  );
}
