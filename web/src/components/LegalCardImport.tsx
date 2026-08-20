"use client";

import { useState } from "react";
import {
  cardPreviewToClientPatch,
  type LegalCardPreview,
} from "@/lib/legal-card-parse";

type Props = {
  onConfirm: (patch: ReturnType<typeof cardPreviewToClientPatch>) => Promise<void> | void;
  confirmLabel?: string;
};

export function LegalCardImport({ onConfirm, confirmLabel = "Подтвердить" }: Props) {
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<LegalCardPreview | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function parse(payload: FormData | { text: string }) {
    setBusy(true);
    setError("");
    const res =
      payload instanceof FormData
        ? await fetch("/api/legal/parse-card", { method: "POST", body: payload })
        : await fetch("/api/legal/parse-card", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Не удалось разобрать");
      setPreview(null);
      return;
    }
    const data = await res.json();
    setPreview(data.preview);
    setWarnings(Array.isArray(data.warnings) ? data.warnings : []);
    if (typeof data.rawText === "string" && data.rawText && !text) {
      setText(data.rawText);
    }
  }

  async function confirm() {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm(cardPreviewToClientPatch(preview));
      setPreview(null);
      setText("");
      setWarnings([]);
    } catch (e) {
      setError(
        e instanceof Error && e.message.trim()
          ? e.message
          : "Не удалось записать реквизиты",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
      <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
        Карточка предприятия
      </h2>
      <div className="grid gap-3 p-4">
        <p className="text-xs text-[var(--muted)]">
          Вставьте текст или загрузите .txt / .rtf / .doc / .docx. В базу ничего не
          пишется, пока не нажмёте «{confirmLabel}».
        </p>
        <textarea
          className="field min-h-[120px] text-sm"
          placeholder="Карточка предприятия…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !text.trim()}
            onClick={() => void parse({ text })}
            className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-40"
          >
            Разобрать текст
          </button>
          <label className="cursor-pointer rounded-md border border-[var(--line)] px-3 py-1.5 text-sm">
            Файл…
            <input
              type="file"
              accept=".txt,.rtf,.doc,.docx,text/plain"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const form = new FormData();
                form.set("file", file);
                if (text.trim()) form.set("text", text);
                void parse(form);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        {preview && (
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel-muted)] p-3 text-sm">
            <dl className="grid gap-1 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[var(--muted)]">Наименование</dt>
                <dd>{preview.companyName || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">ИНН</dt>
                <dd className="font-mono">{preview.inn || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">ОГРНИП</dt>
                <dd className="font-mono">{preview.ogrnip || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--muted)]">Телефон</dt>
                <dd>{preview.phone || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-[var(--muted)]">Адрес</dt>
                <dd>{preview.legalAddress || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-[var(--muted)]">Email</dt>
                <dd>{preview.email || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-[var(--muted)]">Банк</dt>
                <dd>
                  {preview.banks.length === 0
                    ? "—"
                    : preview.banks.map((b) => (
                        <div key={b.account || b.bankName}>
                          {b.label ? `${b.label}: ` : ""}
                          {b.bankName} р/с {b.account} БИК {b.bik}
                        </div>
                      ))}
                </dd>
              </div>
            </dl>
            {warnings.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">
                {warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirm()}
              className="mt-3 rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              {confirmLabel}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
