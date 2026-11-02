"use client";

import { useState } from "react";

export type ClientContactRow = {
  id: string;
  name: string;
  phone: string;
  email: string;
  sortOrder: number;
};

function contactError(data: unknown, fallback: string) {
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") {
    return data.error;
  }
  return fallback;
}

function ContactCard({
  clientId,
  contact,
  onSaved,
}: {
  clientId: string;
  contact: ClientContactRow;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(contact);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/clients/${clientId}/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        phone: draft.phone,
        email: draft.email,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(contactError(await res.json().catch(() => ({})), "Не удалось сохранить"));
      return;
    }
    await onSaved();
  }

  async function remove() {
    const label = contact.name.trim() || contact.phone.trim() || "контакт";
    if (!window.confirm(`Удалить контактное лицо «${label}»?`)) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/clients/${clientId}/contacts/${contact.id}`, {
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
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Имя</span>
          <input
            className="field mt-1"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Телефон</span>
          <input
            className="field mt-1"
            value={draft.phone}
            onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Email</span>
          <input
            type="email"
            className="field mt-1"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          />
        </label>
      </div>
      {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-md bg-[var(--solid)] px-3 py-1.5 text-sm text-[var(--on-solid)] disabled:opacity-50"
        >
          Сохранить
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void remove()}
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50"
        >
          Удалить
        </button>
      </div>
    </div>
  );
}

export function ClientContacts({
  clientId,
  contacts,
  onSaved,
}: {
  clientId: string;
  contacts: ClientContactRow[];
  onSaved: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function add() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/clients/${clientId}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, phone, email }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(contactError(await res.json().catch(() => ({})), "Не удалось добавить"));
      return;
    }
    setName("");
    setPhone("");
    setEmail("");
    await onSaved();
  }

  return (
    <div className="md:col-span-2">
      <p className="text-sm text-[var(--muted)]">Контактные лица</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Первое в списке — основной контакт. В смете можно выбрать, кого вывести в шапку КП.
      </p>
      <div className="mt-3 grid gap-3">
        {contacts.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Контактных лиц пока нет.</p>
        ) : (
          contacts.map((contact) => (
            <ContactCard
              key={`${contact.id}:${contact.name}:${contact.phone}:${contact.email}`}
              clientId={clientId}
              contact={contact}
              onSaved={onSaved}
            />
          ))
        )}
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Имя</span>
          <input
            className="field mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Телефон</span>
          <input
            className="field mt-1"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Email</span>
          <input
            type="email"
            className="field mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      </div>
      {error ? <p className="mt-2 text-sm text-[var(--danger)]">{error}</p> : null}
      <button
        type="button"
        disabled={saving}
        onClick={() => void add()}
        className="mt-3 rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-50"
      >
        Добавить контакт
      </button>
    </div>
  );
}
