"use client";

import { useEffect, useState } from "react";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import type { DeficitScope } from "@/lib/org-prefs";
import {
  DEFAULT_SPEC_PRINT,
  SPEC_FONTS,
  SPEC_HEADER_FIELDS,
  SPEC_TABLE_FIELDS,
  type SpecPrintSettings,
} from "@/lib/spec-print";

type Draft = {
  deficitScope: DeficitScope;
  specPrint: SpecPrintSettings;
};

export function SpecWarehouseSettingsForm() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch("/api/settings")
      .then(async (res) => {
        if (!res.ok) {
          setError("Не удалось загрузить настройки");
          return;
        }
        const data = (await res.json()) as Partial<Draft>;
        setDraft({
          deficitScope: data.deficitScope === "project" ? "project" : "period",
          specPrint: data.specPrint ?? DEFAULT_SPEC_PRINT,
        });
      })
      .catch(() => setError("Не удалось загрузить настройки"));
  }, []);

  async function save() {
    if (!draft) return;
    setBusy(true);
    setError("");
    setSaved("");
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Не удалось сохранить");
      return;
    }
    setSaved("Сохранено");
  }

  const print = draft?.specPrint;

  return (
    <SettingsPageShell
      title="Спецификация и склад"
      lede="Как считать дефицит и что попадает в печать спецификации по умолчанию."
    >
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {saved ? <p className="mb-3 text-sm text-[var(--accent)]">{saved}</p> : null}
      {!draft || !print ? (
        <p className="text-sm text-[var(--muted)]">Загрузка…</p>
      ) : (
        <div className="grid gap-4">
          <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
              Дефицит
            </h2>
            <label className="grid gap-1 p-4 text-sm sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
              <span className="text-[var(--muted)]">Параметры отображения</span>
              <select
                className="field"
                value={draft.deficitScope}
                onChange={(e) =>
                  setDraft({ ...draft, deficitScope: e.target.value as DeficitScope })
                }
              >
                <option value="project">текущий проект</option>
                <option value="period">все проекты за период</option>
              </select>
            </label>
          </section>

          <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
              Печать. Настройка отображения по умолчанию
            </h2>
            <div className="grid gap-4 p-4">
              <label className="grid gap-1 text-sm sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
                <span className="text-[var(--muted)]">Шрифт</span>
                <select
                  className="field"
                  value={print.fontFamily}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      specPrint: { ...print, fontFamily: e.target.value as SpecPrintSettings["fontFamily"] },
                    })
                  }
                >
                  {SPEC_FONTS.map((font) => (
                    <option key={font} value={font}>
                      {font}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
                <span className="text-[var(--muted)]">Размер шрифта</span>
                <input
                  type="number"
                  min={0}
                  max={72}
                  className="field"
                  value={print.fontSize}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      specPrint: { ...print, fontSize: Number(e.target.value) || 0 },
                    })
                  }
                />
              </label>
              <label className="grid gap-1 text-sm sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
                <span className="text-[var(--muted)]">Ориентация</span>
                <select
                  className="field"
                  value={print.orientation}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      specPrint: {
                        ...print,
                        orientation: e.target.value === "landscape" ? "landscape" : "portrait",
                      },
                    })
                  }
                >
                  <option value="portrait">Книжная</option>
                  <option value="landscape">Альбомная</option>
                </select>
              </label>

              <fieldset className="grid gap-1 border-0 p-0">
                <legend className="mb-1 text-sm font-medium">Шапка</legend>
                {SPEC_HEADER_FIELDS.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={print.header[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          specPrint: {
                            ...print,
                            header: { ...print.header, [key]: e.target.checked },
                          },
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>

              <fieldset className="grid gap-1 border-0 p-0">
                <legend className="mb-1 text-sm font-medium">Таблица</legend>
                {SPEC_TABLE_FIELDS.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={print.table[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          specPrint: {
                            ...print,
                            table: { ...print.table, [key]: e.target.checked },
                          },
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>

              <label className="grid gap-1 text-sm sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
                <span className="text-[var(--muted)]">Добавлять пустых строк</span>
                <input
                  type="number"
                  min={0}
                  max={40}
                  className="field"
                  value={print.emptyRows}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      specPrint: { ...print, emptyRows: Number(e.target.value) || 0 },
                    })
                  }
                />
              </label>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save()}
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  {busy ? "Сохраняем…" : "Сохранить"}
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </SettingsPageShell>
  );
}
