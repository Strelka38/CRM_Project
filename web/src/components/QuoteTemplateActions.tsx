"use client";

import { useEffect, useState } from "react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

type Manager = { id: string; name: string };

export function SaveTemplateModal({
  open,
  onClose,
  quoteId,
  managers,
  defaultOwnerId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  managers: Manager[];
  defaultOwnerId: string;
  onSaved?: () => void;
}) {
  const [name, setName] = useState("");
  const [ownerId, setOwnerId] = useState(defaultOwnerId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setOwnerId(defaultOwnerId);
      setError("");
    }
  }, [open, defaultOwnerId]);

  async function save() {
    if (!name.trim()) {
      setError("Укажите название шаблона");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/quote-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId,
          name: name.trim(),
          ownerId: ownerId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Не удалось сохранить",
        );
        return;
      }
      onSaved?.();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Сохранить как шаблон">
      <div className="mt-4 flex flex-col gap-3">
        <label className="text-sm">
          <span className="text-[var(--muted)]">Название</span>
          <input
            className="field mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Например: Свадьба стандарт"
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">За менеджером</span>
          <select
            className="field mt-1"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-[var(--muted)]">
          В шаблон войдут зоны, позиции, заметки, скидка и безнал. Дата и клиент
          задаются при создании из шаблона.
        </p>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Сохраняем…" : "Сохранить"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function DuplicateQuoteModal({
  open,
  onClose,
  quoteId,
  managers,
  defaultOwnerId,
  initialDate,
  initialDays,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  quoteId: string;
  managers: Manager[];
  defaultOwnerId: string;
  initialDate: string;
  initialDays: number;
  onCreated: (id: string) => void;
}) {
  const [date, setDate] = useState(initialDate);
  const [durationDays, setDurationDays] = useState(initialDays);
  const [ownerId, setOwnerId] = useState(defaultOwnerId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDate(initialDate);
      setDurationDays(initialDays || 1);
      setOwnerId(defaultOwnerId);
      setError("");
    }
  }, [open, initialDate, initialDays, defaultOwnerId]);

  async function submit() {
    if (!date.trim()) {
      setError("Выберите даты");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/quotes/${quoteId}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          durationDays,
          ownerId: ownerId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Не удалось скопировать",
        );
        return;
      }
      if (data.id) onCreated(data.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Копировать на другие дни">
      <div className="mt-4 flex flex-col gap-3">
        <DateRangePicker
          inline
          date={date}
          durationDays={durationDays}
          onChange={(d, days) => {
            setDate(d);
            setDurationDays(days);
          }}
        />
        <label className="text-sm">
          <span className="text-[var(--muted)]">Менеджер</span>
          <select
            className="field mt-1"
            value={ownerId}
            onChange={(e) => setOwnerId(e.target.value)}
          >
            {managers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button onClick={() => void submit()} disabled={busy}>
            {busy ? "Копируем…" : "Создать копию"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function CreateFromTemplateModal({
  open,
  onClose,
  managers,
  defaultOwnerId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  managers: Manager[];
  defaultOwnerId: string;
  onCreated: (id: string) => void;
}) {
  const [templates, setTemplates] = useState<
    Array<{ id: string; name: string; owner: { name: string } }>
  >([]);
  const [templateId, setTemplateId] = useState("");
  const [date, setDate] = useState("");
  const [durationDays, setDurationDays] = useState(1);
  const [ownerId, setOwnerId] = useState(defaultOwnerId);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDate("");
    setDurationDays(1);
    setOwnerId(defaultOwnerId);
    setError("");
    setLoading(true);
    void fetch("/api/quote-templates")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTemplates(data);
          setTemplateId(data[0]?.id || "");
        }
      })
      .finally(() => setLoading(false));
  }, [open, defaultOwnerId]);

  async function submit() {
    if (!templateId) {
      setError("Выберите шаблон");
      return;
    }
    if (!date.trim()) {
      setError("Выберите даты");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/quote-templates/${templateId}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          durationDays,
          ownerId: ownerId || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Не удалось создать",
        );
        return;
      }
      if (data.id) onCreated(data.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Создать из шаблона" className="max-w-xl">
      <div className="mt-4 flex flex-col gap-3">
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Загрузка шаблонов…</p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Шаблонов пока нет. Откройте смету и нажмите «В шаблон».
          </p>
        ) : (
          <>
            <label className="text-sm">
              <span className="text-[var(--muted)]">Шаблон</span>
              <select
                className="field mt-1"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.owner.name})
                  </option>
                ))}
              </select>
            </label>
            <DateRangePicker
              inline
              date={date}
              durationDays={durationDays}
              onChange={(d, days) => {
                setDate(d);
                setDurationDays(days);
              }}
            />
            <label className="text-sm">
              <span className="text-[var(--muted)]">Менеджер</span>
              <select
                className="field mt-1"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
              >
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={busy || loading || templates.length === 0}
          >
            {busy ? "Создаём…" : "Создать смету"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
