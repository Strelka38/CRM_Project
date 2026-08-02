"use client";

import { useMemo, useState } from "react";
import type { ZoneTab } from "@/components/QuoteZoneTabs";
import type { QuoteBlockInput } from "@/lib/quote-calc";
import type { ExportFilters, ExportMeta } from "@/lib/export/quote-zones";

type Props = {
  open: boolean;
  onClose: () => void;
  meta: ExportMeta;
  zones: ZoneTab[];
  blocks: QuoteBlockInput[];
};

export function ExportQuoteModal({
  open,
  onClose,
  meta,
  zones,
  blocks,
}: Props) {
  const [includeSummary, setIncludeSummary] = useState(true);
  const [allTabsOneSheet, setAllTabsOneSheet] = useState(true);
  const [showEquipmentPrice, setShowEquipmentPrice] = useState(true);
  const [showConsumablePrice, setShowConsumablePrice] = useState(false);
  const [showServicePrice, setShowServicePrice] = useState(true);
  const [zoneOn, setZoneOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(zones.map((z) => [z.id, true])),
  );
  const [busy, setBusy] = useState<"pdf" | "xls" | "preview" | null>(null);

  const filters: ExportFilters = useMemo(
    () => ({
      includeSummary,
      allTabsOneSheet,
      showEquipmentPrice,
      showConsumablePrice,
      showServicePrice,
      zoneIds: zones.filter((z) => zoneOn[z.id] !== false).map((z) => z.id),
    }),
    [
      includeSummary,
      allTabsOneSheet,
      showEquipmentPrice,
      showConsumablePrice,
      showServicePrice,
      zoneOn,
      zones,
    ],
  );

  if (!open) return null;

  async function run(kind: "pdf" | "xls" | "preview") {
    if (filters.zoneIds.length === 0) {
      alert("Выберите хотя бы одну зону");
      return;
    }
    setBusy(kind);
    try {
      const mod = await import("@/lib/export/quote-zones");
      if (kind === "preview") {
        const html = mod.buildExportPreviewHtml(meta, zones, blocks, filters);
        const w = window.open("", "_blank");
        if (w) {
          w.document.write(html);
          w.document.close();
        }
      } else if (kind === "pdf") {
        await mod.exportQuoteZonesPdf(meta, zones, blocks, filters);
      } else {
        await mod.exportQuoteZonesExcel(meta, zones, blocks, filters);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <h3 className="font-display text-lg">Экспорт сметы</h3>
          <button
            type="button"
            className="text-sm text-[var(--muted)]"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>

        <div className="max-h-[60vh] space-y-1 overflow-y-auto px-4 py-3 text-sm">
          <label className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={includeSummary}
              onChange={(e) => setIncludeSummary(e.target.checked)}
            />
            Сводная ведомость
          </label>
          <label className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={allTabsOneSheet}
              onChange={(e) => setAllTabsOneSheet(e.target.checked)}
            />
            Все вкладки на одном листе (только .xls)
          </label>
          <hr className="my-2 border-[var(--line)]" />
          <label className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={showEquipmentPrice}
              onChange={(e) => setShowEquipmentPrice(e.target.checked)}
            />
            Цена за оборудование
          </label>
          <label className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={showConsumablePrice}
              onChange={(e) => setShowConsumablePrice(e.target.checked)}
            />
            Цена за расходный материал
          </label>
          <label className="flex items-center gap-2 py-1">
            <input
              type="checkbox"
              checked={showServicePrice}
              onChange={(e) => setShowServicePrice(e.target.checked)}
            />
            Цена за услуги
          </label>
          <hr className="my-2 border-[var(--line)]" />
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Зоны
          </p>
          {zones.map((z) => (
            <label key={z.id} className="flex items-center gap-2 py-1">
              <input
                type="checkbox"
                checked={zoneOn[z.id] !== false}
                onChange={(e) =>
                  setZoneOn((prev) => ({ ...prev, [z.id]: e.target.checked }))
                }
              />
              {z.name}
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-[var(--line)] px-4 py-3">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("pdf")}
            className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white disabled:opacity-40"
          >
            {busy === "pdf" ? "PDF…" : "Скачать (pdf)"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("xls")}
            className="rounded-md bg-[var(--solid)] px-3 py-2 text-sm text-[var(--on-solid)] disabled:opacity-40"
          >
            {busy === "xls" ? "Excel…" : "Скачать (xls)"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void run("preview")}
            className="rounded-md border border-[var(--line)] px-3 py-2 text-sm disabled:opacity-40"
          >
            Предпросмотр
          </button>
        </div>
      </div>
    </div>
  );
}
