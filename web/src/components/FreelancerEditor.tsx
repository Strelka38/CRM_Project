"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";

type PayoutRow = {
  assignmentId: string;
  quoteId: string;
  proposalNumber: string;
  eventName: string;
  date: string;
  lifecycle: string;
  paid: boolean;
  kind: string;
  specialtyName: string;
  pay: number;
  countsForStats: boolean;
};

type Specialty = {
  id: string;
  name: string;
  hourlyRate?: number;
  shiftRate?: number;
};

type FreelancerSpecialtyRow = {
  specialtyId: string;
  hourlyRate: number;
  shiftRate: number;
  specialty: Specialty;
};

type FreelancerDetail = {
  id: string;
  name: string;
  comment: string;
  active: boolean;
  specialties?: FreelancerSpecialtyRow[];
  stats: {
    assignmentCount: number;
    eventCount: number;
    confirmedEventCount: number;
    totalPay: number;
    paidPay: number;
    showPay: boolean;
  };
  payouts: PayoutRow[];
};

const LIFE_LABEL: Record<string, string> = {
  CALCULATED: "Посчитано",
  CONFIRMED: "Подтверждено",
  CANCELLED: "Отменено",
  COMPLETED: "Завершено",
};

export function FreelancerEditor({ freelancerId }: { freelancerId: string }) {
  const router = useRouter();
  const [freelancer, setFreelancer] = useState<FreelancerDetail | null>(null);
  const [allSpecialties, setAllSpecialties] = useState<Specialty[]>([]);
  const [rows, setRows] = useState<
    Array<{ specialtyId: string; hourlyRate: number; shiftRate: number; name: string }>
  >([]);
  const [addSpecialtyId, setAddSpecialtyId] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const [fRes, sRes] = await Promise.all([
      fetch(`/api/freelancers/${freelancerId}`),
      fetch("/api/specialties"),
    ]);
    if (!fRes.ok) {
      setError("Фрилансер не найден");
      setFreelancer(null);
      return;
    }
    const data: FreelancerDetail = await fRes.json();
    setFreelancer(data);
    setRows(
      (data.specialties || []).map((s) => ({
        specialtyId: s.specialtyId,
        hourlyRate: s.hourlyRate,
        shiftRate: s.shiftRate,
        name: s.specialty.name,
      })),
    );
    if (sRes.ok) setAllSpecialties(await sRes.json());
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freelancerId]);

  async function saveProfile() {
    if (!freelancer) return false;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/freelancers/${freelancerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: freelancer.name,
        comment: freelancer.comment,
        active: freelancer.active,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string"
          ? data.error
          : "Не удалось сохранить профиль",
      );
      return false;
    }
    const updated = await res.json();
    setFreelancer((prev) => (prev ? { ...prev, ...updated } : prev));
    return true;
  }

  async function saveSpecialties() {
    const res = await fetch(`/api/freelancers/${freelancerId}/specialties`, {
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
    if (!res.ok) {
      setError("Не удалось сохранить специальности");
      return false;
    }
    return true;
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

  if (!freelancer && !error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 text-[var(--muted)]">
        Загрузка…
      </div>
    );
  }

  if (!freelancer) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 text-[var(--danger)]">
        {error}
      </div>
    );
  }

  const { stats } = freelancer;
  const availableToAdd = allSpecialties.filter(
    (s) => !rows.some((r) => r.specialtyId === s.id),
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
        <button
          type="button"
          onClick={() => router.push("/freelancers")}
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-white/10"
        >
          ← Назад
        </button>
        <h1 className="font-display text-center text-2xl uppercase tracking-wide md:text-3xl">
          Профиль фрилансера
        </h1>
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            const okProfile = await saveProfile();
            if (!okProfile) return;
            setSaving(true);
            const okSpec = await saveSpecialties();
            setSaving(false);
            if (okSpec) await load();
          }}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </header>

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] lg:col-span-2">
          <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
            Основная информация
          </h2>
          <div className="grid gap-3 p-4">
            <label className="block text-sm">
              <span className="text-[var(--muted)]">ФИО</span>
              <input
                className="field mt-1"
                value={freelancer.name}
                onChange={(e) =>
                  setFreelancer({ ...freelancer, name: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--muted)]">Комментарий</span>
              <textarea
                className="field mt-1 min-h-[80px]"
                value={freelancer.comment}
                onChange={(e) =>
                  setFreelancer({ ...freelancer, comment: e.target.value })
                }
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={freelancer.active}
                onChange={(e) =>
                  setFreelancer({ ...freelancer, active: e.target.checked })
                }
              />
              Активен
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
            Выплаты
          </h2>
          <div className="space-y-3 p-4 text-sm">
            {stats.showPay ? (
              <>
                <div>
                  <p className="text-xs text-[var(--muted)]">
                    Начислено (подтверждённые КП)
                  </p>
                  <p className="font-display text-xl">
                    {formatMoney(stats.totalPay)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--muted)]">Выплачено</p>
                  <p className="font-display text-xl">
                    {formatMoney(stats.paidPay)}
                  </p>
                </div>
              </>
            ) : (
              <p className="text-xs text-[var(--muted)]">
                Суммы выплат видит менеджер.
              </p>
            )}
            <div className="border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
              <p>
                Смен: {stats.assignmentCount} · мероприятий: {stats.eventCount}
              </p>
              <p className="mt-1">
                В статистике сумм: {stats.confirmedEventCount} подтверждённых /
                завершённых КП.
              </p>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
          Специальности
        </h2>
        <div className="data-table-shell overflow-x-auto p-2">
          <table className="data-table data-table--editable w-full min-w-[560px] text-sm">
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
                  </td>
                  <td className="px-2 py-2">
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
                  </td>
                  <td className="px-2 py-2">
                    <button
                      type="button"
                      className="btn-icon text-[var(--danger)]"
                      onClick={() =>
                        setRows((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      ×
                    </button>
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
          {availableToAdd.length > 0 && (
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

      <section className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="mb-2 font-display text-lg">Назначения</h2>
        {freelancer.payouts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Этот фрилансер ещё не назначался в сметах.
          </p>
        ) : (
          <div className="data-table-shell overflow-x-auto">
            <table className="data-table w-full min-w-[720px] text-sm">
              <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-2 py-2 text-left">КП</th>
                  <th className="px-2 py-2 text-left">Мероприятие</th>
                  <th className="px-2 py-2 text-left">Дата</th>
                  <th className="px-2 py-2 text-left">Роль</th>
                  <th className="px-2 py-2 text-left">Статус</th>
                  {stats.showPay ? (
                    <th className="px-2 py-2 text-right">К выплате</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {freelancer.payouts.map((p) => (
                  <tr
                    key={p.assignmentId}
                    className={`border-t border-[var(--line)] ${
                      p.countsForStats ? "" : "opacity-60"
                    }`}
                  >
                    <td className="px-2 py-2">
                      <Link
                        href={`/quotes/${p.quoteId}`}
                        className="text-[var(--accent)] hover:underline"
                      >
                        № {p.proposalNumber || "—"}
                      </Link>
                    </td>
                    <td className="px-2 py-2">{p.eventName || "—"}</td>
                    <td className="px-2 py-2">{p.date || "—"}</td>
                    <td className="px-2 py-2">
                      {p.kind === "MOUNT"
                        ? "Монтаж"
                        : p.specialtyName || "—"}
                    </td>
                    <td className="px-2 py-2">
                      {LIFE_LABEL[p.lifecycle] || p.lifecycle}
                      {p.paid ? " · выплачено" : ""}
                    </td>
                    {stats.showPay ? (
                      <td className="px-2 py-2 text-right tabular-nums">
                        {formatMoney(p.pay)}
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
