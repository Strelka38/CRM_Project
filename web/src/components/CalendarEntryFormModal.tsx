"use client";

import { useEffect, useState } from "react";
import {
  CatalogPicker,
  type PickedCatalogItem,
  type PickedKit,
} from "@/components/CatalogPicker";
import { Button, Modal } from "@/components/ui";
import {
  ENTRY_KIND_LABELS,
  displayUserName,
} from "@/lib/calendar-entries";
import { formatRuDate, parseEventDate } from "@/lib/dates";

export type CalendarEntryKind = "RENTAL" | "TASK" | "DAY_OFF";

type UserOption = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  active: boolean;
};

type LineDraft = {
  catalogItemId: string;
  name: string;
  qty: number;
};

type EntryPayload = {
  id: string;
  kind: CalendarEntryKind;
  date: string;
  title: string;
  note: string;
  startTime: string | null;
  endTime: string | null;
  responsibleUserId: string | null;
  assignees: Array<{ userId: string }>;
  lines: Array<{ catalogItemId: string; qty: number; catalogItem: { name: string } }>;
};

type Props = {
  open: boolean;
  kind: CalendarEntryKind;
  dateKey: string;
  /** If set — edit mode */
  entryId?: string | null;
  onClose: () => void;
  onSaved: () => void;
};

export function CalendarEntryFormModal({
  open,
  kind,
  dateKey,
  entryId,
  onClose,
  onSaved,
}: Props) {
  const [users, setUsers] = useState<UserOption[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const dayLabel = (() => {
    const d = parseEventDate(dateKey);
    return d ? formatRuDate(d) : dateKey;
  })();

  useEffect(() => {
    if (!open) return;
    setError("");
    void fetch("/api/users")
      .then(async (r) => {
        const data: unknown = await r.json().catch(() => []);
        setUsers(Array.isArray(data) ? (data as UserOption[]) : []);
      })
      .catch(() => setUsers([]));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!entryId) {
      setTitle("");
      setNote("");
      setResponsibleUserId("");
      setAssigneeIds([]);
      setStartTime("09:00");
      setEndTime("18:00");
      setLines([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    void fetch(`/api/calendar/entries/${entryId}`)
      .then(async (r) => {
        const data = (await r.json().catch(() => null)) as EntryPayload | null;
        if (!r.ok || !data) {
          setError("Не удалось загрузить запись");
          return;
        }
        setTitle(data.title || "");
        setNote(data.note || "");
        setResponsibleUserId(data.responsibleUserId || "");
        setAssigneeIds(data.assignees.map((a) => a.userId));
        setStartTime(data.startTime || "09:00");
        setEndTime(data.endTime || "18:00");
        setLines(
          data.lines.map((l) => ({
            catalogItemId: l.catalogItemId,
            name: l.catalogItem.name,
            qty: l.qty,
          })),
        );
      })
      .finally(() => setLoading(false));
  }, [open, entryId]);

  const activeUsers = users.filter((u) => u.active);

  function toggleAssignee(id: string) {
    setAssigneeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function addLine(catalogItemId: string, name: string, qty: number) {
    setLines((prev) => {
      const existing = prev.find((l) => l.catalogItemId === catalogItemId);
      if (existing) {
        return prev.map((l) =>
          l.catalogItemId === catalogItemId
            ? { ...l, qty: l.qty + Math.max(1, qty) }
            : l,
        );
      }
      return [...prev, { catalogItemId, name, qty: Math.max(1, qty) }];
    });
  }

  function onPickItem(item: PickedCatalogItem, qty = 1) {
    addLine(item.id, item.name, qty);
    setPickerOpen(false);
  }

  function onPickKit(kit: PickedKit, qty = 1) {
    const mult = Math.max(1, qty);
    for (const c of kit.components) {
      addLine(
        c.catalogItem.id,
        c.catalogItem.name,
        (Number(c.qty) || 0) * mult,
      );
    }
    setPickerOpen(false);
  }

  async function submit() {
    setSaving(true);
    setError("");
    try {
      const body: Record<string, unknown> = {
        date: dateKey,
        title,
        note,
      };
      if (kind === "RENTAL") {
        body.responsibleUserId = responsibleUserId || null;
        body.lines = lines.map((l) => ({
          catalogItemId: l.catalogItemId,
          qty: l.qty,
        }));
      }
      if (kind === "TASK" || kind === "DAY_OFF") {
        body.assigneeIds = assigneeIds;
      }
      if (kind === "DAY_OFF") {
        body.startTime = startTime;
        body.endTime = endTime;
      }

      const res = await fetch(
        entryId ? `/api/calendar/entries/${entryId}` : "/api/calendar/entries",
        {
          method: entryId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entryId ? body : { ...body, kind }),
        },
      );
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setError(
          typeof data?.error === "string"
            ? data.error
            : "Не удалось сохранить",
        );
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={() => {
          if (pickerOpen) {
            setPickerOpen(false);
            return;
          }
          onClose();
        }}
        title={`${entryId ? "Изменить" : "Создать"}: ${ENTRY_KIND_LABELS[kind]}`}
        className="max-w-lg"
      >
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Загрузка…</p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--muted)]">Дата: {dayLabel}</p>

            {kind === "TASK" && (
              <label className="block space-y-1">
                <span className="text-xs text-[var(--muted)]">Задача</span>
                <textarea
                  className="field min-h-[4.5rem] w-full"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Что нужно сделать"
                />
              </label>
            )}

            {kind === "RENTAL" && (
              <>
                <label className="block space-y-1">
                  <span className="text-xs text-[var(--muted)]">
                    Название (необязательно)
                  </span>
                  <input
                    className="field w-full"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Аренда оборудования"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs text-[var(--muted)]">
                    Ответственный за выдачу
                  </span>
                  <select
                    className="field w-full"
                    value={responsibleUserId}
                    onChange={(e) => setResponsibleUserId(e.target.value)}
                  >
                    <option value="">Выберите сотрудника</option>
                    {activeUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {displayUserName(u)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--muted)]">
                      Оборудование
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPickerOpen(true)}
                    >
                      Добавить со склада
                    </Button>
                  </div>
                  {lines.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">
                      Позиции не выбраны
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {lines.map((l) => (
                        <li
                          key={l.catalogItemId}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {l.name}
                          </span>
                          <input
                            type="number"
                            min={1}
                            className="field !w-16 px-1.5 py-1 text-center"
                            value={l.qty}
                            onChange={(e) => {
                              const n = Math.max(
                                1,
                                Math.round(Number(e.target.value) || 1),
                              );
                              setLines((prev) =>
                                prev.map((x) =>
                                  x.catalogItemId === l.catalogItemId
                                    ? { ...x, qty: n }
                                    : x,
                                ),
                              );
                            }}
                          />
                          <button
                            type="button"
                            className="text-xs text-[var(--danger)]"
                            onClick={() =>
                              setLines((prev) =>
                                prev.filter(
                                  (x) => x.catalogItemId !== l.catalogItemId,
                                ),
                              )
                            }
                          >
                            Убрать
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}

            {kind === "DAY_OFF" && (
              <>
                <label className="block space-y-1">
                  <span className="text-xs text-[var(--muted)]">Сотрудник</span>
                  <select
                    className="field w-full"
                    value={assigneeIds[0] || ""}
                    onChange={(e) =>
                      setAssigneeIds(e.target.value ? [e.target.value] : [])
                    }
                  >
                    <option value="">Выберите сотрудника</option>
                    {activeUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {displayUserName(u)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs text-[var(--muted)]">С</span>
                    <input
                      type="time"
                      className="field w-full"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-[var(--muted)]">До</span>
                    <input
                      type="time"
                      className="field w-full"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                    />
                  </label>
                </div>
              </>
            )}

            {kind === "TASK" && (
              <div className="space-y-1.5">
                <span className="text-xs text-[var(--muted)]">
                  Кто назначен
                </span>
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-[var(--line)] p-2">
                  {activeUsers.length === 0 ? (
                    <p className="text-sm text-[var(--muted)]">Нет сотрудников</p>
                  ) : (
                    activeUsers.map((u) => (
                      <label
                        key={u.id}
                        className="flex cursor-pointer items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={assigneeIds.includes(u.id)}
                          onChange={() => toggleAssignee(u.id)}
                        />
                        {displayUserName(u)}
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}

            <label className="block space-y-1">
              <span className="text-xs text-[var(--muted)]">
                Комментарий (необязательно)
              </span>
              <textarea
                className="field min-h-[3rem] w-full"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            {error && (
              <p className="text-sm text-[var(--danger)]">{error}</p>
            )}

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={saving}
              >
                Отмена
              </Button>
              <Button type="button" onClick={() => void submit()} disabled={saving}>
                {saving ? "Сохранение…" : "Сохранить"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <CatalogPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPickItem={onPickItem}
        onPickKit={onPickKit}
        eventDate={dateKey}
        durationDays={1}
      />
    </>
  );
}
