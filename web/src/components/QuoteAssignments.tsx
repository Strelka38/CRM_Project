"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import {
  CATALOG_OWNERS,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { formatMoney } from "@/lib/format";
import { canSeeAssignmentPay } from "@/lib/roles";
import { Button, Modal } from "@/components/ui";

type Specialty = { id: string; name: string; shiftRate?: number };
type UserOption = {
  id: string;
  name: string;
  email: string;
  specialties: Array<{
    specialtyId: string;
    hourlyRate: number;
    shiftRate: number;
    specialty: Specialty;
  }>;
};

type Assignment = {
  id: string;
  userId: string | null;
  specialtyId: string;
  payMode: "SHIFT" | "HOURLY";
  hours: number | null;
  rateOverride: number | null;
  hourlyRate: number;
  shiftRate: number;
  pay: number;
  isFreelancer: boolean;
  freelancerName: string;
  owners: CatalogOwnerValue[];
  user: {
    id: string;
    name: string;
    email: string;
    owners?: CatalogOwnerValue[] | null;
  };
  specialty: Specialty;
};

type ScheduleConflict = {
  quoteId: string;
  proposalNumber: string;
  eventName: string;
  overlapDates: string[];
};

function FirmBadges({ owners }: { owners?: CatalogOwnerValue[] | null }) {
  const list = owners?.length
    ? CATALOG_OWNERS.filter((o) => owners.includes(o.value))
    : [];
  if (list.length === 0) {
    return <span className="text-[10px] text-[var(--muted)]">—</span>;
  }
  return (
    <span className="inline-flex flex-wrap gap-0.5">
      {list.map((o) => (
        <span
          key={o.value}
          title={o.label}
          className="rounded border border-[var(--solid)] bg-[var(--solid)] px-1 py-0.5 text-[9px] font-medium uppercase text-[var(--on-solid)]"
        >
          {o.short}
        </span>
      ))}
    </span>
  );
}

function conflictLabel(c: ScheduleConflict) {
  const name = c.eventName.trim()
    ? `«${c.eventName.trim()}»`
    : `КП №${c.proposalNumber}`;
  const dates =
    c.overlapDates.length <= 3
      ? c.overlapDates.join(", ")
      : `${c.overlapDates[0]} — ${c.overlapDates[c.overlapDates.length - 1]} (${c.overlapDates.length} дн.)`;
  return `${dates}: №${c.proposalNumber} ${name}`;
}

export function QuoteAssignments({
  quoteId,
  canEdit,
  compact = false,
  hidePay = false,
  onChanged,
}: {
  quoteId: string;
  canEdit: boolean;
  compact?: boolean;
  /** Hide rates, ФОТ, overrides (for brigadier). Also forced by role. */
  hidePay?: boolean;
  onChanged?: () => void;
}) {
  const { data: session } = useSession();
  const noPay =
    hidePay || !canSeeAssignmentPay(session?.user?.role);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [allSpecialties, setAllSpecialties] = useState<Specialty[]>([]);
  const [mode, setMode] = useState<"staff" | "freelancer">("staff");
  const [userId, setUserId] = useState("");
  const [specialtyId, setSpecialtyId] = useState("");
  const [freelancerName, setFreelancerName] = useState("");
  const [freelancerSpecialtyId, setFreelancerSpecialtyId] = useState("");
  const [freelancerOwner, setFreelancerOwner] = useState<CatalogOwnerValue | "">(
    "",
  );
  const [freelancerRate, setFreelancerRate] = useState("");
  const [payMode, setPayMode] = useState<"SHIFT" | "HOURLY">("SHIFT");
  const [hours, setHours] = useState(8);
  const [rateOverride, setRateOverride] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkingBusy, setCheckingBusy] = useState(false);
  const [conflictWarn, setConflictWarn] = useState<{
    userName: string;
    conflicts: ScheduleConflict[];
  } | null>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const skipNotifyRef = useRef(true);

  const load = useCallback(async () => {
    const [aRes, uRes, sRes] = await Promise.all([
      fetch(`/api/quotes/${quoteId}/assignments`),
      canEdit ? fetch("/api/users") : Promise.resolve(null),
      canEdit ? fetch("/api/specialties") : Promise.resolve(null),
    ]);
    if (aRes.ok) {
      setAssignments(await aRes.json());
      if (skipNotifyRef.current) {
        skipNotifyRef.current = false;
      } else {
        onChangedRef.current?.();
      }
    }
    if (uRes?.ok) {
      const list = await uRes.json();
      setUsers(
        list.filter(
          (u: UserOption & { role: string; active: boolean }) =>
            u.active && (u.specialties?.length ?? 0) > 0,
        ),
      );
    }
    if (sRes?.ok) {
      const list = (await sRes.json()) as Specialty[];
      setAllSpecialties(list);
      if (list.length > 0) {
        setFreelancerSpecialtyId((prev) => prev || list[0].id);
      }
    }
    setLoading(false);
  }, [quoteId, canEdit]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedUser = users.find((u) => u.id === userId);
  const userSpecialties = selectedUser?.specialties || [];

  useEffect(() => {
    if (
      userSpecialties.length > 0 &&
      !userSpecialties.some((s) => s.specialtyId === specialtyId)
    ) {
      setSpecialtyId(userSpecialties[0].specialtyId);
    }
  }, [userId, userSpecialties, specialtyId]);

  const selectedSpec = userSpecialties.find(
    (s) => s.specialtyId === specialtyId,
  );

  async function createStaffAssignment() {
    const res = await fetch(`/api/quotes/${quoteId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isFreelancer: false,
        userId,
        specialtyId,
        payMode: noPay ? "SHIFT" : payMode,
        hours: noPay ? null : payMode === "HOURLY" ? hours : null,
        rateOverride: noPay
          ? null
          : rateOverride === ""
            ? null
            : Number(rateOverride),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось назначить");
      return false;
    }
    setRateOverride("");
    setConflictWarn(null);
    void load();
    return true;
  }

  async function addStaff() {
    setError("");
    if (!userId || !specialtyId) {
      setError("Выберите сотрудника и должность");
      return;
    }

    setCheckingBusy(true);
    try {
      const checkRes = await fetch(
        `/api/quotes/${quoteId}/assignments/conflicts?userId=${encodeURIComponent(userId)}`,
      );
      if (checkRes.ok) {
        const data = (await checkRes.json()) as {
          conflicts?: ScheduleConflict[];
        };
        const conflicts = data.conflicts || [];
        if (conflicts.length > 0) {
          setConflictWarn({
            userName: selectedUser?.name || "Сотрудник",
            conflicts,
          });
          return;
        }
      }
      await createStaffAssignment();
    } finally {
      setCheckingBusy(false);
    }
  }

  async function addFreelancer() {
    setError("");
    if (!freelancerSpecialtyId) {
      setError("Выберите должность");
      return;
    }
    const res = await fetch(`/api/quotes/${quoteId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        isFreelancer: true,
        specialtyId: freelancerSpecialtyId,
        freelancerName: freelancerName.trim(),
        owners: freelancerOwner ? [freelancerOwner] : [],
        rateOverride: noPay
          ? null
          : freelancerRate === ""
            ? null
            : Number(freelancerRate),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось добавить фрилансера");
      return;
    }
    setFreelancerName("");
    setFreelancerRate("");
    void load();
  }

  async function removeAssignment(id: string) {
    await fetch(`/api/quotes/${quoteId}/assignments/${id}`, {
      method: "DELETE",
    });
    void load();
  }

  async function patchAssignment(
    id: string,
    body: Record<string, unknown>,
  ) {
    await fetch(`/api/quotes/${quoteId}/assignments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    void load();
  }

  const total = assignments.reduce((s, a) => s + a.pay, 0);
  const colCount = noPay
    ? canEdit
      ? 4
      : 3
    : canEdit
      ? 7
      : 6;

  if (loading) {
    return (
      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 text-sm text-[var(--muted)]">
        Загрузка сотрудников…
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-xl">Сотрудники на мероприятии</h2>
          <p className="text-xs text-[var(--muted)]">
            {noPay
              ? "Назначение сотрудников и фрилансеров по должности."
              : "Штатные и фрилансеры; у фрилансера — ставка смены и фирма для расходки."}
          </p>
        </div>
        {!noPay && (
          <p className="text-sm">
            ФОТ:{" "}
            <span className="font-medium tabular-nums">{formatMoney(total)}</span>
          </p>
        )}
      </div>

      {canEdit && (
        <>
          <div className="mb-2 flex gap-1 text-sm">
            <button
              type="button"
              className={
                mode === "staff"
                  ? "rounded-md bg-[var(--accent)] px-3 py-1 text-white"
                  : "rounded-md border border-[var(--line)] px-3 py-1 text-[var(--muted)]"
              }
              onClick={() => {
                setMode("staff");
                setError("");
              }}
            >
              Сотрудник
            </button>
            <button
              type="button"
              className={
                mode === "freelancer"
                  ? "rounded-md bg-[var(--accent)] px-3 py-1 text-white"
                  : "rounded-md border border-[var(--line)] px-3 py-1 text-[var(--muted)]"
              }
              onClick={() => {
                setMode("freelancer");
                setError("");
              }}
            >
              Фрилансер
            </button>
          </div>

          {mode === "staff" ? (
            <div
              className={
                compact
                  ? "mb-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3 sm:grid-cols-2"
                  : noPay
                    ? "mb-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3 md:grid-cols-3"
                    : "mb-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3 md:grid-cols-6"
              }
            >
              <label
                className={compact || noPay ? "text-sm" : "text-sm md:col-span-2"}
              >
                <span className="text-[var(--muted)]">Сотрудник</span>
                <select
                  className="field mt-1"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value)}
                >
                  <option value="">—</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className={compact || noPay ? "text-sm" : "text-sm md:col-span-2"}
              >
                <span className="text-[var(--muted)]">Должность</span>
                <select
                  className="field mt-1"
                  value={specialtyId}
                  onChange={(e) => setSpecialtyId(e.target.value)}
                  disabled={!userId}
                >
                  {userSpecialties.map((s) => (
                    <option key={s.specialtyId} value={s.specialtyId}>
                      {noPay
                        ? s.specialty.name
                        : `${s.specialty.name} (смена ${s.shiftRate})`}
                    </option>
                  ))}
                </select>
              </label>
              {!noPay && (
                <>
                  <label className="text-sm">
                    <span className="text-[var(--muted)]">Режим</span>
                    <select
                      className="field mt-1"
                      value={payMode}
                      onChange={(e) =>
                        setPayMode(e.target.value as "SHIFT" | "HOURLY")
                      }
                    >
                      <option value="SHIFT">Смена</option>
                      <option value="HOURLY">Часы</option>
                    </select>
                  </label>
                  {payMode === "HOURLY" ? (
                    <label className="text-sm">
                      <span className="text-[var(--muted)]">Часов</span>
                      <input
                        type="number"
                        min={0}
                        className="field mt-1"
                        value={hours}
                        onChange={(e) => setHours(Number(e.target.value) || 0)}
                      />
                    </label>
                  ) : (
                    <label className="text-sm">
                      <span className="text-[var(--muted)]">Override ставки</span>
                      <input
                        type="number"
                        min={0}
                        className="field mt-1"
                        placeholder={
                          selectedSpec ? String(selectedSpec.shiftRate) : "база"
                        }
                        value={rateOverride}
                        onChange={(e) => setRateOverride(e.target.value)}
                      />
                    </label>
                  )}
                </>
              )}
              <div
                className={
                  compact
                    ? "flex items-end sm:col-span-2"
                    : noPay
                      ? "flex items-end"
                      : "flex items-end md:col-span-6"
                }
              >
                <button
                  type="button"
                  disabled={checkingBusy}
                  onClick={() => void addStaff()}
                  className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
                >
                  {checkingBusy ? "Проверка…" : "Назначить"}
                </button>
                {error && (
                  <span className="ml-3 text-sm text-[var(--danger)]">
                    {error}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div
              className={
                compact
                  ? "mb-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3 sm:grid-cols-2"
                  : noPay
                    ? "mb-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3 md:grid-cols-3"
                    : "mb-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3 md:grid-cols-5"
              }
            >
              <label className="text-sm">
                <span className="text-[var(--muted)]">ФИО</span>
                <input
                  className="field mt-1"
                  placeholder="Можно заполнить позже"
                  value={freelancerName}
                  onChange={(e) => setFreelancerName(e.target.value)}
                />
              </label>
              <label className="text-sm">
                <span className="text-[var(--muted)]">Должность</span>
                <select
                  className="field mt-1"
                  value={freelancerSpecialtyId}
                  onChange={(e) => setFreelancerSpecialtyId(e.target.value)}
                >
                  {allSpecialties.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                <span className="text-[var(--muted)]">Фирма</span>
                <select
                  className="field mt-1"
                  value={freelancerOwner}
                  onChange={(e) =>
                    setFreelancerOwner(
                      e.target.value as CatalogOwnerValue | "",
                    )
                  }
                >
                  <option value="">—</option>
                  {CATALOG_OWNERS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.short} — {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {!noPay && (
                <label className="text-sm">
                  <span className="text-[var(--muted)]">Ставка за смену</span>
                  <input
                    type="number"
                    min={0}
                    className="field mt-1"
                    placeholder="0"
                    value={freelancerRate}
                    onChange={(e) => setFreelancerRate(e.target.value)}
                  />
                </label>
              )}
              <div
                className={
                  compact
                    ? "flex items-end sm:col-span-2"
                    : "flex items-end"
                }
              >
                <button
                  type="button"
                  onClick={() => void addFreelancer()}
                  className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white"
                >
                  Добавить фрилансера
                </button>
                {error && (
                  <span className="ml-3 text-sm text-[var(--danger)]">
                    {error}
                  </span>
                )}
              </div>
            </div>
          )}
        </>
      )}

      <div className="min-h-0 flex-1 overflow-x-auto">
        <table
          className={
            compact
              ? "w-full min-w-[320px] text-sm"
              : "w-full min-w-[640px] text-sm"
          }
        >
          <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-2 py-2 text-left">Сотрудник</th>
              <th className="px-2 py-2 text-left">Фирма</th>
              <th className="px-2 py-2 text-left">Должность</th>
              {!noPay && (
                <>
                  <th className="px-2 py-2 text-left">Режим</th>
                  <th className="px-2 py-2 text-right">Ставка / override</th>
                  <th className="px-2 py-2 text-right">К выплате</th>
                </>
              )}
              {canEdit && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => {
              const fl = a.isFreelancer || !a.userId;
              const firmOwners = fl ? a.owners : a.user.owners;
              return (
                <tr key={a.id} className="border-t border-[var(--line)]">
                  <td className="px-2 py-2">
                    {fl && canEdit ? (
                      <div className="flex flex-col gap-0.5">
                        <input
                          className="field max-w-[200px]"
                          placeholder="ФИО фрилансера"
                          defaultValue={a.freelancerName}
                          onBlur={(e) => {
                            if (e.target.value.trim() !== a.freelancerName) {
                              void patchAssignment(a.id, {
                                freelancerName: e.target.value,
                              });
                            }
                          }}
                        />
                        <span className="text-[10px] text-[var(--muted)]">
                          Фрилансер
                        </span>
                      </div>
                    ) : (
                      <span>
                        {fl
                          ? a.freelancerName.trim() || "Фрилансер"
                          : a.user.name}
                        {fl && (
                          <span className="ml-1 text-[10px] text-[var(--muted)]">
                            (фр.)
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {fl && canEdit ? (
                      <select
                        className="field max-w-[100px] text-xs"
                        value={a.owners[0] || ""}
                        onChange={(e) =>
                          void patchAssignment(a.id, {
                            owners: e.target.value
                              ? [e.target.value as CatalogOwnerValue]
                              : [],
                          })
                        }
                      >
                        <option value="">—</option>
                        {CATALOG_OWNERS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.short}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <FirmBadges owners={firmOwners} />
                    )}
                  </td>
                  <td className="px-2 py-2">{a.specialty.name}</td>
                  {!noPay && (
                    <>
                      <td className="px-2 py-2">
                        {fl
                          ? "Смена"
                          : a.payMode === "HOURLY"
                            ? `${a.hours ?? 0} ч × ${formatMoney(a.hourlyRate)}`
                            : "Смена"}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {canEdit ? (
                          <input
                            type="number"
                            min={0}
                            className="field ml-auto max-w-[120px] text-right"
                            placeholder={
                              fl
                                ? "ставка"
                                : String(
                                    a.payMode === "HOURLY"
                                      ? (a.hours || 0) * a.hourlyRate
                                      : a.shiftRate,
                                  )
                            }
                            defaultValue={a.rateOverride ?? ""}
                            onBlur={(e) =>
                              void patchAssignment(a.id, {
                                rateOverride:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                          />
                        ) : a.rateOverride != null ? (
                          formatMoney(a.rateOverride)
                        ) : a.payMode === "SHIFT" ? (
                          formatMoney(a.shiftRate)
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">
                        {formatMoney(a.pay)}
                      </td>
                    </>
                  )}
                  {canEdit && (
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        className="btn-icon text-[var(--danger)]"
                        onClick={() => void removeAssignment(a.id)}
                      >
                        ×
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {assignments.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-6 text-center text-[var(--muted)]"
                >
                  Сотрудники ещё не назначены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={Boolean(conflictWarn)}
        onClose={() => setConflictWarn(null)}
        title="Сотрудник уже занят"
        className="max-w-md"
      >
        {conflictWarn && (
          <div className="mt-3 space-y-3">
            <p className="text-sm text-[var(--ink)]">
              <span className="font-medium">{conflictWarn.userName}</span> уже
              назначен на другое мероприятие в пересекающиеся дни:
            </p>
            <ul className="space-y-1.5 rounded-lg border border-[var(--line)] bg-[var(--bg)] p-3 text-sm">
              {conflictWarn.conflicts.map((c) => (
                <li key={c.quoteId} className="text-[var(--ink)]">
                  {conflictLabel(c)}
                </li>
              ))}
            </ul>
            <p className="text-xs text-[var(--muted)]">
              Можно всё равно назначить или выбрать другого сотрудника.
            </p>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setConflictWarn(null);
                  setUserId("");
                  setSpecialtyId("");
                }}
              >
                Выбрать другого
              </Button>
              <Button
                size="sm"
                disabled={checkingBusy}
                onClick={() => {
                  setCheckingBusy(true);
                  void createStaffAssignment().finally(() =>
                    setCheckingBusy(false),
                  );
                }}
              >
                Назначить всё равно
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </section>
  );
}
