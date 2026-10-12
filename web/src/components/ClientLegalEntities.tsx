"use client";

import { useEffect, useState } from "react";
import { AutoTextarea } from "@/components/ui";

export type ClientLegalEntityRow = {
  id: string;
  name: string;
  inn: string;
  legalAddress: string;
  legalDetails: string;
  sortOrder: number;
};

function EntityCard({
  clientId,
  entity,
  onSaved,
}: {
  clientId: string;
  entity: ClientLegalEntityRow;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(entity);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(entity);
  }, [entity]);

  async function save() {
    const name = draft.name.trim();
    if (!name) {
      setError("Укажите название юрлица");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/clients/${clientId}/legal-entities/${entity.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        inn: draft.inn,
        legalAddress: draft.legalAddress,
        legalDetails: draft.legalDetails,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Не удалось сохранить");
      return;
    }
    await onSaved();
  }

  async function remove() {
    if (!window.confirm(`Удалить юрлицо «${entity.name}»?`)) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/clients/${clientId}/legal-entities/${entity.id}`, {
      method: "DELETE",
    });
    setSaving(false);
    if (!res.ok) {
      setError("Не удалось удалить");
      return;
    }
    await onSaved();
  }

  return (
    <div className="rounded-lg border border-[var(--line)] p-3">
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Название юрлица</span>
          <input
            className="field mt-1"
            value={draft.name}
            placeholder="ООО «Старт» или ИП Былов"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">ИНН</span>
          <input
            className="field mt-1"
            value={draft.inn}
            onChange={(e) => setDraft({ ...draft, inn: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Юридический адрес</span>
          <input
            className="field mt-1"
            value={draft.legalAddress}
            onChange={(e) => setDraft({ ...draft, legalAddress: e.target.value })}
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Реквизиты</span>
          <AutoTextarea
            className="field mt-1"
            value={draft.legalDetails}
            placeholder="Р/с, банк, БИК, КПП…"
            onChange={(e) => setDraft({ ...draft, legalDetails: e.target.value })}
          />
        </label>
      </div>
      {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить юрлицо"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void remove()}
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm text-[var(--danger)] disabled:opacity-50"
        >
          Удалить
        </button>
      </div>
    </div>
  );
}

export function ClientLegalEntities({
  clientId,
  entities,
  onSaved,
}: {
  clientId: string;
  entities: ClientLegalEntityRow[];
  onSaved: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [inn, setInn] = useState("");
  const [legalAddress, setLegalAddress] = useState("");
  const [legalDetails, setLegalDetails] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    if (!name.trim()) {
      setError("Укажите название юрлица");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/clients/${clientId}/legal-entities`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, inn, legalAddress, legalDetails }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Не удалось добавить");
      return;
    }
    setName("");
    setInn("");
    setLegalAddress("");
    setLegalDetails("");
    setOpen(false);
    await onSaved();
  }

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2">
        <h2 className="text-sm font-medium">Юрлица</h2>
        <button
          type="button"
          onClick={() => {
            setOpen((v) => !v);
            setError("");
          }}
          className="rounded-md border border-[var(--line)] px-2.5 py-1 text-xs"
        >
          {open ? "Свернуть" : "Добавить юрлицо"}
        </button>
      </div>
      <div className="grid gap-3 p-4">
        <p className="text-xs text-[var(--muted)]">
          У компании может быть несколько юрлиц — чаще всего ООО и ИП. В договоре
          и счёте выбирается одно из них.
        </p>
        {entities.length === 0 && !open ? (
          <p className="text-sm text-[var(--muted)]">Юрлиц пока нет.</p>
        ) : null}
        {entities.map((entity) => (
          <EntityCard
            key={entity.id}
            clientId={clientId}
            entity={entity}
            onSaved={onSaved}
          />
        ))}
        {open ? (
          <div className="rounded-lg border border-dashed border-[var(--line)] p-3">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block text-sm md:col-span-2">
                <span className="text-[var(--muted)]">Название юрлица</span>
                <input
                  className="field mt-1"
                  value={name}
                  placeholder="ООО «Старт» или ИП Былов"
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">ИНН</span>
                <input
                  className="field mt-1"
                  value={inn}
                  onChange={(e) => setInn(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--muted)]">Юридический адрес</span>
                <input
                  className="field mt-1"
                  value={legalAddress}
                  onChange={(e) => setLegalAddress(e.target.value)}
                />
              </label>
              <label className="block text-sm md:col-span-2">
                <span className="text-[var(--muted)]">Реквизиты</span>
                <AutoTextarea
                  className="field mt-1"
                  value={legalDetails}
                  placeholder="Р/с, банк, БИК, КПП…"
                  onChange={(e) => setLegalDetails(e.target.value)}
                />
              </label>
            </div>
            {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
            <button
              type="button"
              disabled={saving}
              onClick={() => void create()}
              className="mt-3 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {saving ? "Добавление…" : "Добавить"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
