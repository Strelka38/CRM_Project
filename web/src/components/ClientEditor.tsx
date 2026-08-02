"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format";

type ProjectRow = {
  id: string;
  proposalNumber: string;
  eventName: string;
  date: string;
  lifecycle: string;
  paid: boolean;
  revenue: number;
  laborCost: number;
  profit: number;
  countsForStats: boolean;
};

type ClientDetail = {
  id: string;
  companyName: string;
  contactName: string;
  phone: string;
  email: string;
  comment: string;
  inn: string;
  legalAddress: string;
  legalDetails: string;
  active: boolean;
  stats: {
    projectCount: number;
    totalProjects: number;
    revenue: number;
    laborCost: number;
    profit: number;
    paidRevenue: number;
  };
  projects: ProjectRow[];
};

const LIFE_LABEL: Record<string, string> = {
  CALCULATED: "Посчитано",
  CONFIRMED: "Подтверждено",
  CANCELLED: "Отменено",
  COMPLETED: "Завершено",
};

export function ClientEditor({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch(`/api/clients/${clientId}`);
    if (!res.ok) {
      setError("Клиент не найден");
      setClient(null);
      return;
    }
    setClient(await res.json());
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  async function saveProfile() {
    if (!client) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/clients/${clientId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: client.companyName,
        contactName: client.contactName,
        phone: client.phone,
        email: client.email,
        comment: client.comment,
        inn: client.inn,
        legalAddress: client.legalAddress,
        legalDetails: client.legalDetails,
        active: client.active,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Не удалось сохранить профиль");
      return;
    }
    await load();
  }

  if (!client && !error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 text-[var(--muted)]">
        Загрузка…
      </div>
    );
  }

  if (!client) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 text-[var(--danger)]">{error}</div>
    );
  }

  const { stats } = client;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
        <button
          type="button"
          onClick={() => router.push("/clients")}
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-white/10"
        >
          ← Назад
        </button>
        <h1 className="font-display text-center text-2xl uppercase tracking-wide md:text-3xl">
          Профиль клиента
        </h1>
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveProfile()}
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
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <label className="block text-sm md:col-span-2">
              <span className="text-[var(--muted)]">Название компании</span>
              <input
                className="field mt-1"
                value={client.companyName}
                onChange={(e) =>
                  setClient({ ...client, companyName: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--muted)]">Контактное лицо</span>
              <input
                className="field mt-1"
                value={client.contactName}
                onChange={(e) =>
                  setClient({ ...client, contactName: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--muted)]">Телефон</span>
              <input
                className="field mt-1"
                value={client.phone}
                onChange={(e) =>
                  setClient({ ...client, phone: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--muted)]">Email</span>
              <input
                type="email"
                className="field mt-1"
                value={client.email}
                onChange={(e) =>
                  setClient({ ...client, email: e.target.value })
                }
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--muted)]">ИНН</span>
              <input
                className="field mt-1"
                value={client.inn}
                onChange={(e) => setClient({ ...client, inn: e.target.value })}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-[var(--muted)]">Юридический адрес</span>
              <input
                className="field mt-1"
                value={client.legalAddress}
                onChange={(e) =>
                  setClient({ ...client, legalAddress: e.target.value })
                }
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-[var(--muted)]">Юр. реквизиты</span>
              <textarea
                className="field mt-1 min-h-[80px]"
                value={client.legalDetails}
                onChange={(e) =>
                  setClient({ ...client, legalDetails: e.target.value })
                }
                placeholder="Р/с, банк, БИК, КПП…"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-[var(--muted)]">Комментарий</span>
              <textarea
                className="field mt-1 min-h-[80px]"
                value={client.comment}
                onChange={(e) =>
                  setClient({ ...client, comment: e.target.value })
                }
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={client.active}
                onChange={(e) =>
                  setClient({ ...client, active: e.target.checked })
                }
              />
              Активен
            </label>
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
              Прибыльность
            </h2>
            <div className="space-y-3 p-4 text-sm">
              <div>
                <p className="text-xs text-[var(--muted)]">Выручка</p>
                <p className="font-display text-xl">
                  {formatMoney(stats.revenue)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Затраты (персонал)</p>
                <p className="font-display text-xl">
                  {formatMoney(stats.laborCost)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Прибыль</p>
                <p
                  className={`font-display text-2xl ${
                    stats.profit >= 0 ? "text-[var(--accent)]" : "text-[var(--danger)]"
                  }`}
                >
                  {formatMoney(stats.profit)}
                </p>
              </div>
              <div className="border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
                <p>
                  Проектов в статистике: {stats.projectCount} из{" "}
                  {stats.totalProjects}
                </p>
                <p className="mt-1">
                  Оплачено: {formatMoney(stats.paidRevenue)}
                </p>
                <p className="mt-2">
                  Учитываются подтверждённые и завершённые КП. Прибыль = выручка
                  − выплаты персоналу.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="mb-2 font-display text-lg">Проекты</h2>
        {client.projects.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            К этому клиенту ещё не привязаны сметы.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-2 py-2 text-left">КП</th>
                  <th className="px-2 py-2 text-left">Мероприятие</th>
                  <th className="px-2 py-2 text-left">Дата</th>
                  <th className="px-2 py-2 text-left">Статус</th>
                  <th className="px-2 py-2 text-right">Выручка</th>
                  <th className="px-2 py-2 text-right">ЗП</th>
                  <th className="px-2 py-2 text-right">Прибыль</th>
                </tr>
              </thead>
              <tbody>
                {client.projects.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-t border-[var(--line)] ${
                      p.countsForStats ? "" : "opacity-60"
                    }`}
                  >
                    <td className="px-2 py-2">
                      <Link
                        href={`/quotes/${p.id}`}
                        className="text-[var(--accent)] hover:underline"
                      >
                        № {p.proposalNumber || "—"}
                      </Link>
                    </td>
                    <td className="px-2 py-2">{p.eventName || "—"}</td>
                    <td className="px-2 py-2">{p.date || "—"}</td>
                    <td className="px-2 py-2">
                      {LIFE_LABEL[p.lifecycle] || p.lifecycle}
                      {p.paid ? " · оплачено" : ""}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatMoney(p.revenue)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatMoney(p.laborCost)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {formatMoney(p.profit)}
                    </td>
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
