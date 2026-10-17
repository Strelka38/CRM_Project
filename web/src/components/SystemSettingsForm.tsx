"use client";

import { useEffect, useState } from "react";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { CURRENCIES, type CurrencyId } from "@/lib/org-prefs";
import { DEFAULT_TIMEZONE, TIMEZONES, resolveTimezone } from "@/lib/timezone";

type Payload = {
  masterTimezone: string;
  currency: CurrencyId;
  showWhatsNew: boolean;
};

function zoneOptionLabel(offset: string, label: string) {
  const negative = offset.includes("-");
  const hours = offset.replace("UTC", "").replace("+", "").replace("-", "");
  return `(${negative ? "-" : "+"}${hours.padStart(2, "0")}:00 UTC) ${label}`;
}

function clockLabel(timeZone: string, now: Date) {
  const zone = resolveTimezone(timeZone);
  const date = new Intl.DateTimeFormat("ru-RU", {
    timeZone: zone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("ru-RU", {
    timeZone: zone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);
  return `${date} ${time}`;
}

export function SystemSettingsForm() {
  const [draft, setDraft] = useState<Payload | null>(null);
  const [now, setNow] = useState(() => new Date());
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
        const data = (await res.json()) as Payload;
        setDraft({
          masterTimezone: data.masterTimezone || DEFAULT_TIMEZONE,
          currency: data.currency || "RUB",
          showWhatsNew: data.showWhatsNew !== false,
        });
      })
      .catch(() => setError("Не удалось загрузить настройки"));
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
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
    const data = (await res.json()) as Payload;
    setDraft({
      masterTimezone: data.masterTimezone,
      currency: data.currency,
      showWhatsNew: data.showWhatsNew,
    });
    setSaved("Сохранено");
  }

  return (
    <SettingsPageShell
      title="Общие настройки"
      lede="Часовой пояс организации, валюта документов и показ заметок об обновлениях."
    >
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {saved ? <p className="mb-3 text-sm text-[var(--accent)]">{saved}</p> : null}
      {!draft ? (
        <p className="text-sm text-[var(--muted)]">Загрузка…</p>
      ) : (
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
            Общие настройки
          </h2>
          <div className="grid gap-4 p-4">
            <label className="grid gap-1 text-sm sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
              <span className="text-[var(--muted)]">Часовой пояс</span>
              <select
                className="field"
                value={draft.masterTimezone}
                onChange={(e) => setDraft({ ...draft, masterTimezone: e.target.value })}
              >
                {TIMEZONES.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zoneOptionLabel(zone.offset, zone.label)}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid gap-1 text-sm sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
              <span className="text-[var(--muted)]">Текущая дата</span>
              <span className="tabular-nums">{clockLabel(draft.masterTimezone, now)}</span>
            </div>
            <label className="grid gap-1 text-sm sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
              <span className="text-[var(--muted)]">Валюта</span>
              <select
                className="field"
                value={draft.currency}
                onChange={(e) =>
                  setDraft({ ...draft, currency: e.target.value as CurrencyId })
                }
              >
                {CURRENCIES.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm sm:grid-cols-[14rem_minmax(0,1fr)] sm:items-center">
              <span className="text-[var(--muted)]">Показывать «Что нового»</span>
              <select
                className="field"
                value={draft.showWhatsNew ? "1" : "0"}
                onChange={(e) => setDraft({ ...draft, showWhatsNew: e.target.value === "1" })}
              >
                <option value="1">да</option>
                <option value="0">нет</option>
              </select>
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
      )}
    </SettingsPageShell>
  );
}
