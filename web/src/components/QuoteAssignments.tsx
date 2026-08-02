"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CATALOG_OWNERS,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { formatMoney } from "@/lib/format";

type Specialty = { id: string; name: string };
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
  userId: string;
  specialtyId: string;
  payMode: "SHIFT" | "HOURLY";
  hours: number | null;
  rateOverride: number | null;
  hourlyRate: number;
  shiftRate: number;
  pay: number;
  user: {
    id: string;
    name: string;
    email: string;
    owners?: CatalogOwnerValue[] | null;
  };
  specialty: Specialty;
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

export function QuoteAssignments({
  quoteId,
  canEdit,
  compact = false,
  onChanged,
}: {
  quoteId: string;
  canEdit: boolean;
  compact?: boolean;
  onChanged?: () => void;
}) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [userId, setUserId] = useState("");
  const [specialtyId, setSpecialtyId] = useState("");
  const [payMode, setPayMode] = useState<"SHIFT" | "HOURLY">("SHIFT");
  const [hours, setHours] = useState(8);
  const [rateOverride, setRateOverride] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;
  const skipNotifyRef = useRef(true);

  const load = useCallback(async () => {
    const [aRes, uRes] = await Promise.all([
      fetch(`/api/quotes/${quoteId}/assignments`),
      canEdit ? fetch("/api/users") : Promise.resolve(null),
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

  async function addAssignment() {
    setError("");
    if (!userId || !specialtyId) {
      setError("Выберите сотрудника и должность");
      return;
    }
    const res = await fetch(`/api/quotes/${quoteId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        specialtyId,
        payMode,
        hours: payMode === "HOURLY" ? hours : null,
        rateOverride: rateOverride === "" ? null : Number(rateOverride),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Не удалось назначить");
      return;
    }
    setRateOverride("");
    void load();
  }

  async function removeAssignment(id: string) {
    await fetch(`/api/quotes/${quoteId}/assignments/${id}`, {
      method: "DELETE",
    });
    void load();
  }

  async function patchOverride(id: string, value: string) {
    await fetch(`/api/quotes/${quoteId}/assignments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rateOverride: value === "" ? null : Number(value),
      }),
    });
    void load();
  }

  const total = assignments.reduce((s, a) => s + a.pay, 0);

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
            Назначение по должности; оплата — ставка смены или часовка
            («вставка»).
          </p>
        </div>
        <p className="text-sm">
          ФОТ:{" "}
          <span className="font-medium tabular-nums">{formatMoney(total)}</span>
        </p>
      </div>

      {canEdit && (
        <div
          className={
            compact
              ? "mb-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3 sm:grid-cols-2"
              : "mb-4 grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3 md:grid-cols-6"
          }
        >
          <label className={compact ? "text-sm" : "text-sm md:col-span-2"}>
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
          <label className={compact ? "text-sm" : "text-sm md:col-span-2"}>
            <span className="text-[var(--muted)]">Должность</span>
            <select
              className="field mt-1"
              value={specialtyId}
              onChange={(e) => setSpecialtyId(e.target.value)}
              disabled={!userId}
            >
              {userSpecialties.map((s) => (
                <option key={s.specialtyId} value={s.specialtyId}>
                  {s.specialty.name} (смена {s.shiftRate})
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-[var(--muted)]">Режим</span>
            <select
              className="field mt-1"
              value={payMode}
              onChange={(e) => setPayMode(e.target.value as "SHIFT" | "HOURLY")}
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
          <div
            className={
              compact
                ? "flex items-end sm:col-span-2"
                : "flex items-end md:col-span-6"
            }
          >
            <button
              type="button"
              onClick={() => void addAssignment()}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white"
            >
              Назначить
            </button>
            {error && (
              <span className="ml-3 text-sm text-[var(--danger)]">{error}</span>
            )}
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-x-auto">
        <table
          className={
            compact
              ? "w-full min-w-[480px] text-sm"
              : "w-full min-w-[640px] text-sm"
          }
        >
          <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-2 py-2 text-left">Сотрудник</th>
              <th className="px-2 py-2 text-left">Фирма</th>
              <th className="px-2 py-2 text-left">Должность</th>
              <th className="px-2 py-2 text-left">Режим</th>
              <th className="px-2 py-2 text-right">Ставка / override</th>
              <th className="px-2 py-2 text-right">К выплате</th>
              {canEdit && <th className="px-2 py-2" />}
            </tr>
          </thead>
          <tbody>
            {assignments.map((a) => (
              <tr key={a.id} className="border-t border-[var(--line)]">
                <td className="px-2 py-2">{a.user.name}</td>
                <td className="px-2 py-2">
                  <FirmBadges owners={a.user.owners} />
                </td>
                <td className="px-2 py-2">{a.specialty.name}</td>
                <td className="px-2 py-2">
                  {a.payMode === "HOURLY"
                    ? `${a.hours ?? 0} ч × ${formatMoney(a.hourlyRate)}`
                    : "Смена"}
                </td>
                <td className="px-2 py-2 text-right">
                  {canEdit ? (
                    <input
                      type="number"
                      min={0}
                      className="field ml-auto max-w-[120px] text-right"
                      placeholder={String(
                        a.payMode === "HOURLY"
                          ? (a.hours || 0) * a.hourlyRate
                          : a.shiftRate,
                      )}
                      defaultValue={a.rateOverride ?? ""}
                      onBlur={(e) =>
                        void patchOverride(a.id, e.target.value)
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
            ))}
            {assignments.length === 0 && (
              <tr>
                <td
                  colSpan={canEdit ? 7 : 6}
                  className="px-4 py-6 text-center text-[var(--muted)]"
                >
                  Сотрудники ещё не назначены
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
