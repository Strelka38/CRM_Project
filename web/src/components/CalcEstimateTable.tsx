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
    <div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)]">
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-3 py-2">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
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
        <p className="border-b border-[var(--line)] px-4 py-2 text-xs text-[var(--muted)]">
          {csvMessage}
        </p>
      ) : null}
      {blocks.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">
          В смете нет позиций
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] table-fixed text-sm">
            <colgroup>
              <col />
              <col className="w-16" />
              <col className="w-24" />
              <col className="w-28" />
              <col className="w-16" />
              <col className="w-28" />
              <col className="w-2" />
              <col className="w-[220px]" />
              <col className="w-28" />
              <col className="w-28" />
            </colgroup>
            <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-2 py-2 text-left">Тип / название</th>
                <th className="px-2 py-2">Кол-во</th>
                <th className="px-2 py-2">Цена</th>
                <th className="px-2 py-2">Режим дня</th>
                <th className="px-2 py-2">Коэф</th>
                <th className="px-2 py-2 text-right">Сумма</th>
                <th className="bg-[var(--bg)] p-0" />
                <th className="px-2 py-2 text-left">Владельцы / суммы</th>
                <th className="px-2 py-2 text-right">Клиенту</th>
                <th className="px-2 py-2 text-right">Закуп</th>
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
                        className={`px-3 py-2 text-xs font-medium uppercase tracking-wide ${
                          row.active ? "" : "opacity-50"
                        }`}
                      >
                        {row.name}
                        {row.active ? "" : " (выкл.)"}
                      </td>
                      <td className="bg-[var(--bg)] p-0" />
                      <td colSpan={3} />
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
                      <td className="px-2 py-2" colSpan={5}>
                        <div
                          className={
                            block.type === "KIT_HEADER" ? "pl-5 font-semibold" : "font-bold"
                          }
                        >
                          {block.title || block.name || "Раздел"}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right font-medium tabular-nums">
                        {block.type === "SECTION" ? formatMoney(total) : ""}
                      </td>
                      <td className="bg-[var(--bg)] p-0" />
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
                        <td colSpan={3} />
                      )}
                    </tr>
                  );
                }
                return (
                  <tr
                    key={block.id}
                    className={`border-t border-[var(--line)] align-top ${
                      block.zoneActive ? "" : "opacity-50"
                    } ${block.isKit ? "bg-[var(--selected)]/40" : ""}`}
                  >
                    <td className="py-2 pl-6 pr-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        {block.isKit ? (
                          <span className="w-fit rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--accent)]">
                            Комплект
                          </span>
                        ) : null}
                        <div className="leading-5">{block.name || "Позиция"}</div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums">
                      {block.qty ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {block.unitPrice != null
                        ? formatMoney(block.unitPrice)
                        : "—"}
                    </td>
                    <td className="px-2 py-2 text-center text-xs text-[var(--muted)]">
                      {dayModeLabel(block.dayMode)}
                    </td>
                    <td className="px-2 py-2 text-center tabular-nums">
                      {formatNumber(block.dayCoef || 0)}
                    </td>
                    <td className="px-2 py-2 text-right font-medium tabular-nums">
                      {formatMoney(block.lineTotal)}
                      <p className="text-[10px] font-normal text-[var(--muted)]">
                        коэф {formatNumber(block.dayCoef || 0)}
                      </p>
                    </td>
                    <td className="bg-[var(--bg)] p-0" />
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
                        <td className="px-2 py-2 text-[var(--muted)]">—</td>
                        <td className="px-2 py-2 text-right tabular-nums text-[var(--muted)]">
                          {formatMoney(block.lineTotal)}
                        </td>
                        <td className="px-2 py-2 text-right text-[var(--muted)]">
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
      <div className="flex justify-end border-t border-[var(--line)] px-3 py-2">
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

  return (
    <>
      <td className="px-2 py-2">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <div className="inline-flex rounded-md border border-[var(--line)] p-0.5 text-[11px]">
            <button
              type="button"
              className={`rounded px-2 py-0.5 ${
                line.mode === "SHARE"
                  ? "bg-[var(--solid)] text-[var(--on-solid)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
              onClick={() => onSetLineMode(line.id, "SHARE")}
            >
              Доли
            </button>
            <button
              type="button"
              className={`rounded px-2 py-0.5 ${
                line.mode === "AMOUNT"
                  ? "bg-[var(--solid)] text-[var(--on-solid)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
              onClick={() => onSetLineMode(line.id, "AMOUNT")}
            >
              Суммы
            </button>
          </div>
          {(line.ownersCustom || line.mode === "AMOUNT") && (
            <button
              type="button"
              className="text-[10px] text-[var(--muted)] hover:underline"
              onClick={() => onResetLine(line.id)}
            >
              Сброс
            </button>
          )}
        </div>
        {line.mode === "SHARE" ? (
          <OwnerTagsPicker
            label=""
            compact
            value={line.owners}
            onChange={(owners) => onSetLineOwners(line.id, owners)}
          />
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {CATALOG_OWNERS.map((c) => (
              <label key={c.value} className="block text-[10px]">
                <span className="text-[var(--muted)]">{c.short}</span>
                <input
                  type="number"
                  min={0}
                  className="field mt-0.5 py-1 text-xs"
                  value={line.amounts[c.value]}
                  onChange={(e) =>
                    onSetLineAmount(line.id, c.value, Number(e.target.value) || 0)
                  }
                />
              </label>
            ))}
            <p
              className={`col-span-3 text-[10px] ${
                amountDiff === 0 ? "text-[var(--muted)]" : "text-amber-500"
              }`}
            >
              {formatMoney(amountSum)} из {formatMoney(line.lineTotal)}
            </p>
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
        {formatMoney(line.lineTotal)}
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <input
          type="number"
          min={0}
          className="field w-24 py-1 text-right"
          value={cost}
          onChange={(e) => {
            const raw = e.target.value;
            onSetLineCost(line.id, raw === "" ? 0 : Number(raw) || 0);
          }}
        />
        {line.costSource === "passthrough" && line.costOverride == null ? (
          <div className="mt-0.5 text-[10px] text-[var(--muted)]">
            без закупа вся сумма в расход
          </div>
        ) : null}
      </td>
    </>
  );
}

