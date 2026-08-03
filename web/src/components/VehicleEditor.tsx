"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type VehicleDetail = {
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

export function VehicleEditor({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [vehicle, setVehicle] = useState<VehicleDetail | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/vehicles/${vehicleId}`);
      if (!res.ok) {
        setError("Транспорт не найден");
        return;
      }
      setVehicle(await res.json());
    })();
  }, [vehicleId]);

  async function save() {
    if (!vehicle) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/vehicles/${vehicleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plateNumber: vehicle.plateNumber,
        make: vehicle.make,
        model: vehicle.model,
        series: vehicle.series,
        certificateNumber: vehicle.certificateNumber,
        fuelConsumption: vehicle.fuelConsumption,
        mileage: vehicle.mileage,
        operatingRules: vehicle.operatingRules,
        comment: vehicle.comment,
        active: vehicle.active,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(
        typeof data.error === "string"
          ? data.error
          : "Не удалось сохранить",
      );
      return;
    }
    setVehicle(await res.json());
  }

  if (!vehicle && !error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-[var(--muted)]">
        Загрузка…
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-[var(--danger)]">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
        <button
          type="button"
          onClick={() => router.push("/vehicles")}
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-white/70"
        >
          ← Назад
        </button>
        <h1 className="font-display text-center text-2xl uppercase tracking-wide md:text-3xl">
          {vehicle.plateNumber}
        </h1>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </header>

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      <section className="grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 md:grid-cols-2">
        {(
          [
            ["plateNumber", "Номер"],
            ["make", "Марка"],
            ["model", "Модель"],
            ["series", "Серия"],
            ["certificateNumber", "Номер свидетельства"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm">
            <span className="text-[var(--muted)]">{label}</span>
            <input
              className="field mt-1"
              value={vehicle[key]}
              onChange={(e) =>
                setVehicle({ ...vehicle, [key]: e.target.value })
              }
            />
          </label>
        ))}
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Расход топлива</span>
          <input
            type="number"
            min={0}
            step="0.1"
            className="field mt-1"
            value={vehicle.fuelConsumption}
            onChange={(e) =>
              setVehicle({
                ...vehicle,
                fuelConsumption: Math.max(0, Number(e.target.value) || 0),
              })
            }
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Текущий пробег</span>
          <input
            type="number"
            min={0}
            className="field mt-1"
            value={vehicle.mileage}
            onChange={(e) =>
              setVehicle({
                ...vehicle,
                mileage: Math.max(0, Number(e.target.value) || 0),
              })
            }
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Правила эксплуатации</span>
          <textarea
            className="field mt-1 min-h-[80px]"
            value={vehicle.operatingRules}
            onChange={(e) =>
              setVehicle({ ...vehicle, operatingRules: e.target.value })
            }
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Комментарий</span>
          <textarea
            className="field mt-1 min-h-[80px]"
            value={vehicle.comment}
            onChange={(e) =>
              setVehicle({ ...vehicle, comment: e.target.value })
            }
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={vehicle.active}
            onChange={(e) =>
              setVehicle({ ...vehicle, active: e.target.checked })
            }
          />
          Активен
        </label>
      </section>
    </div>
  );
}
