"use client";

import { useEffect, useMemo, useState } from "react";
import {
  allocateLaborByEmployeeOwners,
  CATALOG_OWNERS,
  ownerShorts,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { formatMoney } from "@/lib/format";
import type { calcByZones } from "@/lib/quote-calc";

type ZoneCalc = ReturnType<typeof calcByZones>;

type LaborRow = {
  id: string;
  pay: number;
  payMode: "SHIFT" | "HOURLY";
  hours: number | null;
  user: {
    id: string;
    name: string;
    owners?: CatalogOwnerValue[] | null;
  };
  specialty: { id: string; name: string };
};

function FirmBadges({ owners }: { owners?: CatalogOwnerValue[] | null }) {
  const list = owners?.length
    ? CATALOG_OWNERS.filter((o) => owners.includes(o.value))
    : [];
  if (list.length === 0) {
    return (
      <span className="text-xs text-[var(--muted)]" title="Без тега фирмы">
        —
      </span>
    );
  }
  return (
    <span className="inline-flex flex-wrap gap-1">
      {list.map((o) => (
        <span
          key={o.value}
          title={o.label}
          className="rounded border border-[var(--solid)] bg-[var(--solid)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--on-solid)]"
        >
          {o.short}
        </span>
      ))}
    </span>
  );
}

export function QuoteSummary({
  quoteId,
  summary,
  discountPercent,
  onDiscountPercentChange,
  canEdit,
  laborKey = 0,
}: {
  quoteId: string;
  summary: ZoneCalc;
  discountPercent: number;
  onDiscountPercentChange: (v: number) => void;
  canEdit: boolean;
  /** Bump when assignments change so ФОТ refreshes. */
  laborKey?: number;
}) {
  const [labor, setLabor] = useState<LaborRow[]>([]);
  const [laborLoading, setLaborLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLaborLoading(true);
    void fetch(`/api/quotes/${quoteId}/assignments`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) setLabor(data);
      })
      .finally(() => {
        if (!cancelled) setLaborLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [quoteId, laborKey]);

  const laborAlloc = useMemo(
    () =>
      allocateLaborByEmployeeOwners(
        labor.map((a) => ({
          pay: a.pay,
          owners: a.user.owners,
        })),
      ),
    [labor],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl">Сводная ведомость</h2>
            <p className="text-sm text-[var(--muted)]">
              Итоги по зонам: оборудование, услуги, скидка
            </p>
          </div>
          <label className="text-sm">
            <span className="text-[var(--muted)]">Скидка %</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              className="field mt-1 w-28"
              disabled={!canEdit}
              value={discountPercent}
              onChange={(e) =>
                onDiscountPercentChange(
                  Math.max(0, Number(e.target.value) || 0),
                )
              }
            />
          </label>
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 text-left">№</th>
                <th className="px-3 py-2 text-left">Зона</th>
                <th className="px-3 py-2 text-right">Оборудование</th>
                <th className="px-3 py-2 text-right">Услуги</th>
                <th className="px-3 py-2 text-right">Итого</th>
                <th className="px-3 py-2 text-right">Скидка</th>
                <th className="px-3 py-2 text-right">К оплате</th>
              </tr>
            </thead>
            <tbody>
              {summary.zones.map((z, i) => (
                <tr key={z.zoneId} className="border-t border-[var(--line)]">
                  <td className="px-3 py-2 text-[var(--muted)]">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{z.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(z.equipmentTotal + z.consumablesTotal)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(z.servicesTotal)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatMoney(z.subtotal)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-[var(--muted)]">
                    {discountPercent.toLocaleString("ru-RU")}% ·{" "}
                    {formatMoney(z.discount)}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {formatMoney(z.payable)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-[var(--ink)]/20 bg-[var(--selected)]/30">
                <td className="px-3 py-3" colSpan={2}>
                  <span className="font-medium">Итого клиенту</span>
                </td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">
                  {formatMoney(
                    summary.equipmentTotal + summary.consumablesTotal,
                  )}
                </td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">
                  {formatMoney(summary.servicesTotal)}
                </td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">
                  {formatMoney(summary.subtotal)}
                </td>
                <td className="px-3 py-3 text-right font-medium tabular-nums">
                  {formatMoney(summary.discount)}
                </td>
                <td className="px-3 py-3 text-right font-display text-lg tabular-nums">
                  {formatMoney(summary.payable)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-xl">Фонд оплаты труда</h2>
            <p className="text-sm text-[var(--muted)]">
              Назначенные сотрудники: оплата смены/часов по ставке, учёт по
              фирмам (тегам) сотрудника
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
              ФОТ всего
            </p>
            <p className="font-display text-2xl tabular-nums">
              {formatMoney(laborAlloc.total)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {CATALOG_OWNERS.map((o) => {
            const amount = laborAlloc.byCompany[o.value] || 0;
            if (amount <= 0) return null;
            return (
              <div
                key={o.value}
                className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm"
              >
                <span className="mr-2 rounded border border-[var(--solid)] bg-[var(--solid)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[var(--on-solid)]">
                  {o.short}
                </span>
                <span className="text-[var(--muted)]">{o.label}: </span>
                <span className="font-medium tabular-nums">
                  {formatMoney(amount)}
                </span>
              </div>
            );
          })}
          {laborAlloc.untagged > 0 && (
            <div className="rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm">
              <span className="text-[var(--muted)]">Без тега фирмы: </span>
              <span className="font-medium tabular-nums">
                {formatMoney(laborAlloc.untagged)}
              </span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-3 py-2 text-left">Сотрудник</th>
                <th className="px-3 py-2 text-left">Должность</th>
                <th className="px-3 py-2 text-left">Фирма</th>
                <th className="px-3 py-2 text-left">Режим</th>
                <th className="px-3 py-2 text-right">К выплате</th>
              </tr>
            </thead>
            <tbody>
              {laborLoading ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-[var(--muted)]"
                  >
                    Загрузка назначений…
                  </td>
                </tr>
              ) : labor.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-6 text-center text-[var(--muted)]"
                  >
                    Сотрудники на мероприятие ещё не назначены — ФОТ = 0
                  </td>
                </tr>
              ) : (
                labor.map((a) => (
                  <tr key={a.id} className="border-t border-[var(--line)]">
                    <td className="px-3 py-2 font-medium">{a.user.name}</td>
                    <td className="px-3 py-2">{a.specialty.name}</td>
                    <td className="px-3 py-2">
                      <FirmBadges owners={a.user.owners} />
                      <span className="sr-only">
                        {ownerShorts(a.user.owners)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[var(--muted)]">
                      {a.payMode === "HOURLY"
                        ? `${a.hours ?? 0} ч`
                        : "Смена"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {formatMoney(a.pay)}
                    </td>
                  </tr>
                ))
              )}
              {labor.length > 0 && (
                <tr className="border-t-2 border-[var(--ink)]/20 bg-[var(--selected)]/30">
                  <td className="px-3 py-3 font-medium" colSpan={4}>
                    Итого ФОТ на мероприятие
                  </td>
                  <td className="px-3 py-3 text-right font-display text-lg tabular-nums">
                    {formatMoney(laborAlloc.total)}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {laborAlloc.total > 0 && summary.payable > 0 && (
          <p className="text-xs text-[var(--muted)]">
            ФОТ {formatMoney(laborAlloc.total)} ·{" "}
            {(
              (laborAlloc.total / summary.payable) *
              100
            ).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
            % от суммы к оплате клиентом ({formatMoney(summary.payable)})
          </p>
        )}
      </div>
    </div>
  );
}
