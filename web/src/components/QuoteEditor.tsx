"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CatalogPicker,
  type PickedCatalogItem,
  type PickedKit,
} from "@/components/CatalogPicker";
import { CatalogQuickSearch } from "@/components/CatalogQuickSearch";
import { ClientQuickSearch } from "@/components/ClientQuickSearch";
import { VenueQuickSearch } from "@/components/VenueQuickSearch";
import {
  DateRangePicker,
  SingleDatePicker,
} from "@/components/DateRangePicker";
import { ExportQuoteModal } from "@/components/ExportQuoteModal";
import { QuoteAssignments } from "@/components/QuoteAssignments";
import { QuoteSummary } from "@/components/QuoteSummary";
import {
  DuplicateQuoteModal,
  SaveTemplateModal,
} from "@/components/QuoteTemplateActions";
import { QuoteZoneTabs, type ZoneTab } from "@/components/QuoteZoneTabs";
import {
  StockHeaderCells,
  StockMarks,
  type StockInfo,
} from "@/components/StockMarks";
import { formatMoney, formatNumber } from "@/lib/format";
import { collapseKitBlocks } from "@/lib/kit-blocks";
import {
  isGroupHeader,
  reorderBlocksByDrop,
} from "@/lib/quote-block-groups";
import {
  calcByZones,
  calcDocument,
  toPrismaDayMode,
  type QuoteBlockInput,
} from "@/lib/quote-calc";
import { PaymentFlags } from "@/components/ui";
import { cn } from "@/lib/cn";

type Lifecycle = "CALCULATED" | "CONFIRMED" | "CANCELLED" | "COMPLETED";

type ManagerOption = { id: string; name: string };

type QuoteMeta = {
  id: string;
  proposalNumber: string;
  eventName: string;
  date: string;
  mountDate: string;
  demountDate: string;
  time: string;
  place: string;
  venueId: string | null;
  client: string;
  clientId: string | null;
  managerName: string;
  ownerId: string;
  cashless: boolean;
  durationDays: number;
  notes: string[];
  lifecycle: Lifecycle;
  invoiceRequired: boolean;
  invoiceSent: boolean;
  paid: boolean;
  paymentComment: string;
  discountPercent: number;
};

type EditableBlock = QuoteBlockInput & { key: string; zoneId: string };

function uid() {
  return `tmp-${Math.random().toString(36).slice(2, 10)}`;
}

function newId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  }
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const LIFE_OPTS: { value: Lifecycle; label: string }[] = [
  { value: "CALCULATED", label: "Посчитано" },
  { value: "CONFIRMED", label: "Подтверждено" },
  { value: "CANCELLED", label: "Отменено" },
  { value: "COMPLETED", label: "Завершено" },
];

export function QuoteEditor({
  quoteId,
  isManager = false,
}: {
  quoteId: string;
  isManager?: boolean;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState<QuoteMeta | null>(null);
  const [zones, setZones] = useState<ZoneTab[]>([]);
  const [blocks, setBlocks] = useState<EditableBlock[]>([]);
  const [activeTab, setActiveTab] = useState<string>("summary");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [laborKey, setLaborKey] = useState(0);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [stockIssues, setStockIssues] = useState<
    Array<{ name: string; needed: number; available: number }>
  >([]);
  const [stockMap, setStockMap] = useState<Record<string, StockInfo | null>>(
    {},
  );

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/quotes/${quoteId}`);
      if (!res.ok) {
        setError("Смета не найдена");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setMeta({
        id: data.id,
        proposalNumber: data.proposalNumber,
        eventName: data.eventName,
        date: data.date,
        mountDate: data.mountDate || "",
        demountDate: data.demountDate || "",
        time: data.time,
        place: data.place,
        venueId: data.venueId ?? null,
        client: data.client,
        clientId: data.clientId ?? null,
        managerName: data.managerName,
        ownerId: data.ownerId || data.owner?.id || "",
        cashless: data.cashless,
        durationDays: data.durationDays,
        notes: data.notes,
        lifecycle: data.lifecycle,
        invoiceRequired: data.invoiceRequired,
        invoiceSent: data.invoiceSent,
        paid: data.paid,
        paymentComment: data.paymentComment || "",
        discountPercent: Number(data.discountPercent) || 0,
      });
      const loadedZones: ZoneTab[] = (data.zones || []).map(
        (z: ZoneTab) => ({
          id: z.id,
          name: z.name,
          sortOrder: z.sortOrder,
        }),
      );
      setZones(loadedZones);
      const fallbackZone = loadedZones[0]?.id || "";
      const mapped: EditableBlock[] = data.blocks.map(
        (
          b: QuoteBlockInput & {
            id: string;
            zoneId?: string | null;
            catalogItem?: { itemKind?: string } | null;
          },
        ): EditableBlock => ({
          key: b.id,
          id: b.id,
          type: b.type,
          sortOrder: b.sortOrder,
          title: b.title,
          name: b.name,
          qty: b.qty,
          unitPrice: b.unitPrice,
          cashlessOverride: b.cashlessOverride,
          dayMode: b.dayMode,
          dayCoefOverride: b.dayCoefOverride,
          catalogItemId: b.catalogItemId,
          kitId: b.kitId,
          zoneId: b.zoneId || fallbackZone,
          itemKind: b.catalogItem?.itemKind ?? b.itemKind ?? null,
        }),
      );
      setBlocks(collapseKitBlocks(mapped));
      setActiveTab(loadedZones[0]?.id || "summary");
      setLoading(false);
    })();
  }, [quoteId]);

  useEffect(() => {
    if (!isManager) return;
    void fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then(
        (
          list: Array<{
            id: string;
            name: string;
            role: string;
            active: boolean;
          }>,
        ) => {
          if (!Array.isArray(list)) return;
          setManagers(
            list
              .filter((u) => u.role === "MANAGER" && u.active)
              .map((u) => ({ id: u.id, name: u.name })),
          );
        },
      )
      .catch(() => {});
  }, [isManager]);

  const zoneSummary = useMemo(() => {
    if (!meta) {
      return calcByZones([], [], true, 1, 10);
    }
    return calcByZones(
      zones,
      blocks,
      meta.cashless,
      meta.durationDays,
      meta.discountPercent,
    );
  }, [zones, blocks, meta]);

  const activeZoneId = activeTab === "summary" ? null : activeTab;

  const zoneBlocks = useMemo(() => {
    if (!activeZoneId) return [];
    return blocks
      .filter((b) => b.zoneId === activeZoneId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [blocks, activeZoneId]);

  const zoneCalc = useMemo(() => {
    if (!meta) {
      return {
        blocks: [],
        sections: [],
        itemCount: 0,
        total: 0,
        totalCash: 0,
        totalCashless: 0,
      };
    }
    return calcDocument(zoneBlocks, meta.cashless, meta.durationDays);
  }, [zoneBlocks, meta]);

  const calcByKey = useMemo(() => {
    const map = new Map<string, (typeof zoneCalc.blocks)[number]>();
    zoneCalc.blocks.forEach((b, i) => {
      const key = zoneBlocks[i]?.key;
      if (key) map.set(key, b);
    });
    return map;
  }, [zoneCalc.blocks, zoneBlocks]);

  const neededByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of blocks) {
      if (b.type !== "ITEM" || !b.catalogItemId) continue;
      const q = Number(b.qty) || 0;
      if (q <= 0) continue;
      map.set(b.catalogItemId, (map.get(b.catalogItemId) || 0) + q);
    }
    return map;
  }, [blocks]);

  const catalogIdsKey = useMemo(() => {
    const ids = [
      ...new Set(
        blocks
          .filter((b) => b.type === "ITEM" && b.catalogItemId)
          .map((b) => b.catalogItemId!),
      ),
    ].sort();
    return ids.join(",");
  }, [blocks]);

  useEffect(() => {
    if (!meta || !catalogIdsKey) {
      setStockMap({});
      return;
    }
    const t = setTimeout(() => {
      const params = new URLSearchParams();
      params.set("ids", catalogIdsKey);
      if (meta.date) params.set("eventDate", meta.date);
      params.set("days", String(meta.durationDays || 1));
      params.set("excludeQuoteId", quoteId);
      void fetch(`/api/stock?${params}`)
        .then((r) => r.json())
        .then((data: Record<string, StockInfo | null>) => {
          if (data && typeof data === "object") setStockMap(data);
        })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [meta, catalogIdsKey, quoteId]);

  const persist = useCallback(
    async (
      nextMeta: QuoteMeta,
      nextZones: ZoneTab[],
      nextBlocks: EditableBlock[],
    ) => {
      setSaving(true);
      setError("");
      setStockIssues([]);
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proposalNumber: nextMeta.proposalNumber,
          eventName: nextMeta.eventName,
          date: nextMeta.date,
          mountDate: nextMeta.mountDate,
          demountDate: nextMeta.demountDate,
          time: nextMeta.time,
          place: nextMeta.place,
          venueId: nextMeta.venueId,
          client: nextMeta.client,
          clientId: nextMeta.clientId,
          managerName: nextMeta.managerName,
          ownerId: nextMeta.ownerId || undefined,
          cashless: nextMeta.cashless,
          durationDays: nextMeta.durationDays,
          notes: nextMeta.notes,
          lifecycle: nextMeta.lifecycle,
          invoiceSent: nextMeta.invoiceSent,
          paid: nextMeta.paid,
          paymentComment: nextMeta.paymentComment,
          discountPercent: nextMeta.discountPercent,
          zones: nextZones.map((z, i) => ({
            id: z.id,
            name: z.name,
            sortOrder: i,
          })),
          blocks: nextBlocks.map((b, i) => ({
            type: b.type,
            sortOrder: i,
            title: b.title ?? null,
            name: b.name ?? null,
            qty: b.qty ?? 0,
            unitPrice: b.unitPrice ?? 0,
            cashlessOverride: b.cashlessOverride ?? null,
            dayMode: toPrismaDayMode(String(b.dayMode || "HALF_EXTRA")),
            dayCoefOverride: b.dayCoefOverride ?? null,
            catalogItemId: b.catalogItemId ?? null,
            kitId: b.kitId ?? null,
            zoneId: b.zoneId,
          })),
        }),
      });
      setSaving(false);
      if (res.status === 409) {
        const data = await res.json();
        setStockIssues(data.stockIssues || []);
        setError(data.error || "Конфликт склада");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          typeof data.error === "string" ? data.error : "Не удалось сохранить",
        );
        return;
      }
      setSavedAt(new Date().toLocaleTimeString("ru-RU"));
    },
    [quoteId],
  );

  useEffect(() => {
    if (!meta || loading || zones.length === 0) return;
    const t = setTimeout(() => {
      void persist(meta, zones, blocks);
    }, 800);
    return () => clearTimeout(t);
  }, [meta, zones, blocks, loading, persist]);

  function updateMeta<K extends keyof QuoteMeta>(key: K, value: QuoteMeta[K]) {
    setMeta((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function updateBlock(key: string, patch: Partial<EditableBlock>) {
    setBlocks((prev) =>
      prev.map((b) => (b.key === key ? { ...b, ...patch } : b)),
    );
  }

  function removeBlock(key: string) {
    setBlocks((prev) => prev.filter((b) => b.key !== key));
  }

  function applyZoneOrder(nextZoneBlocks: EditableBlock[]) {
    if (!activeZoneId) return;
    setBlocks((prev) => {
      const others = prev.filter((b) => b.zoneId !== activeZoneId);
      const merged = [...others, ...nextZoneBlocks];
      return merged.map((x, i) => ({ ...x, sortOrder: i }));
    });
  }

  function dropBlock(fromKey: string, toKey: string) {
    if (!activeZoneId || fromKey === toKey) return;
    const zone = blocks
      .filter((b) => b.zoneId === activeZoneId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const next = reorderBlocksByDrop(zone, fromKey, toKey);
    if (next) applyZoneOrder(next);
  }

  function requireZone(): string | null {
    if (activeZoneId) return activeZoneId;
    if (zones[0]) {
      setActiveTab(zones[0].id);
      return zones[0].id;
    }
    return null;
  }

  function addSection() {
    const zoneId = requireZone();
    if (!zoneId) return;
    setBlocks((prev) => [
      ...prev,
      {
        key: uid(),
        type: "SECTION",
        sortOrder: prev.length,
        title: "Новый раздел",
        zoneId,
      },
    ]);
  }

  function addCustomItem() {
    const zoneId = requireZone();
    if (!zoneId) return;
    setBlocks((prev) => [
      ...prev,
      {
        key: uid(),
        type: "ITEM",
        sortOrder: prev.length,
        name: "Новая позиция",
        qty: 1,
        unitPrice: 0,
        dayMode: "HALF_EXTRA",
        zoneId,
        itemKind: "EQUIPMENT",
      },
    ]);
  }

  function addFromCatalog(item: PickedCatalogItem, qty = 1) {
    const zoneId = requireZone();
    if (!zoneId) return;
    const addQty = Math.max(1, Math.round(qty) || 1);
    setBlocks((prev) => {
      const inZone = prev.filter((b) => b.zoneId === zoneId);
      const next = [...prev];
      const sectionTitle = item.category.path.split("/")[0] || item.category.name;
      const hasSection = inZone.some(
        (b) => b.type === "SECTION" && b.title === sectionTitle,
      );
      if (!hasSection) {
        next.push({
          key: uid(),
          type: "SECTION",
          sortOrder: next.length,
          title: sectionTitle,
          zoneId,
        });
      }
      const existing = next.find(
        (b) =>
          b.type === "ITEM" &&
          b.catalogItemId === item.id &&
          b.zoneId === zoneId &&
          !b.kitId,
      );
      if (existing) {
        return next.map((b) =>
          b.key === existing.key
            ? { ...b, qty: (Number(b.qty) || 0) + addQty }
            : b,
        );
      }
      next.push({
        key: uid(),
        type: "ITEM",
        sortOrder: next.length,
        name: item.name,
        qty: addQty,
        unitPrice: item.basePrice,
        cashlessOverride: item.cashlessOverride,
        dayMode: item.dayMode,
        catalogItemId: item.id,
        zoneId,
        itemKind: item.itemKind || "EQUIPMENT",
      });
      return next.map((b, i) => ({ ...b, sortOrder: i }));
    });
  }

  function addKit(kit: PickedKit, qty = 1) {
    const zoneId = requireZone();
    if (!zoneId) return;
    const addQty = Math.max(1, Math.round(qty) || 1);
    setBlocks((prev) => {
      const inZone = prev.filter((b) => b.zoneId === zoneId);
      const next = [...prev];
      const sectionTitle =
        kit.category?.path?.split("/")[0] ||
        kit.category?.name ||
        "Комплекты";
      if (!inZone.some((b) => b.type === "SECTION" && b.title === sectionTitle)) {
        next.push({
          key: uid(),
          type: "SECTION",
          sortOrder: next.length,
          title: sectionTitle,
          zoneId,
        });
      }
      const existing = next.find(
        (b) => b.type === "ITEM" && b.kitId === kit.id && b.zoneId === zoneId,
      );
      if (existing) {
        return next.map((b) =>
          b.key === existing.key
            ? { ...b, qty: (Number(b.qty) || 0) + addQty }
            : b,
        );
      }
      next.push({
        key: uid(),
        type: "ITEM",
        sortOrder: next.length,
        name: kit.name,
        qty: addQty,
        unitPrice: kit.computedPrice,
        dayMode: "FIXED1",
        kitId: kit.id,
        catalogItemId: null,
        zoneId,
        itemKind: "EQUIPMENT",
      });
      return next.map((b, i) => ({ ...b, sortOrder: i }));
    });
  }

  function addZone() {
    const id = newId();
    const name = prompt("Название зоны", `Зона ${zones.length + 1}`);
    if (!name?.trim()) return;
    setZones((prev) => [
      ...prev,
      { id, name: name.trim(), sortOrder: prev.length },
    ]);
    setActiveTab(id);
  }

  function renameZone(id: string, name: string) {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, name } : z)));
  }

  function deleteZone(id: string) {
    if (zones.length <= 1) return;
    const count = blocks.filter((b) => b.zoneId === id).length;
    if (count > 0) {
      alert("Сначала очистите или перенесите позиции из этой зоны");
      return;
    }
    if (!confirm("Удалить пустую зону?")) return;
    setZones((prev) => prev.filter((z) => z.id !== id));
    if (activeTab === id) {
      setActiveTab(zones.find((z) => z.id !== id)?.id || "summary");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 text-[var(--muted)]">
        Загрузка сметы…
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10 text-[var(--danger)]">
        {error || "Ошибка"}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div className="animate-fade-up">
          <button
            type="button"
            onClick={() => router.push("/quotes")}
            className="text-sm text-[var(--muted)] hover:text-[var(--accent-deep)]"
          >
            ← К списку смет
          </button>
          <p className="mt-2 text-xs uppercase tracking-[0.15em] text-[var(--muted)]">
            Смета
          </p>
          <h1 className="mt-1 text-3xl font-light tracking-tight text-[var(--ink)]">
            Редактор КП
          </h1>
          <p className="text-xs text-[var(--muted)]">
            {saving
              ? "Сохранение…"
              : savedAt
                ? `Сохранено в ${savedAt}`
                : "Автосохранение"}
            {error ? ` · ${error}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isManager && (
            <>
              <button
                type="button"
                onClick={() => setTemplateOpen(true)}
                className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
              >
                В шаблон
              </button>
              <button
                type="button"
                onClick={() => setDuplicateOpen(true)}
                className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
              >
                Копировать
              </button>
              <button
                type="button"
                onClick={() => router.push(`/quotes/${quoteId}/spec`)}
                className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
              >
                Спецификация
              </button>
            </>
          )}
          <button
            type="button"
            disabled={zoneSummary.itemCount === 0}
            onClick={() => setExportOpen(true)}
            className="rounded-md bg-[var(--solid)] px-4 py-2 text-sm text-[var(--on-solid)] disabled:opacity-40"
          >
            Excel / PDF
          </button>
        </div>
      </header>

      {stockIssues.length > 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/15 px-4 py-3 text-sm text-red-900">
          <p className="font-medium">
            Не хватает на складе (с учётом других подтверждённых смет):
          </p>
          <ul className="mt-1 list-disc pl-5">
            {stockIssues.map((s) => (
              <li key={s.name}>
                {s.name}: нужно {s.needed}, свободно {s.available}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="grid gap-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-[var(--muted)]">№ КП</span>
            <input
              className="field mt-1"
              value={meta.proposalNumber}
              onChange={(e) => updateMeta("proposalNumber", e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-[var(--muted)]">Мероприятие</span>
            <input
              className="field mt-1"
              value={meta.eventName}
              onChange={(e) => updateMeta("eventName", e.target.value)}
            />
          </label>
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            <DateRangePicker
              date={meta.date}
              durationDays={meta.durationDays}
              disabled={!isManager}
              onChange={(date, durationDays) => {
                setMeta((prev) =>
                  prev ? { ...prev, date, durationDays } : prev,
                );
              }}
            />
            <div className="grid gap-3 content-start">
              <SingleDatePicker
                label="День монтажа"
                date={meta.mountDate}
                disabled={!isManager}
                onChange={(mountDate) =>
                  setMeta((prev) => (prev ? { ...prev, mountDate } : prev))
                }
              />
              <SingleDatePicker
                label="День демонтажа"
                date={meta.demountDate}
                disabled={!isManager}
                onChange={(demountDate) =>
                  setMeta((prev) => (prev ? { ...prev, demountDate } : prev))
                }
              />
            </div>
          </div>
          <label className="text-sm">
            <span className="text-[var(--muted)]">Время</span>
            <input
              className="field mt-1"
              value={meta.time}
              onChange={(e) => updateMeta("time", e.target.value)}
            />
          </label>
          <label className="text-sm">
            <span className="text-[var(--muted)]">Менеджер</span>
            {isManager && managers.length > 0 ? (
              <select
                className="field mt-1"
                value={meta.ownerId}
                onChange={(e) => {
                  const ownerId = e.target.value;
                  const m = managers.find((x) => x.id === ownerId);
                  setMeta((prev) =>
                    prev
                      ? {
                          ...prev,
                          ownerId,
                          managerName: m?.name || prev.managerName,
                        }
                      : prev,
                  );
                }}
              >
                {!managers.some((m) => m.id === meta.ownerId) &&
                meta.ownerId ? (
                  <option value={meta.ownerId}>{meta.managerName}</option>
                ) : null}
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="field mt-1"
                value={meta.managerName}
                disabled
                readOnly
              />
            )}
          </label>
          <label className="text-sm">
            <span className="text-[var(--muted)]">Место</span>
            <VenueQuickSearch
              value={meta.place}
              onChange={(text) =>
                setMeta((prev) =>
                  prev ? { ...prev, place: text, venueId: null } : prev,
                )
              }
              onPick={(v) =>
                setMeta((prev) =>
                  prev
                    ? {
                        ...prev,
                        place: v.name,
                        venueId: v.id,
                      }
                    : prev,
                )
              }
            />
            {meta.venueId ? (
              <span className="mt-1 block text-[10px] text-[var(--muted)]">
                Привязано к профилю площадки
              </span>
            ) : null}
          </label>
          <label className="text-sm">
            <span className="text-[var(--muted)]">Заказчик</span>
            <ClientQuickSearch
              value={meta.client}
              onChange={(text) =>
                setMeta((prev) =>
                  prev ? { ...prev, client: text, clientId: null } : prev,
                )
              }
              onPick={(c) =>
                setMeta((prev) =>
                  prev
                    ? {
                        ...prev,
                        client: c.companyName,
                        clientId: c.id,
                      }
                    : prev,
                )
              }
            />
            {meta.clientId ? (
              <span className="mt-1 block text-[10px] text-[var(--muted)]">
                Привязан к профилю клиента
              </span>
            ) : null}
          </label>
          <label className="text-sm">
            <span className="text-[var(--muted)]">Статус сметы</span>
            <select
              className="field mt-1"
              value={meta.lifecycle}
              onChange={(e) =>
                updateMeta("lifecycle", e.target.value as Lifecycle)
              }
            >
              {LIFE_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-[var(--line)] px-3 py-2 text-sm">
            <input
              type="checkbox"
              checked={meta.cashless}
              onChange={(e) => updateMeta("cashless", e.target.checked)}
            />
            Безналичный расчёт
          </label>
          {meta.invoiceRequired && (
            <div className="rounded-lg border border-[var(--line)] px-3 py-2 sm:col-span-2">
              <div className="mb-1.5 text-xs text-[var(--muted)]">Оплата</div>
              <PaymentFlags
                invoiceSent={meta.invoiceSent}
                paid={meta.paid}
                paymentComment={meta.paymentComment}
                disabled={!isManager}
                onChange={(patch) => {
                  setMeta((prev) => (prev ? { ...prev, ...patch } : prev));
                }}
              />
            </div>
          )}
        </section>

        <QuoteAssignments
          quoteId={quoteId}
          canEdit={isManager}
          compact
          onChanged={() => setLaborKey((k) => k + 1)}
        />
      </div>

      <QuoteZoneTabs
        zones={zones}
        activeId={activeTab}
        onSelect={setActiveTab}
        onAdd={addZone}
        onRename={renameZone}
        onDelete={deleteZone}
        canEdit={isManager}
      />

      {activeTab === "summary" ? (
        <QuoteSummary
          quoteId={quoteId}
          summary={zoneSummary}
          discountPercent={meta.discountPercent}
          onDiscountPercentChange={(v) => updateMeta("discountPercent", v)}
          canEdit={isManager}
          laborKey={laborKey}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <table className="w-full min-w-[1020px] text-sm">
              <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-2 py-2 text-left">Тип / название</th>
                  <th className="w-20 px-2 py-2">Кол-во</th>
                  <StockHeaderCells />
                  <th className="w-28 px-2 py-2">Цена</th>
                  <th className="w-28 px-2 py-2">Режим дня</th>
                  <th className="w-20 px-2 py-2">Коэф</th>
                  <th className="w-28 px-2 py-2">Сумма</th>
                  <th className="w-28 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {zoneBlocks.map((block) => {
                  const line = calcByKey.get(block.key);
                  const isDragging = dragKey === block.key;
                  const isDropTarget = dropKey === block.key && dragKey !== block.key;
                  const rowDragProps = {
                    onDragOver: (e: React.DragEvent) => {
                      if (!dragKey || dragKey === block.key) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dropKey !== block.key) setDropKey(block.key);
                    },
                    onDragLeave: (e: React.DragEvent) => {
                      const related = e.relatedTarget as Node | null;
                      if (
                        related &&
                        (e.currentTarget as HTMLElement).contains(related)
                      ) {
                        return;
                      }
                      setDropKey((k) => (k === block.key ? null : k));
                    },
                    onDrop: (e: React.DragEvent) => {
                      e.preventDefault();
                      const from =
                        e.dataTransfer.getData("text/plain") || dragKey;
                      setDragKey(null);
                      setDropKey(null);
                      if (from) dropBlock(from, block.key);
                    },
                  };

                  if (block.type === "SECTION" || block.type === "KIT_HEADER") {
                    return (
                      <tr
                        key={block.key}
                        {...rowDragProps}
                        className={cn(
                          block.type === "KIT_HEADER"
                            ? "bg-[var(--selected)]"
                            : "bg-[var(--selected)]/50",
                          isDragging && "opacity-50",
                          isDropTarget && "ring-2 ring-inset ring-[var(--accent)]",
                        )}
                      >
                        <td className="px-2 py-2" colSpan={8}>
                          <div className="flex items-center gap-2">
                            <DragHandle
                              label={
                                isGroupHeader(block.type)
                                  ? "Перетащить раздел со всеми позициями"
                                  : "Перетащить"
                              }
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/plain", block.key);
                                e.dataTransfer.effectAllowed = "move";
                                setDragKey(block.key);
                              }}
                              onDragEnd={() => {
                                setDragKey(null);
                                setDropKey(null);
                              }}
                            />
                            <input
                              className="field font-medium"
                              value={block.title || ""}
                              onChange={(e) =>
                                updateBlock(block.key, {
                                  title: e.target.value,
                                })
                              }
                            />
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right font-medium tabular-nums">
                          {block.type === "SECTION"
                            ? formatMoney(
                                zoneCalc.sections.find(
                                  (s) => s.title === block.title,
                                )?.subtotal ?? 0,
                              )
                            : ""}
                        </td>
                        <td className="px-2 py-2">
                          <RowActions
                            onRemove={() => removeBlock(block.key)}
                          />
                        </td>
                      </tr>
                    );
                  }
                  const isKit = Boolean(block.kitId && !block.catalogItemId);
                  const itemId = block.catalogItemId || null;
                  const stock = itemId ? stockMap[itemId] : null;
                  const needed = itemId ? neededByItem.get(itemId) || 0 : 0;
                  return (
                    <tr
                      key={block.key}
                      {...rowDragProps}
                      className={cn(
                        isKit
                          ? "border-t border-[var(--line)] bg-[var(--selected)]/40"
                          : "border-t border-[var(--line)]",
                        isDragging && "opacity-50",
                        isDropTarget && "ring-2 ring-inset ring-[var(--accent)]",
                      )}
                    >
                      <td className="px-2 py-2">
                        <div className="flex items-start gap-2">
                          <DragHandle
                            label="Перетащить позицию"
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", block.key);
                              e.dataTransfer.effectAllowed = "move";
                              setDragKey(block.key);
                            }}
                            onDragEnd={() => {
                              setDragKey(null);
                              setDropKey(null);
                            }}
                          />
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                          {isKit && (
                            <span className="w-fit rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--accent)]">
                              Комплект
                            </span>
                          )}
                          <input
                            className="field"
                            value={block.name || ""}
                            onChange={(e) =>
                              updateBlock(block.key, { name: e.target.value })
                            }
                          />
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          className="field"
                          value={block.qty ?? 0}
                          onChange={(e) =>
                            updateBlock(block.key, {
                              qty: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                      </td>
                      <StockMarks needed={needed} info={isKit ? null : stock} />
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          className="field"
                          value={block.unitPrice ?? 0}
                          onChange={(e) =>
                            updateBlock(block.key, {
                              unitPrice: Math.max(0, Number(e.target.value) || 0),
                            })
                          }
                        />
                        <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                          в КП: {formatMoney(line?.displayUnitPrice ?? 0)}
                        </p>
                      </td>
                      <td className="px-2 py-2">
                        <select
                          className="field"
                          value={String(block.dayMode || "HALF_EXTRA")}
                          onChange={(e) =>
                            updateBlock(block.key, {
                              dayMode: e.target.value,
                              dayCoefOverride: null,
                            })
                          }
                        >
                          <option value="HALF_EXTRA">1-й 100% / +50%</option>
                          <option value="FULL_DAYS">Полные дни</option>
                          <option value="FIXED1">Фикс 1</option>
                          <option value="FIXED2">Фикс 2</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          step={0.1}
                          min={0}
                          className="field"
                          value={
                            block.dayCoefOverride != null
                              ? block.dayCoefOverride
                              : (line?.dayCoef ?? 1)
                          }
                          onChange={(e) =>
                            updateBlock(block.key, {
                              dayCoefOverride:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums font-medium">
                        {formatMoney(line?.lineTotal ?? 0)}
                        <p className="text-[10px] font-normal text-[var(--muted)]">
                          коэф {formatNumber(line?.dayCoef ?? 0)}
                        </p>
                      </td>
                      <td className="px-2 py-2">
                        <RowActions onRemove={() => removeBlock(block.key)} />
                      </td>
                    </tr>
                  );
                })}
                {zoneBlocks.length === 0 && (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-4 py-8 text-center text-[var(--muted)]"
                    >
                      Добавьте раздел, позицию или комплект в эту зону
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-[var(--muted)]">
            Тяните ⠿ за ручку: раздел переносится вместе с позициями. R — нужно
            в этом КП · RT — свободно на дату · T — всего на складе
          </p>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={addSection}
                className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
              >
                + Раздел
              </button>
              <button
                type="button"
                onClick={addCustomItem}
                className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
              >
                + Позиция
              </button>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
              >
                + Из каталога / комплект
              </button>
            </div>
            <CatalogQuickSearch
              onPickItem={addFromCatalog}
              eventDate={meta.date}
              durationDays={meta.durationDays}
            />
          </div>
        </>
      )}

      <section className="rounded-xl border border-[var(--line)] bg-[var(--bg)]/95 px-4 py-3">
        <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
          Итого к оплате
        </p>
        <p className="font-display text-3xl">
          {formatMoney(zoneSummary.payable)}
        </p>
        <p className="text-xs text-[var(--muted)]">
          Позиций: {zoneSummary.itemCount} · без скидки{" "}
          {formatMoney(zoneSummary.subtotal)} · скидка{" "}
          {formatMoney(zoneSummary.discount)} ·{" "}
          {LIFE_OPTS.find((x) => x.value === meta.lifecycle)?.label}
        </p>
      </section>

      <CatalogPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPickItem={addFromCatalog}
        onPickKit={addKit}
        eventDate={meta.date}
        durationDays={meta.durationDays}
      />

      <ExportQuoteModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        meta={{
          proposalNumber: meta.proposalNumber,
          eventName: meta.eventName,
          date: meta.date,
          time: meta.time,
          place: meta.place,
          client: meta.client,
          managerName: meta.managerName,
          cashless: meta.cashless,
          durationDays: meta.durationDays,
          discountPercent: meta.discountPercent,
          notes: meta.notes,
        }}
        zones={zones}
        blocks={blocks}
      />

      {isManager && (
        <>
          <SaveTemplateModal
            open={templateOpen}
            onClose={() => setTemplateOpen(false)}
            quoteId={quoteId}
            managers={managers}
            defaultOwnerId={meta.ownerId || managers[0]?.id || ""}
          />
          <DuplicateQuoteModal
            open={duplicateOpen}
            onClose={() => setDuplicateOpen(false)}
            quoteId={quoteId}
            managers={managers}
            defaultOwnerId={meta.ownerId || managers[0]?.id || ""}
            initialDate={meta.date}
            initialDays={meta.durationDays}
            onCreated={(id) => {
              setDuplicateOpen(false);
              router.push(`/quotes/${id}`);
            }}
          />
        </>
      )}
    </div>
  );
}

function DragHandle({
  label,
  onDragStart,
  onDragEnd,
}: {
  label: string;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  return (
    <span
      draggable
      title={label}
      aria-label={label}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className="mt-1 inline-flex cursor-grab select-none items-center justify-center rounded px-1 text-[var(--muted)] hover:bg-black/5 hover:text-[var(--ink)] active:cursor-grabbing"
    >
      ⠿
    </span>
  );
}

function RowActions({ onRemove }: { onRemove: () => void }) {
  return (
    <div className="flex gap-1">
      <button
        type="button"
        className="btn-icon text-[var(--danger)]"
        onClick={onRemove}
        title="Удалить"
      >
        ×
      </button>
    </div>
  );
}
