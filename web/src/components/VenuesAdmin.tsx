"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type VenueRow = {
  id: string;
  name: string;
  address: string;
  mapUrl: string;
  active: boolean;
  _count?: { quotes: number; photos: number };
};

export function VenuesAdmin() {
  const [venues, setVenues] = useState<VenueRow[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  async function load(search = q) {
    const params = new URLSearchParams();
    params.set("active", "0");
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/venues?${params}`);
    if (!res.ok) {
      setError("Не удалось загрузить площадки");
      setVenues([]);
      return;
    }
    setVenues(await res.json());
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

  async function createVenue() {
    setError("");
    if (!name.trim()) {
      setError("Укажите название площадки");
      return;
    }
    const res = await fetch("/api/venues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, address, mapUrl }),
    });
    if (!res.ok) {
      setError("Не удалось создать площадку");
      return;
    }
    setName("");
    setAddress("");
    setMapUrl("");
    void load(q);
  }

  async function patchVenue(id: string, data: Record<string, unknown>) {
    await fetch(`/api/venues/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    void load(q);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          CRM
        </p>
        <h1 className="mt-1 text-3xl font-light tracking-tight">Площадки</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Профили мест проведения для автоподбора в поле «Место» при составлении
          КП.
        </p>
      </header>

      <section className="mb-6 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 md:grid-cols-2">
        <label className="text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Название площадки</span>
          <input
            className="field mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Крокус Сити Холл, зал A…"
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Адрес</span>
          <input
            className="field mt-1"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Ссылка на точку</span>
          <input
            className="field mt-1"
            value={mapUrl}
            onChange={(e) => setMapUrl(e.target.value)}
            placeholder="https://yandex.ru/maps/…"
          />
        </label>
        {error && <p className="text-sm text-[var(--danger)] md:col-span-2">{error}</p>}
        <button
          type="button"
          onClick={createVenue}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white md:col-span-2 md:w-fit"
        >
          Создать площадку
        </button>
      </section>

      <div className="mb-3">
        <input
          type="search"
          className="field max-w-md"
          placeholder="Поиск по названию, адресу, комментарию…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">Площадка</th>
              <th className="px-4 py-3">Адрес</th>
              <th className="px-4 py-3">Фото</th>
              <th className="px-4 py-3">КП</th>
              <th className="px-4 py-3">Статус</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {venues.map((v) => (
              <tr key={v.id} className="border-t border-[var(--line)]">
                <td className="px-4 py-3">
                  <Link
                    href={`/venues/${v.id}`}
                    className="text-[var(--accent)] hover:underline"
                  >
                    {v.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-[var(--muted)]">
                  {v.address || "—"}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {v._count?.photos ?? 0}
                </td>
                <td className="px-4 py-3 tabular-nums">
                  {v._count?.quotes ?? 0}
                </td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => void patchVenue(v.id, { active: !v.active })}
                    className={
                      v.active ? "text-[var(--accent)]" : "text-[var(--danger)]"
                    }
                  >
                    {v.active ? "Активна" : "Отключена"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/venues/${v.id}`}
                    className="text-sm text-[var(--muted)] underline"
                  >
                    Карточка
                  </Link>
                </td>
              </tr>
            ))}
            {venues.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  Площадок пока нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
