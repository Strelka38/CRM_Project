"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  DirectoryAddButton,
  DirectoryCsvMenu,
  DirectoryIconButton,
  DirectorySelectionActions,
  IconPlusFolder,
  IconSave,
  downloadCsvExport,
  postBulkAction,
  uploadCsvImport,
} from "@/components/DirectoryToolbar";

type CatalogService = {
  id: string;
  name: string;
  itemKind: string;
};

type SpecialtyRow = {
  id: string;
  name: string;
  sortOrder: number;
  hourlyRate: number;
  shiftRate: number;
  description: string;
  active: boolean;
  catalogItemIds?: string[];
  catalogItems?: CatalogService[];
};

type Draft = {
  name: string;
  sortOrder: string;
  hourlyRate: string;
  shiftRate: string;
  description: string;
  catalogItemIds: string[];
};

function rowServiceIds(s: SpecialtyRow): string[] {
  if (s.catalogItemIds?.length) return s.catalogItemIds;
  return (s.catalogItems ?? []).map((item) => item.id);
}

function toDraft(s: SpecialtyRow): Draft {
  return {
    name: s.name,
    sortOrder: String(s.sortOrder),
    hourlyRate: String(s.hourlyRate),
    shiftRate: String(s.shiftRate),
    description: s.description ?? "",
    catalogItemIds: rowServiceIds(s),
  };
}

const compactNumClass =
  "field !w-[4.5rem] py-1 px-1.5 text-left tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const compactShiftClass =
  "field !w-[4.25rem] py-1 px-1.5 text-left tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const compactSortClass =
  "field !w-11 py-1 px-1.5 text-left tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";
const compactNameClass = "field !w-[12rem] py-1 px-2 text-left";
const compactServiceClass =
  "field w-full min-w-[12rem] py-1 px-1.5 text-left text-xs";

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const left = [...a].sort();
  const right = [...b].sort();
  return left.every((id, i) => id === right[i]);
}

function ServicePicker({
  selectedIds,
  onChange,
  services,
  takenIds,
  extras = [],
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  services: CatalogService[];
  takenIds: Set<string>;
  extras?: CatalogService[];
}) {
  const byId = new Map<string, CatalogService>();
  for (const item of extras) byId.set(item.id, item);
  for (const item of services) byId.set(item.id, item);
  const selected = selectedIds
    .map((id) => byId.get(id))
    .filter((item): item is CatalogService => Boolean(item));
  const available = services.filter(
    (item) => !selectedIds.includes(item.id) && !takenIds.has(item.id),
  );
  return (
    <div className="flex min-w-[14rem] max-w-[22rem] flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {selected.map((item) => (
          <span
            key={item.id}
            className="inline-flex max-w-full items-center gap-1 rounded-md bg-[var(--selected)]/50 px-1.5 py-0.5 text-xs"
          >
            <span className="truncate">{item.name}</span>
            <button
              type="button"
              className="shrink-0 text-[var(--muted)] hover:text-[var(--danger)]"
              onClick={() =>
                onChange(selectedIds.filter((id) => id !== item.id))
              }
              aria-label={`Убрать ${item.name}`}
            >
              ×
            </button>
          </span>
        ))}
        {selected.length === 0 ? (
          <span className="text-xs text-[var(--muted)]">Не связаны</span>
        ) : null}
      </div>
      {available.length > 0 ? (
        <select
          className={compactServiceClass}
          value=""
          onChange={(e) => {
            const id = e.target.value;
            if (id) onChange([...selectedIds, id]);
          }}
        >
          <option value="">Добавить услугу…</option>
          {available.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
              {item.itemKind === "PERSONNEL" ? " · персонал" : ""}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

function parseNonNeg(value: string): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function RatesAdmin() {
  const [specialties, setSpecialties] = useState<SpecialtyRow[]>([]);
  const [services, setServices] = useState<CatalogService[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [q, setQ] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const csvImportRef = useRef<HTMLInputElement>(null);

  const [newName, setNewName] = useState("");
  const [newHourly, setNewHourly] = useState("");
  const [newShift, setNewShift] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCatalogItemIds, setNewCatalogItemIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch("/api/specialties?active=0&services=1");
    if (!res.ok) {
      setError("Не удалось загрузить специальности");
      setSpecialties([]);
      setServices([]);
      return;
    }
    const data: unknown = await res.json();
    const rows: SpecialtyRow[] = Array.isArray(data)
      ? data
      : ((data as { specialties?: SpecialtyRow[] }).specialties ?? []);
    const serviceList: CatalogService[] = Array.isArray(data)
      ? []
      : ((data as { services?: CatalogService[] }).services ?? []);
    setSpecialties(rows);
    setServices(serviceList);
    setDrafts(Object.fromEntries(rows.map((s) => [s.id, toDraft(s)])));
    setSelected((prev) => {
      const ids = new Set(rows.map((r) => r.id));
      return new Set([...prev].filter((id) => ids.has(id)));
    });
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return specialties;
    return specialties.filter((s) => {
      const serviceNames = (s.catalogItems ?? [])
        .map((item) => item.name)
        .concat(
          rowServiceIds(s)
            .map((id) => services.find((svc) => svc.id === id)?.name || "")
            .filter(Boolean),
        )
        .join(" ");
      return (
        s.name.toLowerCase().includes(needle) ||
        (s.description ?? "").toLowerCase().includes(needle) ||
        serviceNames.toLowerCase().includes(needle)
      );
    });
  }, [specialties, services, q]);

  function isDirty(s: SpecialtyRow): boolean {
    const d = drafts[s.id];
    if (!d) return false;
    return (
      d.name.trim() !== s.name ||
      Number(d.sortOrder) !== s.sortOrder ||
      Number(d.hourlyRate) !== s.hourlyRate ||
      Number(d.shiftRate) !== s.shiftRate ||
      d.description.trim() !== (s.description ?? "") ||
      !sameIds(d.catalogItemIds, rowServiceIds(s))
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
      body: JSON.stringify({
        name,
        sortOrder,
        hourlyRate,
        shiftRate,
        description: d.description.trim(),
        catalogItemIds: d.catalogItemIds,
      }),
    });
    setSavingId(null);
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(payload?.error || "Не удалось сохранить специальность");
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

    const maxSort = specialties.reduce((m, s) => Math.max(m, s.sortOrder), -1);

    setCreating(true);
    const res = await fetch("/api/specialties", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        sortOrder: maxSort + 1,
        hourlyRate,
        shiftRate,
        description: newDescription.trim(),
        catalogItemIds: newCatalogItemIds,
      }),
    });
    setCreating(false);
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError(
        payload?.error ||
          "Не удалось создать (возможно, такое название уже есть)",
      );
      return;
    }
    setNewName("");
    setNewHourly("");
    setNewShift("");
    setNewDescription("");
    setNewCatalogItemIds([]);
    setShowCreate(false);
    setOk("Специальность создана");
    void load();
  }

  function toggleAll() {
    const ids = filtered.map((s) => s.id);
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
      await postBulkAction("/api/specialties/bulk", action, [...selected]);
      setSelected(new Set());
      setConfirmDelete(false);
      void load();
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
      setCsvMessage(await downloadCsvExport("/api/specialties/csv"));
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
      setCsvMessage(await uploadCsvImport("/api/specialties/csv", file));
      void load();
    } catch (e) {
      setCsvMessage(e instanceof Error ? e.message : "Не удалось импортировать");
    } finally {
      setCsvBusy(false);
    }
  }

  const allSelected =
    filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  function takenServiceIds(exceptId: string): Set<string> {
    return new Set(
      specialties
        .filter((row) => row.id !== exceptId)
        .flatMap((row) => rowServiceIds(row)),
    );
  }

  return (
    <div className="w-full px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          База данных
        </p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">Ставки</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Справочник специальностей и базовые ставки. К специальности можно
          привязать несколько услуг из каталога — при добавлении любой из них в
          смету в спецификации появится запрос на эту специальность.
          Индивидуальные ставки правятся в карточке сотрудника.
        </p>
      </header>

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex w-full items-center gap-2 border-b border-[var(--line)] px-4 py-3">
          <DirectoryAddButton
            title="+ Специальность"
            icon={<IconPlusFolder />}
            onClick={() => setShowCreate((v) => !v)}
          />
          <input
            type="search"
            className="field max-w-md py-1.5 text-sm"
            placeholder="Поиск по названию…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="ml-auto flex items-center gap-1">
            <DirectorySelectionActions
              count={selected.size}
              disabled={busy}
              deleteTitle="Удалить выбранные"
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
        {ok && !error ? (
          <p className="border-b border-[var(--line)] px-4 py-2 text-sm text-[var(--accent)]">
            {ok}
          </p>
        ) : null}

        {showCreate ? (
          <div className="grid gap-3 border-b border-[var(--line)] p-4 md:grid-cols-6">
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
            <div className="text-sm md:col-span-2">
              <span className="text-[var(--muted)]">Услуги в смете</span>
              <div className="mt-1">
                <ServicePicker
                  selectedIds={newCatalogItemIds}
                  onChange={setNewCatalogItemIds}
                  services={services}
                  takenIds={new Set(specialties.flatMap((row) => rowServiceIds(row)))}
                />
              </div>
            </div>
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
            <label className="text-sm md:col-span-2">
              <span className="text-[var(--muted)]">Описание</span>
              <input
                className="field mt-1"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Комментарий к ставке…"
              />
            </label>
            <button
              type="button"
              onClick={() => void createSpecialty()}
              disabled={creating}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white md:col-span-6 md:w-fit disabled:opacity-60"
            >
              {creating ? "Создание…" : "Создать специальность"}
            </button>
          </div>
        ) : null}

        <div className="data-table-shell overflow-x-auto">
          <table className="data-table data-table--editable w-full text-left text-sm">
            <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="w-8 px-2 py-2 text-left">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    aria-label="Выбрать все"
                  />
                </th>
                <th className="w-px whitespace-nowrap px-2 py-2 text-left">
                  №
                </th>
                <th className="w-px whitespace-nowrap px-2 py-2 text-left">
                  Специальность
                </th>
                <th className="w-px whitespace-nowrap px-2 py-2 text-left">
                  Услуги
                </th>
                <th className="w-px whitespace-nowrap px-2 py-2 text-left">
                  Час
                </th>
                <th className="w-px whitespace-nowrap px-2 py-2 text-left">
                  Смена
                </th>
                <th className="w-full min-w-[12rem] px-2 py-2 text-left">
                  Описание
                </th>
                <th className="w-px whitespace-nowrap px-2 py-2 text-left">
                  Статус
                </th>
                <th className="w-10 px-2 py-2 text-left" />
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
                    } ${selected.has(s.id) ? "bg-[var(--selected)]/40" : ""}`}
                  >
                    <td className="w-8 px-2 py-2 text-left align-middle">
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleOne(s.id)}
                        aria-label={`Выбрать ${s.name}`}
                      />
                    </td>
                    <td className="w-px whitespace-nowrap px-2 py-2 text-left align-middle">
                      <input
                        type="number"
                        className={compactSortClass}
                        value={d.sortOrder}
                        onChange={(e) =>
                          updateDraft(s.id, { sortOrder: e.target.value })
                        }
                      />
                    </td>
                    <td className="w-px whitespace-nowrap px-2 py-2 text-left align-middle">
                      <input
                        className={compactNameClass}
                        value={d.name}
                        onChange={(e) =>
                          updateDraft(s.id, { name: e.target.value })
                        }
                      />
                    </td>
                    <td className="min-w-[16rem] px-2 py-2 text-left align-middle">
                      <ServicePicker
                        selectedIds={d.catalogItemIds}
                        onChange={(catalogItemIds) =>
                          updateDraft(s.id, { catalogItemIds })
                        }
                        services={services}
                        takenIds={takenServiceIds(s.id)}
                        extras={s.catalogItems ?? []}
                      />
                    </td>
                    <td className="w-px whitespace-nowrap px-2 py-2 text-left align-middle">
                      <input
                        type="number"
                        min={0}
                        step={100}
                        className={compactNumClass}
                        value={d.hourlyRate}
                        onChange={(e) =>
                          updateDraft(s.id, { hourlyRate: e.target.value })
                        }
                      />
                    </td>
                    <td className="w-px whitespace-nowrap px-2 py-2 text-left align-middle">
                      <input
                        type="number"
                        min={0}
                        step={500}
                        className={compactShiftClass}
                        value={d.shiftRate}
                        onChange={(e) =>
                          updateDraft(s.id, { shiftRate: e.target.value })
                        }
                      />
                    </td>
                    <td className="w-full min-w-[12rem] px-2 py-2 text-left align-middle">
                      <input
                        className="field w-full py-1 px-2 text-left"
                        value={d.description}
                        onChange={(e) =>
                          updateDraft(s.id, { description: e.target.value })
                        }
                        placeholder="Описание…"
                      />
                    </td>
                    <td className="w-px whitespace-nowrap px-2 py-2 text-left align-middle">
                      <button
                        type="button"
                        onClick={() => void toggleActive(s)}
                        className={
                          s.active
                            ? "text-[var(--accent)]"
                            : "text-[var(--danger)]"
                        }
                      >
                        {s.active ? "Активна" : "Отключена"}
                      </button>
                    </td>
                    <td className="w-10 px-2 py-2 text-left align-middle">
                      <DirectoryIconButton
                        title="Сохранить"
                        disabled={!dirty || savingId === s.id}
                        onClick={() => void saveRow(s)}
                      >
                        <IconSave />
                      </DirectoryIconButton>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-8 text-left text-[var(--muted)]"
                  >
                    Специальностей пока нет
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title="Удалить специальности"
        message={`Удалить выбранные специальности (${selected.size}) вместе со ставками? Если специальность уже стоит в смете, удаление не пройдёт.`}
        confirmLabel="Удалить"
        busy={busy}
        onConfirm={() => void bulk("delete")}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
