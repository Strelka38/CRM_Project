"use client";

import { useEffect, useState } from "react";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { Modal } from "@/components/ui/Modal";
import {
  STANDARD_TEMPLATE_ID,
  parseExportTemplateSettings,
  parseExportTemplates,
  type ExportTemplate,
  type ExportTemplateSettings,
} from "@/lib/export/export-templates";
import { EXPORT_OPTION_ROWS, type QuotePrintOptions } from "@/lib/export/print-options";
import { ESTIMATE_DISCLAIMER } from "@/lib/commercial-terms";

type Row = {
  id: string;
  name: string;
  comment: string;
  note: string;
  builtin?: boolean;
  settings?: ExportTemplateSettings;
};

const BUILTIN: Row = {
  id: STANDARD_TEMPLATE_ID,
  name: "Стандартный шаблон",
  comment: "Шаблон создан автоматически",
  note: "",
  builtin: true,
};

function storedNote(text: string) {
  const trimmed = text.trim();
  return trimmed === ESTIMATE_DISCLAIMER.trim() ? "" : trimmed.slice(0, 4000);
}

export function KpTemplatesSettings() {
  const [rows, setRows] = useState<ExportTemplate[]>([]);
  const [defaultId, setDefaultId] = useState(STANDARD_TEMPLATE_ID);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [edit, setEdit] = useState<Row | null>(null);
  const [options, setOptions] = useState<ExportTemplate | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftComment, setDraftComment] = useState("");
  const [draftNote, setDraftNote] = useState("");

  async function load() {
    const res = await fetch("/api/export-templates");
    if (!res.ok) {
      setError("Не удалось загрузить шаблоны");
      return;
    }
    const data = (await res.json()) as {
      templates?: unknown;
      defaultTemplateId?: string;
    };
    setRows(parseExportTemplates(data.templates));
    setDefaultId(data.defaultTemplateId || STANDARD_TEMPLATE_ID);
  }

  useEffect(() => {
    void load().catch(() => setError("Не удалось загрузить шаблоны"));
  }, []);

  const list: Row[] = [BUILTIN, ...rows];

  async function setDefault(id: string) {
    setError("");
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kpDefaultTemplateId: id }),
    });
    if (!res.ok) {
      setError("Не удалось сохранить шаблон по умолчанию");
      return;
    }
    setDefaultId(id);
    setSaved("Сохранено");
  }

  async function create() {
    setError("");
    const res = await fetch("/api/export-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draftName,
        comment: draftComment,
        note: storedNote(draftNote),
        settings: parseExportTemplateSettings(null),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Не удалось создать шаблон");
      return;
    }
    setCreating(false);
    setDraftName("");
    setDraftComment("");
    setDraftNote("");
    await load();
    setSaved("Шаблон добавлен");
  }

  async function saveEdit() {
    if (!edit || edit.builtin) return;
    setError("");
    const res = await fetch("/api/export-templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: edit.id,
        name: edit.name,
        comment: edit.comment,
        note: storedNote(edit.note),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Не удалось сохранить");
      return;
    }
    if (defaultId === edit.id || edit.id === defaultId) {
      /* default stays */
    }
    setEdit(null);
    await load();
    setSaved("Сохранено");
  }

  async function saveOptions() {
    if (!options) return;
    setError("");
    const res = await fetch("/api/export-templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: options.id, settings: options.settings }),
    });
    if (!res.ok) {
      setError("Не удалось сохранить параметры");
      return;
    }
    setOptions(null);
    await load();
    setSaved("Сохранено");
  }

  async function remove(id: string) {
    if (!window.confirm("Удалить шаблон?")) return;
    const res = await fetch(`/api/export-templates?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setError("Не удалось удалить шаблон");
      return;
    }
    if (defaultId === id) await setDefault(STANDARD_TEMPLATE_ID);
    await load();
  }

  function toggleOption(row: (typeof EXPORT_OPTION_ROWS)[number], checked: boolean) {
    if (!options || row.kind === "gap") return;
    if (row.kind === "print") {
      setOptions({
        ...options,
        settings: {
          ...options.settings,
          print: { ...options.settings.print, [row.key]: checked } as QuotePrintOptions,
        },
      });
      return;
    }
    setOptions({
      ...options,
      settings: { ...options.settings, [row.key]: checked },
    });
  }

  return (
    <SettingsPageShell
      title="Коммерческое предложение"
      lede="Шаблоны печати КП: название, комментарий, примечание под сметой и какой брать по умолчанию."
    >
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {saved ? <p className="mb-3 text-sm text-[var(--accent)]">{saved}</p> : null}
      <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
        <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2">
          <h2 className="text-sm font-medium">Шаблоны</h2>
          <button
            type="button"
            className="text-sm text-[var(--accent)]"
            onClick={() => setCreating(true)}
          >
            добавить
          </button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--line)] text-left text-[var(--muted)]">
              <th className="w-10 px-3 py-2 font-medium">№</th>
              <th className="px-3 py-2 font-medium">Наименование</th>
              <th className="px-3 py-2 font-medium">Комментарий</th>
              <th className="px-3 py-2 text-center font-medium">По умолчанию</th>
              <th className="w-28 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((row, index) => (
              <tr key={row.id} className="border-b border-[var(--line)] last:border-0">
                <td className="px-3 py-2 tabular-nums">{index + 1}</td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2 text-[var(--muted)]">{row.comment}</td>
                <td className="px-3 py-2 text-center">
                  <button
                    type="button"
                    aria-label={
                      defaultId === row.id ? "Шаблон по умолчанию" : "Сделать шаблоном по умолчанию"
                    }
                    className={defaultId === row.id ? "text-[var(--accent)]" : "text-[var(--muted)]"}
                    onClick={() => void setDefault(row.id)}
                  >
                    {defaultId === row.id ? "+" : "·"}
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  <span className="inline-flex gap-2">
                    {row.builtin ? null : (
                      <button
                        type="button"
                        className="text-[var(--muted)] hover:text-[var(--ink)]"
                        aria-label="Параметры шаблона"
                        onClick={() => {
                          const found = rows.find((item) => item.id === row.id);
                          if (found) setOptions(found);
                        }}
                      >
                        ⚙
                      </button>
                    )}
                    {row.builtin ? null : (
                      <button
                        type="button"
                        className="text-[var(--muted)] hover:text-[var(--ink)]"
                        aria-label="Изменить шаблон"
                        onClick={() =>
                          setEdit({
                            ...row,
                            note: row.note.trim() || ESTIMATE_DISCLAIMER,
                          })
                        }
                      >
                        ✎
                      </button>
                    )}
                    {row.builtin ? null : (
                      <button
                        type="button"
                        className="text-[var(--danger)]"
                        aria-label="Удалить шаблон"
                        onClick={() => void remove(row.id)}
                      >
                        ×
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Modal open={creating} onClose={() => setCreating(false)} title="Добавление шаблона" className="max-w-xl">
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Наименование</span>
          <input className="field mt-1" value={draftName} onChange={(e) => setDraftName(e.target.value)} />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-[var(--muted)]">Комментарий</span>
          <input
            className="field mt-1"
            value={draftComment}
            onChange={(e) => setDraftComment(e.target.value)}
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="text-[var(--muted)]">Примечание под сметой</span>
          <textarea
            className="field mt-1 min-h-28 text-xs leading-snug"
            value={draftNote}
            placeholder={ESTIMATE_DISCLAIMER}
            onChange={(e) => setDraftNote(e.target.value)}
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="px-3 py-1.5 text-sm text-[var(--muted)]" onClick={() => setCreating(false)}>
            Закрыть
          </button>
          <button
            type="button"
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white"
            onClick={() => void create()}
          >
            Сохранить
          </button>
        </div>
      </Modal>

      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title="Редактирование шаблона" className="max-w-xl">
        {edit ? (
          <>
            <label className="block text-sm">
              <span className="text-[var(--muted)]">Наименование</span>
              <input
                className="field mt-1"
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="text-[var(--muted)]">Комментарий</span>
              <input
                className="field mt-1"
                value={edit.comment}
                onChange={(e) => setEdit({ ...edit, comment: e.target.value })}
              />
            </label>
            <label className="mt-3 block text-sm">
              <span className="text-[var(--muted)]">Примечание под сметой</span>
              <textarea
                className="field mt-1 min-h-36 text-xs leading-snug"
                value={edit.note}
                onChange={(e) => setEdit({ ...edit, note: e.target.value })}
              />
              <span className="mt-1 block text-xs text-[var(--muted)]">
                Печатается под итогом, если у сметы не задано своё примечание и выбран этот шаблон.
              </span>
            </label>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={defaultId === edit.id}
                onChange={(e) => {
                  if (e.target.checked) void setDefault(edit.id);
                }}
              />
              Использовать по умолчанию
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="px-3 py-1.5 text-sm text-[var(--muted)]" onClick={() => setEdit(null)}>
                Закрыть
              </button>
              <button
                type="button"
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white"
                onClick={() => void saveEdit()}
              >
                Сохранить
              </button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(options)}
        onClose={() => setOptions(null)}
        title="Параметры шаблона"
        className="max-w-lg"
      >
        {options ? (
          <>
            <div className="max-h-80 overflow-y-auto text-sm">
              {EXPORT_OPTION_ROWS.map((row, index) => {
                if (row.kind === "gap") return <div key={`gap-${index}`} className="my-2 h-px bg-[var(--line)]" />;
                const checked =
                  row.kind === "print"
                    ? options.settings.print[row.key]
                    : options.settings[row.key];
                return (
                  <label key={`${row.kind}-${row.key}`} className="flex items-start gap-2 py-1">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={checked}
                      onChange={(e) => toggleOption(row, e.target.checked)}
                    />
                    {row.label}
                  </label>
                );
              })}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="px-3 py-1.5 text-sm text-[var(--muted)]" onClick={() => setOptions(null)}>
                Закрыть
              </button>
              <button
                type="button"
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white"
                onClick={() => void saveOptions()}
              >
                Сохранить
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </SettingsPageShell>
  );
}
