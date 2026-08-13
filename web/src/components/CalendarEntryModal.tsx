"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button, Modal } from "@/components/ui";
import {
  ENTRY_KIND_LABELS,
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
  responsibleUser: {
    id: string;
    name: string;
    firstName: string;
    lastName: string;
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
  entryId: string;
  onClose: () => void;
  onEdit: (entry: EntryDetail) => void;
  onDeleted: () => void;
};

export function CalendarEntryModal({
  entryId,
  onClose,
  onEdit,
  onDeleted,
}: Props) {
  const { data: session } = useSession();
  const [entry, setEntry] = useState<EntryDetail | null>(null);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
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
  }, [entryId]);

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

  return (
    <Modal
      open
      onClose={onClose}
      title={entry ? ENTRY_KIND_LABELS[entry.kind] : "Запись"}
      className="max-w-md"
    >
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
    </Modal>
  );
}
