"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type PickedCatalogItem } from "@/components/CatalogPicker";
import { QuoteCatalogSidebar } from "@/components/QuoteCatalogSidebar";
import { ClientQuickSearch } from "@/components/ClientQuickSearch";
import { VenueQuickSearch } from "@/components/VenueQuickSearch";
import { DateRangePicker } from "@/components/DateRangePicker";
import { QuoteFilesField } from "@/components/QuoteFilesField";
import { SpecEditor } from "@/components/SpecEditor";
import { ExportQuoteModal } from "@/components/ExportQuoteModal";
import { QuoteDocumentsPanel } from "@/components/QuoteDocumentsModal";
import { QuoteAssignments } from "@/components/QuoteAssignments";
import { QuoteHistoryPanel } from "@/components/QuoteHistoryModal";
import { QuoteSummary } from "@/components/QuoteSummary";
import {
  ApplyTemplateModal,
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
  isPersonnelOrServiceKind,
  SERVICES_SECTION_TITLE,
} from "@/lib/quote-defaults";
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
import {
  applyAutoMountDemount,
  appendOccupancyParams,
  quoteTimeOptions,
} from "@/lib/quote-schedule";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PaymentFlags } from "@/components/ui";
import { cn } from "@/lib/cn";
import { isQuoteOwnerRole } from "@/lib/roles";
import { parseTemplatePayload } from "@/lib/quote-structure";

type Lifecycle = "CALCULATED" | "CONFIRMED" | "CANCELLED" | "COMPLETED";

type ManagerOption = { id: string; name: string };

type QuoteMeta = {
  id: string;
  proposalNumber: string;
  eventName: string;
  date: string;
  mountDate: string;
  mountDurationDays: number;
  demountDate: string;
  demountDurationDays: number;
  time: string;
  place: string;
  venueId: string | null;
  client: string;
  clientId: string | null;
  managerName: string;
  ownerId: string;
  cashless: boolean;
  cashlessPercent: number;
  durationDays: number;
  notes: string[];
  lifecycle: Lifecycle;
  invoiceRequired: boolean;
  invoiceSent: boolean;
  paid: boolean;
  paymentComment: string;
  discountPercent: number;
  brief: string;
  createdAt: string;
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

const ACTION_BTN =
  "inline-flex shrink-0 items-center justify-center rounded-md border border-[var(--line)] px-2 py-1.5 disabled:opacity-40";

const ACTION_ICON = "size-4 sm:size-[1.125rem]";

const PANE_TAB =
  "relative -mb-px shrink-0 rounded-t-lg border border-b-0 px-3 py-2 text-xs whitespace-nowrap transition-colors sm:text-sm";

function resizeItemNameField(element: HTMLTextAreaElement | null) {
  if (!element) return;
  const maxHeight = 104;
  element.style.height = "auto";
  element.style.height = `${Math.min(element.scrollHeight, maxHeight)}px`;
  element.style.overflowY =
    element.scrollHeight > maxHeight ? "auto" : "hidden";
}

const EDITOR_PANES = [
  "main",
  "quote",
  "spec",
  "history",
  "team",
  "docs",
] as const;
type EditorPane = (typeof EDITOR_PANES)[number];

function parseEditorPane(
  value: string | null | undefined,
  isManager: boolean,
): EditorPane {
  if ((value === "quote" || value === "docs") && !isManager) return "spec";
  if (
    value === "main" ||
    value === "spec" ||
    value === "history" ||
    value === "team" ||
    value === "docs" ||
    value === "quote"
  ) {
    return value;
  }
  return isManager ? "quote" : "spec";
}

export function QuoteEditor({
  quoteId,
  isManager = false,
  canEditSpec = false,
  initialZone = null,
  initialPane = null,
}: {
  quoteId: string;
  isManager?: boolean;
  canEditSpec?: boolean;
  initialZone?: string | null;
  initialPane?: string | null;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState<QuoteMeta | null>(null);
  const [zones, setZones] = useState<ZoneTab[]>([]);
  const [blocks, setBlocks] = useState<EditableBlock[]>([]);
  const [activeTab, setActiveTab] = useState<string>("summary");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [fromTemplateOpen, setFromTemplateOpen] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editorPane, setEditorPane] = useState<EditorPane>(() =>
    parseEditorPane(initialPane, isManager),
  );
  const [openedPanes, setOpenedPanes] = useState<Set<EditorPane>>(
    () => new Set([parseEditorPane(initialPane, isManager)]),
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [laborKey, setLaborKey] = useState(0);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [stockIssues, setStockIssues] = useState<
    Array<{
      catalogItemId?: string;
      name: string;
      needed: number;
      available: number;
      shortfall?: number;
    }>
  >([]);
  const [stockMap, setStockMap] = useState<Record<string, StockInfo | null>>(
    {},
  );
  const [lineNotice, setLineNotice] = useState("");
  const specFlushRef = useRef<(() => Promise<boolean>) | null>(null);
  const showHistory = isManager || canEditSpec;

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
        mountDurationDays: Math.max(1, data.mountDurationDays || 1),
        demountDate: data.demountDate || "",
        demountDurationDays: Math.max(1, data.demountDurationDays || 1),
        time: data.time,
        place: data.place,
        venueId: data.venueId ?? null,
        client: data.client,
        clientId: data.clientId ?? null,
        managerName: data.managerName,
        ownerId: data.ownerId || data.owner?.id || "",
        cashless: data.cashless,
        cashlessPercent:
          data.cashlessPercent == null ? 10 : Number(data.cashlessPercent),
        durationDays: data.durationDays,
        notes: data.notes,
        lifecycle: data.lifecycle,
        invoiceRequired: data.invoiceRequired,
        invoiceSent: data.invoiceSent,
        paid: data.paid,
        paymentComment: data.paymentComment || "",
        discountPercent: Number(data.discountPercent) || 0,
        brief: typeof data.brief === "string" ? data.brief : "",
        createdAt: data.createdAt || "",
      });
      const loadedZones: ZoneTab[] = (data.zones || []).map(
        (z: ZoneTab) => ({
          id: z.id,
          name: z.name,
          sortOrder: z.sortOrder,
          active: z.active !== false,
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
      if (reloadKey === 0) {
        if (initialZone === "summary") {
          setActiveTab("summary");
        } else if (
          initialZone &&
          loadedZones.some((z) => z.id === initialZone)
        ) {
          setActiveTab(initialZone);
        } else {
          setActiveTab(loadedZones[0]?.id || "summary");
        }
      }
      setLoading(false);
    })();
  }, [quoteId, reloadKey, initialZone]);

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
              .filter((u) => isQuoteOwnerRole(u.role) && u.active)
              .map((u) => ({ id: u.id, name: u.name })),
          );
        },
      )
      .catch(() => {});
  }, [isManager]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (exportOpen || templateOpen || fromTemplateOpen) return;
      const el = e.target as HTMLElement | null;
      const inField =
        !!el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("quote-catalog-search")?.focus();
        return;
      }
      if (!inField && e.key === "/") {
        e.preventDefault();
        document.getElementById("quote-catalog-search")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exportOpen, templateOpen, fromTemplateOpen]);

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
      meta.cashlessPercent,
    );
  }, [zones, blocks, meta]);

  const activeZoneId = activeTab === "summary" ? null : activeTab;
  const insertZoneId = activeZoneId || zones[0]?.id || "";
  const insertZoneName =
    zones.find((z) => z.id === insertZoneId)?.name || "";

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
    return calcDocument(
      zoneBlocks,
      meta.cashless,
      meta.durationDays,
      meta.cashlessPercent,
    );
  }, [zoneBlocks, meta]);

  const blockTotals = useMemo(() => {
    if (activeTab === "summary") {
      return {
        name: "Сводная",
        payable: zoneSummary.payable,
        itemCount: zoneSummary.itemCount,
        subtotal: zoneSummary.subtotal,
        discount: zoneSummary.discount,
      };
    }
    const z = zoneSummary.zones.find((row) => row.zoneId === activeTab);
    return {
      name: zones.find((zone) => zone.id === activeTab)?.name || "вкладка",
      payable: z?.payable ?? 0,
      itemCount: z?.itemCount ?? 0,
      subtotal: z?.subtotal ?? 0,
      discount: z?.discount ?? 0,
    };
  }, [activeTab, zoneSummary, zones]);

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
    const activeIds = new Set(
      zones.filter((z) => z.active !== false).map((z) => z.id),
    );
    for (const b of blocks) {
      if (b.type !== "ITEM" || !b.catalogItemId) continue;
      if (b.zoneId && !activeIds.has(b.zoneId)) continue;
      const q = Number(b.qty) || 0;
      if (q <= 0) continue;
      map.set(b.catalogItemId, (map.get(b.catalogItemId) || 0) + q);
    }
    return map;
  }, [blocks, zones]);

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
      appendOccupancyParams(params, meta);
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
    ): Promise<boolean> => {
      if (
        (nextMeta.lifecycle === "CONFIRMED" ||
          nextMeta.lifecycle === "COMPLETED") &&
        !nextMeta.venueId
      ) {
        setError("Выберите площадку из справочника");
        setSaving(false);
        return false;
      }
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
          mountDurationDays: nextMeta.mountDurationDays,
          demountDate: nextMeta.demountDate,
          demountDurationDays: nextMeta.demountDurationDays,
          time: nextMeta.time,
          place: nextMeta.place,
          venueId: nextMeta.venueId,
          client: nextMeta.client,
          clientId: nextMeta.clientId,
          managerName: nextMeta.managerName,
          ownerId: nextMeta.ownerId || undefined,
          cashless: nextMeta.cashless,
          cashlessPercent: nextMeta.cashlessPercent,
          durationDays: nextMeta.durationDays,
          notes: nextMeta.notes,
          lifecycle: nextMeta.lifecycle,
          invoiceSent: nextMeta.invoiceSent,
          paid: nextMeta.paid,
          paymentComment: nextMeta.paymentComment,
          discountPercent: nextMeta.discountPercent,
          brief: nextMeta.brief,
          zones: nextZones.map((z, i) => ({
            id: z.id,
            name: z.name,
            sortOrder: i,
            active: z.active !== false,
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
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          typeof data.error === "string" ? data.error : "Не удалось сохранить",
        );
        return false;
      }
      const data = await res.json().catch(() => ({}));
      const issues = Array.isArray(data.stockIssues) ? data.stockIssues : [];
      setStockIssues(issues);
      setSavedAt(new Date().toLocaleTimeString("ru-RU"));
      return true;
    },
    [quoteId],
  );

  useEffect(() => {
    if (!isManager || !meta || loading || zones.length === 0) return;
    const t = setTimeout(() => {
      void persist(meta, zones, blocks);
    }, 800);
    return () => clearTimeout(t);
  }, [isManager, meta, zones, blocks, loading, persist]);

  function updateMeta<K extends keyof QuoteMeta>(key: K, value: QuoteMeta[K]) {
    setMeta((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function goToPane(next: EditorPane) {
    setEditorPane(next);
    setOpenedPanes((prev) => {
      if (prev.has(next)) return prev;
      const copy = new Set(prev);
      copy.add(next);
      return copy;
    });
    const params = new URLSearchParams();
    if (next !== "quote") params.set("tab", next);
    const qs = params.toString();
    router.replace(`/quotes/${quoteId}${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  async function saveNow() {
    if (!meta) return;
    await persist(meta, zones, blocks);
  }

  async function applyTemplateCanvas(template: {
    cashless: boolean;
    cashlessPercent: number;
    discountPercent: number;
    notes: string[];
    payload: unknown;
  }) {
    if (!meta) return;
    const structure = parseTemplatePayload(template.payload);
    const nextZones: ZoneTab[] = structure.zones.map((z, i) => ({
      id: newId(),
      name: z.name,
      sortOrder: z.sortOrder ?? i,
      active: true,
    }));
    if (nextZones.length === 0) {
      throw new Error("В шаблоне нет зон");
    }
    const lastZone = nextZones.length - 1;
    const nextBlocks: EditableBlock[] = structure.blocks.map((b, i) => {
      const id = newId();
      const zi = Math.min(Math.max(0, b.zoneIndex), lastZone);
      return {
        key: id,
        id,
        type: b.type as EditableBlock["type"],
        sortOrder: b.sortOrder ?? i,
        title: b.title ?? null,
        name: b.name ?? null,
        qty: b.qty ?? 0,
        unitPrice: b.unitPrice ?? 0,
        cashlessOverride: b.cashlessOverride ?? null,
        dayMode: b.dayMode ?? "HALF_EXTRA",
        dayCoefOverride: b.dayCoefOverride ?? null,
        catalogItemId: b.catalogItemId ?? null,
        kitId: b.kitId ?? null,
        zoneId: nextZones[zi].id,
      };
    });
    const nextMeta: QuoteMeta = {
      ...meta,
      cashless: template.cashless,
      cashlessPercent: Number(template.cashlessPercent) || 0,
      discountPercent: Number(template.discountPercent) || 0,
      notes: Array.isArray(template.notes) ? template.notes : meta.notes,
    };
    const collapsed = collapseKitBlocks(nextBlocks);
    setMeta(nextMeta);
    setZones(nextZones);
    setBlocks(collapsed);
    setActiveTab("summary");
    goToPane("quote");
    await persist(nextMeta, nextZones, collapsed);
  }

  async function deleteQuote() {
    setDeleting(true);
    setError("");
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          typeof data.error === "string" ? data.error : "Не удалось удалить",
        );
        setDeleteOpen(false);
        return;
      }
      router.push("/quotes");
    } catch {
      setError("Не удалось удалить");
      setDeleteOpen(false);
    } finally {
      setDeleting(false);
    }
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
        qty: 0,
        unitPrice: 0,
        dayMode: "HALF_EXTRA",
        zoneId,
        itemKind: "EQUIPMENT",
      },
    ]);
  }

  function insertAfterSection(
    list: EditableBlock[],
    zoneId: string,
    sectionTitle: string,
    item: EditableBlock,
  ): EditableBlock[] {
    const next = [...list];
    let sectionIdx = next.findIndex(
      (b) =>
        b.zoneId === zoneId && b.type === "SECTION" && b.title === sectionTitle,
    );
    if (sectionIdx < 0) {
      let insertAt = next.length;
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].zoneId === zoneId) {
          insertAt = i + 1;
          break;
        }
      }
      next.splice(insertAt, 0, {
        key: uid(),
        type: "SECTION",
        sortOrder: 0,
        title: sectionTitle,
        zoneId,
      });
      sectionIdx = insertAt;
    }
    let end = sectionIdx + 1;
    while (end < next.length) {
      if (next[end].zoneId === zoneId && next[end].type === "SECTION") break;
      end++;
    }
    next.splice(end, 0, item);
    return next.map((b, i) => ({ ...b, sortOrder: i }));
  }

  function addFromCatalog(item: PickedCatalogItem, qty = 1) {
    const zoneId = requireZone();
    if (!zoneId) return;
    const addQty = Math.max(1, Math.round(qty) || 1);
    const sectionTitle = isPersonnelOrServiceKind(item.itemKind)
      ? SERVICES_SECTION_TITLE
      : item.category.path.split("/")[0] || item.category.name;
    setLineNotice("");
    setBlocks((prev) => {
      const existingSameZone = prev.find(
        (b) =>
          b.type === "ITEM" &&
          b.catalogItemId === item.id &&
          b.zoneId === zoneId &&
          !b.kitId,
      );
      if (existingSameZone) {
        return prev.map((b) =>
          b.key === existingSameZone.key
            ? { ...b, qty: (Number(b.qty) || 0) + addQty }
            : b,
        );
      }
      const existingOther = prev.find(
        (b) =>
          b.type === "ITEM" &&
          b.catalogItemId === item.id &&
          b.zoneId !== zoneId &&
          !b.kitId,
      );
      if (existingOther) {
        const zoneName =
          zones.find((z) => z.id === existingOther.zoneId)?.name || "другой зоне";
        setLineNotice(
          `«${item.name}» уже есть в зоне «${zoneName}» — добавлено ещё раз`,
        );
      }
      return insertAfterSection(prev, zoneId, sectionTitle, {
        key: uid(),
        type: "ITEM",
        sortOrder: 0,
        name: item.name,
        qty: addQty,
        unitPrice: item.basePrice,
        cashlessOverride: item.cashlessOverride,
        dayMode: item.dayMode,
        catalogItemId: item.id,
        zoneId,
        itemKind: item.itemKind || "EQUIPMENT",
      });
    });
  }

  function addZone() {
    const id = newId();
    const name = prompt("Название зоны", `Зона ${zones.length + 1}`);
    if (!name?.trim()) return;
    setZones((prev) => [
      ...prev,
      { id, name: name.trim(), sortOrder: prev.length, active: true },
    ]);
    setActiveTab(id);
  }

  function renameZone(id: string, name: string) {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, name } : z)));
  }

  function toggleZoneActive(id: string) {
    setZones((prev) =>
      prev.map((z) =>
        z.id === id ? { ...z, active: z.active === false } : z,
      ),
    );
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
    <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 px-3 py-4 md:px-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
          <button
            type="button"
            onClick={() => router.push("/quotes")}
            className="shrink-0 text-sm text-[var(--muted)] hover:text-[var(--accent-deep)]"
          >
            ← {isManager ? "Сметы" : "Мероприятия"}
          </button>
          <label className="flex min-w-0 items-center gap-1 text-sm">
            <span className="shrink-0 text-[var(--muted)]">№</span>
            <input
              className="field w-14 px-1.5 py-1 text-center tabular-nums"
              value={meta.proposalNumber}
              aria-label="Номер КП"
              disabled={!isManager}
              onChange={(e) => updateMeta("proposalNumber", e.target.value)}
            />
          </label>
          <input
            className="field min-w-[8rem] flex-1 py-1 font-medium"
            value={meta.eventName}
            placeholder="Название мероприятия"
            aria-label="Название мероприятия"
            disabled={!isManager}
            onChange={(e) => updateMeta("eventName", e.target.value)}
          />
          <p className="text-[11px] text-[var(--muted)]">
            {saving
              ? "Сохранение…"
              : savedAt
                ? `Сохранено ${savedAt}`
                : "Автосохранение"}
            {error ? ` · ${error}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-x-3 border-b border-[var(--line)]">
          <div
            className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto"
            role="tablist"
            aria-label="Разделы карточки сметы"
          >
            {(
              [
                ["main", "Основное"],
                ["quote", "Смета"],
                ["spec", "Спека"],
                ["history", "История"],
                ["team", "Команда"],
                ["docs", "Документы"],
              ] as const
            )
              .filter(([id]) => {
                if (id === "quote" || id === "docs") return isManager;
                if (id === "history") return showHistory;
                return true;
              })
              .map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => goToPane(id)}
                  role="tab"
                  aria-selected={editorPane === id}
                  className={cn(
                    PANE_TAB,
                    editorPane === id
                      ? "border-[var(--line)] bg-[var(--panel)] font-semibold text-[var(--ink)] after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-[var(--panel)]"
                      : "border-transparent text-[var(--muted)] hover:border-[var(--line)] hover:bg-[var(--panel-muted)] hover:text-[var(--ink)]",
                  )}
                >
                  {label}
                </button>
              ))}
          </div>
          <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-1.5 pb-1.5">
            {isManager && (
              <>
                <button
                  type="button"
                  disabled={zoneSummary.itemCount === 0}
                  onClick={() => setExportOpen(true)}
                  className="shrink-0 rounded-md bg-[var(--solid)] px-2.5 py-1.5 text-xs whitespace-nowrap text-[var(--on-solid)] disabled:opacity-40 sm:text-sm"
                >
                  Excel
                </button>
                <button
                  type="button"
                  onClick={() => setDuplicateOpen(true)}
                  title="Копировать"
                  aria-label="Копировать"
                  className={ACTION_BTN}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={ACTION_ICON}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    <rect x="8" y="8" width="12" height="12" rx="2" />
                    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setTemplateOpen(true)}
                  title="В шаблон"
                  aria-label="В шаблон"
                  className={ACTION_BTN}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={ACTION_ICON}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    <path d="M7 3.5h7.5L19.5 9v11A1.5 1.5 0 0 1 18 21.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
                    <path d="M14.5 3.5V9h5" />
                    <path d="M12 13v6M9 16h6" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setFromTemplateOpen(true)}
                  title="Из шаблона"
                  aria-label="Из шаблона"
                  className={ACTION_BTN}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={ACTION_ICON}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    <path d="M7 3.5h7.5L19.5 9v11A1.5 1.5 0 0 1 18 21.5H7A1.5 1.5 0 0 1 5.5 20V5A1.5 1.5 0 0 1 7 3.5Z" />
                    <path d="M14.5 3.5V9h5" />
                    <path d="M12 12.5v6M12 18.5l-2.2-2.2M12 18.5l2.2-2.2" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void saveNow()}
                  title={saving ? "Сохранение…" : "Сохранить"}
                  aria-label={saving ? "Сохранение…" : "Сохранить"}
                  className={ACTION_BTN}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={ACTION_ICON}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    <path d="M5 5h11l3 3v11H5V5Z" />
                    <path d="M8 5v5h8V5M8 19v-6h8v6" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={saving || deleting}
                  onClick={() => setDeleteOpen(true)}
                  title="Удалить смету"
                  aria-label="Удалить смету"
                  className={cn(ACTION_BTN, "text-[var(--danger)] hover:bg-red-500/15")}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={ACTION_ICON}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    <path d="M4 7h16" />
                    <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {stockIssues.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/15 px-4 py-3 text-sm">
          <p className="font-medium">
            Смета сохранена. Не хватает на складе (можно субаренда):
          </p>
          <ul className="mt-1 list-disc pl-5">
            {stockIssues.map((s) => (
              <li key={s.catalogItemId || s.name}>
                {s.name}: не хватает{" "}
                {s.shortfall ?? Math.max(0, s.needed - s.available)} (нужно{" "}
                {s.needed}, свободно {s.available})
              </li>
            ))}
          </ul>
        </div>
      )}
      {lineNotice ? (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--panel-muted)] px-4 py-2 text-sm">
          {lineNotice}
        </div>
      ) : null}

      {editorPane === "main" ? (
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3 [&_.field]:px-2.5 [&_.field]:py-1.5">
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
            <div className="grid gap-2.5">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-1.5">
                <label className="w-[11.5rem] min-w-0 text-[11px] text-[var(--muted)]">
                  Статус КП
                  <select
                    className="field mt-0.5 text-sm"
                    value={meta.lifecycle}
                    aria-label="Статус сметы"
                    disabled={!isManager}
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
                {meta.createdAt ? (
                  <p className="pb-2 text-[10px] text-[var(--muted)]">
                    {new Date(meta.createdAt).toLocaleDateString("ru-RU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                ) : null}
                <div className="ml-auto min-w-0">
                  <div className="mb-0.5 text-[11px] text-[var(--muted)]">
                    Оплата
                  </div>
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
              </div>

              <div className="grid gap-x-3 gap-y-2 sm:grid-cols-2">
                <DateRangePicker
                  dense
                  date={meta.date}
                  durationDays={meta.durationDays}
                  disabled={!isManager}
                  onChange={(date, durationDays) => {
                    setMeta((prev) => {
                      if (!prev) return prev;
                      const auto = applyAutoMountDemount({
                        prevDate: prev.date,
                        prevDurationDays: prev.durationDays,
                        nextDate: date,
                        nextDurationDays: durationDays,
                        mountDate: prev.mountDate,
                        demountDate: prev.demountDate,
                      });
                      return { ...prev, date, durationDays, ...auto };
                    });
                  }}
                />
                <DateRangePicker
                  dense
                  label="Монтаж"
                  emptyLabel="Не указан"
                  date={meta.mountDate}
                  durationDays={meta.mountDurationDays}
                  disabled={!isManager}
                  onChange={(mountDate, mountDurationDays) => {
                    setMeta((prev) =>
                      prev
                        ? { ...prev, mountDate, mountDurationDays }
                        : prev,
                    );
                  }}
                />
                <label className="text-[11px] text-[var(--muted)]">
                  Время
                  <select
                    className="field mt-0.5 text-sm"
                    value={meta.time}
                    disabled={!isManager}
                    onChange={(e) => updateMeta("time", e.target.value)}
                  >
                    <option value="">Не указано</option>
                    {quoteTimeOptions(meta.time).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <DateRangePicker
                  dense
                  label="Демонтаж"
                  emptyLabel="Не указан"
                  date={meta.demountDate}
                  durationDays={meta.demountDurationDays}
                  disabled={!isManager}
                  onChange={(demountDate, demountDurationDays) => {
                    setMeta((prev) =>
                      prev
                        ? { ...prev, demountDate, demountDurationDays }
                        : prev,
                    );
                  }}
                />
                <div className="text-[11px] text-[var(--muted)]">
                  <span className="flex items-baseline justify-between gap-2">
                    Площадка
                    {meta.venueId && isManager ? (
                      <button
                        type="button"
                        className="text-[10px] text-[var(--accent)] hover:underline"
                        onClick={() =>
                          setMeta((prev) =>
                            prev
                              ? { ...prev, place: "", venueId: null }
                              : prev,
                          )
                        }
                      >
                        Сменить
                      </button>
                    ) : (
                      <Link
                        href="/venues"
                        target="_blank"
                        className="text-[10px] text-[var(--accent)] hover:underline"
                      >
                        Добавить
                      </Link>
                    )}
                  </span>
                  <VenueQuickSearch
                    compact
                    value={meta.place}
                    selectedId={meta.venueId}
                    disabled={!isManager}
                    onChange={(text) =>
                      setMeta((prev) =>
                        prev
                          ? { ...prev, place: text, venueId: null }
                          : prev,
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
                    onClear={() =>
                      setMeta((prev) =>
                        prev ? { ...prev, place: "", venueId: null } : prev,
                      )
                    }
                  />
                </div>
                <label className="text-[11px] text-[var(--muted)]">
                  Менеджер
                  {isManager && managers.length > 0 ? (
                    <select
                      className="field mt-0.5 text-sm"
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
                      className="field mt-0.5 text-sm"
                      value={meta.managerName}
                      disabled
                      readOnly
                    />
                  )}
                </label>
                <label className="text-[11px] text-[var(--muted)]">
                  Заказчик
                  <ClientQuickSearch
                    value={meta.client}
                    onChange={(text) =>
                      setMeta((prev) =>
                        prev
                          ? { ...prev, client: text, clientId: null }
                          : prev,
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
                </label>
                <div className="grid grid-cols-[minmax(0,1fr)_4.75rem] items-end gap-2">
                  <label className="field flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={meta.cashless}
                      disabled={!isManager}
                      onChange={(e) =>
                        updateMeta("cashless", e.target.checked)
                      }
                    />
                    Безнал
                  </label>
                  <label
                    className="text-[11px] text-[var(--muted)]"
                    title="К безналу от наличной цены (стандарт 10%). Наличные без начисления; безнал = нал / (1 − %/100)."
                  >
                    %
                    <input
                      type="number"
                      min={0}
                      max={99}
                      step={0.1}
                      className="field mt-0.5 text-sm"
                      disabled={!isManager}
                      value={meta.cashlessPercent}
                      onChange={(e) =>
                        updateMeta(
                          "cashlessPercent",
                          Math.min(99, Math.max(0, Number(e.target.value) || 0)),
                        )
                      }
                    />
                  </label>
                </div>
              </div>

              <QuoteFilesField quoteId={quoteId} canEdit={isManager} />
            </div>

            <label className="flex min-h-0 min-w-0 flex-col text-[11px] text-[var(--muted)] xl:self-stretch">
              ТЗ от заказчика
              <textarea
                className="field mt-0.5 min-h-[12rem] flex-1 resize-y text-sm"
                placeholder="Техническое задание. Позже подставится из анкеты администратора."
                disabled={!isManager}
                value={meta.brief}
                onChange={(e) => updateMeta("brief", e.target.value)}
              />
            </label>
          </div>
        </section>
      ) : null}

      {editorPane === "team" ? (
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <QuoteAssignments
              quoteId={quoteId}
              canEdit={showHistory}
              compact
              kind="EVENT"
              onChanged={() => setLaborKey((k) => k + 1)}
            />
            <QuoteAssignments
              quoteId={quoteId}
              canEdit={showHistory}
              compact
              kind="MOUNT"
              onChanged={() => setLaborKey((k) => k + 1)}
            />
          </div>
        </section>
      ) : null}

      {editorPane === "quote" ? (
        <div className="flex min-h-0 flex-col gap-3 lg:flex-row lg:items-start">
          <QuoteCatalogSidebar
            onPickItem={addFromCatalog}
            eventDate={meta.date}
            durationDays={meta.durationDays}
            zoneName={insertZoneName}
            currentQtyByItem={neededByItem}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-3">
      <QuoteZoneTabs
        zones={zones}
        activeId={activeTab}
        onSelect={setActiveTab}
        onAdd={addZone}
        onRename={renameZone}
        onDelete={deleteZone}
        onToggleActive={toggleZoneActive}
        canEdit={isManager}
      />

      {activeTab === "summary" ? (
        <QuoteSummary
          quoteId={quoteId}
          summary={zoneSummary}
          discountPercent={meta.discountPercent}
          onDiscountPercentChange={(v) => updateMeta("discountPercent", v)}
          cashlessPercent={meta.cashlessPercent}
          onCashlessPercentChange={(v) => updateMeta("cashlessPercent", v)}
          cashless={meta.cashless}
          canEdit={isManager}
          laborKey={laborKey}
        />
      ) : (
        <>
          {zones.find((z) => z.id === activeTab)?.active === false ? (
            <p className="text-sm text-[var(--muted)]">
              Зона выключена: не входит в сумму КП и складской резерв. Включить
              можно в меню вкладки.
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--panel)]">
            <table className="w-full min-w-[1120px] table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-20" />
                <col className="w-28" />
                <col className="w-28" />
                <col className="w-20" />
                <col className="w-10" />
                <col className="w-10" />
                <col className="w-10" />
                <col className="w-28" />
                <col className="w-12" />
              </colgroup>
              <thead className="bg-[var(--table-head)] text-xs uppercase text-[var(--muted)]">
                <tr>
                  <th className="px-2 py-2 text-left">Тип / название</th>
                  <th className="px-2 py-2">Кол-во</th>
                  <th className="px-2 py-2">Цена</th>
                  <th className="px-2 py-2">Режим дня</th>
                  <th className="px-2 py-2">Коэф</th>
                  <StockHeaderCells />
                  <th className="px-2 py-2 text-right">Сумма</th>
                  <th className="px-2 py-2" />
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
                          block.type === "SECTION"
                            ? "bg-[var(--selected)]"
                            : "bg-[var(--selected)]/35",
                          isDragging && "opacity-50",
                          isDropTarget && "ring-2 ring-inset ring-[var(--accent)]",
                        )}
                      >
                        <td className="px-2 py-2" colSpan={8}>
                          <div
                            className={cn(
                              "flex items-center gap-2",
                              block.type === "KIT_HEADER" && "pl-5",
                            )}
                          >
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
                              className={cn(
                                "field",
                                block.type === "SECTION"
                                  ? "text-base font-bold"
                                  : "text-sm font-semibold",
                              )}
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
                  const shortfall =
                    !isKit && stock && !stock.unlimited && needed > stock.available
                      ? needed - stock.available
                      : 0;
                  return (
                    <tr
                      key={block.key}
                      {...rowDragProps}
                      className={cn(
                        isKit
                          ? "border-t border-[var(--line)] bg-[var(--selected)]/40"
                          : "border-t border-[var(--line)]",
                        shortfall > 0 && "bg-amber-500/10",
                        isDragging && "opacity-50",
                        isDropTarget && "ring-2 ring-inset ring-[var(--accent)]",
                      )}
                    >
                      <td className="py-2 pl-6 pr-2">
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
                          <textarea
                            ref={resizeItemNameField}
                            rows={1}
                            className="field min-h-9 max-h-[6.5rem] resize-none overflow-hidden leading-5"
                            value={block.name || ""}
                            onChange={(e) => {
                              resizeItemNameField(e.currentTarget);
                              updateBlock(block.key, { name: e.target.value });
                            }}
                          />
                          {shortfall > 0 && (
                            <span className="text-xs font-medium text-[var(--danger)]">
                              не хватает {shortfall}
                            </span>
                          )}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="number"
                          min={0}
                          className="field"
                          value={block.qty ? block.qty : ""}
                          placeholder="—"
                          onChange={(e) => {
                            const raw = e.target.value;
                            updateBlock(block.key, {
                              qty:
                                raw === ""
                                  ? 0
                                  : Math.max(0, Number(raw) || 0),
                            });
                          }}
                        />
                      </td>
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
                      <StockMarks needed={needed} info={isKit ? null : stock} />
                      <td className="px-2 py-2 text-right align-middle font-medium tabular-nums">
                        {formatMoney(line?.lineTotal ?? 0)}
                        <p className="text-[10px] font-normal text-[var(--muted)]">
                          коэф {formatNumber(line?.dayCoef ?? 0)}
                        </p>
                      </td>
                      <td className="px-2 py-2 align-middle">
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
                      Добавьте позицию из каталога слева или создайте раздел вручную
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
          </div>
        </>
      )}

      <section className="flex flex-col gap-4 rounded-xl border border-[var(--line)] bg-[var(--bg)]/95 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--muted)]">
            Итого по блоку
          </p>
          <p className="font-display text-3xl">
            {formatMoney(blockTotals.payable)}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {blockTotals.name} · позиций: {blockTotals.itemCount} · без скидки{" "}
            {formatMoney(blockTotals.subtotal)}
          </p>
        </div>
        <div className="sm:text-right">
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
        </div>
      </section>
          </div>
        </div>
      ) : null}

      {openedPanes.has("spec") ? (
        <div className={editorPane === "spec" ? "" : "hidden"}>
          <SpecEditor
            key={reloadKey}
            quoteId={quoteId}
            isManager={isManager}
            embedded
            flushRef={specFlushRef}
          />
        </div>
      ) : null}

      {openedPanes.has("history") && showHistory ? (
        <div className={editorPane === "history" ? "" : "hidden"}>
          <QuoteHistoryPanel
            quoteId={quoteId}
            onRestored={() => setReloadKey((k) => k + 1)}
            onBeforeQuoteSnapshot={async () => {
              if (!isManager) return true;
              if (!meta) return false;
              return persist(meta, zones, blocks);
            }}
            onBeforeSpecSnapshot={async () => {
              if (specFlushRef.current) return specFlushRef.current();
              return true;
            }}
          />
        </div>
      ) : null}

      {openedPanes.has("docs") ? (
        <div className={editorPane === "docs" ? "" : "hidden"}>
          <QuoteDocumentsPanel
            quoteId={quoteId}
            proposalNumber={meta.proposalNumber}
            eventName={meta.eventName}
            eventDate={meta.date}
            venue={meta.place}
            clientName={meta.client}
            clientId={meta.clientId}
            amount={zoneSummary.payable}
            zones={zones}
            blocks={blocks}
            canEdit={isManager}
            onInvoiceSentChange={(sent) =>
              setMeta((prev) =>
                prev ? { ...prev, invoiceSent: sent || prev.paid } : prev,
              )
            }
            exportMeta={{
              proposalNumber: meta.proposalNumber,
              eventName: meta.eventName,
              date: meta.date,
              time: meta.time,
              place: meta.place,
              client: meta.client,
              managerName: meta.managerName,
              cashless: meta.cashless,
              cashlessPercent: meta.cashlessPercent,
              durationDays: meta.durationDays,
              discountPercent: meta.discountPercent,
              notes: meta.notes,
            }}
          />
        </div>
      ) : null}

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
          cashlessPercent: meta.cashlessPercent,
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
          <ApplyTemplateModal
            open={fromTemplateOpen}
            onClose={() => setFromTemplateOpen(false)}
            onApply={applyTemplateCanvas}
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
          <ConfirmDialog
            open={deleteOpen}
            title="Удалить смету?"
            message={`Смета № ${meta.proposalNumber} и связанные данные будут удалены без возможности восстановления.`}
            busy={deleting}
            onConfirm={() => void deleteQuote()}
            onCancel={() => {
              if (!deleting) setDeleteOpen(false);
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
