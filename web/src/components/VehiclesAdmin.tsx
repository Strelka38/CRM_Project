"use client";

import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  DirectoryAddButton,
  DirectoryCardLink,
  DirectoryCsvMenu,
  DirectorySelectionActions,
  IconPlusFolder,
  downloadCsvExport,
  postBulkAction,
  uploadCsvImport,
} from "@/components/DirectoryToolbar";

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
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const csvImportRef = useRef<HTMLInputElement>(null);

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
    const rows: VehicleRow[] = await res.json();
    setVehicles(rows);
    setSelected((prev) => {
      const ids = new Set(rows.map((r) => r.id));
      return new Set([...prev].filter((id) => ids.has(id)));
    });
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
        typeof data.error === "string" ? data.error : "Не удалось создать запись",
      );
      return;
    }
    setForm(emptyForm);
    setShowCreate(false);
    void load(q);
  }

  function toggleAll() {
    const ids = vehicles.map((v) => v.id);
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

  async function bulk(action: "delete" | "copy") {
    if (selected.size === 0) return;
    setBusy(true);
    setError("");
    try {
      await postBulkAction("/api/vehicles/bulk", action, [...selected]);
      setSelected(new Set());
      setConfirmDelete(false);
      void load(q);
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
      setCsvMessage(await downloadCsvExport("/api/vehicles/csv"));
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
      setCsvMessage(await uploadCsvImport("/api/vehicles/csv", file));
      void load(q);
    } catch (e) {
      setCsvMessage(e instanceof Error ? e.message : "Не удалось импортировать");
    } finally {
      setCsvBusy(false);
    }
  }

  const allSelected =
    vehicles.length > 0 && vehicles.every((v) => selected.has(v.id));

  return (
    <div className="w-full px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          Склад
        </p>
        <h1 className="mt-1 text-3xl font-light tracking-tight">Транспорт</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Корпоративный автопарк: госномера, модели, пробег и комментарии.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex w-full items-center gap-2 border-b border-[var(--line)] px-4 py-3">
          <DirectoryAddButton
            title="+ Транспорт"
            icon={<IconPlusFolder />}
            onClick={() => setShowCreate((v) => !v)}
          />
          <input
            type="search"
            className="field max-w-md py-1.5 text-sm"
            placeholder="Поиск…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="ml-auto flex items-center gap-1">
            <DirectorySelectionActions
              count={selected.size}
              disabled={busy}
              onDelete={() => setConfirmDelete(true)}
              onCopy={() => void bulk("copy")}
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
          <div className="grid gap-3 border-b border-[var(--line)] p-4 md:grid-cols-3 lg:grid-cols-4">
            <label className="text-sm">
              <span className="text-[var(--muted)]">Номер</span>
              <input
                className="field mt-1"
                value={form.plateNumber}
                onChange={(e) => setForm({ ...form, plateNumber: e.target.value })}
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
                className="field mt-1 text-left"
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
                className="field mt-1 text-left"
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
            <button
              type="button"
              onClick={createVehicle}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white md:col-span-3 md:w-fit lg:col-span-4"
            >
              Добавить транспорт
            </button>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[70rem] text-left text-sm">
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
                <th className="px-3 py-2 text-left">Номер</th>
                <th className="px-3 py-2 text-left">Марка</th>
                <th className="px-3 py-2 text-left">Модель</th>
                <th className="px-3 py-2 text-left">Серия</th>
                <th className="px-3 py-2 text-left">Свидетельство</th>
                <th className="px-3 py-2 text-left">Расход</th>
                <th className="px-3 py-2 text-left">Пробег</th>
                <th className="px-3 py-2 text-left">Правила</th>
                <th className="px-3 py-2 text-left">Комментарий</th>
                <th className="w-12 px-3 py-2 text-left" />
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr
                  key={v.id}
                  className={`border-t border-[var(--line)] ${
                    v.active ? "" : "opacity-50"
                  } ${selected.has(v.id) ? "bg-[var(--selected)]/40" : ""}`}
                >
                  <td className="px-3 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={selected.has(v.id)}
                      onChange={() => toggleOne(v.id)}
                      aria-label={`Выбрать ${v.plateNumber}`}
                    />
                  </td>
                  <td className="px-3 py-2 text-left">{v.plateNumber}</td>
                  <td className="px-3 py-2 text-left">{v.make || "—"}</td>
                  <td className="px-3 py-2 text-left">{v.model || "—"}</td>
                  <td className="px-3 py-2 text-left">{v.series || "—"}</td>
                  <td className="px-3 py-2 text-left">{v.certificateNumber || "—"}</td>
                  <td className="px-3 py-2 text-left tabular-nums">
                    {v.fuelConsumption || 0}
                  </td>
                  <td className="px-3 py-2 text-left tabular-nums">{v.mileage || 0}</td>
                  <td className="max-w-[10rem] truncate px-3 py-2 text-left">
                    {v.operatingRules || "—"}
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-2 text-left">
                    {v.comment || "—"}
                  </td>
                  <td className="px-3 py-2 text-left">
                    <DirectoryCardLink href={`/vehicles/${v.id}`} />
                  </td>
                </tr>
              ))}
              {vehicles.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-left text-[var(--muted)]">
                    Транспорта пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Отключить транспорт"
        message={`Отключить выбранные машины (${selected.size})?`}
        confirmLabel="Отключить"
        busy={busy}
        onConfirm={() => void bulk("delete")}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
