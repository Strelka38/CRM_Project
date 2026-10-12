"use client";

import { useEffect, useState } from "react";
import type { PublicBrand } from "@/lib/brand-public";

function LogoSlot({
  src,
  invert,
  label,
  plate,
}: {
  src: string;
  invert: boolean;
  label: string;
  plate: "dark" | "paper";
}) {
  return (
    <figure className="flex flex-col items-center gap-1">
      <span
        className={`flex size-16 items-center justify-center overflow-hidden rounded-lg ${
          plate === "dark" ? "bg-neutral-950" : "bg-white"
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="size-12 object-contain"
          style={invert ? { filter: "invert(1)" } : undefined}
        />
      </span>
      <figcaption className="text-caption text-[var(--muted)]">{label}</figcaption>
    </figure>
  );
}

export function BrandSettingsForm() {
  const [brand, setBrand] = useState<PublicBrand | null>(null);
  const [crmName, setCrmName] = useState("");
  const [kpName, setKpName] = useState("");
  const [kpSite, setKpSite] = useState("");
  const [kpInvert, setKpInvert] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  function apply(next: PublicBrand) {
    setBrand(next);
    setCrmName(next.crmName);
    setKpName(next.kpName);
    setKpSite(next.kpSite);
    setKpInvert(next.kpLogoInvert);
  }

  useEffect(() => {
    void fetch("/api/settings/brand")
      .then(async (r) => {
        if (!r.ok) {
          setError("Не удалось загрузить настройки");
          return;
        }
        apply(await r.json());
      })
      .catch(() => setError("Не удалось загрузить настройки"));
  }, []);

  async function saveText() {
    setBusy(true);
    setError("");
    setSaved("");
    const res = await fetch("/api/settings/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        crmName,
        kpName,
        kpSite,
        kpLogoInvert: kpInvert,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Не удалось сохранить");
      return;
    }
    apply(await res.json());
    setSaved("Сохранено");
  }

  async function upload(kind: "crm" | "kp", file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    setSaved("");
    const form = new FormData();
    form.set("kind", kind);
    form.set("file", file);
    const res = await fetch("/api/settings/brand", { method: "POST", body: form });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Не удалось загрузить");
      return;
    }
    apply(await res.json());
    setSaved("Логотип обновлён");
  }

  async function reset(kind: "crm" | "kp") {
    setBusy(true);
    setError("");
    setSaved("");
    const res = await fetch(`/api/settings/brand?kind=${kind}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setError("Не удалось вернуть логотип");
      return;
    }
    apply(await res.json());
    setSaved("Стоит знак по умолчанию");
  }

  if (!brand) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-[var(--muted)]">
        {error || "Загрузка…"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <header className="mb-6 border-b border-[var(--line)] pb-4">
        <h1 className="font-display text-2xl">Логотип и название</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Шапка CRM и шапка коммерческого предложения. Пока файл не загружен,
          стоит знак Baikal Stage Group.
        </p>
      </header>
      {error ? <p className="mb-3 text-sm text-[var(--danger)]">{error}</p> : null}
      {saved ? <p className="mb-3 text-sm text-[var(--accent)]">{saved}</p> : null}

      <div className="grid gap-4">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
            CRM
          </h2>
          <div className="grid gap-4 p-4">
            <label className="block text-sm">
              <span className="text-[var(--muted)]">Название в шапке</span>
              <input
                className="field mt-1"
                value={crmName}
                onChange={(e) => setCrmName(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap items-end gap-4">
              <LogoSlot src={brand.crmLogoUrl} invert={false} plate="dark" label="Тёмная шапка" />
              <LogoSlot src={brand.crmLogoUrl} invert plate="paper" label="Светлая тема" />
              <div className="grid gap-2 text-sm">
                <label className="cursor-pointer rounded-md border border-[var(--line)] px-3 py-1.5">
                  Загрузить логотип
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      void upload("crm", file);
                    }}
                  />
                </label>
                {brand.crmLogoCustom ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void reset("crm")}
                    className="rounded-md border border-[var(--line)] px-3 py-1.5 text-left"
                  >
                    Знак по умолчанию
                  </button>
                ) : null}
                <p className="max-w-sm text-xs text-[var(--muted)]">
                  Светлый знак на прозрачном фоне, PNG или WebP до 2 МБ. На светлой
                  теме он перекрашивается.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
            Коммерческое предложение
          </h2>
          <div className="grid gap-4 p-4">
            <label className="block text-sm">
              <span className="text-[var(--muted)]">Название</span>
              <input
                className="field mt-1"
                value={kpName}
                onChange={(e) => setKpName(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--muted)]">Сайт</span>
              <input
                className="field mt-1"
                value={kpSite}
                onChange={(e) => setKpSite(e.target.value)}
                placeholder="baikalstagegroup.ru"
              />
            </label>
            <div className="flex flex-wrap items-end gap-4">
              <LogoSlot
                src={brand.kpLogoUrl}
                invert={brand.kpLogoCustom ? kpInvert : true}
                plate="paper"
                label="На белом листе КП"
              />
              <div className="grid gap-2 text-sm">
                <label className="cursor-pointer rounded-md border border-[var(--line)] px-3 py-1.5">
                  Загрузить логотип КП
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      void upload("kp", file);
                    }}
                  />
                </label>
                {brand.kpLogoCustom ? (
                  <>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={kpInvert}
                        onChange={(e) => setKpInvert(e.target.checked)}
                      />
                      Светлый знак, перекрасить для печати
                    </label>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void reset("kp")}
                      className="rounded-md border border-[var(--line)] px-3 py-1.5 text-left"
                    >
                      Знак по умолчанию
                    </button>
                  </>
                ) : null}
                <p className="max-w-sm text-xs text-[var(--muted)]">
                  Для печати лучше тёмный или цветной знак на прозрачном фоне.
                  Светлый, как в шапке, включите галочкой.
                </p>
              </div>
            </div>
          </div>
        </section>

        <div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void saveText()}
            className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {busy ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}
