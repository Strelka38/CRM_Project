"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CATALOG_OWNERS } from "@/lib/catalog-owner";

type Account = {
  id: string;
  label: string;
  bankName: string;
  account: string;
  corrAccount: string;
  bik: string;
  isDefault: boolean;
  sortOrder: number;
};

type EntityDetail = {
  id: string;
  shortName: string;
  fullName: string;
  inn: string;
  ogrnip: string;
  legalAddress: string;
  actualAddress: string;
  phone: string;
  email: string;
  catalogOwner: "SHOW_MASTER" | "DIAKOM" | "NE_EVENT" | null;
  signatoryName: string;
  sealPath: string | null;
  signaturePath: string | null;
  active: boolean;
  bankAccounts: Account[];
};

const emptyAccount = (): Account => ({
  id: `new-${Math.random().toString(36).slice(2, 8)}`,
  label: "",
  bankName: "",
  account: "",
  corrAccount: "",
  bik: "",
  isDefault: false,
  sortOrder: 0,
});

export function LegalEntityEditor({ entityId }: { entityId: string }) {
  const router = useRouter();
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [bust, setBust] = useState(0);

  async function load() {
    const res = await fetch(`/api/legal-entities/${entityId}`);
    if (!res.ok) {
      setError("Юрлицо не найдено");
      setEntity(null);
      return;
    }
    setEntity(await res.json());
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityId]);

  async function save() {
    if (!entity) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/legal-entities/${entityId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shortName: entity.shortName,
        fullName: entity.fullName,
        inn: entity.inn,
        ogrnip: entity.ogrnip,
        legalAddress: entity.legalAddress,
        actualAddress: entity.actualAddress,
        phone: entity.phone,
        email: entity.email,
        catalogOwner: entity.catalogOwner,
        signatoryName: entity.signatoryName,
        active: entity.active,
        accounts: entity.bankAccounts
          .filter((a) => a.account.replace(/\D/g, "").length > 0)
          .map((a, i) => ({
          id: a.id.startsWith("new-") ? undefined : a.id,
          label: a.label,
          bankName: a.bankName,
          account: a.account,
          corrAccount: a.corrAccount,
          bik: a.bik,
          isDefault: a.isDefault,
          sortOrder: i,
        })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Не удалось сохранить");
      return;
    }
    setEntity(await res.json());
  }

  async function upload(kind: "seal" | "signature", file: File) {
    const form = new FormData();
    form.set("file", file);
    const res = await fetch(`/api/legal-entities/${entityId}/${kind}`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      setError("Не удалось загрузить изображение");
      return;
    }
    setEntity(await res.json());
    setBust((n) => n + 1);
  }

  async function removeImage(kind: "seal" | "signature") {
    const res = await fetch(`/api/legal-entities/${entityId}/${kind}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    setEntity(await res.json());
    setBust((n) => n + 1);
  }

  async function removeEntity() {
    if (!confirm("Удалить юрлицо?")) return;
    const res = await fetch(`/api/legal-entities/${entityId}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Не удалось удалить");
      return;
    }
    router.push("/legal-entities");
  }

  if (!entity && !error) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-[var(--muted)]">
        Загрузка…
      </div>
    );
  }
  if (!entity) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-[var(--danger)]">{error}</div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
        <button
          type="button"
          onClick={() => router.push("/legal-entities")}
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm"
        >
          ← Назад
        </button>
        <h1 className="text-xl font-medium">Карточка юрлица</h1>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </header>

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      <section className="mb-4 grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 md:grid-cols-2">
        <label className="text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Краткое наименование</span>
          <input
            className="field mt-1"
            value={entity.shortName}
            onChange={(e) => setEntity({ ...entity, shortName: e.target.value })}
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Полное наименование</span>
          <input
            className="field mt-1"
            value={entity.fullName}
            onChange={(e) => setEntity({ ...entity, fullName: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">ИНН</span>
          <input
            className="field mt-1"
            value={entity.inn}
            onChange={(e) => setEntity({ ...entity, inn: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">ОГРНИП</span>
          <input
            className="field mt-1"
            value={entity.ogrnip}
            onChange={(e) => setEntity({ ...entity, ogrnip: e.target.value })}
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Юридический адрес</span>
          <input
            className="field mt-1"
            value={entity.legalAddress}
            onChange={(e) => setEntity({ ...entity, legalAddress: e.target.value })}
          />
        </label>
        <label className="text-sm md:col-span-2">
          <span className="text-[var(--muted)]">Фактический адрес</span>
          <input
            className="field mt-1"
            value={entity.actualAddress}
            onChange={(e) => setEntity({ ...entity, actualAddress: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Телефон</span>
          <input
            className="field mt-1"
            value={entity.phone}
            onChange={(e) => setEntity({ ...entity, phone: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Email</span>
          <input
            className="field mt-1"
            value={entity.email}
            onChange={(e) => setEntity({ ...entity, email: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Подпись (расшифровка)</span>
          <input
            className="field mt-1"
            value={entity.signatoryName}
            onChange={(e) => setEntity({ ...entity, signatoryName: e.target.value })}
          />
        </label>
        <label className="text-sm">
          <span className="text-[var(--muted)]">Тег склада (опционально)</span>
          <select
            className="field mt-1"
            value={entity.catalogOwner || ""}
            onChange={(e) =>
              setEntity({
                ...entity,
                catalogOwner: (e.target.value || null) as EntityDetail["catalogOwner"],
              })
            }
          >
            <option value="">Нет</option>
            {CATALOG_OWNERS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={entity.active}
            onChange={(e) => setEntity({ ...entity, active: e.target.checked })}
          />
          Активно
        </label>
      </section>

      <section className="mb-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium">Расчётные счета</h2>
          <button
            type="button"
            className="rounded-md border border-[var(--line)] px-3 py-1 text-sm"
            onClick={() =>
              setEntity({
                ...entity,
                bankAccounts: [...entity.bankAccounts, emptyAccount()],
              })
            }
          >
            + Счёт
          </button>
        </div>
        <div className="space-y-3">
          {entity.bankAccounts.map((acc, idx) => (
            <div
              key={acc.id}
              className="grid gap-2 rounded-lg border border-[var(--line)] p-3 md:grid-cols-2"
            >
              <label className="text-sm">
                <span className="text-[var(--muted)]">Метка</span>
                <input
                  className="field mt-1"
                  value={acc.label}
                  onChange={(e) => {
                    const bankAccounts = entity.bankAccounts.slice();
                    bankAccounts[idx] = { ...acc, label: e.target.value };
                    setEntity({ ...entity, bankAccounts });
                  }}
                  placeholder="Сбер / Т-Банк"
                />
              </label>
              <label className="text-sm">
                <span className="text-[var(--muted)]">Банк</span>
                <input
                  className="field mt-1"
                  value={acc.bankName}
                  onChange={(e) => {
                    const bankAccounts = entity.bankAccounts.slice();
                    bankAccounts[idx] = { ...acc, bankName: e.target.value };
                    setEntity({ ...entity, bankAccounts });
                  }}
                />
              </label>
              <label className="text-sm">
                <span className="text-[var(--muted)]">Р/с</span>
                <input
                  className="field mt-1 font-mono"
                  value={acc.account}
                  onChange={(e) => {
                    const bankAccounts = entity.bankAccounts.slice();
                    bankAccounts[idx] = { ...acc, account: e.target.value };
                    setEntity({ ...entity, bankAccounts });
                  }}
                />
              </label>
              <label className="text-sm">
                <span className="text-[var(--muted)]">К/с</span>
                <input
                  className="field mt-1 font-mono"
                  value={acc.corrAccount}
                  onChange={(e) => {
                    const bankAccounts = entity.bankAccounts.slice();
                    bankAccounts[idx] = { ...acc, corrAccount: e.target.value };
                    setEntity({ ...entity, bankAccounts });
                  }}
                />
              </label>
              <label className="text-sm">
                <span className="text-[var(--muted)]">БИК</span>
                <input
                  className="field mt-1 font-mono"
                  value={acc.bik}
                  onChange={(e) => {
                    const bankAccounts = entity.bankAccounts.slice();
                    bankAccounts[idx] = { ...acc, bik: e.target.value };
                    setEntity({ ...entity, bankAccounts });
                  }}
                />
              </label>
              <div className="flex items-end justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={acc.isDefault}
                    onChange={(e) => {
                      const bankAccounts = entity.bankAccounts.map((a, i) => ({
                        ...a,
                        isDefault: i === idx ? e.target.checked : false,
                      }));
                      setEntity({ ...entity, bankAccounts });
                    }}
                  />
                  По умолчанию
                </label>
                <button
                  type="button"
                  className="text-sm text-[var(--danger)]"
                  onClick={() =>
                    setEntity({
                      ...entity,
                      bankAccounts: entity.bankAccounts.filter((_, i) => i !== idx),
                    })
                  }
                >
                  Удалить
                </button>
              </div>
            </div>
          ))}
          {entity.bankAccounts.length === 0 && (
            <p className="text-sm text-[var(--muted)]">Нет счетов</p>
          )}
        </div>
      </section>

      <section className="mb-4 grid gap-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:grid-cols-2">
        {(["seal", "signature"] as const).map((kind) => {
          const path = kind === "seal" ? entity.sealPath : entity.signaturePath;
          const label = kind === "seal" ? "Печать" : "Подпись";
          return (
            <div key={kind}>
              <p className="mb-2 text-sm text-[var(--muted)]">{label}</p>
              {path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/api/legal-entities/${entityId}/${kind}?t=${bust}`}
                  alt={label}
                  className="mb-2 h-28 w-auto rounded border border-[var(--line)] bg-white object-contain"
                />
              ) : (
                <div className="mb-2 flex h-28 items-center justify-center rounded border border-dashed border-[var(--line)] text-xs text-[var(--muted)]">
                  нет файла
                </div>
              )}
              <div className="flex gap-2">
                <label className="cursor-pointer rounded-md border border-[var(--line)] px-3 py-1 text-sm">
                  Загрузить
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(kind, file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {path && (
                  <button
                    type="button"
                    className="text-sm text-[var(--danger)]"
                    onClick={() => void removeImage(kind)}
                  >
                    Снять
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <button
        type="button"
        onClick={() => void removeEntity()}
        className="text-sm text-[var(--danger)]"
      >
        Удалить юрлицо
      </button>
    </div>
  );
}
