"use client";

import { useState } from "react";
import { PriceInput } from "@/components/ui/PriceInput";
import { SideDrawer } from "@/components/ui/SideDrawer";
import { cn } from "@/lib/cn";
import { formatMoney, formatNumber } from "@/lib/format";
import { isGroupHeader } from "@/lib/quote-block-groups";

/** Режимы начисления за день. Общий список для таблицы и для карточек. */
export const DAY_MODE_OPTIONS = [
  { value: "HALF_EXTRA", label: "1-й 100% / +50%" },
  { value: "FULL_DAYS", label: "Полные дни" },
  { value: "FIXED1", label: "Фикс 1" },
  { value: "FIXED2", label: "Фикс 2" },
] as const;

export type EstimateCardBlock = {
  key: string;
  type: string;
  title?: string | null;
  name?: string | null;
  qty?: number | null;
  unitPrice?: number | string | null;
  dayMode?: string | null;
  dayCoefOverride?: number | null;
  kitId?: string | null;
  catalogItemId?: string | null;
};

export type EstimateCardLine = { lineTotal: number; dayCoef: number };

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

/** Стрелки вместо drag: перетаскивание на тач-экране конфликтует со скроллом. */
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

/**
 * Смета карточками — мобильная замена таблице на 11 колонок.
 *
 * Ставится рядом с таблицей (`md:hidden` против `hidden md:block`), данные и
 * колбэки те же. Правку выносим в шит снизу: инлайн-инпуты высотой 32px в
 * ячейках на тач-экране не попадаются пальцем, а горизонтальный скролл на
 * 880px превращает ввод цены в квест.
 *
 * В карточке остаётся то, по чему принимают решение: наименование, формула
 * «кол-во × цена», сумма и дефицит склада. Режим дня и коэффициент — в шите:
 * их меняют редко, а места они занимают как сумма.
 */
export function QuoteEstimateCards({
  blocks,
  canEdit,
  lineFor,
  shortfallFor,
  sectionSubtotal,
  onUpdate,
  onRemove,
  onMove,
  className,
  emptyMessage,
}: {
  blocks: EstimateCardBlock[];
  canEdit: boolean;
  lineFor: (key: string) => EstimateCardLine | undefined;
  shortfallFor: (block: EstimateCardBlock) => number;
  sectionSubtotal: (title: string) => number;
  onUpdate: (key: string, patch: Record<string, unknown>) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, dir: -1 | 1) => void;
  className?: string;
  emptyMessage: string;
}) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const editing = blocks.find((b) => b.key === editingKey) ?? null;

  if (blocks.length === 0) {
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
      {blocks.map((block) => {
        if (isGroupHeader(block.type)) {
          const subtotal =
            block.type === "SECTION" ? sectionSubtotal(block.title || "") : null;
          return (
            <div
              key={block.key}
              className={cn(
                "flex items-center gap-1 rounded-sm border border-[var(--accent)]/25 bg-[var(--selected)] px-1.5 py-0.5",
                block.type === "KIT_HEADER" && "ml-2",
              )}
            >
              {canEdit ? (
                <input
                  className="field field-compact min-w-0 flex-1 font-semibold"
                  value={block.title || ""}
                  aria-label="Название раздела"
                  onChange={(e) =>
                    onUpdate(block.key, { title: e.target.value })
                  }
                />
              ) : (
                <p className="min-w-0 flex-1 truncate font-semibold">
                  {block.title}
                </p>
              )}
              {subtotal != null ? (
                <p className="shrink-0 tabular-nums text-[var(--muted)]">
                  {formatMoney(subtotal)}
                </p>
              ) : null}
              {canEdit ? (
                <>
                  <MoveButtons onMove={(dir) => onMove(block.key, dir)} />
                  <button
                    type="button"
                    aria-label="Удалить раздел"
                    onClick={() => onRemove(block.key)}
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

        const line = lineFor(block.key);
        const shortfall = shortfallFor(block);
        const isKit = Boolean(block.kitId && !block.catalogItemId);
        const qty = Number(block.qty) || 0;
        const unitPrice = Number(block.unitPrice) || 0;

        return (
          <div
            key={block.key}
            className={cn(
              "rounded-sm border bg-[var(--panel)]",
              shortfall > 0
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-[var(--line)]",
              isKit && "bg-[var(--selected)]/40",
            )}
          >
            <div className="flex min-h-[3.25rem] items-center gap-1 px-1.5 py-1.5">
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setEditingKey(block.key)}
                className="min-w-0 flex-1 text-left disabled:cursor-default"
              >
                <span className="flex min-w-0 items-baseline gap-1">
                  {isKit ? (
                    <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-[var(--accent)]">
                      компл.
                    </span>
                  ) : null}
                  <span className="min-w-0 truncate font-medium">
                    {block.name || "Без названия"}
                  </span>
                </span>
                <span className="block truncate tabular-nums text-[10px] text-[var(--muted)]">
                  {qty} × {formatMoney(unitPrice)}
                  {line && line.dayCoef !== 1
                    ? ` · коэф ${formatNumber(line.dayCoef)}`
                    : ""}
                </span>
              </button>

              <span className="shrink-0 tabular-nums font-semibold">
                {formatMoney(line?.lineTotal ?? 0)}
              </span>
              {canEdit ? (
                <MoveButtons onMove={(dir) => onMove(block.key, dir)} />
              ) : null}
            </div>

            {shortfall > 0 ? (
              // Дефицит — предупреждение, а не запрет: смета сохраняется,
              // нехватку закрывают субарендой.
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
        labelledBy="estimate-line-title"
      >
        {editing ? (
          <EstimateLineSheet
            block={editing}
            line={lineFor(editing.key)}
            shortfall={shortfallFor(editing)}
            onUpdate={(patch) => onUpdate(editing.key, patch)}
            onRemove={() => {
              setEditingKey(null);
              onRemove(editing.key);
            }}
            onClose={() => setEditingKey(null)}
          />
        ) : null}
      </SideDrawer>
    </div>
  );
}

function EstimateLineSheet({
  block,
  line,
  shortfall,
  onUpdate,
  onRemove,
  onClose,
}: {
  block: EstimateCardBlock;
  line: EstimateCardLine | undefined;
  shortfall: number;
  onUpdate: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
        <h2
          id="estimate-line-title"
          className="min-w-0 flex-1 truncate text-title font-medium"
        >
          Позиция сметы
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

      {/* Поля в одну колонку: на 390px две колонки дают 175px на поле,
          и подпись переносится в две строки. */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3">
        <label className="block text-sm">
          <span className="text-[var(--muted)]">Наименование</span>
          <textarea
            rows={2}
            className="field mt-1 resize-none"
            value={block.name || ""}
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
              value={block.qty ? block.qty : ""}
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
            <span className="text-[var(--muted)]">Цена за единицу</span>
            <PriceInput
              className="mt-1"
              value={Number(block.unitPrice) || 0}
              navGroup="quote-unit-price-sheet"
              onChange={(unitPrice) => onUpdate({ unitPrice })}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-[var(--muted)]">Режим дня</span>
          <select
            className="field mt-1"
            value={String(block.dayMode || "HALF_EXTRA")}
            onChange={(e) =>
              onUpdate({ dayMode: e.target.value, dayCoefOverride: null })
            }
          >
            {DAY_MODE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="text-[var(--muted)]">Коэффициент дней</span>
          <input
            type="number"
            inputMode="decimal"
            step={0.1}
            min={0}
            className="field mt-1 tabular-nums"
            value={
              block.dayCoefOverride != null
                ? block.dayCoefOverride
                : (line?.dayCoef ?? 1)
            }
            onChange={(e) =>
              onUpdate({
                dayCoefOverride:
                  e.target.value === "" ? null : Number(e.target.value),
              })
            }
          />
          <span className="mt-1 block text-caption text-[var(--muted)]">
            Пустое значение — коэффициент из режима дня
          </span>
        </label>

        {shortfall > 0 ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
            На складе не хватает {shortfall}. Смета сохранится — нехватку
            закрывают субарендой.
          </p>
        ) : null}

        <button
          type="button"
          onClick={onRemove}
          className="tap-target flex w-full items-center justify-center rounded-md border border-[var(--danger)]/40 px-3 text-sm text-[var(--danger)]"
        >
          Удалить позицию
        </button>
      </div>

      <div className="flex items-center gap-3 border-t border-[var(--line)] px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-caption uppercase tracking-[0.04em] text-[var(--muted)]">
            Сумма строки
          </p>
          <p className="font-display text-xl tabular-nums">
            {formatMoney(line?.lineTotal ?? 0)}
          </p>
        </div>
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
