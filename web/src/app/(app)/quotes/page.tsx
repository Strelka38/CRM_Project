"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
  TableSkeleton,
  type LifecycleStatus,
  LIFECYCLE_LABELS,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { CreateFromTemplateModal } from "@/components/QuoteTemplateActions";
import { endDateFromDuration, formatRuDate, parseEventDate } from "@/lib/dates";

type QuoteRow = {
  id: string;
  proposalNumber: string;
  eventName: string;
  date: string;
  durationDays: number;
  client: string;
  lifecycle: string;
  updatedAt: string;
  owner: { name: string };
  _count: { blocks: number };
};

type ManagerOption = { id: string; name: string };

function isLifecycle(value: string): value is LifecycleStatus {
  return value in LIFECYCLE_LABELS;
}

function formatQuoteDates(date: string, durationDays: number) {
  const start = parseEventDate(date);
  if (!start) return date || "—";
  const days = Math.max(1, durationDays || 1);
  if (days <= 1) return formatRuDate(start);
  return `${formatRuDate(start)} — ${formatRuDate(endDateFromDuration(start, days))}`;
}

export default function QuotesPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const isManager = session?.user?.role === "MANAGER";
  const isBrigadier = session?.user?.role === "BRIGADIER";
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [fromTemplateOpen, setFromTemplateOpen] = useState(false);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [defaultOwnerId, setDefaultOwnerId] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/quotes");
      if (res.status === 401) {
        router.push("/login?callbackUrl=/quotes");
        return;
      }
      const data: unknown = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data)) {
        setQuotes([]);
        setError("Не удалось загрузить сметы. Попробуйте выйти и войти снова.");
        return;
      }
      setQuotes(data);
      setError("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!isManager) return;
    void fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then(
        (
          list: Array<{
            id: string;
            name: string;
            role: string;
            active: boolean;
          }>,
        ) => {
          if (!Array.isArray(list)) return;
          const ms = list
            .filter((u) => u.role === "MANAGER" && u.active)
            .map((u) => ({ id: u.id, name: u.name }));
          setManagers(ms);
          setDefaultOwnerId(ms[0]?.id || "");
        },
      )
      .catch(() => {});
  }, [isManager]);

  async function createQuote() {
    setCreating(true);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const text = await res.text();
      const data = text
        ? (JSON.parse(text) as { id?: string; error?: string })
        : {};
      if (res.status === 401) {
        router.push("/login?callbackUrl=/quotes");
        return;
      }
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Не удалось создать смету",
        );
        return;
      }
      if (data.id) router.push(`/quotes/${data.id}`);
    } catch {
      setError("Не удалось создать смету");
    } finally {
      setCreating(false);
    }
  }

  async function removeQuote() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await fetch(`/api/quotes/${pendingDelete}`, { method: "DELETE" });
      setPendingDelete(null);
      void load();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      <PageHeader
        title={isManager ? "Сметы" : "Мероприятия"}
        subtitle={
          isManager
            ? "КП с контролем склада, статусами и календарём"
            : isBrigadier
              ? "Все мероприятия — спецификации и назначения сотрудников"
              : "Мероприятия, на которые вас назначили"
        }
        actions={
          isManager ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={creating}
                onClick={() => setFromTemplateOpen(true)}
              >
                Из шаблона
              </Button>
              <Button disabled={creating} onClick={createQuote}>
                {creating ? "Создаём…" : "Новая смета"}
              </Button>
            </div>
          ) : undefined
        }
      />

      {error && (
        <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>
      )}

      <Card>
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : quotes.length === 0 ? (
          <EmptyState
            title={isManager ? "Пока нет смет" : "Пока нет мероприятий"}
            description={
              isManager
                ? "Создайте первую смету — она появится в списке и календаре"
                : isBrigadier
                  ? "Когда менеджер создаст мероприятие, оно появится здесь"
                  : "Когда вас назначат на мероприятие, оно появится здесь"
            }
            action={
              isManager ? (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={creating}
                    onClick={() => setFromTemplateOpen(true)}
                  >
                    Из шаблона
                  </Button>
                  <Button disabled={creating} onClick={createQuote}>
                    {creating ? "Создаём…" : "Новая смета"}
                  </Button>
                </div>
              ) : undefined
            }
          />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--table-head)] text-[11px] uppercase tracking-wider text-[var(--muted)]">
              <tr>
                <th className="px-4 py-3">№ / мероприятие</th>
                <th className="px-4 py-3">Дата</th>
                <th className="px-4 py-3">Статус</th>
                <th className="px-4 py-3">Клиент</th>
                <th className="px-4 py-3">Автор</th>
                <th className="px-4 py-3">Блоков</th>
                <th className="px-4 py-3" />
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
                      className="font-medium text-[var(--accent-deep)] hover:text-[var(--accent)] hover:underline"
                    >
                      № {q.proposalNumber}
                      {q.eventName ? ` — ${q.eventName}` : ""}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {formatQuoteDates(q.date, q.durationDays)}
                  </td>
                  <td className="px-4 py-3">
                    {isLifecycle(q.lifecycle) ? (
                      <StatusBadge status={q.lifecycle} />
                    ) : (
                      q.lifecycle
                    )}
                  </td>
                  <td className="px-4 py-3">{q.client || "—"}</td>
                  <td className="px-4 py-3">{q.owner.name}</td>
                  <td className="px-4 py-3">{q._count.blocks}</td>
                  <td className="px-4 py-3 text-right">
                    {isManager ? (
                      <Button
                        variant="danger-ghost"
                        size="sm"
                        onClick={() => setPendingDelete(q.id)}
                      >
                        Удалить
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Удалить смету?"
        message="Смета и связанные данные будут удалены без возможности восстановления."
        busy={deleting}
        onConfirm={removeQuote}
        onCancel={() => setPendingDelete(null)}
      />

      {isManager && (
        <CreateFromTemplateModal
          open={fromTemplateOpen}
          onClose={() => setFromTemplateOpen(false)}
          managers={managers}
          defaultOwnerId={defaultOwnerId}
          onCreated={(id) => {
            setFromTemplateOpen(false);
            router.push(`/quotes/${id}`);
          }}
        />
      )}
    </div>
  );
}
