"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/format";

type SpecialtyRow = {
  id: string;
  name: string;
  sortOrder: number;
  hourlyRate: number;
  shiftRate: number;
  active: boolean;
};

type Draft = {
  name: string;
  sortOrder: string;
  hourlyRate: string;
  shiftRate: string;
};

function toDraft(s: SpecialtyRow): Draft {
  return {
    name: s.name,
    sortOrder: String(s.sortOrder),
    hourlyRate: String(s.hourlyRate),
    shiftRate: String(s.shiftRate),
  };
}

function parseNonNeg(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function RatesAdmin() {
  const [specialties, setSpecialties] = useState<SpecialtyRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [q, setQ] = useState("");

  const [newName, setNewName] = useState("");
  const [newHourly, setNewHourly] = useState("");
  const [newShift, setNewShift] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch("/api/specialties?active=0");
    if (!res.ok) {
      setError("Не удалось загрузить специальности");
      setSpecialties([]);
      return;
    }
    const rows: SpecialtyRow[] = await res.json();
    setSpecialties(rows);
    setDrafts(Object.fromEntries(rows.map((s) => [s.id, toDraft(s)])));
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return specialties;
    return specialties.filter((s) => s.name.toLowerCase().includes(needle));
  }, [specialties, q]);

  function isDirty(s: SpecialtyRow): boolean {
    const d = drafts[s.id];
    if (!d) return false;
    return (
      d.name.trim() !== s.name ||
      Number(d.sortOrder) !== s.sortOrder ||
      Number(d.hourlyRate) !== s.hourlyRate ||
      Number(d.shiftRate) !== s.shiftRate
    );
  }

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
    setOk("");
  }

  async function saveRow(s: SpecialtyRow) {
    const d = drafts[s.id];
    if (!d) return;
    setError("");
    setOk("");
    const name = d.name.trim();
    if (!name) {
      setError("Название специальности не может быть пустым");
      return;
    }
    const sortOrder = Number.parseInt(d.sortOrder, 10);
    const hourlyRate = parseNonNeg(d.hourlyRate);
    const shiftRate = parseNonNeg(d.shiftRate);
    if (!Number.isFinite(sortOrder)) {
      setError("Порядок должен быть целым числом");
      return;
    }
    if (hourlyRate == null || shiftRate == null) {
      setError("Ставки должны быть неотрицательными числами");
      return;
    }

    setSavingId(s.id);
    const res = await fetch(`/api/specialties/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, sortOrder, hourlyRate, shiftRate }),
    });
    setSavingId(null);
    if (!res.ok) {
      setError("Не удалось сохранить специальность");
      return;
    }
    const updated: SpecialtyRow = await res.json();
    setSpecialties((prev) =>
      prev
        .map((row) => (row.id === updated.id ? updated : row))
        .sort(
          (a, b) =>
            a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"),
        ),
    );
    setDrafts((prev) => ({ ...prev, [updated.id]: toDraft(updated) }));
    setOk(`Сохранено: ${updated.name}`);
  }

  async function toggleActive(s: SpecialtyRow) {
    setError("");
    setOk("");
    const res = await fetch(`/api/specialties/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    if (!res.ok) {
      setError("Не удалось изменить статус");
      return;
    }
    const updated: SpecialtyRow = await res.json();
    setSpecialties((prev) =>
      prev.map((row) => (row.id === updated.id ? updated : row)),
    );
  }

  async function createSpecialty() {
    setError("");
    setOk("");
    if (!newName.trim()) {
      setError("Укажите название специальности");
      return;
    }
    const hourlyRate = newHourly.trim() === "" ? 0 : parseNonNeg(newHourly);
    const shiftRate = newShift.trim() === "" ? 0 : parseNonNeg(newShift);
    if (hourlyRate == null || shiftRate == null) {
      setError("Ставки должны быть неотрицательными числами");
      return;
    }

    const maxSort = specialties.reduce(
      (m, s) => Math.max(m, s.sortOrder),
      -1,
    );

    setCreating(true);
    const res = await fetch("/api/specialties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        sortOrder: maxSort + 1,
        hourlyRate,
        shiftRate,
      }),
    });
    setCreating(false);
    if (!res.ok) {
      setError("Не удалось создать (возможно, такое название уже есть)");
      return;
    }
    setNewName("");
    setNewHourly("");
    setNewShift("");
    setOk("Специальность создана");
    void load();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          CRM
        </p>
        <h1 className="mt-1 text-3xl font-light tracking-tight">Ставки</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Справочник специальностей и базовые ставки. При назначении сотруднику
          подставляются эти значения — индивидуальные ставки правятся в карточке
          сотрудника.
        </p>
      </header>

      <section className="mb-6 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 md:grid-cols-4">
        <label className="text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Специальность</span>
          <input
            className="field mt-1"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Звукооператор…"
            onKeyDown={(e) => {
              if (e.key === "Enter") void createSpecialty();
            }}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Ставка час</span>
          <input
            type="number"
            min={0}
            step={100}
            className="field mt-1"
            value={newHourly}
            onChange={(e) => setNewHourly(e.target.value)}
            placeholder="0"
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Ставка смена</span>
          <input
            type="number"
            min={0}
            step={500}
            className="field mt-1"
            value={newShift}
            onChange={(e) => setNewShift(e.target.value)}
            placeholder="0"
          />
        </label>
        <button
          type="button"
          onClick={() => void createSpecialty()}
          disabled={creating}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white md:col-span-4 md:w-fit disabled:opacity-60"
        >
          {creating ? "Создание…" : "Создать специальность"}
        </button>
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="field max-w-md"
          placeholder="Поиск по названию…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        {ok && !error && (
          <p className="text-sm text-[var(--accent)]">{ok}</p>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full min-w-[40rem] text-left text-sm">
          <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-3 py-3">№</th>
              <th className="px-3 py-3">Специальность</th>
              <th className="px-3 py-3">Час</th>
              <th className="px-3 py-3">Смена</th>
              <th className="px-3 py-3">Статус</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const d = drafts[s.id] ?? toDraft(s);
              const dirty = isDirty(s);
              return (
                <tr
                  key={s.id}
                  className={`border-t border-[var(--line)] ${
                    s.active ? "" : "opacity-60"
                  }`}
                >
                  <td className="px-3 py-2 align-middle">
                    <input
                      type="number"
                      className="field w-16 py-1.5 text-center tabular-nums"
                      value={d.sortOrder}
                      onChange={(e) =>
                        updateDraft(s.id, { sortOrder: e.target.value })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      className="field py-1.5"
                      value={d.name}
                      onChange={(e) =>
                        updateDraft(s.id, { name: e.target.value })
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      type="number"
                      min={0}
                      step={100}
                      className="field w-28 py-1.5 tabular-nums"
                      value={d.hourlyRate}
                      onChange={(e) =>
                        updateDraft(s.id, { hourlyRate: e.target.value })
                      }
                    />
                    <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                      {formatMoney(Number(d.hourlyRate) || 0)}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <input
                      type="number"
                      min={0}
                      step={500}
                      className="field w-28 py-1.5 tabular-nums"
                      value={d.shiftRate}
                      onChange={(e) =>
                        updateDraft(s.id, { shiftRate: e.target.value })
                      }
                    />
                    <div className="mt-0.5 text-[11px] text-[var(--muted)]">
                      {formatMoney(Number(d.shiftRate) || 0)}
                    </div>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <button
                      type="button"
                      onClick={() => void toggleActive(s)}
                      className={
                        s.active ? "text-[var(--accent)]" : "text-[var(--danger)]"
                      }
                    >
                      {s.active ? "Активна" : "Отключена"}
                    </button>
                  </td>
                  <td className="px-3 py-2 align-middle">
                    <button
                      type="button"
                      disabled={!dirty || savingId === s.id}
                      onClick={() => void saveRow(s)}
                      className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm transition-colors enabled:hover:bg-subtle disabled:opacity-40"
                    >
                      {savingId === s.id ? "…" : "Сохранить"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  Специальностей пока нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
