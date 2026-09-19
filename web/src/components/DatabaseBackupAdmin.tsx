"use client";

import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FullBackupAdmin } from "@/components/FullBackupAdmin";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import {
  countBackupTables,
  DATABASE_BACKUP_KIND,
  type DatabaseBackupCounts,
} from "@/lib/database-backup-format";

const LABELS: Array<{ key: keyof DatabaseBackupCounts; label: string }> = [
  { key: "specialties", label: "Специальности" },
  { key: "users", label: "Пользователи" },
  { key: "userSpecialties", label: "Ставки сотрудников" },
  { key: "catalogCategories", label: "Категории каталога" },
  { key: "catalogItems", label: "Позиции каталога" },
  { key: "kits", label: "Комплекты" },
  { key: "kitComponents", label: "Состав комплектов" },
  { key: "clients", label: "Клиенты" },
  { key: "freelancers", label: "Фрилансеры" },
  { key: "freelancerSpecialties", label: "Ставки фрилансеров" },
  { key: "venues", label: "Площадки" },
  { key: "venuePhotos", label: "Фото площадок" },
  { key: "vehicles", label: "Транспорт" },
  { key: "legalEntities", label: "Юрлица" },
  { key: "legalEntityBankAccounts", label: "Счета юрлиц" },
  { key: "equipmentUnits", label: "Единицы оборудования" },
  { key: "equipmentDocuments", label: "Документы оборудования" },
  { key: "quoteTemplates", label: "Шаблоны смет" },
  { key: "quotes", label: "Сметы" },
  { key: "quoteZones", label: "Зоны смет" },
  { key: "quoteBlocks", label: "Блоки и позиции" },
  { key: "quoteAssignments", label: "Запросы на персонал" },
  { key: "quoteCalcShares", label: "Доли калькуляции" },
  { key: "quoteCalcLineOverrides", label: "Переопределения строк" },
  { key: "quoteExtraExpenses", label: "Доп. расходы смет" },
  { key: "specOverrides", label: "Правки спецификаций" },
  { key: "specExtras", label: "Доп. строки спецификаций" },
  { key: "quoteComments", label: "Комментарии смет" },
  { key: "quoteAttachments", label: "Вложения смет" },
  { key: "quoteSnapshots", label: "Снимки смет" },
  { key: "quoteAuditEvents", label: "Журнал смет" },
  { key: "specRevisions", label: "Снимки спецификаций" },
];

export function DatabaseBackupAdmin() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [counts, setCounts] = useState<DatabaseBackupCounts | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pendingText, setPendingText] = useState<string | null>(null);

  async function exportJson() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/database/export", {
        credentials: "same-origin",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Не удалось экспортировать");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="([^"]+)"/)?.[1] || "crm-database.json";
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Файл экспорта скачан");
    } catch {
      setError("Не удалось экспортировать");
    } finally {
      setBusy(false);
    }
  }

  async function previewFile(file: File) {
    setError("");
    setMessage("");
    setCounts(null);
    setWarnings([]);
    try {
      const text = await file.text();
      const json = JSON.parse(text) as {
        kind?: string;
        tables?: Record<string, unknown[]>;
      };
      if (json.kind !== DATABASE_BACKUP_KIND) {
        setError("Это не файл экспорта CRM");
        return;
      }
      if (file.size > 50 * 1024 * 1024) {
        setError("Файл больше 50 МБ");
        return;
      }
      setCounts(countBackupTables(json.tables));
      setPendingText(text);
    } catch {
      setError("Не удалось прочитать JSON");
    }
  }

  async function runImport(text: string) {
    setBusy(true);
    setError("");
    setMessage("");
    setWarnings([]);
    try {
      const res = await fetch("/api/database/import", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: text,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Не удалось импортировать");
        return;
      }
      if (data.counts) setCounts(data.counts);
      const warn = Array.isArray(data.warnings) ? data.warnings : [];
      setWarnings(warn.slice(0, 40));
      const warnHint = warn.length ? ` · предупреждений: ${warn.length}` : "";
      setMessage(`Импорт выполнен${warnHint}`);
    } catch {
      setError("Не удалось импортировать");
    } finally {
      setBusy(false);
      setPendingText(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6">
      <header className="mb-8 animate-fade-up">
        <p className="text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
          CRM
        </p>
        <h1 className="mt-1 text-3xl font-medium tracking-tight">
          Экспорт и импорт базы
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Полный снимок — Postgres и медиафайлы, для бэкапа и переезда. JSON —
          только справочники, без смет, календаря и файлов.
        </p>
      </header>

      <FullBackupAdmin />

      <Card className="mt-4 p-5">
        <h2 className="text-sm font-medium text-[var(--ink)]">
          Справочники (JSON)
        </h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          Специальности, пользователи, каталог, комплекты, клиенты, площадки,
          транспорт и оборудование. Сметы, календарь, ремонты и чаты не входят.
          Фото и документы не копируются — только записи в базе.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={busy}
            onClick={() => void exportJson()}
          >
            {busy ? "…" : "Скачать экспорт"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void previewFile(file);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            Импортировать JSON
          </Button>
        </div>
        <p className="mt-3 text-xs text-[var(--muted)]">
          Файл содержит хеши паролей — храните его как конфиденциальный.
          Импорт дополняет и обновляет записи, ничего не удаляет. Ваш пароль
          не перезаписывается.
        </p>
        {error && (
          <p className="mt-3 text-sm text-[var(--danger)]">{error}</p>
        )}
        {message && (
          <p className="mt-3 text-sm text-[var(--accent-deep)]">{message}</p>
        )}
      </Card>

      {counts && (
        <Card className="mt-4 p-5">
          <h2 className="text-sm font-medium text-[var(--ink)]">Состав файла</h2>
          <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            {LABELS.map((row) => (
              <li
                key={row.key}
                className="flex justify-between gap-3 text-[var(--muted)]"
              >
                <span>{row.label}</span>
                <span className="tabular-nums text-[var(--ink)]">
                  {counts[row.key]}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {warnings.length > 0 && (
        <Card className="mt-4 p-5">
          <h2 className="text-sm font-medium text-[var(--ink)]">
            Предупреждения
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
            {warnings.map((w, i) => (
              <li key={`${i}-${w}`}>{w}</li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={!!pendingText}
        title="Импортировать базу?"
        message="Справочники и сметы будут созданы или обновлены по файлу. Позиции, блоки, разделы и назначения в сметах из файла заменятся. Существующие сметы, которых нет в файле, не удаляются. Продолжить?"
        confirmLabel="Импортировать"
        danger={false}
        busy={busy}
        onCancel={() => setPendingText(null)}
        onConfirm={() => {
          if (pendingText) void runImport(pendingText);
        }}
      />
    </div>
  );
}
