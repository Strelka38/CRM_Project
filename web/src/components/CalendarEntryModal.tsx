"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui";
import { SideDrawer } from "@/components/ui/SideDrawer";
import {
  ENTRY_KIND_LABELS,
  canCompleteTask,
  canMutateEntry,
  displayUserName,
} from "@/lib/calendar-entries";
import { formatRuDate, parseEventDate } from "@/lib/dates";
import type { CalendarEntryKind } from "@/components/CalendarEntryFormModal";

type EntryDetail = {
  id: string;
  kind: CalendarEntryKind;
  date: string;
  title: string;
  note: string;
  startTime: string | null;
  endTime: string | null;
  createdById: string;
  completedAt: string | null;
  completedById: string | null;
  responsibleUser: {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
  } | null;
  client: {
    id: string;
    companyName: string;
    contactName?: string;
    phone?: string;
  } | null;
  assignees: Array<{
    userId: string;
    user: {
      id: string;
      name: string;
      firstName: string;
      lastName: string;
    };
  }>;
  lines: Array<{
    catalogItemId: string;
    qty: number;
    catalogItem: { id: string; name: string };
  }>;
};

type Props = {
  open: boolean;
  entryId: string | null;
  onClose: () => void;
  onEdit: (entry: EntryDetail) => void;
  onDeleted: () => void;
  onChanged?: () => void;
};

export function CalendarEntryModal({
  open,
  entryId,
  onClose,
  onEdit,
  onDeleted,
  onChanged,
}: Props) {
  const { data: session } = useSession();
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open || !entryId) {
      setEntry(null);
      setError("");
      return;
    }
    let cancelled = false;
    void fetch(`/api/calendar/entries/${entryId}`)
      .then(async (r) => {
        const data = (await r.json().catch(() => null)) as EntryDetail | null;
        if (cancelled) return;
        if (!r.ok || !data) {
          setError("Не удалось загрузить");
          return;
        }
        setEntry(data);
      })
      .catch(() => {
        if (!cancelled) setError("Не удалось загрузить");
      });
    return () => {
      cancelled = true;
    };
  }, [entryId, open]);

  const canToggleComplete =
    entry &&
    entry.kind === "TASK" &&
    session?.user &&
    canCompleteTask({
      role: session.user.role,
      userId: session.user.id,
      createdById: entry.createdById,
      assigneeIds: entry.assignees.map((a) => a.userId),
    });

  const canEdit =
    entry &&
    session?.user &&
    canMutateEntry(
      session.user.role,
      entry.createdById,
      session.user.id,
      entry.kind,
    );

  const dayLabel = entry
    ? (() => {
        const d = parseEventDate(entry.date);
        return d ? formatRuDate(d) : entry.date;
      })()
    : "";

  async function remove() {
    if (!entry || !confirm("Удалить запись?")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/calendar/entries/${entry.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Не удалось удалить");
        return;
      }
      onDeleted();
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  async function toggleComplete() {
    if (!entry || !canToggleComplete) return;
    const next = !entry.completedAt;
    const res = await fetch(`/api/calendar/entries/${entry.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: next }),
    });
    if (!res.ok) {
      setError("Не удалось обновить задачу");
      return;
    }
    const data = (await res.json().catch(() => null)) as EntryDetail | null;
    if (data) setEntry({ ...entry, ...data });
    onChanged?.();
  }

  return (
    <SideDrawer open={open} onClose={onClose} labelledBy="entry-title" zIndex={55}>
      <div className="flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
          <h2 id="entry-title" className="font-display text-xl text-[var(--ink)]">
            {entry ? ENTRY_KIND_LABELS[entry.kind] : "Запись"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
          >
            Закрыть
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {error && !entry ? (
        <p className="text-sm text-[var(--danger)]">{error}</p>
      ) : !entry ? (
        <p className="text-sm text-[var(--muted)]">Загрузка…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-[var(--muted)]">Дата</p>
            <p className="text-sm font-medium">{dayLabel}</p>
          </div>

          {entry.kind === "DAY_OFF" && (
            <div>
              <p className="text-xs text-[var(--muted)]">Время</p>
              <p className="text-sm font-medium">
                {entry.startTime || "—"} — {entry.endTime || "—"}
              </p>
            </div>
          )}

          {(entry.kind === "TASK" || entry.title) && (
            <div>
              <p className="text-xs text-[var(--muted)]">
                {entry.kind === "TASK" ? "Задача" : "Название"}
              </p>
              <p className="text-sm font-medium whitespace-pre-wrap">
                {entry.title || "—"}
              </p>
              {entry.kind === "TASK" ? (
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--accent)]"
                    checked={Boolean(entry.completedAt)}
                    disabled={!canToggleComplete}
                    onChange={() => void toggleComplete()}
                  />
                  {entry.completedAt ? "Выполнена" : "Отметить выполненной"}
                </label>
              ) : null}
            </div>
          )}

          {entry.kind === "RENTAL" && (
            <>
              <div>
                <p className="text-xs text-[var(--muted)]">
                  Ответственный за выдачу
                </p>
                <p className="text-sm font-medium">
                  {entry.responsibleUser
                    ? displayUserName(entry.responsibleUser)
                    : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">Клиент</p>
                {entry.client ? (
                  <>
                    <Link
                      href={`/clients/${entry.client.id}`}
                      className="text-sm font-medium text-[var(--accent)] hover:underline"
                    >
                      {entry.client.companyName}
                    </Link>
                    {entry.client.contactName || entry.client.phone ? (
                      <p className="text-xs text-[var(--muted)]">
                        {[entry.client.contactName, entry.client.phone]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm font-medium">—</p>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs text-[var(--muted)]">Оборудование</p>
                <ul className="space-y-1">
                  {entry.lines.map((l) => (
                    <li key={l.catalogItemId} className="text-sm">
                      {l.catalogItem.name}{" "}
                      <span className="text-[var(--muted)]">× {l.qty}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {(entry.kind === "TASK" || entry.kind === "DAY_OFF") && (
            <div>
              <p className="mb-1 text-xs text-[var(--muted)]">
                {entry.kind === "DAY_OFF" ? "Кто отдыхает" : "Назначены"}
              </p>
              <ul className="space-y-1">
                {entry.assignees.map((a) => (
                  <li key={a.userId} className="text-sm font-medium">
                    {displayUserName(a.user)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {entry.note ? (
            <div>
              <p className="text-xs text-[var(--muted)]">Комментарий</p>
              <p className="text-sm whitespace-pre-wrap">{entry.note}</p>
            </div>
          ) : null}

          {error && (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          )}

          {canEdit && (
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="danger-ghost"
                size="sm"
                disabled={deleting}
                onClick={() => void remove()}
              >
                Удалить
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onEdit(entry)}
              >
                Изменить
              </Button>
            </div>
          )}
        </div>
      )}
        </div>
      </div>
    </SideDrawer>
  );
}
