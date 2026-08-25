"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

type FullBackupListItem = {
  filename: string;
  size: number;
  mtime: string;
};

function formatBytes(n: number) {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} ГБ`;
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU");
}

export function FullBackupAdmin() {
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [backups, setBackups] = useState<FullBackupListItem[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/database/full-backup", {
      credentials: "same-origin",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Не удалось получить список снимков");
    }
    setBackups(Array.isArray(data.backups) ? data.backups : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    refresh()
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Ошибка загрузки");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function createSnapshot() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/database/full-backup", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Не удалось создать снимок");
        return;
      }
      await refresh();
      const name = data.backup?.filename as string | undefined;
      setMessage(
        name ? `Снимок сохранён: ${name}` : "Снимок сохранён на диск",
      );
    } catch {
      setError("Не удалось создать снимок");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="text-sm font-medium text-[var(--ink)]">Полный снимок</h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Postgres и файлы из uploads. Нужен для переезда на другой сервер и
        восстановления после сбоя. Восстановление только с сервера:{" "}
        <code className="text-[var(--ink)]">./scripts/restore.sh</code>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={busy}
          onClick={() => void createSnapshot()}
        >
          {busy ? "Создание…" : "Создать снимок"}
        </Button>
      </div>
      {error && <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      {message && (
        <p className="mt-3 text-sm text-[var(--accent-deep)]">{message}</p>
      )}
      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Загрузка списка…</p>
        ) : backups.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Снимков пока нет. Они появляются здесь и в каталоге{" "}
            <code className="text-[var(--ink)]">./backups</code> на сервере.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--line)]">
            {backups.map((item) => (
              <li
                key={item.filename}
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
              >
                <div>
                  <div className="font-medium text-[var(--ink)]">
                    {item.filename}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {formatWhen(item.mtime)} · {formatBytes(item.size)}
                  </div>
                </div>
                <a
                  href={`/api/database/full-backup?file=${encodeURIComponent(item.filename)}`}
                  className="text-sm text-[var(--accent)] hover:underline"
                >
                  Скачать
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
