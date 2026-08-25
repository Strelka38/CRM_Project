"use client";

import { formatMoney, formatNumber } from "@/lib/format";
import {
  CATALOG_OWNERS,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { dayModeLabel } from "@/lib/calc-csv";
import type { LineAmountSplit } from "@/lib/quote-calculation";
import { OwnerTagsPicker } from "@/components/OwnerTagsPicker";
import {
  DirectoryCsvMenu,
  DirectoryIconButton,
  IconSave,
} from "@/components/DirectoryToolbar";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";

export type CalcEstimateBlock = {
  id: string;
  type: string;
  zoneId: string | null;
  zoneName: string;
  zoneActive: boolean;
  name: string;
  title: string | null;
  qty: number | null;
  unitPrice: number | null;
  dayMode: string | null;
  dayCoef: number;
  lineTotal: number;
  isKit: boolean;
};

export type CalcEstimateLine = {
  id: string;
  name: string;
  lineTotal: number;
  costTotal: number;
  costSource?: string;
  costOverride: number | null;
  catalogOwners: CatalogOwnerValue[];
  owners: CatalogOwnerValue[];
  ownersCustom: boolean;
  mode: "SHARE" | "AMOUNT";
  amounts: LineAmountSplit;
};

type Props = {
  blocks: CalcEstimateBlock[];
  lines: CalcEstimateLine[];
  saving: boolean;
  csvBusy?: boolean;
  csvMessage?: string;
  onSave: () => void;
  onExportCsv: () => void;
  onImportCsv: () => void;
  onSetLineMode: (id: string, mode: "SHARE" | "AMOUNT") => void;
  onSetLineOwners: (id: string, owners: CatalogOwnerValue[]) => void;
  onSetLineAmount: (
    id: string,
    company: CatalogOwnerValue,
    value: number,
  ) => void;
  onSetLineCost: (id: string, value: number | null) => void;
  onResetLine: (id: string) => void;
};

function sectionTotal(blocks: CalcEstimateBlock[], index: number): number {
  const start = blocks[index];
  let sum = 0;
  for (let i = index + 1; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "SECTION") break;
    if (b.zoneId !== start.zoneId) break;
    if (b.type === "ITEM" || b.type === "KIT_HEADER") sum += b.lineTotal;
  }
  return sum;
}

export function CalcEstimateTable({
  blocks,
  lines,
  saving,
  csvBusy,
  csvMessage,
  onSave,
  onExportCsv,
  onImportCsv,
  onSetLineMode,
  onSetLineOwners,
  onSetLineAmount,
  onSetLineCost,
  onResetLine,
}: Props) {
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const zoneCount = new Set(blocks.map((b) => b.zoneId).filter(Boolean)).size;

  const display: Array<
    | { kind: "zone"; id: string; name: string; active: boolean }
    | { kind: "block"; block: CalcEstimateBlock; index: number }
  > = [];
  let lastZone: string | null | undefined = undefined;
  blocks.forEach((block, index) => {
    if (zoneCount > 1 && block.zoneId && block.zoneId !== lastZone) {
      display.push({
        kind: "zone",
        id: block.zoneId,
        name: block.zoneName || "Зона",
        active: block.zoneActive,
      });
      lastZone = block.zoneId;
    }
    display.push({ kind: "block", block, index });
  });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-caption uppercase tracking-wide text-[var(--muted)]">
          Смета · закуп и владельцы справа
        </p>
        <div className="ml-auto flex items-center gap-1">
          <DirectoryIconButton
            title="Сохранить строки"
            disabled={saving || lines.length === 0}
            onClick={onSave}
            className="text-[var(--ink)]"
          >
            <IconSave />
          </DirectoryIconButton>
          <DirectoryCsvMenu
            busy={csvBusy}
            onExport={onExportCsv}
            onImport={onImportCsv}
          />
        </div>
      </div>
      {csvMessage ? (
        <p className="text-xs text-[var(--muted)]">{csvMessage}</p>
      ) : null}
      {blocks.length === 0 ? (
        <p className="rounded-lg border border-[var(--line)] px-4 py-8 text-center text-sm text-[var(--muted)]">
          В смете нет позиций
        </p>
      ) : (
        <div className="data-table-shell">
          <table className="data-table data-table--editable quote-estimate-table w-full min-w-[1020px] table-fixed text-xs">
            <colgroup>
              <col />
              <col className="w-14" />
              <col className="w-20" />
              <col className="w-24" />
              <col className="w-14" />
              <col className="w-24" />
              <col className="w-56" />
              <col className="w-24" />
              <col className="w-24" />
            </colgroup>
            <thead>
              <tr>
                <th className="px-1.5 py-1.5 text-left">Тип / название</th>
                <th className="px-1.5 py-1.5">Кол-во</th>
                <th className="px-1.5 py-1.5">Цена</th>
                <th className="px-1.5 py-1.5">День</th>
                <th className="px-1.5 py-1.5">Коэф</th>
                <th className="px-1.5 py-1.5 text-right">Сумма</th>
                <th className="calc-split px-1.5 py-1.5 text-left">Владельцы</th>
                <th className="px-1.5 py-1.5 text-right">Клиенту</th>
                <th className="px-1.5 py-1.5 text-right">Закуп</th>
              </tr>
            </thead>
            <tbody>
              {display.map((row) => {
                if (row.kind === "zone") {
                  return (
                    <tr
                      key={`zone-${row.id}`}
                      className="bg-[var(--selected)]/50"
                    >
                      <td
                        colSpan={6}
                        className={cn(
                          "px-1.5 py-1 text-xs font-medium uppercase tracking-wide",
                          !row.active && "opacity-50",
                        )}
                      >
                        {row.name}
                        {row.active ? "" : " (выкл.)"}
                      </td>
                      <td className="calc-split" colSpan={3} />
                    </tr>
                  );
                }
                const { block, index } = row;
                const line = lineById.get(block.id);
                if (block.type === "SECTION" || block.type === "KIT_HEADER") {
                  const total = sectionTotal(blocks, index);
                  return (
                    <tr
                      key={block.id}
                      className={
                        block.type === "SECTION"
                          ? "bg-[var(--selected)]"
                          : "bg-[var(--selected)]/35"
                      }
                    >
                      <td className="px-1.5 py-1" colSpan={5}>
                        <div
                          className={
                            block.type === "KIT_HEADER"
                              ? "pl-4 font-semibold"
                              : "font-bold"
                          }
                        >
                          {block.title || block.name || "Раздел"}
                        </div>
                      </td>
                      <td className="px-1.5 py-1 text-right font-semibold tabular-nums">
                        {block.type === "SECTION" ? formatMoney(total) : ""}
                      </td>
                      {line ? (
                        <LineCalcCells
                          line={line}
                          onSetLineMode={onSetLineMode}
                          onSetLineOwners={onSetLineOwners}
                          onSetLineAmount={onSetLineAmount}
                          onSetLineCost={onSetLineCost}
                          onResetLine={onResetLine}
                        />
                      ) : (
                        <td className="calc-split" colSpan={3} />
                      )}
                    </tr>
                  );
                }
                return (
                  <tr
                    key={block.id}
                    className={cn(
                      !block.zoneActive && "opacity-50",
                      block.isKit && "bg-[var(--selected)]/40",
                    )}
                  >
                    <td className="min-w-0 overflow-hidden py-1 pl-3 pr-1.5">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        {block.isKit ? (
                          <span className="w-fit rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-caption font-medium uppercase tracking-wide text-[var(--accent)]">
                            Комплект
                          </span>
                        ) : null}
                        <div className="break-words leading-4">
                          {block.name || "Позиция"}
                        </div>
                      </div>
                    </td>
                    <td className="px-1.5 py-1 text-center tabular-nums">
                      {block.qty ?? "—"}
                    </td>
                    <td className="px-1.5 py-1 text-right tabular-nums whitespace-nowrap">
                      {block.unitPrice != null
                        ? formatMoney(block.unitPrice)
                        : "—"}
                    </td>
                    <td className="px-1.5 py-1 text-center whitespace-nowrap">
                      {dayModeLabel(block.dayMode)}
                    </td>
                    <td className="px-1.5 py-1 text-center tabular-nums">
                      {formatNumber(block.dayCoef || 0)}
                    </td>
                    <td className="px-1.5 py-1 text-right font-medium tabular-nums whitespace-nowrap">
                      {formatMoney(block.lineTotal)}
                    </td>
                    {line ? (
                      <LineCalcCells
                        line={line}
                        onSetLineMode={onSetLineMode}
                        onSetLineOwners={onSetLineOwners}
                        onSetLineAmount={onSetLineAmount}
                        onSetLineCost={onSetLineCost}
                        onResetLine={onResetLine}
                      />
                    ) : (
                      <>
                        <td className="calc-split px-1.5 py-1 text-[var(--muted)]">
                          —
                        </td>
                        <td className="px-1.5 py-1 text-right tabular-nums whitespace-nowrap text-[var(--muted)]">
                          {formatMoney(block.lineTotal)}
                        </td>
                        <td className="px-1.5 py-1 text-right text-[var(--muted)]">
                          —
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          disabled={saving || lines.length === 0}
          onClick={onSave}
        >
          <IconSave />
          Сохранить строки
        </Button>
      </div>
    </div>
  );
}

function LineCalcCells({
  line,
  onSetLineMode,
  onSetLineOwners,
  onSetLineAmount,
  onSetLineCost,
  onResetLine,
}: {
  line: CalcEstimateLine;
  onSetLineMode: (id: string, mode: "SHARE" | "AMOUNT") => void;
  onSetLineOwners: (id: string, owners: CatalogOwnerValue[]) => void;
  onSetLineAmount: (
    id: string,
    company: CatalogOwnerValue,
    value: number,
  ) => void;
  onSetLineCost: (id: string, value: number | null) => void;
  onResetLine: (id: string) => void;
}) {
  const amountSum =
    line.amounts.SHOW_MASTER + line.amounts.DIAKOM + line.amounts.NE_EVENT;
  const amountDiff = Math.round(line.lineTotal - amountSum);
  const cost =
    line.costOverride != null ? line.costOverride : line.costTotal;
  const passthrough =
    line.costSource === "passthrough" && line.costOverride == null;

  return (
    <>
      <td className="calc-split px-1.5 py-1">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <div className="inline-flex shrink-0 rounded border border-[var(--line)] p-px text-caption leading-none">
            <button
              type="button"
              className={cn(
                "rounded px-1.5 py-0.5",
                line.mode === "SHARE"
                  ? "bg-[var(--solid)] text-[var(--on-solid)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]",
              )}
              onClick={() => onSetLineMode(line.id, "SHARE")}
            >
              Доли
            </button>
            <button
              type="button"
              className={cn(
                "rounded px-1.5 py-0.5",
                line.mode === "AMOUNT"
                  ? "bg-[var(--solid)] text-[var(--on-solid)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]",
              )}
              onClick={() => onSetLineMode(line.id, "AMOUNT")}
            >
              Суммы
            </button>
          </div>
          {line.mode === "SHARE" ? (
            <OwnerTagsPicker
              label=""
              compact
              value={line.owners}
              onChange={(owners) => onSetLineOwners(line.id, owners)}
            />
          ) : (
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-1">
              {CATALOG_OWNERS.map((c) => (
                <label key={c.value} className="block min-w-0 text-caption">
                  <span className="text-[var(--muted)]">{c.short}</span>
                  <input
                    type="number"
                    min={0}
                    className="field mt-0.5 w-full min-w-0 py-0.5 text-xs"
                    value={line.amounts[c.value]}
                    onChange={(e) =>
                      onSetLineAmount(line.id, c.value, Number(e.target.value) || 0)
                    }
                  />
                </label>
              ))}
              <p
                className={cn(
                  "col-span-3 text-caption leading-none",
                  amountDiff === 0 ? "text-[var(--muted)]" : "text-amber-500",
                )}
              >
                {formatMoney(amountSum)} из {formatMoney(line.lineTotal)}
              </p>
            </div>
          )}
          {(line.ownersCustom || line.mode === "AMOUNT") && (
            <button
              type="button"
              className="shrink-0 text-caption text-[var(--muted)] hover:underline"
              onClick={() => onResetLine(line.id)}
            >
              Сброс
            </button>
          )}
        </div>
      </td>
      <td className="px-1.5 py-1 text-right tabular-nums whitespace-nowrap">
        {formatMoney(line.lineTotal)}
      </td>
      <td className="px-1.5 py-1 text-right">
        <input
          type="number"
          min={0}
          title={passthrough ? "Без закупа вся сумма в расход" : undefined}
          className="field w-full min-w-0 py-0.5 text-right tabular-nums"
          value={cost}
          onChange={(e) => {
            const raw = e.target.value;
            onSetLineCost(line.id, raw === "" ? 0 : Number(raw) || 0);
          }}
        />
        {passthrough ? (
          <div className="mt-0.5 truncate text-caption leading-none text-[var(--muted)]">
            весь в расход
          </div>
        ) : null}
      </td>
    </>
  );
}
