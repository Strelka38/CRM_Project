"use client";

import { useState } from "react";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { cn } from "@/lib/cn";
import { CATALOG_OWNERS } from "@/lib/catalog-owner";

export type SpecCardLine = {
  key: string;
  type: "SECTION" | "ITEM";
  title: string | null;
  name: string | null;
  qty: number;
  comment: string;
  kitName: string | null;
  catalogItemId: string | null;
  ownerLabel?: string;
  hidden: boolean;
  isKitHeader?: boolean;
};

export type SpecCardPatch = {
  title?: string;
  name?: string;
  qty?: number;
  comment?: string;
  ownerLabel?: string;
};

function IconArrow({ dir }: { dir: "up" | "down" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-3"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {dir === "up" ? <path d="m6 14 6-6 6 6" /> : <path d="m6 10 6 6 6-6" />}
    </svg>
  );
}

function MoveButtons({
  onMove,
  disabled,
}: {
  onMove: (dir: -1 | 1) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center">
      <button
        type="button"
        disabled={disabled}
        aria-label="Переместить выше"
        onClick={() => onMove(-1)}
        className="flex size-5 items-center justify-center rounded-sm text-[var(--muted)] hover:bg-[var(--header-hover)] hover:text-[var(--ink)] disabled:opacity-30"
      >
        <IconArrow dir="up" />
      </button>
      <button
        type="button"
        disabled={disabled}
        aria-label="Переместить ниже"
        onClick={() => onMove(1)}
        className="flex size-5 items-center justify-center rounded-sm text-[var(--muted)] hover:bg-[var(--header-hover)] hover:text-[var(--ink)] disabled:opacity-30"
      >
        <IconArrow dir="down" />
      </button>
    </div>
  );
}

function displayName(line: SpecCardLine) {
  if (line.type === "SECTION") return line.title || "Раздел";
  return line.name || "Без названия";
}

/**
 * Спека карточками — мобильная замена таблице на 800px.
 * Ветка рядом с таблицей: карточки `md:hidden`, таблица `hidden md:block`.
 */
export function SpecCards({
  lines,
  canEdit,
  shortfallFor,
  onUpdate,
  onRemove,
  onMove,
  onToggleHide,
  emptyMessage,
  className,
}: {
  lines: SpecCardLine[];
  canEdit: boolean;
  shortfallFor: (line: SpecCardLine) => number;
  onUpdate: (key: string, patch: SpecCardPatch) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  onToggleHide: (key: string) => void;
  emptyMessage: string;
  className?: string;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const editing = lines.find((l) => l.key === editingKey) ?? null;

  if (lines.length === 0) {
    return (
      <p
        className={cn(
          "quote-dense rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-3 text-center text-[11px] text-[var(--muted)]",
          className,
        )}
      >
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className={cn("quote-dense flex flex-col gap-px", className)}>
      {lines.map((line) => {
        if (line.type === "SECTION") {
          return (
            <div
              key={line.key}
              className={cn(
                "flex items-center gap-1 rounded-sm border border-[var(--accent)]/25 bg-[var(--selected)] px-1.5 py-0.5",
                line.isKitHeader && "ml-2",
                line.hidden && "opacity-40",
              )}
            >
              {canEdit ? (
                <input
                  className="field field-compact min-w-0 flex-1 font-semibold"
                  value={line.title || ""}
                  aria-label="Название раздела"
                  onChange={(e) =>
                    onUpdate(line.key, { title: e.target.value })
                  }
                />
              ) : (
                <p className="min-w-0 flex-1 truncate font-semibold">
                  {displayName(line)}
                </p>
              )}
              {canEdit ? (
                <>
                  <MoveButtons onMove={(dir) => onMove(line.key, dir)} />
                  <button
                    type="button"
                    aria-label="Удалить раздел"
                    onClick={() => onRemove(line.key)}
                    className="flex size-5 shrink-0 items-center justify-center rounded-sm text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)]"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="size-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <path d="M6 6l12 12M18 6 6 18" />
                    </svg>
                  </button>
                </>
              ) : null}
            </div>
          );
        }

        const shortfall = shortfallFor(line);

        return (
          <div
            key={line.key}
            className={cn(
              "rounded-sm border bg-[var(--panel)]",
              shortfall > 0
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-[var(--line)]",
              line.hidden && "opacity-40",
            )}
          >
            <div className="flex min-h-[3.25rem] items-center gap-1 px-1.5 py-1.5">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setEditingKey(line.key)}
                className="min-w-0 flex-1 text-left disabled:cursor-default"
              >
                <span className="flex min-w-0 items-baseline gap-1">
                  {line.kitName ? (
                    <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-[var(--accent)]">
                      компл.
                    </span>
                  ) : null}
                  <span className="min-w-0 truncate font-medium">
                    {displayName(line)}
                  </span>
                </span>
                <span className="block truncate tabular-nums text-[10px] text-[var(--muted)]">
                  {line.qty} шт
                  {line.ownerLabel ? ` · ${line.ownerLabel}` : ""}
                  {line.comment ? ` · ${line.comment}` : ""}
                </span>
              </button>
              {canEdit ? (
                <MoveButtons onMove={(dir) => onMove(line.key, dir)} />
              ) : null}
            </div>
            {shortfall > 0 ? (
              <p className="border-t border-amber-500/30 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                Не хватает {shortfall} — нужна субаренда
              </p>
            ) : null}
          </div>
        );
      })}

      <SideDrawer
        open={Boolean(editing)}
        onClose={() => setEditingKey(null)}
        labelledBy="spec-line-title"
      >
        {editing ? (
          <SpecLineSheet
            line={editing}
            shortfall={shortfallFor(editing)}
            onUpdate={(patch) => onUpdate(editing.key, patch)}
            onRemove={() => {
              setEditingKey(null);
              onRemove(editing.key);
            }}
            onToggleHide={() => onToggleHide(editing.key)}
            onClose={() => setEditingKey(null)}
          />
        ) : null}
      </SideDrawer>
    </div>
  );
}

function SpecLineSheet({
  line,
  shortfall,
  onUpdate,
  onRemove,
  onToggleHide,
  onClose,
}: {
  line: SpecCardLine;
  shortfall: number;
  onUpdate: (patch: SpecCardPatch) => void;
  onRemove: () => void;
  onToggleHide: () => void;
  onClose: () => void;
}) {
  const ownerValue = (line.ownerLabel ?? "").trim();
  const knownOwner = CATALOG_OWNERS.some((o) => o.short === ownerValue);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
        <h2
          id="spec-line-title"
          className="min-w-0 flex-1 truncate text-title font-medium"
        >
          Позиция спеки
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="tap-target -mr-1 flex items-center justify-center rounded-md px-2 text-[var(--muted)] hover:bg-[var(--header-hover)] hover:text-[var(--ink)]"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Наименование</span>
          <textarea
            rows={2}
            className="field mt-1 resize-none"
            value={line.name || ""}
            onChange={(e) => onUpdate({ name: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Кол-во</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              className="field mt-1 tabular-nums"
              value={line.qty ? line.qty : ""}
              placeholder="—"
              onChange={(e) => {
                const raw = e.target.value;
                onUpdate({
                  qty: raw === "" ? 0 : Math.max(0, Number(raw) || 0),
                });
              }}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Чьё</span>
            <select
              className="field mt-1"
              aria-label="Контора"
              value={ownerValue}
              onChange={(e) => onUpdate({ ownerLabel: e.target.value })}
            >
              <option value="">—</option>
              {CATALOG_OWNERS.map((owner) => (
                <option key={owner.value} value={owner.short}>
                  {owner.short}
                </option>
              ))}
              {ownerValue && !knownOwner ? (
                <option value={ownerValue}>{ownerValue}</option>
              ) : null}
            </select>
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-[var(--muted)]">Комментарий</span>
          <input
            className="field mt-1"
            value={line.comment || ""}
            onChange={(e) => onUpdate({ comment: e.target.value })}
          />
        </label>

        {shortfall > 0 ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
            На складе не хватает {shortfall}. Спека сохранится — нехватку
            закрывают субарендой.
          </p>
        ) : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onToggleHide}
            className="tap-target flex flex-1 items-center justify-center rounded-md border border-[var(--line)] px-3 text-sm"
          >
            {line.hidden ? "Показать" : "Скрыть"}
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="tap-target flex flex-1 items-center justify-center rounded-md border border-[var(--danger)]/40 px-3 text-sm text-[var(--danger)]"
          >
            Удалить
          </button>
        </div>
      </div>

      <div className="flex items-center justify-end border-t border-[var(--line)] px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="tap-target h-10 rounded-[var(--radius-sm)] bg-[var(--accent)] px-5 text-sm font-medium text-[var(--accent-ink)]"
        >
          Готово
        </button>
      </div>
    </div>
  );
}
