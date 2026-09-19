"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import { useRouter } from "next/navigation";
import { type PickedCatalogItem } from "@/components/CatalogPicker";
import { CatalogReplaceDropTarget } from "@/components/CatalogReplaceDropTarget";
import { QuoteCatalogSidebar } from "@/components/QuoteCatalogSidebar";
import { QuoteZoneTabs, type ZoneTab } from "@/components/QuoteZoneTabs";
import { SpecCards, type SpecCardPatch } from "@/components/SpecCards";
import { moveBlockInGroups } from "@/lib/quote-block-groups";
import {
  peakItemQtyByWorkingDay,
  staffCoverageLines,
  type ZoneWorkingDays,
} from "@/lib/quote-assignment-days";
import { isVacantStaff } from "@/lib/staff-slots";
import {
  StockHeaderCells,
  StockMarks,
  type StockInfo,
} from "@/components/StockMarks";
import { CollapsibleNotice } from "@/components/ui/CollapsibleNotice";
import { cn } from "@/lib/cn";
import { CATALOG_OWNERS, ownerShorts } from "@/lib/catalog-owner";
import { omitEmptyDerivedSections } from "@/lib/spec-build";
import { appendOccupancyParams } from "@/lib/quote-schedule";
import { reorderBlocksByDrop } from "@/lib/quote-block-groups";
import {
  isCatalogDrag,
  nearestInsertGap,
  parseCatalogDrag,
  relatedTargetStillInside,
} from "@/lib/catalog-dnd";

type SpecLine = {
  key: string;
  deriveKey: string | null;
  source: "derived" | "extra";
  zoneId?: string | null;
  zoneName?: string | null;
  zoneSortOrder?: number | null;
  zoneActive?: boolean;
  type: "SECTION" | "ITEM";
  title: string | null;
  name: string | null;
  qty: number;
  comment: string;
  kitName: string | null;
  catalogItemId: string | null;
  extraId: string | null;
  hidden: boolean;
  isKitHeader?: boolean;
  ownerLabel?: string;
};

type Override = {
  deriveKey: string;
  action: "HIDE" | "SET_QTY" | "RENAME" | "SET_COMMENT" | "REPLACE" | "DELETE";
  qty?: number | null;
  name?: string | null;
  catalogItemId?: string | null;
};

type Extra = {
  id: string;
  type: "SECTION" | "ITEM";
  sortOrder: number;
  zoneId?: string | null;
  zoneName?: string | null;
  zoneSortOrder?: number | null;
  zoneActive?: boolean;
  title?: string | null;
  name?: string | null;
  qty?: number;
  comment?: string;
  hidden?: boolean;
  catalogItemId?: string | null;
  ownerLabel?: string;
};

type EditableExtra = Extra & { key: string };

const OWNER_SHORTS = new Set(CATALOG_OWNERS.map((o) => o.short));

function ownerSelectValue(label: string | undefined) {
  const value = (label ?? "").trim();
  if (!value || value === "—") return "";
  return value;
}

function ownerSelectExtraOption(label: string | undefined) {
  const value = ownerSelectValue(label);
  if (!value || OWNER_SHORTS.has(value)) return null;
  return <option value={value}>{value}</option>;
}

type StaffRow = {
  id: string;
  userId: string | null;
  name: string;
  specialtyId: string;
  specialtyName: string;
  kind?: "EVENT" | "MOUNT";
  dayIndex?: number | null;
  zoneId?: string | null;
  vacant?: boolean;
  isFreelancer?: boolean;
  freelancerName?: string;
  specialty?: { id?: string; name?: string } | null;
  user?: { name?: string; firstName?: string; lastName?: string } | null;
};

type ReplaceTarget =
  | { kind: "derived"; key: string; deriveKey: string }
  | { kind: "extra"; key: string };

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `x${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function extraKey(id: string) {
  return `extra:${id}`;
}

function staffAsCoverage(a: StaffRow) {
  return {
    ...a,
    specialty: a.specialty || { id: a.specialtyId, name: a.specialtyName },
  };
}

function EyeIcon({ crossed }: { crossed?: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed && <path d="M4 4l16 16" />}
    </svg>
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

export function SpecEditor({
  quoteId,
  isManager = false,
  returnZone = null,
  embedded = false,
  flushRef,
}: {
  quoteId: string;
  isManager?: boolean;
  returnZone?: string | null;
  embedded?: boolean;
  flushRef?: MutableRefObject<(() => Promise<boolean>) | null>;
}) {
  const router = useRouter();
  const [meta, setMeta] = useState<{
    proposalNumber: string;
    eventName: string;
    date: string;
    mountDate: string;
    mountDurationDays: number;
    demountDate: string;
    demountDurationDays: number;
    place: string;
    client: string;
    durationDays: number;
    hasSnapshot: boolean;
    snapshotAt: string | null;
  } | null>(null);
  const [derived, setDerived] = useState<SpecLine[]>([]);
  const [extras, setExtras] = useState<EditableExtra[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [lineOrder, setLineOrder] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<StaffRow[]>([]);
  const [staffZones, setStaffZones] = useState<ZoneWorkingDays[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [showHidden, setShowHidden] = useState(true);
  const [activeZoneId, setActiveZoneId] = useState("");
  const [exporting, setExporting] = useState<"excel" | "pdf" | null>(null);
  const [stockMap, setStockMap] = useState<Record<string, StockInfo | null>>(
    {},
  );
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropKey, setDropKey] = useState<string | null>(null);
  const [gapIndex, setGapIndex] = useState<number | null>(null);
  const [catalogOver, setCatalogOver] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    counts: {
      added: number;
      removed: number;
      kept: number;
      extras: number;
    };
    diff: {
      added: Array<{ key: string; label: string; qty: number }>;
      removed: Array<{ key: string; label: string; qty: number }>;
      extras: Array<{ key: string; label: string }>;
    };
  } | null>(null);
  const dirtyRef = useRef(false);
  const lineOrderRef = useRef<string[]>([]);
  const tableRef = useRef<HTMLDivElement>(null);
  lineOrderRef.current = lineOrder;

  const applyPayload = useCallback((data: Record<string, unknown>) => {
    setMeta({
      proposalNumber: String(data.proposalNumber ?? ""),
      eventName: String(data.eventName ?? ""),
      date: String(data.date ?? ""),
      mountDate: String(data.mountDate ?? ""),
      mountDurationDays: Number(data.mountDurationDays) || 1,
      demountDate: String(data.demountDate ?? ""),
      demountDurationDays: Number(data.demountDurationDays) || 1,
      place: String(data.place ?? ""),
      client: String(data.client ?? ""),
      durationDays: Number(data.durationDays) || 1,
      hasSnapshot: Boolean(data.hasSnapshot),
      snapshotAt:
        typeof data.snapshotAt === "string" ? data.snapshotAt : null,
    });
    setCanEdit(Boolean(data.canEdit));
    const lines: SpecLine[] = ((data.lines as SpecLine[]) || []).map(
      (l): SpecLine => ({
        ...l,
        comment: l.comment ?? "",
      }),
    );
    setDerived(lines.filter((l) => l.source === "derived"));
    setExtras(
      ((data.extras as Array<Extra>) || []).map(
        (e): EditableExtra => ({
          key: extraKey(e.id),
          id: e.id,
          type: e.type,
          sortOrder: e.sortOrder,
          zoneId: e.zoneId ?? null,
          zoneName: e.zoneName ?? null,
          zoneSortOrder: e.zoneSortOrder ?? null,
          zoneActive: e.zoneActive !== false,
          title: e.title,
          name: e.name,
          qty: e.qty,
          comment: e.comment ?? "",
          hidden: Boolean(e.hidden),
          catalogItemId: e.catalogItemId,
          ownerLabel:
            e.ownerLabel ??
            (lines.find((l) => l.extraId === e.id)?.ownerLabel as
              | string
              | undefined) ??
            "",
        }),
      ),
    );
    setOverrides(
      ((data.overrides as Override[]) || []).map(
        (o): Override => ({
          deriveKey: o.deriveKey,
          action: o.action,
          qty: o.qty,
          name: o.name,
          catalogItemId: o.catalogItemId,
        }),
      ),
    );
    setLineOrder(
      Array.isArray(data.lineOrder)
        ? (data.lineOrder as string[])
        : lines.map((l) => l.key),
    );
    setAssignments(
      ((data.assignments as StaffRow[]) || []).slice().sort((a, b) => {
        const av = Number(a.vacant ?? isVacantStaff(a));
        const bv = Number(b.vacant ?? isVacantStaff(b));
        return bv - av;
      }),
    );
    setStaffZones(
      Array.isArray(data.zones)
        ? (data.zones as ZoneWorkingDays[]).map((z) => ({
            id: z.id,
            workingDayIndexes: z.workingDayIndexes,
          }))
        : [],
    );
    dirtyRef.current = false;
  }, []);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = Boolean(opts?.silent);
      if (!silent) setLoading(true);
      setError("");
      try {
        const res = await fetch(`/api/quotes/${quoteId}/spec`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!silent) setMeta(null);
          setError(
            typeof data.error === "string"
              ? data.error
              : res.status === 404
                ? "Смета не найдена или нет доступа"
                : `Ошибка загрузки спецификации (${res.status})`,
          );
          return;
        }
        applyPayload(data);
      } catch {
        if (!silent) setMeta(null);
        setError("Не удалось связаться с сервером");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [quoteId, applyPayload],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (
      nextOverrides: Override[],
      nextExtras: EditableExtra[],
      nextOrder: string[],
    ): Promise<boolean> => {
      if (!canEdit || !dirtyRef.current) return true;
      setSaving(true);
      setError("");
      const res = await fetch(`/api/quotes/${quoteId}/spec`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overrides: nextOverrides,
          extras: nextExtras.map((e, i) => ({
            id: e.id,
            type: e.type,
            sortOrder: i,
            zoneId: e.zoneId ?? null,
            zoneName: e.zoneName ?? null,
            zoneSortOrder: e.zoneSortOrder ?? null,
            zoneActive: e.zoneActive !== false,
            title: e.title ?? null,
            name: e.name ?? null,
            qty: e.qty ?? 0,
            comment: e.comment ?? "",
            hidden: Boolean(e.hidden),
            catalogItemId: e.catalogItemId ?? null,
            ownerLabel: e.ownerLabel ?? "",
          })),
          lineOrder: nextOrder,
          ownerLabels: [
            ...derived.map((line) => ({
              key: line.key,
              ownerLabel: line.ownerLabel ?? "",
            })),
            ...nextExtras.map((extra) => ({
              key: extra.key,
              ownerLabel: extra.ownerLabel ?? "",
            })),
          ],
        }),
      });
      setSaving(false);
      if (!res.ok) {
        setError("Не удалось сохранить");
        return false;
      }
      const data = await res.json().catch(() => null);
      if (data) applyPayload(data);
      setSavedAt(new Date().toLocaleTimeString("ru-RU"));
      return true;
    },
    [canEdit, quoteId, applyPayload, derived],
  );

  async function openImportPreview() {
    if (!canEdit) return;
    setImportBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/quotes/${quoteId}/spec/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Не удалось сравнить со сметой",
        );
        return;
      }
      setImportPreview(data);
      setImportOpen(true);
    } finally {
      setImportBusy(false);
    }
  }

  async function applyImport() {
    if (!canEdit) return;
    setImportBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/quotes/${quoteId}/spec/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Импорт не выполнен",
        );
        return;
      }
      setImportOpen(false);
      setImportPreview(null);
      await load({ silent: true });
      setSavedAt(new Date().toLocaleTimeString("ru-RU"));
    } finally {
      setImportBusy(false);
    }
  }

  useEffect(() => {
    if (loading || !canEdit || !dirtyRef.current) return;
    const t = setTimeout(() => {
      void persist(overrides, extras, lineOrder);
    }, 800);
    return () => clearTimeout(t);
  }, [overrides, extras, lineOrder, derived, loading, canEdit, persist]);

  useEffect(() => {
    if (!flushRef) return;
    flushRef.current = () => persist(overrides, extras, lineOrder);
    return () => {
      if (flushRef.current) flushRef.current = null;
    };
  }, [flushRef, persist, overrides, extras, lineOrder]);

  const allRows = useMemo(() => {
    const byKey = new Map<string, SpecLine>();
    for (const l of derived) byKey.set(l.key, l);
    for (const e of extras) {
      byKey.set(e.key, {
        key: e.key,
        deriveKey: null,
        source: "extra",
        zoneId: e.zoneId ?? null,
        zoneName: e.zoneName ?? null,
        zoneSortOrder: e.zoneSortOrder ?? null,
        zoneActive: e.zoneActive !== false,
        type: e.type,
        title: e.title ?? null,
        name: e.name ?? null,
        qty: e.qty ?? 0,
        comment: e.comment ?? "",
        kitName: null,
        catalogItemId: e.catalogItemId ?? null,
        extraId: e.id,
        hidden: Boolean(e.hidden),
        ownerLabel: e.ownerLabel,
      });
    }
    const ordered: SpecLine[] = [];
    const seen = new Set<string>();
    for (const key of lineOrder) {
      const row = byKey.get(key);
      if (row) {
        ordered.push(row);
        seen.add(key);
      }
    }
    for (const [key, row] of byKey) {
      if (!seen.has(key)) ordered.push(row);
    }
    return omitEmptyDerivedSections(ordered);
  }, [derived, extras, lineOrder]);

  const specZones = useMemo<ZoneTab[]>(() => {
    const byId = new Map<string, ZoneTab>();
    let hasUnassigned = false;
    for (const line of allRows) {
      if (!line.zoneId || !line.zoneName) {
        hasUnassigned = true;
        continue;
      }
      if (!byId.has(line.zoneId)) {
        byId.set(line.zoneId, {
          id: line.zoneId,
          name: line.zoneName,
          sortOrder: line.zoneSortOrder ?? byId.size,
          active: line.zoneActive !== false,
          workingDayIndexes: staffZones.find((z) => z.id === line.zoneId)
            ?.workingDayIndexes,
        });
      }
    }
    const zones = [...byId.values()].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"),
    );
    if (hasUnassigned) {
      zones.push({
        id: "spec-unassigned",
        name: "Без зоны",
        sortOrder: Number.MAX_SAFE_INTEGER,
        active: true,
      });
    }
    return zones;
  }, [allRows, staffZones]);

  const resolvedZoneId = specZones.some((zone) => zone.id === activeZoneId)
    ? activeZoneId
    : specZones[0]?.id ?? "";

  const insertZone = useMemo(() => {
    if (resolvedZoneId && resolvedZoneId !== "spec-unassigned") {
      return specZones.find((zone) => zone.id === resolvedZoneId) ?? null;
    }
    return specZones.find((zone) => zone.id !== "spec-unassigned") ?? null;
  }, [resolvedZoneId, specZones]);

  const displayRows = useMemo(() => {
    return allRows.filter((l) => {
      const visible = !l.hidden || (canEdit && editMode && showHidden);
      if (!visible) return false;
      if (!resolvedZoneId) return true;
      if (resolvedZoneId === "spec-unassigned") return !l.zoneId;
      return l.zoneId === resolvedZoneId;
    });
  }, [allRows, canEdit, editMode, showHidden, resolvedZoneId]);

  const neededByItem = useMemo(() => {
    return peakItemQtyByWorkingDay(
      allRows.filter(
        (line) =>
          !line.hidden &&
          line.type === "ITEM" &&
          Boolean(line.catalogItemId) &&
          line.zoneActive !== false,
      ),
      meta?.durationDays ?? 1,
      staffZones,
    );
  }, [allRows, meta?.durationDays, staffZones]);

  const catalogIdsKey = useMemo(() => {
    const ids = new Set<string>();
    for (const l of allRows) {
      if (l.type === "ITEM" && l.catalogItemId) ids.add(l.catalogItemId);
    }
    return [...ids].sort().join(",");
  }, [allRows]);

  useEffect(() => {
    if (!meta || !catalogIdsKey || !canEdit) {
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
  }, [meta, catalogIdsKey, quoteId, canEdit]);

  function markDirty() {
    dirtyRef.current = true;
  }

  function updateLineOrder(next: string[]) {
    markDirty();
    setLineOrder(next);
  }

  function setOverride(
    deriveKey: string,
    action: Override["action"],
    patch: {
      qty?: number | null;
      name?: string | null;
      catalogItemId?: string | null;
    },
  ) {
    markDirty();
    setOverrides((prev) => {
      const rest = prev.filter(
        (o) => !(o.deriveKey === deriveKey && o.action === action),
      );
      if (action === "HIDE") {
        return [...rest, { deriveKey, action: "HIDE" }];
      }
      if (action === "DELETE") {
        return [...rest, { deriveKey, action: "DELETE" }];
      }
      if (action === "SET_QTY") {
        return [...rest, { deriveKey, action: "SET_QTY", qty: patch.qty ?? 0 }];
      }
      if (action === "SET_COMMENT") {
        return [
          ...rest,
          { deriveKey, action: "SET_COMMENT", name: patch.name ?? "" },
        ];
      }
      if (action === "REPLACE") {
        return [
          ...rest,
          {
            deriveKey,
            action: "REPLACE",
            name: patch.name ?? "",
            catalogItemId: patch.catalogItemId ?? null,
          },
        ];
      }
      return [
        ...rest,
        { deriveKey, action: "RENAME", name: patch.name ?? "" },
      ];
    });
  }

  function clearOverride(deriveKey: string, action: Override["action"]) {
    markDirty();
    setOverrides((prev) =>
      prev.filter((o) => !(o.deriveKey === deriveKey && o.action === action)),
    );
  }

  function hideLine(deriveKey: string) {
    clearOverride(deriveKey, "DELETE");
    setOverride(deriveKey, "HIDE", {});
    setDerived((prev) =>
      prev.map((l) =>
        l.deriveKey === deriveKey ? { ...l, hidden: true } : l,
      ),
    );
  }

  function unhideLine(deriveKey: string) {
    clearOverride(deriveKey, "HIDE");
    setDerived((prev) =>
      prev.map((l) =>
        l.deriveKey === deriveKey ? { ...l, hidden: false } : l,
      ),
    );
  }

  function hideExtra(key: string) {
    updateExtra(key, { hidden: true });
  }

  function unhideExtra(key: string) {
    updateExtra(key, { hidden: false });
  }

  function deleteDerivedLine(line: SpecLine) {
    if (!line.deriveKey) return;
    clearOverride(line.deriveKey, "HIDE");
    setOverride(line.deriveKey, "DELETE", {});
    setDerived((prev) => prev.filter((l) => l.key !== line.key));
    updateLineOrder(lineOrderRef.current.filter((k) => k !== line.key));
  }

  function deleteLine(line: SpecLine) {
    if (line.source === "extra") {
      removeExtra(line.key);
      return;
    }
    deleteDerivedLine(line);
  }

  function toggleHideLine(line: SpecLine) {
    if (line.source === "extra") {
      if (line.hidden) unhideExtra(line.key);
      else hideExtra(line.key);
      return;
    }
    if (!line.deriveKey) return;
    if (line.hidden) unhideLine(line.deriveKey);
    else hideLine(line.deriveKey);
  }

  function displayName(line: SpecLine) {
    if (line.type === "SECTION") return line.title || "";
    return line.name || "";
  }

  function updateDerivedName(line: SpecLine, name: string) {
    if (!line.deriveKey) return;
    if (line.type === "SECTION") {
      setOverride(line.deriveKey, "RENAME", { name });
      setDerived((prev) =>
        prev.map((l) => (l.key === line.key ? { ...l, title: name } : l)),
      );
      return;
    }
    setOverride(line.deriveKey, "RENAME", { name });
    setDerived((prev) =>
      prev.map((l) => (l.key === line.key ? { ...l, name } : l)),
    );
  }

  function updateDerivedQty(line: SpecLine, qty: number) {
    if (!line.deriveKey || line.type !== "ITEM") return;
    setOverride(line.deriveKey, "SET_QTY", { qty });
    setDerived((prev) =>
      prev.map((l) => (l.key === line.key ? { ...l, qty } : l)),
    );
  }

  function updateDerivedComment(line: SpecLine, comment: string) {
    if (!line.deriveKey || line.type !== "ITEM") return;
    setOverride(line.deriveKey, "SET_COMMENT", { name: comment });
    setDerived((prev) =>
      prev.map((l) => (l.key === line.key ? { ...l, comment } : l)),
    );
  }

  function updateDerivedOwner(line: SpecLine, ownerLabel: string) {
    if (line.type !== "ITEM") return;
    markDirty();
    setDerived((prev) =>
      prev.map((l) => (l.key === line.key ? { ...l, ownerLabel } : l)),
    );
  }

  function updateExtra(key: string, patch: Partial<EditableExtra>) {
    markDirty();
    setExtras((prev) =>
      prev.map((e) => (e.key === key ? { ...e, ...patch } : e)),
    );
  }

  function removeExtra(key: string) {
    markDirty();
    setExtras((prev) => prev.filter((e) => e.key !== key));
    updateLineOrder(lineOrderRef.current.filter((k) => k !== key));
  }

  function insertExtraAt(
    index: number,
    extra: Omit<EditableExtra, "key" | "sortOrder"> & { id: string },
  ) {
    const key = extraKey(extra.id);
    const row: EditableExtra = {
      ...extra,
      key,
      sortOrder: index,
    };
    markDirty();
    setExtras((prev) => [...prev, row]);
    const visibleKeys = displayRows.map((r) => r.key);
    const beforeKey = visibleKeys[index] ?? null;
    setLineOrder((prev) => {
      const base = prev.length ? [...prev] : allRows.map((r) => r.key);
      const without = base.filter((k) => k !== key);
      if (!beforeKey) {
        without.push(key);
        return without;
      }
      const at = without.indexOf(beforeKey);
      if (at < 0) without.push(key);
      else without.splice(at, 0, key);
      return without;
    });
  }

  function appendExtra(extra: Omit<EditableExtra, "key" | "sortOrder"> & { id: string }) {
    const key = extraKey(extra.id);
    markDirty();
    setExtras((prev) => [
      ...prev,
      { ...extra, key, sortOrder: prev.length },
    ]);
    setLineOrder((prev) => {
      const base = prev.length ? prev : allRows.map((r) => r.key);
      if (base.includes(key)) return base;
      return [...base, key];
    });
  }

  function activeExtraZone() {
    return {
      zoneId: insertZone?.id ?? null,
      zoneName: insertZone?.name ?? null,
      zoneSortOrder: insertZone?.sortOrder ?? null,
      zoneActive: insertZone?.active !== false,
    };
  }

  function addSection() {
    appendExtra({
      id: uid(),
      type: "SECTION",
      ...activeExtraZone(),
      title: "Новый раздел",
      comment: "",
    });
  }

  function addCustomItem() {
    appendExtra({
      id: uid(),
      type: "ITEM",
      ...activeExtraZone(),
      name: "Новая позиция",
      qty: 1,
      comment: "",
    });
  }

  function addFromCatalog(item: PickedCatalogItem, qty = 1) {
    const addQty = Math.max(1, Math.round(qty) || 1);
    const existing = extras.find(
      (e) =>
        e.type === "ITEM" &&
        e.catalogItemId === item.id &&
        (e.zoneId ?? null) === (insertZone?.id ?? null),
    );
    if (existing) {
      updateExtra(existing.key, {
        qty: (Number(existing.qty) || 0) + addQty,
      });
      return;
    }
    appendExtra({
      id: uid(),
      type: "ITEM",
      ...activeExtraZone(),
      name: item.name,
      qty: addQty,
      comment: "",
      catalogItemId: item.id,
      ownerLabel: ownerShorts(item.owners),
    });
  }

  function insertFromCatalogAt(
    index: number,
    item: PickedCatalogItem,
    qty = 1,
  ) {
    const addQty = Math.max(1, Math.round(qty) || 1);
    insertExtraAt(index, {
      id: uid(),
      type: "ITEM",
      ...activeExtraZone(),
      name: item.name,
      qty: addQty,
      comment: "",
      catalogItemId: item.id,
      ownerLabel: ownerShorts(item.owners),
    });
  }

  function dropRow(fromKey: string, toKey: string) {
    const groupable = allRows.map((r, i) => ({
      key: r.key,
      type: r.isKitHeader ? "KIT_HEADER" : r.type,
      zoneId: "spec",
      sortOrder: i,
      row: r,
    }));
    const next = reorderBlocksByDrop(groupable, fromKey, toKey);
    if (!next) return;
    updateLineOrder(next.map((r) => r.key));
  }

  function moveLine(key: string, dir: -1 | 1) {
    const groupable = displayRows.map((r, i) => ({
      key: r.key,
      type: r.isKitHeader ? "KIT_HEADER" : r.type,
      zoneId: "spec",
      sortOrder: i,
    }));
    const nextVisible = moveBlockInGroups(groupable, key, dir);
    if (!nextVisible) return;
    const visibleKeys = nextVisible.map((r) => r.key);
    const visibleSet = new Set(visibleKeys);
    const base = lineOrderRef.current.length
      ? lineOrderRef.current
      : allRows.map((r) => r.key);
    const first = base.findIndex((k) => visibleSet.has(k));
    const rest = base.filter((k) => !visibleSet.has(k));
    if (first < 0) {
      updateLineOrder([...rest, ...visibleKeys]);
      return;
    }
    rest.splice(first, 0, ...visibleKeys);
    updateLineOrder(rest);
  }

  function patchCardLine(key: string, patch: SpecCardPatch) {
    const line = displayRows.find((l) => l.key === key);
    if (!line) return;
    const isExtra = line.source === "extra";
    if (patch.title != null || patch.name != null) {
      const value = patch.title ?? patch.name ?? "";
      if (isExtra) {
        updateExtra(
          key,
          line.type === "SECTION" ? { title: value } : { name: value },
        );
      } else {
        updateDerivedName(line, value);
      }
    }
    if (patch.qty != null) {
      if (isExtra) updateExtra(key, { qty: patch.qty });
      else updateDerivedQty(line, patch.qty);
    }
    if (patch.comment != null) {
      if (isExtra) updateExtra(key, { comment: patch.comment });
      else updateDerivedComment(line, patch.comment);
    }
    if (patch.ownerLabel != null) {
      if (isExtra) updateExtra(key, { ownerLabel: patch.ownerLabel });
      else updateDerivedOwner(line, patch.ownerLabel);
    }
  }

  function shortfallForLine(line: { type: string; catalogItemId: string | null }) {
    if (line.type === "SECTION") return 0;
    const itemId = line.catalogItemId;
    if (!itemId) return 0;
    const stock = stockMap[itemId];
    const needed = neededByItem.get(itemId) || 0;
    if (!stock || stock.unlimited || needed <= stock.available) return 0;
    return needed - stock.available;
  }

  function replaceLineFromCatalog(
    target: ReplaceTarget,
    item: PickedCatalogItem,
  ) {
    if (target.kind === "derived") {
      setOverride(target.deriveKey, "REPLACE", {
        name: item.name,
        catalogItemId: item.id,
      });
      setOverride(target.deriveKey, "RENAME", { name: item.name });
      setDerived((prev) =>
        prev.map((line) =>
          line.key === target.key
            ? {
                ...line,
                name: item.name,
                catalogItemId: item.id,
                ownerLabel: ownerShorts(item.owners),
              }
            : line,
        ),
      );
    } else {
      updateExtra(target.key, {
        name: item.name,
        catalogItemId: item.id,
        ownerLabel: ownerShorts(item.owners),
      });
    }
  }

  function onPickFromSidebar(item: PickedCatalogItem, qty?: number) {
    addFromCatalog(item, qty);
  }

  function onCatalogTableDragOver(e: React.DragEvent) {
    if (!canEdit || !editMode || !isCatalogDrag(e.dataTransfer)) return false;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (!catalogOver) setCatalogOver(true);
    const root = tableRef.current;
    if (root) {
      const rows = root.querySelectorAll<HTMLElement>("[data-spec-row]");
      const best = nearestInsertGap(rows, e.clientY, gapIndex);
      setGapIndex((prev) => (prev === best ? prev : best));
    }
    return true;
  }

  function onCatalogTableDragLeave(e: React.DragEvent) {
    if (!isCatalogDrag(e.dataTransfer)) return;
    if (relatedTargetStillInside(e.currentTarget, e.relatedTarget)) return;
    setCatalogOver(false);
    setGapIndex(null);
  }

  function onCatalogTableDrop(e: React.DragEvent) {
    if (!canEdit || !editMode || !isCatalogDrag(e.dataTransfer)) return false;
    e.preventDefault();
    e.stopPropagation();
    const payload = parseCatalogDrag(e.dataTransfer);
    setCatalogOver(false);
    if (!payload) return true;
    const rows = tableRef.current?.querySelectorAll<HTMLElement>("[data-spec-row]");
    if (rows && rows.length > 0) {
      const index = nearestInsertGap(rows, e.clientY, gapIndex);
      insertFromCatalogAt(index, payload.item, payload.qty);
    } else {
      addFromCatalog(payload.item, payload.qty);
    }
    setGapIndex(null);
    return true;
  }

  function exportLines(): SpecLine[] {
    return allRows.filter((l) => !l.hidden);
  }

  async function onExport(kind: "excel" | "pdf") {
    if (!meta) return;
    const lines = exportLines();
    if (lines.length === 0 && assignments.length === 0) return;
    setExporting(kind);
    try {
      const { exportSpecExcel, exportSpecPdf } = await import(
        "@/lib/export/spec"
      );
      const staff = staffCoverageLines(
        assignments.map(staffAsCoverage),
        meta.durationDays,
        meta.date,
        staffZones,
      ).map((line) => ({
        name: line.text,
        specialtyName: line.vacant
          ? ""
          : line.role === "должность" && line.text.includes("монтаж")
            ? "монтаж"
            : line.role,
      }));
      if (kind === "excel") await exportSpecExcel(meta, lines, staff);
      else await exportSpecPdf(meta, lines, staff);
    } finally {
      setExporting(null);
    }
  }

  if (loading && !meta) {
    return (
      <div className={embedded ? "py-4 text-sm text-[var(--muted)]" : "mx-auto max-w-6xl px-4 py-6 md:px-6"}>
        {!embedded && (
          <header className="border-b border-[var(--line)] pb-4">
            <p className="text-sm text-[var(--muted)]">
              {isManager ? "← К смете" : "← К мероприятиям"}
            </p>
            <h1 className="font-display mt-1 text-3xl text-[var(--ink)]">
              Спецификация на погрузку
            </h1>
            <p className="mt-2 text-sm text-[var(--muted)]">Загрузка…</p>
          </header>
        )}
        {embedded ? "Загрузка спецификации…" : null}
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-10 text-[var(--danger)]">
        {error || "Ошибка"}
      </div>
    );
  }

  const hiddenCount = [...derived, ...extras.map((e) => ({
    hidden: Boolean(e.hidden),
  }))].filter((l) => l.hidden).length;
  const isEditing = canEdit && editMode;
  const staffLines = staffCoverageLines(
    assignments.map(staffAsCoverage),
    meta.durationDays,
    meta.date,
    staffZones,
  );
  const tableColSpan = isEditing ? 9 : canEdit ? 7 : 4;
  function renderGap(index: number) {
    if (!isEditing || !catalogOver || gapIndex !== index) return null;
    return (
      <tr key={`gap-${index}`} className="relative h-0 border-0">
        <td colSpan={tableColSpan} className="relative h-0 p-0">
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

  return (
    <div className={embedded ? "flex flex-col gap-2" : "mx-auto flex max-w-[1680px] flex-col gap-6 px-4 py-6 md:px-6"}>
      {!embedded && (
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
            <button
              type="button"
              onClick={() => {
                if (!isManager) {
                  router.push("/quotes");
                  return;
                }
                const q = returnZone
                  ? `?zone=${encodeURIComponent(returnZone)}`
                  : "";
                router.push(`/quotes/${quoteId}${q}`);
              }}
              className="text-sm text-[var(--muted)] hover:text-[var(--ink)]"
            >
              {isManager ? "← К смете" : "← К мероприятиям"}
            </button>
            <h1 className="font-display mt-1 text-3xl text-[var(--ink)]">
              Спецификация на погрузку
            </h1>
          <p className="text-sm text-[var(--muted)]">
            №{meta.proposalNumber} · {meta.eventName || meta.client || "Мероприятие"}
            {meta.date ? ` · ${meta.date}` : ""}
          </p>
        </div>
      </header>
      )}

      <div
        className={cn(
          "min-w-0",
          isEditing &&
            "grid items-start gap-2 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]",
        )}
      >
        {isEditing ? (
          <div className="hidden min-w-0 lg:block">
            <QuoteCatalogSidebar
              onPickItem={onPickFromSidebar}
              eventDate={meta.date || undefined}
              durationDays={meta.durationDays}
              zoneName={insertZone?.name || "спецификацию"}
              addTargetLabel="спецификацию"
              includeHidden
              currentQtyByItem={neededByItem}
            />
          </div>
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col gap-2">
      {specZones.length > 0 ? (
        <QuoteZoneTabs
          zones={specZones}
          activeId={resolvedZoneId}
          onSelect={setActiveZoneId}
          onAdd={() => {}}
          onRename={() => {}}
          onDelete={() => {}}
          canEdit={false}
          showSummary={false}
          eventDate={meta.date}
          durationDays={meta.durationDays}
        />
      ) : null}

      {canEdit ? (
        <div className="quote-dense flex flex-wrap items-center justify-end gap-1 md:gap-2">
          <button
            type="button"
            disabled={importBusy}
            onClick={() => void openImportPreview()}
            className="rounded-sm border border-[var(--line)] px-2 py-0.5 text-[11px] disabled:opacity-40 md:rounded-md md:px-3 md:py-1.5 md:text-xs"
          >
            {importBusy ? "Сравнение…" : "Импорт из сметы"}
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={editMode}
            title={
              editMode
                ? "Выключить режим редактирования"
                : "Включить режим редактирования"
            }
            onClick={() => setEditMode((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide transition-colors md:gap-2 md:rounded-md md:px-2.5 md:py-1.5 md:text-xs",
              editMode
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--line)] text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--ink)]",
            )}
          >
            <span
              className={cn(
                "relative h-4 w-7 rounded-full transition-colors",
                editMode ? "bg-white/30" : "bg-[var(--line)]",
              )}
              aria-hidden
            >
              <span
                className={cn(
                  "absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform",
                  editMode ? "left-3.5" : "left-0.5",
                )}
              />
            </span>
            Edit
          </button>
        </div>
      ) : null}

      <SpecCards
        className="md:hidden"
        lines={displayRows}
        canEdit={isEditing}
        shortfallFor={shortfallForLine}
        onUpdate={patchCardLine}
        onRemove={(key) => {
          const line = displayRows.find((l) => l.key === key);
          if (line) deleteLine(line);
        }}
        onMove={moveLine}
        onToggleHide={(key) => {
          const line = displayRows.find((l) => l.key === key);
          if (line) toggleHideLine(line);
        }}
        emptyMessage="В этой зоне пока нет позиций для спецификации"
      />

      <div
        ref={tableRef}
        className={cn(
          "data-table-shell quote-estimate-table-wrap relative hidden md:block",
          isEditing && catalogOver && "ring-2 ring-inset ring-[var(--accent)]",
        )}
        onDragOver={isEditing ? onCatalogTableDragOver : undefined}
        onDragLeave={isEditing ? onCatalogTableDragLeave : undefined}
        onDrop={isEditing ? onCatalogTableDrop : undefined}
      >
        <table className="data-table data-table--editable quote-estimate-table w-full min-w-[800px] table-fixed text-xs">
          <thead className="bg-[var(--table-head)] text-caption uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-1.5 py-1.5 text-left">Название</th>
              <th className="w-14 px-1.5 py-1.5">Кол-во</th>
              {isEditing && (
                <th
                  className="w-10 px-1 py-1.5 text-center"
                  title="Замена из каталога"
                >
                  ⇄
                </th>
              )}
              <th className="w-20 px-1.5 py-1.5 text-left">Чьё</th>
              <th className="px-1.5 py-1.5 text-left">Комментарий</th>
              {canEdit && <StockHeaderCells />}
              {isEditing && <th className="w-16 px-1 py-1.5" />}
            </tr>
          </thead>
          <tbody>
            {isEditing && renderGap(0)}
            {displayRows.map((line, index) => {
              const isSection = line.type === "SECTION";
              const isExtra = line.source === "extra";
              const itemId = line.catalogItemId || null;
              const stock = itemId ? stockMap[itemId] : null;
              const needed = itemId ? neededByItem.get(itemId) || 0 : 0;
              const isDragging = dragKey === line.key;
              const isDropTarget =
                dropKey === line.key && dragKey !== line.key;

              const rowDragProps = isEditing
                ? {
                    onDragOver: (e: React.DragEvent) => {
                      if (onCatalogTableDragOver(e)) return;
                      if (!dragKey || dragKey === line.key) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dropKey !== line.key) setDropKey(line.key);
                    },
                    onDragLeave: (e: React.DragEvent) => {
                      const related = e.relatedTarget as Node | null;
                      if (
                        related &&
                        (e.currentTarget as HTMLElement).contains(related)
                      ) {
                        return;
                      }
                      setDropKey((k) => (k === line.key ? null : k));
                    },
                    onDrop: (e: React.DragEvent) => {
                      if (onCatalogTableDrop(e)) return;
                      e.preventDefault();
                      const from =
                        e.dataTransfer.getData("text/plain") || dragKey;
                      setDragKey(null);
                      setDropKey(null);
                      if (from) dropRow(from, line.key);
                    },
                  }
                : {};

              return (
                <Fragment key={line.key}>
                  <tr
                    data-spec-row
                    {...rowDragProps}
                    className={cn(
                      line.hidden
                        ? "opacity-40"
                        : isSection
                          ? "bg-[var(--selected)]"
                          : undefined,
                      isDragging && "opacity-50",
                      isDropTarget &&
                        "ring-2 ring-inset ring-[var(--accent)]",
                    )}
                  >
                    <td className="px-1.5 py-1">
                      <div className="flex items-start gap-2">
                        {isEditing && (
                          <DragHandle
                            label={
                              isSection
                                ? "Перетащить раздел со всеми позициями"
                                : "Перетащить позицию"
                            }
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", line.key);
                              e.dataTransfer.effectAllowed = "move";
                              setDragKey(line.key);
                              setGapIndex(null);
                            }}
                            onDragEnd={() => {
                              setDragKey(null);
                              setDropKey(null);
                            }}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          {line.kitName && (
                            <span className="mb-1 block w-fit rounded bg-[var(--accent)]/10 px-1.5 py-0.5 text-caption font-medium uppercase tracking-wide text-[var(--accent)]">
                              из комплекта «{line.kitName}»
                            </span>
                          )}
                          {isEditing ? (
                            <input
                              className={cn(
                                "field min-h-7",
                                isSection ? "text-sm font-bold" : "text-xs",
                              )}
                              value={displayName(line)}
                              onChange={(e) => {
                                if (isExtra) {
                                  updateExtra(
                                    line.key,
                                    isSection
                                      ? { title: e.target.value }
                                      : { name: e.target.value },
                                  );
                                } else {
                                  updateDerivedName(line, e.target.value);
                                }
                              }}
                            />
                          ) : (
                            <span className={isSection ? "font-medium" : ""}>
                              {displayName(line)}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-1.5 py-1">
                      {!isSection &&
                        (isEditing ? (
                          <input
                            type="number"
                            min={0}
                            className="field"
                            value={line.qty ? line.qty : ""}
                            placeholder="—"
                            onChange={(e) => {
                              const raw = e.target.value;
                              const qty =
                                raw === ""
                                  ? 0
                                  : Math.max(0, Number(raw) || 0);
                              if (isExtra) updateExtra(line.key, { qty });
                              else updateDerivedQty(line, qty);
                            }}
                          />
                        ) : (
                          <span className="tabular-nums">{line.qty}</span>
                        ))}
                    </td>
                    {isEditing && (
                      <td className="px-1 py-1">
                        <CatalogReplaceDropTarget
                          disabled={
                            isSection ||
                            line.hidden ||
                            (!isExtra && !line.deriveKey)
                          }
                          onDragActiveChange={(active) => {
                            if (!active) return;
                            setCatalogOver(false);
                            setGapIndex(null);
                          }}
                          onReplace={(item) =>
                            replaceLineFromCatalog(
                              isExtra
                                ? { kind: "extra", key: line.key }
                                : {
                                    kind: "derived",
                                    key: line.key,
                                    deriveKey: line.deriveKey!,
                                  },
                              item,
                            )
                          }
                        />
                      </td>
                    )}
                    <td className="px-1.5 py-1">
                      {!isSection &&
                        (isEditing ? (
                          <select
                            className="field w-full"
                            aria-label="Контора"
                            title="Контора"
                            value={ownerSelectValue(line.ownerLabel)}
                            onChange={(e) => {
                              const ownerLabel = e.target.value;
                              if (isExtra) {
                                updateExtra(line.key, { ownerLabel });
                              } else {
                                updateDerivedOwner(line, ownerLabel);
                              }
                            }}
                          >
                            <option value="">—</option>
                            {CATALOG_OWNERS.map((owner) => (
                              <option
                                key={owner.value}
                                value={owner.short}
                                title={owner.label}
                              >
                                {owner.short}
                              </option>
                            ))}
                            {ownerSelectExtraOption(line.ownerLabel)}
                          </select>
                        ) : (
                          <span className="text-xs text-[var(--muted)]">
                            {line.ownerLabel || "—"}
                          </span>
                        ))}
                    </td>
                    <td className="px-1.5 py-1">
                      {!isSection &&
                        (isEditing ? (
                          <input
                            className="field"
                            placeholder="Комментарий"
                            value={line.comment || ""}
                            onChange={(e) => {
                              if (isExtra) {
                                updateExtra(line.key, {
                                  comment: e.target.value,
                                });
                              } else {
                                updateDerivedComment(line, e.target.value);
                              }
                            }}
                          />
                        ) : (
                          <span className="text-[var(--muted)]">
                            {line.comment || ""}
                          </span>
                        ))}
                    </td>
                    {canEdit &&
                      (isSection ? (
                        <>
                          <td className="stock-cell">—</td>
                          <td className="stock-cell">—</td>
                          <td className="stock-cell">—</td>
                        </>
                      ) : (
                        <StockMarks needed={needed} info={stock} />
                      ))}
                    {isEditing && (
                      <td className="px-1 py-1">
                        <div className="flex items-center justify-end gap-0.5">
                          <button
                            type="button"
                            title={
                              line.hidden
                                ? "Показать позицию"
                                : "Скрыть позицию"
                            }
                            aria-label={
                              line.hidden
                                ? "Показать позицию"
                                : "Скрыть позицию"
                            }
                            className={cn(
                              "btn-icon",
                              line.hidden
                                ? "text-[var(--accent)]"
                                : "text-[var(--muted)]",
                            )}
                            onClick={() => toggleHideLine(line)}
                          >
                            <EyeIcon crossed={line.hidden} />
                          </button>
                          <button
                            type="button"
                            title="Удалить строку"
                            aria-label="Удалить строку"
                            className="btn-icon text-[var(--danger)]"
                            onClick={() => deleteLine(line)}
                          >
                            ×
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {isEditing && renderGap(index + 1)}
                </Fragment>
              );
            })}

            {displayRows.length === 0 && (
              <tr>
                <td
                  colSpan={tableColSpan}
                  className="px-4 py-8 text-center text-[var(--muted)]"
                >
                  В этой зоне пока нет позиций для спецификации
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {staffLines.length > 0 ? (
        <CollapsibleNotice
          storageKey="bs-crm-staff-slots"
          title="Технический персонал"
          summary={
            staffLines.some((l) => l.vacant)
              ? `${staffLines.length} · есть незакрытые слоты`
              : String(staffLines.length)
          }
          className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] text-[11px] md:text-sm"
          headerClassName="bg-[var(--table-head)] text-caption font-semibold uppercase tracking-wide text-[var(--muted)] md:px-3"
        >
          <ul className="divide-y divide-[var(--line)] border-t border-[var(--line)]">
            {staffLines.map((line) => (
              <li
                key={line.id}
                className={cn(
                  "px-2 py-1 md:px-3 md:py-1.5",
                  line.vacant && "bg-amber-500/10 text-amber-800 dark:text-amber-200",
                )}
              >
                {line.text}
              </li>
            ))}
          </ul>
        </CollapsibleNotice>
      ) : null}

      {isEditing && (
        <div className="quote-dense flex flex-wrap items-center gap-1 md:gap-1.5">
          <button
            type="button"
            onClick={addSection}
            className="min-h-11 rounded-sm border border-[var(--line)] px-2 py-2 text-[11px] md:min-h-0 md:rounded-md md:px-2.5 md:py-1.5 md:text-xs"
          >
            + Раздел
          </button>
          <button
            type="button"
            onClick={addCustomItem}
            className="min-h-11 rounded-sm border border-[var(--line)] px-2 py-2 text-[11px] md:min-h-0 md:rounded-md md:px-2.5 md:py-1.5 md:text-xs"
          >
            + Позиция
          </button>
          <button
            type="button"
            title={
              showHidden
                ? "Убрать отображение скрытых строк и разделов"
                : "Показать скрытые строки и разделы"
            }
            aria-label={
              showHidden
                ? "Убрать отображение скрытых строк и разделов"
                : "Показать скрытые строки и разделы"
            }
            aria-pressed={!showHidden}
            onClick={() => setShowHidden((v) => !v)}
            className={`btn-icon inline-flex items-center gap-1.5 px-2 ${
              !showHidden ? "text-[var(--accent)]" : "text-[var(--muted)]"
            }`}
          >
            <EyeIcon crossed={!showHidden} />
            <span className="text-xs font-normal normal-case tracking-normal">
              {showHidden
                ? hiddenCount > 0
                  ? `Скрытые (${hiddenCount})`
                  : "Скрытые"
                : "Скрытые спрятаны"}
            </span>
          </button>
        </div>
      )}

        </div>
      </div>

      <footer className="quote-dense flex flex-col gap-1 border-t border-[var(--line)] pt-2 sm:flex-row sm:items-end sm:justify-between md:gap-2 md:pt-3">
        <div className="min-w-0 text-[10px] text-[var(--muted)] md:text-xs">
          <p className="font-medium text-[var(--ink)]">Спецификация на погрузку</p>
          <p>
            {canEdit
              ? editMode
                ? saving
                  ? "Сохранение…"
                  : savedAt
                    ? `Сохранено в ${savedAt}`
                    : "Режим редактирования · автосохранение"
                : "Просмотр · включите Edit для правок"
              : "Только просмотр"}
            {meta.hasSnapshot
              ? " · снимок (смена статуса сметы не пересобирает)"
              : " · следует за сметой, пока не сохраните правки или не импортируете"}
            {error ? ` · ${error}` : ""}
          </p>
          <p className="mt-1 hidden md:block">
            Отдельные позиции из сметы + разворот комплектов по составляющим.
            Цен нет. Технический персонал указан под таблицей.
            {canEdit ? " Правки поверх сметы сохраняются отдельно." : ""}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            disabled={
              exporting !== null ||
              (allRows.length === 0 && assignments.length === 0)
            }
            onClick={() => void onExport("excel")}
            className="rounded-md bg-[var(--solid)] px-3 py-1.5 text-xs text-[var(--on-solid)] disabled:opacity-40"
          >
            {exporting === "excel" ? "Excel…" : "Excel"}
          </button>
          <button
            type="button"
            disabled={
              exporting !== null ||
              (allRows.length === 0 && assignments.length === 0)
            }
            onClick={() => void onExport("pdf")}
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs text-white disabled:opacity-40"
          >
            {exporting === "pdf" ? "PDF…" : "PDF"}
          </button>
        </div>
      </footer>

      {importOpen && importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
            <h2 className="text-lg font-medium">Импорт из сметы</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Скрытые, переименованные и ручные строки сохранятся. Ушедшие из
              сметы позиции снимутся, новые добавятся.
            </p>
            <p className="mt-2 rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              После подтверждения пул персонала синхронизируется со сметой:
              недостающие слоты добавятся, лишние назначения удалятся.
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              <li>Новые: {importPreview.counts.added}</li>
              <li>Уйдут из спеки: {importPreview.counts.removed}</li>
              <li>Останутся как есть: {importPreview.counts.kept}</li>
              <li>Ручные строки: {importPreview.counts.extras}</li>
            </ul>
            {importPreview.diff.added.length > 0 && (
              <div className="mt-3">
                <p className="text-xs uppercase text-[var(--muted)]">Добавятся</p>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {importPreview.diff.added.slice(0, 12).map((r) => (
                    <li key={r.key}>
                      {r.label || "—"}
                      {r.qty ? ` × ${r.qty}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {importPreview.diff.removed.length > 0 && (
              <div className="mt-3">
                <p className="text-xs uppercase text-[var(--muted)]">Уйдут</p>
                <ul className="mt-1 list-disc pl-5 text-sm">
                  {importPreview.diff.removed.slice(0, 12).map((r) => (
                    <li key={r.key}>{r.label || "—"}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-[var(--line)] px-3 py-2 text-sm"
                onClick={() => {
                  setImportOpen(false);
                  setImportPreview(null);
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={importBusy}
                className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm text-white disabled:opacity-40"
                onClick={() => void applyImport()}
              >
                {importBusy ? "Импорт…" : "Импортировать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
