"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Card,
  EmptyState,
  PageHeader,
  PaymentFlags,
  StatusBadge,
  type LifecycleStatus,
  LIFECYCLE_LABELS,
} from "@/components/ui";

type Quote = {
  id: string;
  proposalNumber: string;
  eventName: string;
  client: string;
  date: string;
  invoiceSent: boolean;
  paid: boolean;
  paymentComment: string;
  lifecycle: string;
};

export default function UnpaidPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  async function load() {
    const res = await fetch("/api/quotes?unpaid=1");
    const data: unknown = await res.json().catch(() => []);
    setQuotes(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function patch(id: string, data: Record<string, unknown>) {
    await fetch(`/api/quotes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    void load();
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <PageHeader
        title="Неоплаченные проекты"
        subtitle="Подтверждённые мероприятия после даты проведения — контроль оплаты"
      />

      <Card>
        {quotes.length === 0 ? (
          <EmptyState
            title="Список пуст"
            description="Неоплаченных проектов сейчас нет"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--table-head)] text-[11px] uppercase tracking-wider text-[var(--muted)]">
                <tr>
                  <th className="px-4 py-3">КП</th>
                  <th className="px-4 py-3">Дата</th>
                  <th className="px-4 py-3">Клиент</th>
                  <th className="px-4 py-3">Статус</th>
                  <th className="px-4 py-3">Оплата</th>
                </tr>
              </thead>
              <tbody>
                {quotes.map((q) => (
                  <tr
                    key={q.id}
                    className="border-t border-[var(--line)] transition-colors hover:bg-subtle"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/quotes/${q.id}`}
                        className="font-medium text-[var(--accent-deep)] hover:underline"
                      >
                        № {q.proposalNumber}
                        {q.eventName ? ` — ${q.eventName}` : ""}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)]">
                      {q.date || "—"}
                    </td>
                    <td className="px-4 py-3">{q.client || "—"}</td>
                    <td className="px-4 py-3">
                      {q.lifecycle in LIFECYCLE_LABELS ? (
                        <StatusBadge status={q.lifecycle as LifecycleStatus} />
                      ) : (
                        q.lifecycle
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <PaymentFlags
                        invoiceSent={q.invoiceSent}
                        paid={q.paid}
                        paymentComment={q.paymentComment || ""}
                        onChange={(data) => patch(q.id, data)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-3 text-xs text-[var(--muted)]">
        Красный — не оплачено · Жёлтый — счёт отправлен · Зелёный — оплачено
        (можно указать «наличкой»)
      </p>
    </div>
  );
}
