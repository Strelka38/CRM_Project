"use client";

import Link from "next/link";
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ActionSheet, Button, type ActionSheetGroup } from "@/components/ui";
import { cn } from "@/lib/cn";

const ICON_BTN =
  "rounded-md p-1.5 transition-colors hover:bg-[var(--header-hover)] disabled:opacity-40";

function PlusBadge() {
  return (
    <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-[var(--panel)] text-caption font-bold leading-none text-[var(--accent)] ring-1 ring-[var(--line)]">
      +
    </span>
  );
}

export function DirectoryIconButton({
  title,
  onClick,
  disabled,
  danger,
  href,
  children,
  className,
}: {
  title: string;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  const cls = cn(
    ICON_BTN,
    danger ? "text-[var(--danger)]" : "text-[var(--muted)] hover:text-[var(--ink)]",
    className,
  );
  if (href) {
    return (
      <Link href={href} title={title} aria-label={title} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cls}
    >
      {children}
    </button>
  );
}

export function IconPlusPerson() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 19.2c1.6-3 4-4.4 6.5-4.4s4.9 1.4 6.5 4.4" />
    </svg>
  );
}

export function IconPlusFolder() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M3 7.5V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8.5" />
    </svg>
  );
}

export function IconPlusDoc() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M7 3.5h7.5L19.5 9v11A1.5 1.5 0 0 1 18 21.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M14.5 3.5V9h5" />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  );
}

export function IconCard() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M7 3.5h10a3.5 3.5 0 0 1 3.5 3.5v7A3.5 3.5 0 0 1 17 17.5h-3.2L12 21l-1.8-3.5H7A3.5 3.5 0 0 1 3.5 14V7A3.5 3.5 0 0 1 7 3.5Z" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
      <path d="M12 11v4" />
    </svg>
  );
}

export function IconKey() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="8" cy="14" r="3.2" />
      <path d="M11 14h9v3M17 14v3" />
    </svg>
  );
}

export function IconSave() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M5 5h11l3 3v11H5V5Z" />
      <path d="M8 5v5h8V5M8 19v-5h8v5" />
    </svg>
  );
}

export function IconEdit() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M4 20h4L19 9l-4-4L4 16v4Z" />
      <path d="M13.5 6.5 17.5 10.5" />
    </svg>
  );
}

export function IconTemplate() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M7 3.5h7.5L19.5 9v11A1.5 1.5 0 0 1 18 21.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M14.5 3.5V9h5M9 13h6M9 16.5h4" />
    </svg>
  );
}

export function IconExcel() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M7 3.5h7.5L19.5 9v11A1.5 1.5 0 0 1 18 21.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
      <path d="M14.5 3.5V9h5" />
      <path d="m9 13.5 2.4 3.5L9 20.5M14.5 13.5 12.1 17l2.4 3.5" />
    </svg>
  );
}

export function IconCheck() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
      <path d="m5 13 4.5 4.5L19 7" />
    </svg>
  );
}

export function IconSeed() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <ellipse cx="12" cy="7" rx="7" ry="3" />
      <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
      <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M12 3v12" />
      <path d="m8 7 4-4 4 4" />
      <path d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}

export function DirectoryAddButton({
  title,
  onClick,
  disabled,
  icon,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "relative rounded-md p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--header-hover)] hover:text-[var(--ink)] disabled:opacity-40",
      )}
    >
      {icon ?? <IconPlusFolder />}
      <PlusBadge />
    </button>
  );
}

export function DirectorySelectionActions({
  count,
  onDelete,
  onCopy,
  extra,
  disabled,
  deleteTitle = "Отключить выбранные",
}: {
  count: number;
  onDelete?: () => void;
  onCopy?: () => void;
  extra?: ReactNode;
  disabled?: boolean;
  deleteTitle?: string;
}) {
  if (count <= 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-0.5 rounded-md border border-[var(--accent)]/30 bg-[var(--selected)] px-0.5 py-0.5 animate-fade-up">
      {extra}
      {onDelete ? (
        <DirectoryIconButton
          title={deleteTitle}
          danger
          disabled={disabled}
          onClick={onDelete}
        >
          <IconTrash />
        </DirectoryIconButton>
      ) : null}
      {onCopy ? (
        <DirectoryIconButton
          title="Копировать"
          disabled={disabled}
          onClick={onCopy}
          className="text-[var(--ink)]"
        >
          <IconCopy />
        </DirectoryIconButton>
      ) : null}
    </div>
  );
}

export function DirectoryCsvMenu({
  onExport,
  onExportExcel,
  excelDisabled,
  excelHint,
  onImport,
  busy,
  exportLabel = "Экспорт CSV",
  importLabel = "Импорт CSV",
  extraExport,
}: {
  onExport: () => void;
  onExportExcel?: () => void;
  excelDisabled?: boolean;
  excelHint?: string;
  onImport?: () => void;
  busy?: boolean;
  exportLabel?: string;
  importLabel?: string;
  extraExport?: { label: string; onSelect: () => void };
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function run(fn: () => void) {
    setOpen(false);
    fn();
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        title="Экспорт"
        aria-label="Экспорт"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="rounded-md p-1.5 text-[var(--muted)] hover:bg-[var(--header-hover)] hover:text-[var(--ink)]"
      >
        <ExportIcon />
      </button>
      {open ? (
        <div className="absolute right-0 z-30 mt-1 min-w-56 rounded-md border border-[var(--line)] bg-[var(--panel)] py-1 shadow-lg">
          <button
            type="button"
            disabled={busy}
            className="flex w-full px-3 py-1.5 text-left text-sm text-[var(--ink)] hover:bg-[var(--header-hover)] disabled:opacity-40"
            onClick={() => run(onExport)}
          >
            {busy ? `${exportLabel}…` : exportLabel}
          </button>
          {extraExport ? (
            <button
              type="button"
              disabled={busy}
              className="flex w-full px-3 py-1.5 text-left text-sm text-[var(--ink)] hover:bg-[var(--header-hover)] disabled:opacity-40"
              onClick={() => run(extraExport.onSelect)}
            >
              {extraExport.label}
            </button>
          ) : null}
          {onExportExcel ? (
            <button
              type="button"
              disabled={busy || excelDisabled}
              title={excelDisabled ? excelHint : undefined}
              className="flex w-full px-3 py-1.5 text-left text-sm text-[var(--ink)] hover:bg-[var(--header-hover)] disabled:opacity-40"
              onClick={() => run(onExportExcel)}
            >
              {busy ? "Excel…" : "Экспорт Excel (сводная)"}
            </button>
          ) : null}
          {onImport ? (
            <button
              type="button"
              disabled={busy}
              className="flex w-full px-3 py-1.5 text-left text-sm text-[var(--ink)] hover:bg-[var(--header-hover)] disabled:opacity-40"
              onClick={() => run(onImport)}
            >
              {busy ? `${importLabel}…` : importLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function IconKebab() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

/**
 * Тулбар справочника на мобильном: поиск на всю ширину, одно главное действие
 * кнопкой, остальное — в шите с подписями.
 *
 * Стоит рядом с десктопным тулбаром (`md:hidden` против `hidden md:flex`), а не
 * вместо него: на десктопе иконки с `title` быстрее, чем шит в два тапа.
 */
export function DirectoryMobileBar({
  q,
  onQ,
  searchPlaceholder,
  filter,
  primary,
  sheetTitle,
  groups = [],
  csv,
  selection,
}: {
  /** Без `onQ` строка поиска не рисуется — не во всех справочниках она есть. */
  q?: string;
  onQ?: (value: string) => void;
  searchPlaceholder?: string;
  /** Свой фильтр на всю ширину над кнопками: выбор периода, статуса. */
  filter?: ReactNode;
  /** Главное действие — обычно «добавить». Остаётся кнопкой, а не уходит в шит. */
  primary?: { label: string; onClick: () => void };
  sheetTitle: string;
  /** Группы поверх стандартной «Таблица» с CSV. */
  groups?: ActionSheetGroup[];
  csv?: {
    busy?: boolean;
    onExport: () => void;
    onImport?: () => void;
    exportLabel?: string;
    importLabel?: string;
    extraExport?: { label: string; onSelect: () => void };
  };
  selection?: {
    count: number;
    busy?: boolean;
    onCopy?: () => void;
    onDelete?: () => void;
    deleteLabel?: string;
    /** Свои массовые операции отдельной строкой под счётчиком. */
    extra?: ReactNode;
  };
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const sheetGroups: ActionSheetGroup[] = [
    ...groups,
    ...(csv
      ? [
          {
            title: "Таблица",
            items: [
              {
                label: csv.busy
                  ? `${csv.exportLabel ?? "Экспорт CSV"}…`
                  : csv.exportLabel ?? "Экспорт CSV",
                disabled: csv.busy,
                onSelect: csv.onExport,
              },
              ...(csv.extraExport
                ? [
                    {
                      label: csv.extraExport.label,
                      disabled: csv.busy,
                      onSelect: csv.extraExport.onSelect,
                    },
                  ]
                : []),
              ...(csv.onImport
                ? [
                    {
                      label: csv.busy
                        ? `${csv.importLabel ?? "Импорт CSV"}…`
                        : csv.importLabel ?? "Импорт CSV",
                      disabled: csv.busy,
                      onSelect: csv.onImport,
                    },
                  ]
                : []),
            ],
          },
        ]
      : []),
  ];

  const count = selection?.count ?? 0;

  const kebab =
    sheetGroups.length > 0 ? (
      <Button
        variant="icon"
        className="tap-target shrink-0 px-3"
        aria-label="Ещё действия"
        onClick={() => setSheetOpen(true)}
      >
        <IconKebab />
      </Button>
    ) : null;

  return (
    <>
      <div className="flex flex-col gap-2 border-b border-[var(--line)] px-3 py-3 md:hidden">
        {onQ ? (
          <div className="flex items-center gap-2">
            <input
              type="search"
              className="field min-w-0 flex-1 text-sm"
              placeholder={searchPlaceholder}
              value={q ?? ""}
              onChange={(e) => onQ(e.target.value)}
            />
            {kebab}
          </div>
        ) : null}

        {filter}

        {/* Без поиска кебабу некуда встать — сажаем его в ряд с главной
            кнопкой, иначе он висит отдельной строкой у правого края. */}
        {primary || (!onQ && kebab) ? (
          <div className="flex items-center gap-2">
            {primary ? (
              <Button
                variant="secondary"
                className="tap-target min-w-0 flex-1"
                onClick={primary.onClick}
              >
                {primary.label}
              </Button>
            ) : null}
            {onQ ? null : kebab}
          </div>
        ) : null}

        {count > 0 ? (
          <div className="animate-fade-up flex flex-col gap-2 rounded-md border border-[var(--accent)]/30 bg-[var(--selected)] px-3 py-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm">Выбрано: {count}</span>
              {selection?.onCopy ? (
                <button
                  type="button"
                  disabled={selection.busy}
                  onClick={selection.onCopy}
                  className="tap-target ml-auto px-2 text-sm text-[var(--ink)] disabled:opacity-40"
                >
                  Копировать
                </button>
              ) : null}
              {selection?.onDelete ? (
                <button
                  type="button"
                  disabled={selection.busy}
                  onClick={selection.onDelete}
                  className={cn(
                    "tap-target px-2 text-sm text-[var(--danger)] disabled:opacity-40",
                    !selection.onCopy && "ml-auto",
                  )}
                >
                  {selection.deleteLabel ?? "Отключить"}
                </button>
              ) : null}
            </div>
            {selection?.extra}
          </div>
        ) : null}
      </div>

      <ActionSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={sheetTitle}
        groups={sheetGroups}
      />
    </>
  );
}

export function DirectoryCardLink({
  href,
  label = "Карточка",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="inline-flex rounded-md p-1 text-[var(--accent)] hover:bg-[var(--header-hover)]"
    >
      <IconCard />
    </Link>
  );
}

export function downloadCsvRows(filename: string, rows: string[][]): string {
  const esc = (cell: string) => {
    if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
    return cell;
  };
  const csv = `\uFEFF${rows.map((r) => r.map((c) => esc(c ?? "")).join(",")).join("\r\n")}\r\n`;
  const blob = new Blob([csv], { type: "text/csv; charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(objectUrl);
  return "CSV скачан";
}

export async function downloadCsvExport(
  url: string,
  doneMessage = "CSV скачан",
): Promise<string> {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      typeof data.error === "string" ? data.error : "Не удалось экспортировать",
    );
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download =
    res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ||
    "export.csv";
  a.click();
  URL.revokeObjectURL(objectUrl);
  return doneMessage;
}

export async function uploadCsvImport(
  url: string,
  file: File,
): Promise<string> {
  const fd = new FormData();
  fd.set("file", file);
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    body: fd,
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    created?: number;
    updated?: number;
    skipped?: number;
    errors?: string[];
    errorCount?: number;
    note?: string;
  };
  if (!res.ok) {
    throw new Error(data.error || data.errors?.[0] || "Не удалось импортировать");
  }
  const parts = [
    data.created ? `создано ${data.created}` : "",
    data.updated ? `обновлено ${data.updated}` : "",
    data.skipped ? `пропущено ${data.skipped}` : "",
  ].filter(Boolean);
  const extra = [
    data.note,
    data.errorCount && data.errors?.length
      ? data.errors.slice(0, 3).join("; ")
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (parts.join(", ") || "Импорт выполнен") + (extra ? ` · ${extra}` : "");
}

export async function postBulkAction(
  url: string,
  action: "delete" | "copy" | "paid" | "invoice" | "activate" | "deactivate" | "role" | "addSpecialty",
  ids: string[],
  extra?: Record<string, unknown>,
): Promise<{ count?: number; skipped?: number }> {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ids, ...extra }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    count?: number;
    skipped?: number;
  };
  if (!res.ok) {
    throw new Error(data.error || "Не удалось выполнить действие");
  }
  return data;
}
