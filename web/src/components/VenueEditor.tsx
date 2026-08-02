"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type VenuePhoto = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  sortOrder: number;
  createdAt: string;
};

type QuoteRow = {
  id: string;
  proposalNumber: string;
  eventName: string;
  date: string;
  lifecycle: string;
  client: string;
};

type VenueDetail = {
  id: string;
  name: string;
  address: string;
  mapUrl: string;
  comment: string;
  active: boolean;
  photos: VenuePhoto[];
  quotes: QuoteRow[];
};

const LIFE_LABEL: Record<string, string> = {
  CALCULATED: "Посчитано",
  CONFIRMED: "Подтверждено",
  CANCELLED: "Отменено",
  COMPLETED: "Завершено",
};

function photoSrc(venueId: string, photo: VenuePhoto) {
  return `/api/venues/${venueId}/photos/${photo.id}?v=${encodeURIComponent(photo.createdAt)}`;
}

export function VenueEditor({ venueId }: { venueId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [venue, setVenue] = useState<VenueDetail | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function load() {
    const res = await fetch(`/api/venues/${venueId}`);
    if (!res.ok) {
      setError("Площадка не найдена");
      setVenue(null);
      return;
    }
    setVenue(await res.json());
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  async function saveProfile() {
    if (!venue) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/venues/${venueId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: venue.name,
        address: venue.address,
        mapUrl: venue.mapUrl,
        comment: venue.comment,
        active: venue.active,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Не удалось сохранить профиль");
      return;
    }
    await load();
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/venues/${venueId}/photos`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          setError(data?.error || "Не удалось загрузить фото");
          break;
        }
      }
      await load();
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function removePhoto(photoId: string) {
    setUploading(true);
    setError("");
    try {
      const res = await fetch(`/api/venues/${venueId}/photos/${photoId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Не удалось удалить фото");
        return;
      }
      await load();
    } finally {
      setUploading(false);
    }
  }

  if (!venue && !error) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 text-[var(--muted)]">
        Загрузка…
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 text-[var(--danger)]">{error}</div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
        <button
          type="button"
          onClick={() => router.push("/venues")}
          className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-white/10"
        >
          ← Назад
        </button>
        <h1 className="font-display text-center text-2xl uppercase tracking-wide md:text-3xl">
          Профиль площадки
        </h1>
        <button
          type="button"
          disabled={saving}
          onClick={() => void saveProfile()}
          className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </header>

      {error && <p className="mb-4 text-sm text-[var(--danger)]">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] lg:col-span-2">
          <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
            Основная информация
          </h2>
          <div className="grid gap-3 p-4 md:grid-cols-2">
            <label className="block text-sm md:col-span-2">
              <span className="text-[var(--muted)]">Название</span>
              <input
                className="field mt-1"
                value={venue.name}
                onChange={(e) => setVenue({ ...venue, name: e.target.value })}
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-[var(--muted)]">Адрес</span>
              <input
                className="field mt-1"
                value={venue.address}
                onChange={(e) =>
                  setVenue({ ...venue, address: e.target.value })
                }
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-[var(--muted)]">Ссылка на точку</span>
              <input
                className="field mt-1"
                value={venue.mapUrl}
                onChange={(e) => setVenue({ ...venue, mapUrl: e.target.value })}
                placeholder="https://yandex.ru/maps/…"
              />
              {venue.mapUrl ? (
                <a
                  href={venue.mapUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs text-[var(--accent)] hover:underline"
                >
                  Открыть на карте
                </a>
              ) : null}
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="text-[var(--muted)]">Комментарий</span>
              <textarea
                className="field mt-1 min-h-[120px]"
                value={venue.comment}
                onChange={(e) =>
                  setVenue({ ...venue, comment: e.target.value })
                }
                placeholder="Контакты охраны, электриков, наличие щитков…"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={venue.active}
                onChange={(e) =>
                  setVenue({ ...venue, active: e.target.checked })
                }
              />
              Активна
            </label>
          </div>
        </section>

        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <h2 className="border-b border-[var(--line)] bg-[var(--table-head)] px-4 py-2 text-sm font-medium">
            Сводка
          </h2>
          <div className="space-y-3 p-4 text-sm">
            <div>
              <p className="text-xs text-[var(--muted)]">Фотографий</p>
              <p className="font-display text-xl">{venue.photos.length}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted)]">Привязанных КП</p>
              <p className="font-display text-xl">{venue.quotes.length}</p>
            </div>
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg">Фотографии площадки</h2>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,.png,.jpg,.jpeg"
              multiple
              className="hidden"
              onChange={(e) => void uploadPhotos(e.target.files)}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="rounded-md border border-[var(--line)] px-3 py-1.5 text-sm hover:bg-white/10 disabled:opacity-50"
            >
              {uploading ? "Загрузка…" : "Добавить фото"}
            </button>
          </div>
        </div>
        {venue.photos.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Фото ещё не добавлены. Можно прикрепить несколько снимков площадки.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {venue.photos.map((photo) => (
              <figure
                key={photo.id}
                className="group relative overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoSrc(venueId, photo)}
                  alt={photo.filename}
                  className="aspect-[4/3] w-full object-cover"
                />
                <figcaption className="truncate px-2 py-1 text-[10px] text-[var(--muted)]">
                  {photo.filename}
                </figcaption>
                <button
                  type="button"
                  disabled={uploading}
                  onClick={() => void removePhoto(photo.id)}
                  className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
                >
                  Удалить
                </button>
              </figure>
            ))}
          </div>
        )}
      </section>

      <section className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <h2 className="mb-2 font-display text-lg">Связанные КП</h2>
        {venue.quotes.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            К этой площадке ещё не привязаны сметы.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-2 py-2 text-left">КП</th>
                  <th className="px-2 py-2 text-left">Мероприятие</th>
                  <th className="px-2 py-2 text-left">Заказчик</th>
                  <th className="px-2 py-2 text-left">Дата</th>
                  <th className="px-2 py-2 text-left">Статус</th>
                </tr>
              </thead>
              <tbody>
                {venue.quotes.map((q) => (
                  <tr key={q.id} className="border-t border-[var(--line)]">
                    <td className="px-2 py-2">
                      <Link
                        href={`/quotes/${q.id}`}
                        className="text-[var(--accent)] hover:underline"
                      >
                        № {q.proposalNumber || "—"}
                      </Link>
                    </td>
                    <td className="px-2 py-2">{q.eventName || "—"}</td>
                    <td className="px-2 py-2">{q.client || "—"}</td>
                    <td className="px-2 py-2">{q.date || "—"}</td>
                    <td className="px-2 py-2">
                      {LIFE_LABEL[q.lifecycle] || q.lifecycle}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
