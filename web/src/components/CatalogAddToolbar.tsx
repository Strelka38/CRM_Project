"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

type AddAction =
  | "section"
  | "equipment"
  | "service"
  | "consumable"
  | "kit"
  | "component";

const ACTIONS: Array<{
  id: AddAction;
  title: string;
  icon: ReactNode;
}> = [
  {
    id: "section",
    title: "+ Раздел",
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3 7.5V6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8.5" />
      </svg>
    ),
  },
  {
    id: "equipment",
    title: "+ Оборудование",
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="4" y="6" width="16" height="13" rx="2" />
        <path d="M8 6V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" />
        <path d="M9 14h6" />
      </svg>
    ),
  },
  {
    id: "service",
    title: "+ Услуга",
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14.7 6.3a3 3 0 0 1 0 4.2l-1.4 1.4-4.2-4.2 1.4-1.4a3 3 0 0 1 4.2 0Z" />
        <path d="m9 11-5.5 5.5a2 2 0 1 0 2.8 2.8L12 13.5" />
      </svg>
    ),
  },
  {
    id: "consumable",
    title: "+ Расходный материал",
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M14 4 7 18" />
        <path d="M9.5 7.5 15 5l2 5.5" />
        <path d="M8 14h4" />
      </svg>
    ),
  },
  {
    id: "kit",
    title: "+ Комплект",
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <ellipse cx="12" cy="6" rx="7" ry="2.5" />
        <path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" />
        <path d="M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
        <path d="M5 14v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4" />
      </svg>
    ),
  },
  {
    id: "component",
    title: "+ Комплектующие",
    icon: (
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="7" width="11" height="11" rx="2" />
        <rect x="10" y="4" width="11" height="11" rx="2" />
      </svg>
    ),
  },
];

function PlusBadge() {
  return (
    <span className="absolute -bottom-0.5 -right-0.5 flex size-3.5 items-center justify-center rounded-full bg-[var(--panel)] text-caption font-bold leading-none text-[var(--accent)] ring-1 ring-[var(--line)]">
      +
    </span>
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

export function CatalogAddToolbar({
  onAction,
  disabled,
}: {
  onAction: (action: AddAction) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {ACTIONS.map((a) => (
        <button
          key={a.id}
          type="button"
          title={a.title}
          aria-label={a.title}
          disabled={disabled}
          onClick={() => onAction(a.id)}
          className={cn(
            "relative rounded-md p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--header-hover)] hover:text-[var(--ink)] disabled:opacity-40",
          )}
        >
          {a.icon}
          <PlusBadge />
        </button>
      ))}
    </div>
  );
}

export function CatalogSelectionActions({
  count,
  onDelete,
  onPrintQr,
  onCopy,
  onRename,
  canRename,
  disabled,
}: {
  count: number;
  onDelete: () => void;
  onPrintQr: () => void;
  onCopy: () => void;
  onRename?: () => void;
  canRename?: boolean;
  disabled?: boolean;
}) {
  if (count <= 0) return null;
  const btn =
    "rounded-md p-1.5 transition-colors hover:bg-[var(--panel)] disabled:opacity-40";
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-[var(--accent)]/30 bg-[var(--selected)] px-0.5 py-0.5 animate-fade-up">
      <button
        type="button"
        disabled={disabled}
        title="Удалить"
        aria-label="Удалить"
        className={cn(btn, "text-[var(--danger)]")}
        onClick={onDelete}
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <path d="M4 7h16" />
          <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
      <button
        type="button"
        disabled={disabled}
        title="QR-коды"
        aria-label="QR-коды"
        className={cn(btn, "text-[var(--ink)]")}
        onClick={onPrintQr}
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3h-3zM20 14h1v3h-3v-1M14 20h3v1M20 18v3" />
        </svg>
      </button>
      <button
        type="button"
        disabled={disabled}
        title="Копировать"
        aria-label="Копировать"
        className={cn(btn, "text-[var(--ink)]")}
        onClick={onCopy}
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      </button>
      {onRename ? (
        <button
          type="button"
          disabled={disabled || !canRename}
          title={
            canRename
              ? "Переименовать раздел"
              : "Выберите один раздел"
          }
          aria-label="Переименовать"
          className={cn(btn, "text-[var(--ink)]")}
          onClick={onRename}
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

export function CatalogExportMenu({
  onExportCsv,
  onImportCsv,
  onExportWarehouse,
  csvBusy,
}: {
  onExportCsv: () => void;
  onImportCsv: () => void;
  onExportWarehouse: () => void;
  csvBusy?: boolean;
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
        <div className="absolute right-0 z-30 mt-1 w-52 rounded-md border border-[var(--line)] bg-[var(--panel)] py-1 shadow-lg">
          <button
            type="button"
            disabled={csvBusy}
            className="flex w-full px-3 py-1.5 text-left text-sm text-[var(--ink)] hover:bg-[var(--header-hover)] disabled:opacity-40"
            onClick={() => run(onExportCsv)}
          >
            Экспорт CSV
          </button>
          <button
            type="button"
            disabled={csvBusy}
            className="flex w-full px-3 py-1.5 text-left text-sm text-[var(--ink)] hover:bg-[var(--header-hover)] disabled:opacity-40"
            onClick={() => run(onImportCsv)}
          >
            {csvBusy ? "CSV…" : "Импорт CSV"}
          </button>
          <button
            type="button"
            disabled={csvBusy}
            className="flex w-full px-3 py-1.5 text-left text-sm text-[var(--ink)] hover:bg-[var(--header-hover)] disabled:opacity-40"
            onClick={() => run(onExportWarehouse)}
          >
            Экспорт склада
          </button>
        </div>
      ) : null}
    </div>
  );
}

export type { AddAction };
