"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  EmptyState,
  PageHeader,
  StatusBadge,
  TableSkeleton,
  type LifecycleStatus,
  LIFECYCLE_LABELS,
} from "@/components/ui";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DateRangePicker } from "@/components/DateRangePicker";
import { CreateFromTemplateModal } from "@/components/QuoteTemplateActions";
import {
  DirectoryAddButton,
  DirectoryCardLink,
  DirectoryCsvMenu,
  DirectorySelectionActions,
  IconPlusDoc,
  IconTemplate,
  downloadCsvExport,
  postBulkAction,
  uploadCsvImport,
} from "@/components/DirectoryToolbar";
import {
  endDateFromDuration,
  formatRuDate,
  parseEventDate,
  rangesOverlap,
} from "@/lib/dates";
import { isManager as roleIsManager, isQuoteOwnerRole } from "@/lib/roles";

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
  const isManager = roleIsManager(session?.user?.role);
  const isBrigadier = session?.user?.role === "BRIGADIER";
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [copying, setCopying] = useState(false);
  const [fromTemplateOpen, setFromTemplateOpen] = useState(false);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [defaultOwnerId, setDefaultOwnerId] = useState("");
  const [periodDate, setPeriodDate] = useState("");
  const [periodDays, setPeriodDays] = useState(1);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvMessage, setCsvMessage] = useState("");
  const csvImportRef = useRef<HTMLInputElement>(null);

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
            .filter((u) => isQuoteOwnerRole(u.role) && u.active)
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
    if (pendingDelete.length === 0) return;
    setDeleting(true);
    try {
      await postBulkAction("/api/quotes/bulk", "delete", pendingDelete);
      setPendingDelete([]);
      setSelectedIds(new Set());
      void load();
    } catch {
      setError("Не все выбранные сметы удалось удалить");
    } finally {
      setDeleting(false);
    }
  }

  async function copySelectedQuotes() {
    const selected = quotes.filter((quote) => selectedIds.has(quote.id));
    if (selected.length === 0) return;
    setCopying(true);
    setError("");
    try {
      const results = await Promise.all(
        selected.map((quote) =>
          fetch(`/api/quotes/${quote.id}/duplicate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date: quote.date || "",
              durationDays: Math.max(1, quote.durationDays || 1),
            }),
          }),
        ),
      );
      if (results.some((res) => !res.ok)) {
        setError("Не все выбранные сметы удалось скопировать");
        return;
      }
      setSelectedIds(new Set());
      await load();
    } finally {
      setCopying(false);
    }
  }

  function toggleQuote(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const filteredQuotes = useMemo(() => {
    const periodStart = parseEventDate(periodDate);
    const matching = periodStart
      ? quotes.filter((q) => {
          const start = parseEventDate(q.date);
          if (!start) return false;
          const days = Math.max(1, periodDays || 1);
          return rangesOverlap(start, q.durationDays || 1, periodStart, days);
        })
      : quotes;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return [...matching].sort((a, b) => {
      const aDate = parseEventDate(a.date);
      const bDate = parseEventDate(b.date);
      if (!aDate && !bDate) return b.updatedAt.localeCompare(a.updatedAt);
      if (!aDate) return 1;
      if (!bDate) return -1;

      const aDistance = Math.abs(aDate.getTime() - today.getTime());
      const bDistance = Math.abs(bDate.getTime() - today.getTime());
      return aDistance - bDistance || bDate.getTime() - aDate.getTime();
    });
  }, [quotes, periodDate, periodDays]);

  const allVisibleSelected =
    filteredQuotes.length > 0 &&
    filteredQuotes.every((quote) => selectedIds.has(quote.id));

  function toggleAllVisible() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredQuotes.forEach((quote) => next.delete(quote.id));
      } else {
        filteredQuotes.forEach((quote) => next.add(quote.id));
      }
      return next;
    });
  }

  async function exportCsv() {
    setCsvBusy(true);
    setCsvMessage("");
    try {
      setCsvMessage(await downloadCsvExport("/api/quotes/csv"));
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
      setCsvMessage(await uploadCsvImport("/api/quotes/csv", file));
      void load();
    } catch (e) {
      setCsvMessage(e instanceof Error ? e.message : "Не удалось импортировать");
    } finally {
      setCsvBusy(false);
    }
  }

  return (
    <div className="w-full px-3 py-4 md:px-6 md:py-6">
      <PageHeader
        title={isManager ? "Сметы" : "Мероприятия"}
        subtitle={
          isManager
            ? "КП с контролем склада, статусами и календарём"
            : isBrigadier
              ? "Все мероприятия — спецификации и назначения сотрудников"
              : "Мероприятия, на которые вас назначили"
        }
      />

      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex w-full flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-3">
          {isManager ? (
            <>
              <DirectoryAddButton
                title={creating ? "Создаём…" : "Новая смета"}
                icon={<IconPlusDoc />}
                disabled={creating}
                onClick={() => void createQuote()}
              />
              <DirectoryAddButton
                title="Из шаблона"
                icon={<IconTemplate />}
                disabled={creating}
                onClick={() => setFromTemplateOpen(true)}
              />
            </>
          ) : null}
          <div className="min-w-[12rem] max-w-[16rem] flex-1">
            <DateRangePicker
              date={periodDate}
              durationDays={periodDays}
              onChange={(date, days) => {
                setPeriodDate(date);
                setPeriodDays(days);
              }}
              label="Поиск по датам"
              emptyLabel="Все даты"
            />
          </div>
          <div className="ml-auto flex items-center gap-1">
            {isManager ? (
              <DirectorySelectionActions
                count={selectedIds.size}
                disabled={copying || deleting}
                onDelete={() => setPendingDelete([...selectedIds])}
                onCopy={() => void copySelectedQuotes()}
              />
            ) : null}
            <DirectoryCsvMenu
              busy={csvBusy}
              onExport={() => void exportCsv()}
              onImport={
                isManager ? () => csvImportRef.current?.click() : undefined
              }
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
          />
        ) : filteredQuotes.length === 0 ? (
          <EmptyState
            title={isManager ? "Нет смет за период" : "Нет мероприятий за период"}
            description="Измените даты или очистите фильтр, чтобы увидеть весь список"
          />
        ) : (
          <>
            <ul className="divide-y divide-[var(--line)] md:hidden">
              {filteredQuotes.map((q) => (
                <li
                  key={q.id}
                  className={
                    selectedIds.has(q.id)
                      ? "flex items-start gap-2 bg-[var(--selected)] px-3 py-3"
                      : "flex items-start gap-2 px-3 py-3"
                  }
                >
                  {isManager ? (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(q.id)}
                      aria-label={`Выбрать смету № ${q.proposalNumber}`}
                      className="mt-1 size-4 shrink-0 accent-[var(--accent)]"
                      onChange={() => toggleQuote(q.id)}
                    />
                  ) : null}
                  <Link
                    href={`/quotes/${q.id}`}
                    className="min-w-0 flex-1"
                  >
                    <p className="font-medium text-[var(--accent-deep)]">
                      № {q.proposalNumber}
                      {q.eventName ? ` — ${q.eventName}` : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      {formatQuoteDates(q.date, q.durationDays)}
                      {q.client ? ` · ${q.client}` : ""}
                    </p>
                    <div className="mt-1.5">
                      {isLifecycle(q.lifecycle) ? (
                        <StatusBadge status={q.lifecycle} />
                      ) : (
                        q.lifecycle
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="data-table-shell hidden overflow-x-auto md:block">
              <table className="data-table w-full text-left text-sm">
            <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wider text-[var(--muted)]">
              <tr>
                {isManager ? (
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      aria-label="Выбрать все сметы"
                      className="size-4 accent-[var(--accent)]"
                      onChange={toggleAllVisible}
                    />
                  </th>
                ) : null}
                <th className="px-4 py-3 text-left">№ / мероприятие</th>
                <th className="px-4 py-3 text-left">Дата</th>
                <th className="px-4 py-3 text-left">Статус</th>
                <th className="px-4 py-3 text-left">Клиент</th>
                <th className="px-4 py-3 text-left">Автор</th>
                <th className="px-4 py-3 text-left">Блоков</th>
                <th className="w-12 px-4 py-3 text-left" />
              </tr>
            </thead>
            <tbody>
              {filteredQuotes.map((q) => (
                <tr
                  key={q.id}
                  className={
                    selectedIds.has(q.id)
                      ? "border-t border-[var(--line)] bg-[var(--selected)] transition-colors"
                      : "border-t border-[var(--line)] transition-colors hover:bg-subtle"
                  }
                >
                  {isManager ? (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(q.id)}
                        aria-label={`Выбрать смету № ${q.proposalNumber}`}
                        className="size-4 accent-[var(--accent)]"
                        onChange={() => toggleQuote(q.id)}
                      />
                    </td>
                  ) : null}
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
                  <td className="px-4 py-3 text-left">{q._count.blocks}</td>
                  <td className="px-4 py-3 text-left">
                    <DirectoryCardLink href={`/quotes/${q.id}`} />
                  </td>
                </tr>
              ))}
            </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <ConfirmDialog
        open={pendingDelete.length > 0}
        title={
          pendingDelete.length > 1
            ? `Удалить ${pendingDelete.length} сметы?`
            : "Удалить смету?"
        }
        message="Выбранные сметы и связанные данные будут удалены без возможности восстановления."
        busy={deleting}
        onConfirm={removeQuote}
        onCancel={() => setPendingDelete([])}
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
