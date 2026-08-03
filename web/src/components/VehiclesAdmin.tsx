"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type VehicleRow = {
  id: string;
  plateNumber: string;
  make: string;
  model: string;
  series: string;
  certificateNumber: string;
  fuelConsumption: number;
  mileage: number;
  operatingRules: string;
  comment: string;
  active: boolean;
};

const emptyForm = {
  plateNumber: "",
  make: "",
  model: "",
  series: "",
  certificateNumber: "",
  fuelConsumption: "",
  mileage: "",
  operatingRules: "",
  comment: "",
};

export function VehiclesAdmin() {
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  async function load(search = q) {
    const params = new URLSearchParams();
    params.set("active", "0");
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/vehicles?${params}`);
    if (!res.ok) {
      setError("Не удалось загрузить транспорт");
      setVehicles([]);
      return;
    }
    setVehicles(await res.json());
  }

  useEffect(() => {
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(q), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function createVehicle() {
    setError("");
    if (!form.plateNumber.trim()) {
      setError("Укажите госномер");
      return;
    }
    const res = await fetch("/api/vehicles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plateNumber: form.plateNumber,
        make: form.make,
        model: form.model,
        series: form.series,
        certificateNumber: form.certificateNumber,
        fuelConsumption: Number(form.fuelConsumption) || 0,
        mileage: Number(form.mileage) || 0,
        operatingRules: form.operatingRules,
        comment: form.comment,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string"
          ? data.error
          : "Не удалось создать запись",
      );
      return;
    }
    setForm(emptyForm);
    void load(q);
  }

  async function deleteVehicle(id: string, plate: string) {
    if (!confirm(`Удалить транспорт ${plate}?`)) return;
    const res = await fetch(`/api/vehicles/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Не удалось удалить");
      return;
    }
    void load(q);
  }

  return (
    <div className="mx-auto max-w-[90rem] px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          CRM
        </p>
        <h1 className="mt-1 text-3xl font-light tracking-tight">Транспорт</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Корпоративный автопарк: госномера, модели, пробег и комментарии.
        </p>
      </header>

      <section className="mb-6 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 md:grid-cols-3 lg:grid-cols-4">
        <label className="text-sm">
          <span className="text-[var(--muted)]">Номер</span>
          <input
            className="field mt-1"
            value={form.plateNumber}
            onChange={(e) =>
              setForm({ ...form, plateNumber: e.target.value })
            }
            placeholder="А123ВС138"
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Марка</span>
          <input
            className="field mt-1"
            value={form.make}
            onChange={(e) => setForm({ ...form, make: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Модель</span>
          <input
            className="field mt-1"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Серия</span>
          <input
            className="field mt-1"
            value={form.series}
            onChange={(e) => setForm({ ...form, series: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Номер свидетельства</span>
          <input
            className="field mt-1"
            value={form.certificateNumber}
            onChange={(e) =>
              setForm({ ...form, certificateNumber: e.target.value })
            }
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Расход топлива</span>
          <input
            type="number"
            min={0}
            step="0.1"
            className="field mt-1"
            value={form.fuelConsumption}
            onChange={(e) =>
              setForm({ ...form, fuelConsumption: e.target.value })
            }
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Текущий пробег</span>
          <input
            type="number"
            min={0}
            className="field mt-1"
            value={form.mileage}
            onChange={(e) => setForm({ ...form, mileage: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Правила эксплуатации</span>
          <input
            className="field mt-1"
            value={form.operatingRules}
            onChange={(e) =>
              setForm({ ...form, operatingRules: e.target.value })
            }
          />
        </label>
        <label className="text-sm md:col-span-2 lg:col-span-3">
          <span className="text-[var(--muted)]">Комментарий</span>
          <input
            className="field mt-1"
            value={form.comment}
            onChange={(e) => setForm({ ...form, comment: e.target.value })}
          />
        </label>
        {error && (
          <p className="text-sm text-[var(--danger)] md:col-span-3 lg:col-span-4">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={createVehicle}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white md:col-span-3 md:w-fit lg:col-span-4"
        >
          Добавить транспорт
        </button>
      </section>

      <div className="mb-3 flex justify-end">
        <input
          type="search"
          className="field max-w-xs"
          placeholder="Поиск…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full min-w-[70rem] text-left text-sm">
          <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3">№</th>
              <th className="px-3 py-3">Номер</th>
              <th className="px-3 py-3">Марка</th>
              <th className="px-3 py-3">Модель</th>
              <th className="px-3 py-3">Серия</th>
              <th className="px-3 py-3">Номер свидетельства</th>
              <th className="px-3 py-3">Расход топлива</th>
              <th className="px-3 py-3">Текущий пробег</th>
              <th className="px-3 py-3">Правила эксплуатации</th>
              <th className="px-3 py-3">Комментарий</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {vehicles.map((v, i) => (
              <tr
                key={v.id}
                className={`border-t border-[var(--line)] ${
                  v.active ? "" : "opacity-50"
                }`}
              >
                <td className="px-3 py-2 tabular-nums text-[var(--muted)]">
                  {vehicles.length - i}
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/vehicles/${v.id}`}
                    className="font-medium text-[var(--accent)] hover:underline"
                  >
                    {v.plateNumber}
                  </Link>
                </td>
                <td className="px-3 py-2">{v.make || "—"}</td>
                <td className="px-3 py-2">{v.model || "—"}</td>
                <td className="px-3 py-2">{v.series || ""}</td>
                <td className="px-3 py-2">{v.certificateNumber || "0"}</td>
                <td className="px-3 py-2 tabular-nums">
                  {v.fuelConsumption || 0}
                </td>
                <td className="px-3 py-2 tabular-nums">{v.mileage || 0}</td>
                <td className="max-w-[10rem] truncate px-3 py-2">
                  {v.operatingRules}
                </td>
                <td className="max-w-[14rem] truncate px-3 py-2">
                  {v.comment}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    title="Удалить"
                    onClick={() => void deleteVehicle(v.id, v.plateNumber)}
                    className="btn-icon text-[var(--danger)]"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {vehicles.length === 0 && (
              <tr>
                <td
                  colSpan={11}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  Транспорта пока нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
