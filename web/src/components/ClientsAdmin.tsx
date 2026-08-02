"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type ClientRow = {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  inn: string;
  active: boolean;
  _count?: { quotes: number };
};

export function ClientsAdmin() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  async function load(search = q) {
    const params = new URLSearchParams();
    params.set("active", "0");
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/clients?${params}`);
    if (!res.ok) {
      setError("Не удалось загрузить клиентов");
      setClients([]);
      return;
    }
    setClients(await res.json());
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

  async function createClient() {
    setError("");
    if (!companyName.trim()) {
      setError("Укажите название компании");
      return;
    }
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName, contactName, phone, email }),
    });
    if (!res.ok) {
      setError("Не удалось создать клиента");
      return;
    }
    setCompanyName("");
    setContactName("");
    setPhone("");
    setEmail("");
    void load(q);
  }

  async function patchClient(id: string, data: Record<string, unknown>) {
    await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    void load(q);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">CRM</p>
        <h1 className="mt-1 text-3xl font-light tracking-tight">Клиенты</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Профили заказчиков для КП и статистики прибыльности проектов.
        </p>
      </header>

      <section className="mb-6 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 md:grid-cols-2">
        <label className="text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Название компании</span>
          <input
            className="field mt-1"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Контактное лицо</span>
          <input
            className="field mt-1"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Телефон</span>
          <input
            className="field mt-1"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Email</span>
          <input
            type="email"
            className="field mt-1"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-[var(--danger)] md:col-span-2">{error}</p>}
        <button
          type="button"
          onClick={createClient}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white md:col-span-2 md:w-fit"
        >
          Создать клиента
        </button>
      </section>

      <div className="mb-3">
        <input
          type="search"
          className="field max-w-md"
          placeholder="Поиск по компании, контакту, телефону, ИНН…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Компания</th>
              <th className="px-4 py-3">Контакт</th>
              <th className="px-4 py-3">Телефон</th>
              <th className="px-4 py-3">КП</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3">
                  <Link
                    href={`/clients/${c.id}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {c.companyName}
                  </Link>
                  {c.inn ? (
                    <span className="mt-0.5 block text-xs text-[var(--muted)]">
                      ИНН {c.inn}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">{c.contactName || "—"}</td>
                <td className="px-4 py-3">{c.phone || "—"}</td>
                <td className="px-4 py-3 tabular-nums">
                  {c._count?.quotes ?? 0}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() =>
                      void patchClient(c.id, { active: !c.active })
                    }
                    className={
                      c.active ? "text-[var(--accent)]" : "text-[var(--danger)]"
                    }
                  >
                    {c.active ? "Активен" : "Отключён"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/clients/${c.id}`}
                    className="text-sm text-[var(--muted)] underline"
                  >
                    Карточка
                  </Link>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  Клиентов пока нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
