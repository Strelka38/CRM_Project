"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type PickedCatalogItem, type PickedKit } from "@/components/CatalogPicker";
import { CatalogReplaceDropTarget } from "@/components/CatalogReplaceDropTarget";
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
  DAY_MODE_OPTIONS,
  QuoteEstimateCards,
} from "@/components/QuoteEstimateCards";
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
import { PriceInput } from "@/components/ui/PriceInput";
import { collapseKitBlocks } from "@/lib/kit-blocks";
import {
  isPersonnelOrServiceKind,
  SERVICES_SECTION_TITLE,
} from "@/lib/quote-defaults";
import {
  isGroupHeader,
  moveBlockInGroups,
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
import {
  ActionSheet,
  Button,
  CollapsibleNotice,
  LIFECYCLE_LABELS,
  LIFECYCLE_STATUSES,
  PaymentFlags,
  SideDrawer,
  type LifecycleStatus,
} from "@/components/ui";
import { useIsMobile } from "@/components/LayoutDensityProvider";
import { cn } from "@/lib/cn";
import {
  BRIGADIER_QUOTE_PATCH_KEYS,
  isQuoteOwnerRole,
} from "@/lib/roles";
import { DEFAULT_CASHLESS_PERCENT } from "@/lib/pricing";
import { isStatsLifecycle } from "@/lib/lifecycle";
import { formatIsoRuDate, parseEventDate } from "@/lib/dates";
import {
  rangeFromWorkingDayIndexes,
  peakItemQtyByWorkingDay,
  storedWorkingDayIndexes,
  workingDayCount,
  workingDayIndexesFromRange,
  zoneDurationDays,
} from "@/lib/quote-assignment-days";
import {
  isCatalogDrag,
  nearestInsertGap,
  parseCatalogDrag,
  relatedTargetStillInside,
} from "@/lib/catalog-dnd";

type Lifecycle = LifecycleStatus;

type ManagerOption = { id: string; name: string; phone: string };

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
  requestContact: string;
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

const LIFE_OPTS: { value: Lifecycle; label: string }[] =
  LIFECYCLE_STATUSES.map((value) => ({
    value,
    label: LIFECYCLE_LABELS[value],
  }));

const ACTION_ICON = "size-4 sm:size-[1.125rem]";

const PANE_TAB =
  "relative -mb-px shrink-0 rounded-t-md border border-b-0 px-2 py-1 text-xs whitespace-nowrap transition-colors md:rounded-t-lg md:px-3 md:py-2 md:text-sm";

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
  canViewQuote = false,
): EditorPane {
  if (value === "docs" && !isManager) return "spec";
  if (value === "quote" && !(isManager || canViewQuote)) return "spec";
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
  canEditBrief = false,
  canEditSchedule = false,
  canViewQuote = false,
  canManageAttachments = false,
  initialZone = null,
  initialPane = null,
  importUnmatched = null,
}: {
  quoteId: string;
  isManager?: boolean;
  canEditSpec?: boolean;
  canEditBrief?: boolean;
  canEditSchedule?: boolean;
  canViewQuote?: boolean;
  canManageAttachments?: boolean;
  initialZone?: string | null;
  initialPane?: string | null;
  importUnmatched?: number | null;
}) {
  const router = useRouter();
  const viewQuote = isManager || canViewQuote || canEditSpec;
  const editBrief = isManager || canEditBrief || canEditSpec;
  const editSchedule = isManager || canEditSchedule || canEditSpec;
  const canEditQuote = isManager;
  const canAutosave = canEditQuote || editBrief || editSchedule;
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
    parseEditorPane(initialPane, isManager, viewQuote),
  );
  const [openedPanes, setOpenedPanes] = useState<Set<EditorPane>>(
    () => new Set([parseEditorPane(initialPane, isManager, viewQuote)]),
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [managers, setManagers] = useState<ManagerOption[]>([]);
  const [laborKey, setLaborKey] = useState(0);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [catalogOver, setCatalogOver] = useState(false);
  const [catalogGapIndex, setCatalogGapIndex] = useState<number | null>(null);
  const isMobile = useIsMobile();
  const catalogInSheet = isMobile;
  const [catalogSheetOpen, setCatalogSheetOpen] = useState(false);
  const [actionsSheetOpen, setActionsSheetOpen] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
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
        requestContact:
          typeof data.requestContact === "string" ? data.requestContact : "",
        managerName: data.managerName,
        ownerId: data.ownerId || data.owner?.id || "",
        cashless: data.cashless,
        cashlessPercent:
          data.cashlessPercent == null
            ? DEFAULT_CASHLESS_PERCENT
            : Number(data.cashlessPercent),
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
          workingDayIndexes: Array.isArray(z.workingDayIndexes)
            ? z.workingDayIndexes
            : [],
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
            phone?: string;
          }>,
        ) => {
          if (!Array.isArray(list)) return;
          setManagers(
            list
              .filter((u) => isQuoteOwnerRole(u.role) && u.active)
              .map((u) => ({
                id: u.id,
                name: u.name,
                phone: typeof u.phone === "string" ? u.phone : "",
              })),
          );
        },
      )
      .catch(() => {});
  }, [isManager]);

  useEffect(() => {
    if (!isMobile || editorPane !== "team") return;
    goToPane(viewQuote ? "quote" : "spec");
  }, [isMobile, editorPane, viewQuote]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!canEditQuote || exportOpen || templateOpen || fromTemplateOpen) return;
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
  }, [canEditQuote, exportOpen, templateOpen, fromTemplateOpen]);

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
  const insertZone = zones.find((z) => z.id === insertZoneId);
  const insertZoneName = insertZone?.name || "";
  const insertZoneSchedule = useMemo(() => {
    if (!meta) {
      return { date: "", durationDays: 1 };
    }
    const start = parseEventDate(meta.date);
    if (!start || !insertZone) {
      return { date: meta.date, durationDays: meta.durationDays };
    }
    return rangeFromWorkingDayIndexes(
      start,
      meta.durationDays,
      insertZone.workingDayIndexes ?? [],
    );
  }, [meta, insertZone]);

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
      zoneDurationDays(activeZoneId, meta.durationDays, zones),
      meta.cashlessPercent,
    );
  }, [zoneBlocks, meta, activeZoneId, zones]);

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
    const activeZones = zones.filter((zone) => zone.active !== false);
    const activeIds = new Set(activeZones.map((zone) => zone.id));
    return peakItemQtyByWorkingDay(
      blocks.filter(
        (block) =>
          block.type === "ITEM" &&
          Boolean(block.catalogItemId) &&
          (!block.zoneId || activeIds.has(block.zoneId)),
      ),
      meta?.durationDays ?? 1,
      activeZones,
    );
  }, [blocks, meta?.durationDays, zones]);

  const neededByKit = useMemo(() => {
    const map = new Map<string, number>();
    for (const block of blocks) {
      if (block.type !== "ITEM" || !block.kitId || block.catalogItemId) continue;
      map.set(block.kitId, (map.get(block.kitId) || 0) + (Number(block.qty) || 0));
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
        canEditQuote &&
        isStatsLifecycle(nextMeta.lifecycle) &&
        !nextMeta.venueId
      ) {
        setError("Выберите площадку из справочника");
        setSaving(false);
        return false;
      }
      setSaving(true);
      setError("");
      setStockIssues([]);
      const payload = canEditQuote
        ? {
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
            requestContact: nextMeta.requestContact,
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
              workingDayIndexes: Array.isArray(z.workingDayIndexes)
                ? z.workingDayIndexes
                : [],
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
          }
        : Object.fromEntries(
            BRIGADIER_QUOTE_PATCH_KEYS.map((key) => [key, nextMeta[key]]),
          );
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    [quoteId, canEditQuote],
  );

  useEffect(() => {
    if (!canAutosave || !meta || loading) return;
    if (canEditQuote && zones.length === 0) return;
    const t = setTimeout(() => {
      void persist(meta, zones, blocks);
    }, 800);
    return () => clearTimeout(t);
  }, [canAutosave, canEditQuote, meta, zones, blocks, loading, persist]);

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

  useEffect(() => {
    if (!isMobile) return;
    if (editorPane === "docs" || editorPane === "team") goToPane("spec");
  }, [editorPane, isMobile]);

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
      workingDayIndexes: [],
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

  /** Перемещение стрелками — мобильная замена drag, который спорит со скроллом. */
  function moveBlock(key: string, dir: -1 | 1) {
    if (!activeZoneId) return;
    const zone = blocks
      .filter((b) => b.zoneId === activeZoneId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const next = moveBlockInGroups(zone, key, dir);
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
      return insertAfterSection(
        prev,
        zoneId,
        sectionTitle,
        catalogItemBlock(item, zoneId, addQty),
      );
    });
  }

  function catalogItemBlock(
    item: PickedCatalogItem,
    zoneId: string,
    qty: number,
  ): EditableBlock {
    return {
      key: uid(),
      type: "ITEM",
      sortOrder: 0,
      name: item.name,
      qty,
      unitPrice: item.basePrice,
      cashlessOverride: item.cashlessOverride,
      dayMode: item.dayMode,
      catalogItemId: item.id,
      zoneId,
      itemKind: item.itemKind || "EQUIPMENT",
    };
  }

  function addFromKit(kit: PickedKit, qty = 1) {
    const zoneId = requireZone();
    if (!zoneId) return;
    const addQty = Math.max(1, Math.round(qty) || 1);
    const sectionTitle =
      kit.category?.path.split("/")[0] || kit.category?.name || "Комплекты";
    setLineNotice("");
    setBlocks((prev) => {
      const existing = prev.find(
        (b) =>
          b.type === "ITEM" &&
          b.kitId === kit.id &&
          !b.catalogItemId &&
          b.zoneId === zoneId,
      );
      if (existing) {
        return prev.map((b) =>
          b.key === existing.key
            ? { ...b, qty: (Number(b.qty) || 0) + addQty }
            : b,
        );
      }
      return insertAfterSection(prev, zoneId, sectionTitle, {
        key: uid(),
        type: "ITEM",
        sortOrder: 0,
        name: kit.name,
        qty: addQty,
        unitPrice: kit.computedPrice,
        dayMode: "FIXED1",
        catalogItemId: null,
        kitId: kit.id,
        zoneId,
        itemKind: "EQUIPMENT",
      });
    });
  }

  function replaceBlockFromCatalog(key: string, item: PickedCatalogItem) {
    updateBlock(key, {
      type: "ITEM",
      name: item.name,
      catalogItemId: item.id,
      kitId: null,
    });
    setLineNotice(
      `Позиция заменена на «${item.name}», количество и расчёт сохранены`,
    );
  }

  function insertFromCatalogAt(
    index: number,
    item: PickedCatalogItem,
    qty = 1,
  ) {
    const zoneId = requireZone();
    if (!zoneId) return;
    const addQty = Math.max(1, Math.round(qty) || 1);
    setLineNotice("");
    setBlocks((prev) => {
      const zone = prev
        .filter((b) => b.zoneId === zoneId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const others = prev.filter((b) => b.zoneId !== zoneId);
      const at = Math.max(0, Math.min(index, zone.length));
      const nextZone = [
        ...zone.slice(0, at),
        catalogItemBlock(item, zoneId, addQty),
        ...zone.slice(at),
      ];
      return [...others, ...nextZone].map((b, i) => ({ ...b, sortOrder: i }));
    });
  }

  function updateCatalogInsertHint(clientY: number) {
    const root = tableRef.current;
    if (!root || !canEditQuote) return;
    const rows = root.querySelectorAll<HTMLElement>("[data-quote-row]");
    const best = nearestInsertGap(rows, clientY, catalogGapIndex);
    setCatalogGapIndex((prev) => (prev === best ? prev : best));
  }

  function onCatalogTableDragOver(e: React.DragEvent) {
    if (!canEditQuote || !isCatalogDrag(e.dataTransfer)) return false;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (!catalogOver) setCatalogOver(true);
    updateCatalogInsertHint(e.clientY);
    return true;
  }

  function onCatalogTableDragLeave(e: React.DragEvent) {
    if (!isCatalogDrag(e.dataTransfer)) return;
    if (relatedTargetStillInside(e.currentTarget, e.relatedTarget)) return;
    setCatalogOver(false);
    setCatalogGapIndex(null);
  }

  function onCatalogTableDrop(e: React.DragEvent) {
    if (!canEditQuote || !isCatalogDrag(e.dataTransfer)) return false;
    e.preventDefault();
    e.stopPropagation();
    const payload = parseCatalogDrag(e.dataTransfer);
    setCatalogOver(false);
    if (!payload) {
      setCatalogGapIndex(null);
      return true;
    }
    const rows = tableRef.current?.querySelectorAll<HTMLElement>("[data-quote-row]");
    if (rows && rows.length > 0) {
      const index = nearestInsertGap(rows, e.clientY, catalogGapIndex);
      insertFromCatalogAt(index, payload.item, payload.qty);
    } else {
      addFromCatalog(payload.item, payload.qty);
    }
    setCatalogGapIndex(null);
    return true;
  }

  function renderCatalogGap(index: number) {
    if (!canEditQuote || !catalogOver || catalogGapIndex !== index) return null;
    return (
      <tr key={`gap-${index}`} className="relative h-0 border-0">
        <td
          colSpan={canEditQuote ? 11 : 9}
          className="relative h-0 p-0"
        >
          <div
            className="pointer-events-none absolute inset-x-0 z-20"
            style={{ height: 0, top: 0 }}
          >
            <div className="absolute inset-x-3 top-0 h-0.5 -translate-y-1/2 bg-[var(--accent)]" />
          </div>
        </td>
      </tr>
    );
  }

  function addZone() {
    const id = newId();
    const name = prompt("Название зоны", `Зона ${zones.length + 1}`);
    if (!name?.trim()) return;
    setZones((prev) => [
      ...prev,
      { id, name: name.trim(), sortOrder: prev.length, active: true, workingDayIndexes: [] },
    ]);
    setActiveTab(id);
  }

  function renameZone(id: string, name: string) {
    setZones((prev) => prev.map((z) => (z.id === id ? { ...z, name } : z)));
  }

  function setZoneWorkingDays(zoneId: string, workingDayIndexes: number[]) {
    setZones((prev) =>
      prev.map((z) => (z.id === zoneId ? { ...z, workingDayIndexes } : z)),
    );
  }

  async function saveZoneWorkingDays(zoneId: string, indexes: number[]) {
    if (!meta) return;
    const next = storedWorkingDayIndexes(indexes, meta.durationDays);
    setZoneWorkingDays(zoneId, next);
    await fetch(`/api/quotes/${quoteId}/zones/${zoneId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workingDayIndexes: next }),
    });
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

  const quoteEventStart = parseEventDate(meta.date);
  const activeZone = zones.find((z) => z.id === activeTab);
  const activeZoneRange = quoteEventStart
    ? rangeFromWorkingDayIndexes(
        quoteEventStart,
        meta.durationDays,
        activeZone?.workingDayIndexes ?? [],
      )
    : null;

  return (
    <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-2 px-2 py-2 md:gap-3 md:px-3 md:py-3">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <button
            type="button"
            onClick={() => router.push("/quotes")}
            className="shrink-0 text-sm text-[var(--muted)] hover:text-[var(--accent-deep)]"
          >
            ← {isManager ? "Сметы" : "Мероприятия"}
          </button>
          <label className="flex shrink-0 items-center gap-1 text-sm">
            <span className="shrink-0 text-[var(--muted)]">№</span>
            <input
              className="field quote-chrome-field quote-chrome-num px-1 text-center tabular-nums"
              value={meta.proposalNumber}
              aria-label="Номер КП"
              disabled={!isManager}
              onChange={(e) => updateMeta("proposalNumber", e.target.value)}
            />
          </label>
          <p
            className={cn(
              "ml-auto shrink-0 text-caption text-[var(--muted)]",
              !saving && !error && !importUnmatched && "hidden md:block",
            )}
          >
            {saving
              ? "Сохранение…"
              : savedAt
                ? `Сохранено ${savedAt}`
                : "Автосохранение"}
            {error ? ` · ${error}` : ""}
            {importUnmatched
              ? ` · импорт: ${importUnmatched} ${
                  importUnmatched === 1 ? "позиция не найдена" : "позиций не найдены"
                } в каталоге, оставлены как свободные строки`
              : ""}
          </p>
          <input
            className="field quote-chrome-field min-w-0 flex-1 font-medium md:basis-full"
            value={meta.eventName}
            placeholder="Название мероприятия"
            aria-label="Название мероприятия"
            disabled={!isManager}
            onChange={(e) => updateMeta("eventName", e.target.value)}
          />
        </div>
        <div className="flex items-end gap-1 border-b border-[var(--line)] md:gap-x-3">
          <div
            className="flex min-w-0 flex-1 flex-nowrap items-end gap-0.5 overflow-x-hidden md:gap-1 md:overflow-visible"
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
                if (id === "quote") return viewQuote;
                if (id === "docs") return isManager && !isMobile;
                if (id === "history") return showHistory;
                if (id === "team") return !isMobile;
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
          <div className="relative z-10 flex shrink-0 items-center gap-1 pb-1 md:gap-1.5 md:pb-1.5">
            {isManager && (
              <>
                <button
                  type="button"
                  disabled={zoneSummary.itemCount === 0}
                  onClick={() => setExportOpen(true)}
                  className="h-8 shrink-0 rounded-md bg-[var(--solid)] px-2.5 text-xs whitespace-nowrap text-[var(--on-solid)] disabled:opacity-40 sm:text-sm"
                >
                  Excel
                </button>
                {/* На мобильном шесть иконок без подписей нечитаемы — прячем
                    их в шит, где у каждого действия есть название. */}
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  className="h-8 min-h-8 w-8 md:hidden"
                  onClick={() => setActionsSheetOpen(true)}
                  aria-label="Действия со сметой"
                >
                  <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
                    <circle cx="5" cy="12" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="19" cy="12" r="1.6" />
                  </svg>
                </Button>
                <div className="hidden flex-wrap justify-end gap-1.5 md:flex">
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  onClick={() => setDuplicateOpen(true)}
                  title="Копировать"
                  aria-label="Копировать"
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
                </Button>
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  onClick={() => setTemplateOpen(true)}
                  title="В шаблон"
                  aria-label="В шаблон"
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
                </Button>
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  disabled={saving}
                  onClick={() => setFromTemplateOpen(true)}
                  title="Из шаблона"
                  aria-label="Из шаблона"
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
                </Button>
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  disabled={saving}
                  onClick={() => void saveNow()}
                  title={saving ? "Сохранение…" : "Сохранить"}
                  aria-label={saving ? "Сохранение…" : "Сохранить"}
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
                </Button>
                <Button
                  type="button"
                  variant="icon"
                  size="sm"
                  disabled={saving || deleting}
                  onClick={() => setDeleteOpen(true)}
                  title="Удалить смету"
                  aria-label="Удалить смету"
                  className="text-[var(--danger)] hover:bg-red-500/15"
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
                </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      {stockIssues.length > 0 && (
        <CollapsibleNotice
          storageKey="bs-crm-stock-warning"
          title="Не хватает на складе"
          summary={`${stockIssues.length} ${
            stockIssues.length % 10 === 1 && stockIssues.length % 100 !== 11
              ? "позиция"
              : stockIssues.length % 10 >= 2 &&
                  stockIssues.length % 10 <= 4 &&
                  (stockIssues.length % 100 < 12 || stockIssues.length % 100 > 14)
                ? "позиции"
                : "позиций"
          } · можно субаренда`}
          className="rounded-xl border border-amber-500/40 bg-amber-500/15 text-sm"
        >
          <ul className="list-disc px-4 pb-3 pl-8 md:px-5 md:pl-9">
            {stockIssues.map((s) => (
              <li key={s.catalogItemId || s.name}>
                {s.name}: не хватает{" "}
                {s.shortfall ?? Math.max(0, s.needed - s.available)} (нужно{" "}
                {s.needed}, свободно {s.available})
              </li>
            ))}
          </ul>
        </CollapsibleNotice>
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
              <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end md:gap-x-3">
                <label className="min-w-0 text-caption text-[var(--muted)] md:w-[11.5rem]">
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
                <div className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-4 gap-y-1 md:contents">
                  <label className="min-w-0 text-caption text-[var(--muted)] md:w-[8.5rem]">
                    Создана
                    <p className="mt-0.5 text-sm tabular-nums text-[var(--ink)]">
                      {formatIsoRuDate(meta.createdAt)}
                    </p>
                  </label>
                  <div className="min-w-0 md:ml-auto">
                    <div className="mb-0.5 text-caption text-[var(--muted)]">
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
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <DateRangePicker
                  dense
                  date={meta.date}
                  durationDays={meta.durationDays}
                  disabled={!editSchedule}
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
                  disabled={!editSchedule}
                  onChange={(mountDate, mountDurationDays) => {
                    setMeta((prev) =>
                      prev
                        ? { ...prev, mountDate, mountDurationDays }
                        : prev,
                    );
                  }}
                />
                <label className="text-caption text-[var(--muted)]">
                  Время
                  <select
                    className="field mt-0.5 text-sm"
                    value={meta.time}
                    disabled={!editSchedule}
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
                  disabled={!editSchedule}
                  onChange={(demountDate, demountDurationDays) => {
                    setMeta((prev) =>
                      prev
                        ? { ...prev, demountDate, demountDurationDays }
                        : prev,
                    );
                  }}
                />
                <div className="col-span-2 text-caption text-[var(--muted)] sm:col-span-1">
                  <span className="flex items-baseline justify-between gap-2">
                    Площадка
                    {meta.venueId && isManager ? (
                      <button
                        type="button"
                        className="text-caption text-[var(--accent)] hover:underline"
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
                        className="text-caption text-[var(--accent)] hover:underline"
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
                <label className="col-span-2 text-caption text-[var(--muted)] sm:col-span-1">
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
                <label className="col-span-2 text-caption text-[var(--muted)] sm:col-span-1">
                  Заказчик
                  <ClientQuickSearch
                    value={meta.client}
                    disabled={!isManager}
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
                <label className="col-span-2 text-caption text-[var(--muted)] sm:col-span-1">
                  Контактная информация
                  <input
                    className="field mt-0.5 text-sm"
                    value={meta.requestContact}
                    disabled={!isManager}
                    maxLength={1000}
                    placeholder="Телефон, Telegram или примечание"
                    onChange={(e) =>
                      updateMeta("requestContact", e.target.value)
                    }
                  />
                </label>
                <div className="col-span-2 grid grid-cols-[minmax(0,1fr)_4.75rem] items-end gap-2">
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
                    className="text-caption text-[var(--muted)]"
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

              <QuoteFilesField
                quoteId={quoteId}
                canEdit={isManager || canManageAttachments}
              />
            </div>

            <label className="flex min-h-0 min-w-0 flex-col text-caption text-[var(--muted)] xl:self-stretch">
              ТЗ от заказчика
              <textarea
                className="field mt-0.5 min-h-[12rem] flex-1 resize-y text-sm"
                placeholder="Техническое задание. Позже подставится из анкеты администратора."
                disabled={!editBrief}
                value={meta.brief}
                onChange={(e) => updateMeta("brief", e.target.value)}
              />
            </label>
          </div>
        </section>
      ) : null}

      {editorPane === "team" && !isMobile ? (
        <section className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-3">
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <QuoteAssignments
              quoteId={quoteId}
              canEdit={showHistory}
              compact
              kind="EVENT"
              zones={zones}
              durationDays={meta.durationDays}
              eventDate={meta.date}
              onZoneWorkingDaysChange={setZoneWorkingDays}
              onChanged={() => setLaborKey((k) => k + 1)}
            />
            <QuoteAssignments
              quoteId={quoteId}
              canEdit={showHistory}
              compact
              kind="MOUNT"
              zones={zones}
              onChanged={() => setLaborKey((k) => k + 1)}
            />
          </div>
        </section>
      ) : null}

      {editorPane === "quote" ? (
        <div className="flex min-h-0 flex-col gap-2 lg:flex-row lg:items-start">
          {isManager ? (
            // На узком экране каталог колонкой съедает половину первого экрана,
            // и смета уходит под сгиб. Поэтому там он живёт в шите по кнопке.
            catalogInSheet ? (
              <SideDrawer
                open={catalogSheetOpen}
                onClose={() => setCatalogSheetOpen(false)}
                labelledBy="quote-catalog-sheet"
              >
                <div className="flex h-full min-h-0 flex-1 flex-col">
                  <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-3">
                    <h2
                      id="quote-catalog-sheet"
                      className="min-w-0 flex-1 truncate text-title font-medium"
                    >
                      Каталог
                    </h2>
                    <button
                      type="button"
                      onClick={() => setCatalogSheetOpen(false)}
                      className="tap-target -mr-1 rounded-md px-3 text-sm text-[var(--accent)]"
                    >
                      Готово
                    </button>
                  </div>
                  <div className="min-h-0 flex-1">
                    <QuoteCatalogSidebar
                      embedded
                      onPickItem={addFromCatalog}
                      onPickKit={addFromKit}
                      eventDate={insertZoneSchedule.date || meta.date}
                      durationDays={insertZoneSchedule.durationDays}
                      zoneName={insertZoneName}
                      currentQtyByItem={neededByItem}
                      currentQtyByKit={neededByKit}
                    />
                  </div>
                </div>
              </SideDrawer>
            ) : (
              <QuoteCatalogSidebar
                onPickItem={addFromCatalog}
                onPickKit={addFromKit}
                eventDate={insertZoneSchedule.date || meta.date}
                durationDays={insertZoneSchedule.durationDays}
                zoneName={insertZoneName}
                currentQtyByItem={neededByItem}
                currentQtyByKit={neededByKit}
              />
            )
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
      <QuoteZoneTabs
        zones={zones}
        activeId={activeTab}
        onSelect={setActiveTab}
        onAdd={addZone}
        onRename={renameZone}
        onDelete={deleteZone}
        onToggleActive={toggleZoneActive}
        canEdit={isManager}
        eventDate={meta.date}
        durationDays={meta.durationDays}
      />

      {activeTab !== "summary" &&
      isManager &&
      workingDayCount(meta.durationDays) >= 2 ? (
        <div className="max-w-sm">
          {quoteEventStart && activeZoneRange ? (
            <DateRangePicker
              dense
              label="Даты зоны"
              emptyLabel="Выберите даты зоны…"
              date={activeZoneRange.date}
              durationDays={activeZoneRange.durationDays}
              onChange={(date, durationDays) => {
                const rangeStart = parseEventDate(date);
                if (!rangeStart || !activeTab) return;
                void saveZoneWorkingDays(
                  activeTab,
                  workingDayIndexesFromRange(
                    quoteEventStart,
                    meta.durationDays,
                    rangeStart,
                    durationDays,
                  ),
                );
              }}
            />
          ) : (
            <p className="text-xs text-[var(--muted)]">
              Сначала укажите даты мероприятия — по ним зона попадёт в расчёт дней и календарь Сроста.
            </p>
          )}
        </div>
      ) : null}

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
              Зона выключена: не входит в сумму КП и складской резерв.
              {canEditQuote ? " Включить можно в меню вкладки." : ""}
            </p>
          ) : null}
          <fieldset
            disabled={!isManager}
            className="min-w-0 border-0 p-0 disabled:opacity-90"
          >
          {/* Смета карточками. Ветку выбирает CSS, а не JS: после SSR первый
              кадр должен быть правильным, иначе на телефоне мелькает таблица. */}
          <QuoteEstimateCards
            className="md:hidden"
            blocks={zoneBlocks}
            canEdit={canEditQuote}
            lineFor={(key) => calcByKey.get(key)}
            shortfallFor={(block) => {
              const itemId = block.catalogItemId || null;
              if (!itemId || (block.kitId && !block.catalogItemId)) return 0;
              const stock = stockMap[itemId];
              const needed = neededByItem.get(itemId) || 0;
              if (!stock || stock.unlimited || needed <= stock.available) {
                return 0;
              }
              return needed - stock.available;
            }}
            sectionSubtotal={(title) =>
              zoneCalc.sections.find((s) => s.title === title)?.subtotal ?? 0
            }
            onUpdate={(key, patch) => updateBlock(key, patch)}
            onRemove={removeBlock}
            onMove={moveBlock}
            emptyMessage={
              canEditQuote
                ? "Пока пусто. Добавьте раздел или позицию кнопками ниже."
                : "В этой зоне пока нет позиций"
            }
          />

          <div
            ref={tableRef}
            className={cn(
              "data-table-shell quote-estimate-table-wrap hidden md:block",
              catalogOver && "ring-2 ring-inset ring-[var(--accent)]",
            )}
            onDragOver={canEditQuote ? onCatalogTableDragOver : undefined}
            onDragLeave={canEditQuote ? onCatalogTableDragLeave : undefined}
            onDrop={canEditQuote ? onCatalogTableDrop : undefined}
          >
            <table className={cn(
              "data-table quote-estimate-table w-full min-w-[880px] table-fixed text-xs",
              canEditQuote && "data-table--editable",
            )}>
              <colgroup>
                <col />
                <col className="w-14" />
                {canEditQuote ? <col className="w-10" /> : null}
                <col className="w-20" />
                <col className="w-24" />
                <col className="w-14" />
                <col className="w-8" />
                <col className="w-8" />
                <col className="w-8" />
                <col className="w-24" />
                {canEditQuote ? <col className="w-9" /> : null}
              </colgroup>
              <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wide text-[var(--muted)]">
                <tr>
                  <th className="px-1.5 py-1.5 text-left">Тип / название</th>
                  <th className="px-1.5 py-1.5">Кол-во</th>
                  {canEditQuote ? (
                    <th
                      className="px-1 py-1.5 text-center"
                      title="Замена из каталога"
                    >
                      ⇄
                    </th>
                  ) : null}
                  <th className="px-1.5 py-1.5">Цена</th>
                  <th className="px-1.5 py-1.5">Режим дня</th>
                  <th className="px-1.5 py-1.5">Коэф</th>
                  <StockHeaderCells />
                  <th className="px-1.5 py-1.5 text-right">Сумма</th>
                  {canEditQuote ? <th className="px-1 py-1.5" /> : null}
                </tr>
              </thead>
              <tbody>
                {canEditQuote ? renderCatalogGap(0) : null}
                {zoneBlocks.map((block, index) => {
                  const line = calcByKey.get(block.key);
                  const isDragging = dragKey === block.key;
                  const isDropTarget = dropKey === block.key && dragKey !== block.key;
                  const rowDragProps = canEditQuote
                    ? {
                    onDragOver: (e: React.DragEvent) => {
                      if (onCatalogTableDragOver(e)) return;
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
                      if (onCatalogTableDrop(e)) return;
                      e.preventDefault();
                      const from =
                        e.dataTransfer.getData("text/plain") || dragKey;
                      setDragKey(null);
                      setDropKey(null);
                      if (from) dropBlock(from, block.key);
                    },
                  }
                    : {};

                  if (block.type === "SECTION" || block.type === "KIT_HEADER") {
                    return (
                      <Fragment key={block.key}>
                      <tr
                        data-quote-row
                        {...rowDragProps}
                        className={cn(
                          block.type === "SECTION"
                            ? "bg-[var(--selected)]"
                            : "bg-[var(--selected)]/35",
                          isDragging && "opacity-50",
                          isDropTarget && "ring-2 ring-inset ring-[var(--accent)]",
                        )}
                      >
                        <td
                          className="px-1.5 py-1"
                          colSpan={canEditQuote ? 9 : 8}
                        >
                          <div
                            className={cn(
                              "flex items-center gap-2",
                              block.type === "KIT_HEADER" && "pl-5",
                            )}
                          >
                            {canEditQuote ? (
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
                            ) : null}
                            <input
                              className={cn(
                                "field",
                                block.type === "SECTION"
                                  ? "text-sm font-bold"
                                  : "text-xs font-semibold",
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
                        <td className="px-1.5 py-1 text-right font-semibold tabular-nums">
                          {block.type === "SECTION"
                            ? formatMoney(
                                zoneCalc.sections.find(
                                  (s) => s.title === block.title,
                                )?.subtotal ?? 0,
                              )
                            : ""}
                        </td>
                        {canEditQuote ? (
                        <td className="px-1 py-1">
                          <RowActions
                            onRemove={() => removeBlock(block.key)}
                          />
                        </td>
                        ) : null}
                      </tr>
                      {canEditQuote ? renderCatalogGap(index + 1) : null}
                      </Fragment>
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
                    <Fragment key={block.key}>
                    <tr
                      data-quote-row
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
                      <td className="py-1 pl-3 pr-1.5">
                        <div className="flex items-start gap-2">
                          {canEditQuote ? (
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
                          ) : null}
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          {isKit && (
                            <span className="w-fit rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-caption font-medium uppercase tracking-wide text-[var(--accent)]">
                              Комплект
                            </span>
                          )}
                          <textarea
                            ref={resizeItemNameField}
                            rows={1}
                            className="field min-h-7 max-h-[5rem] resize-none overflow-hidden leading-4"
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
                      <td className="px-1.5 py-1">
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
                      {canEditQuote ? (
                        <td className="px-1 py-1">
                          <CatalogReplaceDropTarget
                            disabled={block.type !== "ITEM"}
                            onDragActiveChange={(active) => {
                              if (!active) return;
                              setCatalogOver(false);
                              setCatalogGapIndex(null);
                            }}
                            onReplace={(item) =>
                              replaceBlockFromCatalog(block.key, item)
                            }
                          />
                        </td>
                      ) : null}
                      <td className="px-1.5 py-1">
                        <PriceInput
                          className="w-full min-w-0"
                          value={Number(block.unitPrice) || 0}
                          disabled={!canEditQuote}
                          navGroup="quote-unit-price"
                          onChange={(unitPrice) =>
                            updateBlock(block.key, { unitPrice })
                          }
                        />
                      </td>
                      <td className="px-1.5 py-1">
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
                          {DAY_MODE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1.5 py-1">
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
                      <td className="px-1.5 py-1 text-right align-middle font-semibold tabular-nums">
                        {formatMoney(line?.lineTotal ?? 0)}
                        <p className="text-caption font-normal text-[var(--muted)]">
                          коэф {formatNumber(line?.dayCoef ?? 0)}
                        </p>
                      </td>
                      {canEditQuote ? (
                      <td className="px-1 py-1 align-middle">
                        <RowActions onRemove={() => removeBlock(block.key)} />
                      </td>
                      ) : null}
                    </tr>
                    {canEditQuote ? renderCatalogGap(index + 1) : null}
                    </Fragment>
                  );
                })}
                {zoneBlocks.length === 0 && (
                  <tr>
                    <td
                      colSpan={canEditQuote ? 11 : 9}
                      className="px-4 py-8 text-center text-[var(--muted)]"
                    >
                      {canEditQuote
                        ? "Добавьте позицию из каталога слева, перетащите её в таблицу или создайте раздел вручную"
                        : "В этой зоне пока нет позиций"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Подсказка про drag и расшифровка складских колонок — только там,
              где есть и drag, и эти колонки. */}
          <p className="hidden text-caption text-[var(--muted)] md:block">
            {canEditQuote
              ? "Тяните ⠿ за ручку: раздел переносится вместе с позициями. Позиции из каталога можно перетащить в таблицу. "
              : ""}
            R — нужно в этом КП · RT — свободно на дату · T — всего на складе
          </p>

          {isManager ? (
          <div className="quote-dense flex flex-wrap gap-1">
              {catalogInSheet ? (
                <button
                  type="button"
                  onClick={() => setCatalogSheetOpen(true)}
                  className="min-h-11 w-full rounded-sm border border-[var(--accent)]/40 px-2 py-2 text-[11px] text-[var(--accent)] md:min-h-0 md:rounded-md md:px-2.5 md:py-1.5 md:text-xs"
                >
                  Добавить из каталога
                </button>
              ) : null}
              <button
                type="button"
                onClick={addSection}
                className="min-h-11 flex-1 rounded-sm border border-[var(--line)] px-2 py-2 text-[11px] md:min-h-0 md:flex-none md:rounded-md md:px-2.5 md:py-1.5 md:text-xs"
              >
                + Раздел
              </button>
              <button
                type="button"
                onClick={addCustomItem}
                className="min-h-11 flex-1 rounded-sm border border-[var(--line)] px-2 py-2 text-[11px] md:min-h-0 md:flex-none md:rounded-md md:px-2.5 md:py-1.5 md:text-xs"
              >
                + Позиция
              </button>
          </div>
          ) : null}
          </fieldset>
        </>
      )}

      <section className="quote-dense flex flex-col gap-1 rounded-md border border-[var(--line)] bg-[var(--bg)]/95 px-2 py-1.5 sm:flex-row sm:items-end sm:justify-between md:gap-2 md:rounded-lg md:px-3 md:py-2">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] md:text-xs">
            Итого по блоку
          </p>
          <p className="font-display text-sm tabular-nums md:text-2xl">
            {formatMoney(blockTotals.payable)}
          </p>
          <p className="text-[10px] text-[var(--muted)] md:text-xs">
            {blockTotals.name} · позиций: {blockTotals.itemCount} · без скидки{" "}
            {formatMoney(blockTotals.subtotal)}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)] md:text-xs">
            Итого к оплате
          </p>
          <p className="font-display text-sm tabular-nums md:text-2xl">
            {formatMoney(zoneSummary.payable)}
          </p>
          <p className="text-[10px] text-[var(--muted)] md:text-xs">
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

      {openedPanes.has("docs") && !isMobile ? (
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
              clientId: meta.clientId,
              ownerId: meta.ownerId,
              requestContact: meta.requestContact,
              managerName: meta.managerName,
              managerPhone:
                managers.find((m) => m.id === meta.ownerId)?.phone || "",
              cashless: meta.cashless,
              cashlessPercent: meta.cashlessPercent,
              durationDays: meta.durationDays,
              discountPercent: meta.discountPercent,
              notes: meta.notes,
            }}
          />
        </div>
      ) : null}

      {isManager ? (
        <ActionSheet
          open={actionsSheetOpen}
          onClose={() => setActionsSheetOpen(false)}
          title={`КП № ${meta.proposalNumber}`}
          groups={[
            {
              items: [
                {
                  label: saving ? "Сохранение…" : "Сохранить сейчас",
                  disabled: saving,
                  onSelect: () => void saveNow(),
                },
                {
                  label: "Копировать смету",
                  hint: "Создать дубль с новыми датами",
                  onSelect: () => setDuplicateOpen(true),
                },
              ],
            },
            {
              title: "Шаблоны",
              items: [
                { label: "Сохранить как шаблон", onSelect: () => setTemplateOpen(true) },
                {
                  label: "Заполнить из шаблона",
                  disabled: saving,
                  onSelect: () => setFromTemplateOpen(true),
                },
              ],
            },
            {
              items: [
                {
                  label: "Удалить смету",
                  danger: true,
                  disabled: saving || deleting,
                  onSelect: () => setDeleteOpen(true),
                },
              ],
            },
          ]}
        />
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
          clientId: meta.clientId,
          ownerId: meta.ownerId,
          requestContact: meta.requestContact,
          managerName: meta.managerName,
          managerPhone:
            managers.find((m) => m.id === meta.ownerId)?.phone || "",
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
