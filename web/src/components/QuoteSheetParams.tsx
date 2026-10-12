"use client";

import { useEffect, useRef, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/cn";
import {
  parseZonePricing,
  type TaxMode,
  type ZonePricing,
} from "@/lib/zone-pricing";

type Tab = "tax" | "discount" | "coef";

type Firm = { id: string; shortName: string };

const TABS: { id: Tab; label: string }[] = [
  { id: "tax", label: "Налоги" },
  { id: "discount", label: "Скидка" },
  { id: "coef", label: "Коэффициент" },
];

function NumField({
  label,
  value,
  step,
  onChange,
}: {
  label: string;
  value: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2.5">
      <span className="text-sm text-[var(--ink)]">{label}</span>
      <input
        type="number"
        min={0}
        max={100}
        step={step}
        className="field w-24 text-right tabular-nums"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function QuoteSheetParams({
  open,
  zoneName,
  value,
  onClose,
  onSave,
}: {
  open: boolean;
  zoneName: string;
  value: ZonePricing;
  onClose: () => void;
  onSave: (next: ZonePricing) => void;
}) {
  const [tab, setTab] = useState<Tab>("coef");
  const [draft, setDraft] = useState<ZonePricing>(value);
  const [firms, setFirms] = useState<Firm[]>([]);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!open) return;
    setDraft(parseZonePricing(valueRef.current));
    setTab("coef");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetch("/api/legal-entities")
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: unknown) => {
        if (cancelled || !Array.isArray(rows)) return;
        setFirms(
          rows
            .map((row) => {
              if (!row || typeof row !== "object") return null;
              const rec = row as { id?: unknown; shortName?: unknown };
              if (typeof rec.id !== "string") return null;
              return {
                id: rec.id,
                shortName:
                  typeof rec.shortName === "string" && rec.shortName.trim()
                    ? rec.shortName
                    : "Без названия",
              };
            })
            .filter((row): row is Firm => Boolean(row)),
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  function patch(partial: Partial<ZonePricing>) {
    setDraft((prev) => ({ ...prev, ...partial }));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Параметры · ${zoneName}`}
      className="max-w-md"
    >
      <div className="flex border-b border-[var(--line)] px-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              tab === item.id
                ? "border-[var(--accent)] font-medium text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]",
            )}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "tax" ? (
        <div className="flex flex-col">
          <label className="flex items-center justify-between gap-3 border-b border-[var(--line)] px-3 py-2.5">
            <span className="text-sm">Фирма</span>
            <select
              className="field max-w-[14rem]"
              value={draft.legalEntityId ?? ""}
              onChange={(e) =>
                patch({ legalEntityId: e.target.value || null })
              }
            >
              <option value="">Не выбрана</option>
              {firms.map((firm) => (
                <option key={firm.id} value={firm.id}>
                  {firm.shortName}
                </option>
              ))}
            </select>
          </label>
          <TaxBlock
            title="Налог 1"
            label={draft.tax1Label}
            rate={draft.tax1Rate}
            mode={draft.tax1Mode}
            visible={draft.tax1Visible}
            onLabel={(tax1Label) => patch({ tax1Label })}
            onRate={(tax1Rate) => patch({ tax1Rate })}
            onMode={(tax1Mode) => patch({ tax1Mode })}
            onVisible={(tax1Visible) => patch({ tax1Visible })}
          />
          <TaxBlock
            title="Налог 2"
            label={draft.tax2Label}
            rate={draft.tax2Rate}
            mode={draft.tax2Mode}
            visible={draft.tax2Visible}
            onLabel={(tax2Label) => patch({ tax2Label })}
            onRate={(tax2Rate) => patch({ tax2Rate })}
            onMode={(tax2Mode) => patch({ tax2Mode })}
            onVisible={(tax2Visible) => patch({ tax2Visible })}
          />
        </div>
      ) : null}

      {tab === "discount" ? (
        <div>
          <NumField
            label="Аренда"
            value={draft.discountEquipment}
            step={0.01}
            onChange={(discountEquipment) => patch({ discountEquipment })}
          />
          <NumField
            label="Расходный материал"
            value={draft.discountConsumable}
            step={0.01}
            onChange={(discountConsumable) => patch({ discountConsumable })}
          />
          <NumField
            label="Услуги"
            value={draft.discountService}
            step={0.01}
            onChange={(discountService) => patch({ discountService })}
          />
          <p className="px-3 py-2 text-caption text-[var(--muted)]">
            Процент скидки отдельно на аренду, расходники и услуги этого листа.
          </p>
        </div>
      ) : null}

      {tab === "coef" ? (
        <div>
          <NumField
            label="Аренда"
            value={draft.coefEquipment}
            step={0.01}
            onChange={(coefEquipment) => patch({ coefEquipment })}
          />
          <NumField
            label="Расходный материал"
            value={draft.coefConsumable}
            step={0.01}
            onChange={(coefConsumable) => patch({ coefConsumable })}
          />
          <NumField
            label="Услуги"
            value={draft.coefService}
            step={0.01}
            onChange={(coefService) => patch({ coefService })}
          />
          <p className="px-3 py-2 text-caption text-[var(--muted)]">
            1.00 — цена каталога. 1.20 поднимает суммы вида на 20%.
          </p>
        </div>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-[var(--line)] px-3 py-3">
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-sm text-[var(--muted)] hover:text-[var(--ink)]"
          onClick={onClose}
        >
          Отмена
        </button>
        <button
          type="button"
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white"
          onClick={() => onSave(parseZonePricing(draft))}
        >
          Применить
        </button>
      </div>
    </Modal>
  );
}

function TaxBlock({
  title,
  label,
  rate,
  mode,
  visible,
  onLabel,
  onRate,
  onMode,
  onVisible,
}: {
  title: string;
  label: string;
  rate: number;
  mode: TaxMode;
  visible: boolean;
  onLabel: (value: string) => void;
  onRate: (value: number) => void;
  onMode: (value: TaxMode) => void;
  onVisible: (value: boolean) => void;
}) {
  return (
    <div className="border-b border-[var(--line)]">
      <p className="bg-[var(--panel-muted)] px-3 py-1.5 text-xs font-medium text-[var(--muted)]">
        {title}
      </p>
      <label className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="text-sm text-[var(--muted)]">Способ начисления</span>
        <select
          className="field max-w-[12rem]"
          value={mode}
          onChange={(e) => onMode(e.target.value === "ON_TOP" ? "ON_TOP" : "IN_TOTAL")}
        >
          <option value="IN_TOTAL">в итоговую</option>
          <option value="ON_TOP">сверху</option>
        </select>
      </label>
      <div className="flex items-center gap-2 px-3 py-2">
        <input
          className="field min-w-0 flex-1"
          value={label}
          placeholder="Название налога"
          onChange={(e) => onLabel(e.target.value)}
        />
        <input
          type="number"
          min={0}
          max={100}
          step={0.01}
          className="field w-24 text-right tabular-nums"
          value={Number.isFinite(rate) ? rate : 0}
          onChange={(e) => onRate(Number(e.target.value))}
        />
      </div>
      <label className="flex items-center justify-between gap-3 px-3 py-2">
        <span className="text-sm text-[var(--muted)]">Отображение</span>
        <select
          className="field max-w-[12rem]"
          value={visible ? "show" : "hide"}
          onChange={(e) => onVisible(e.target.value === "show")}
        >
          <option value="show">показать</option>
          <option value="hide">скрыть</option>
        </select>
      </label>
    </div>
  );
}
