import type { Prisma } from "@prisma/client";

export const MAX_QUOTE_SNAPSHOTS = 10;
export const MAX_SPEC_SNAPSHOTS = 10;

export type QuoteSnapshotPayload = {
  meta: {
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
    requestContact?: string;
    managerName: string;
    ownerId: string;
    cashless: boolean;
    cashlessPercent: number;
    durationDays: number;
    notes: string[];
    brief: string;
    discountPercent: number;
    lifecycle: string;
  };
  zones: Array<{
    id: string;
    name: string;
    sortOrder: number;
    active: boolean;
    workingDayIndexes?: number[];
  }>;
  blocks: Array<{
    id: string;
    type: string;
    sortOrder: number;
    title: string | null;
    name: string | null;
    qty: number;
    unitPrice: number;
    cashlessOverride: number | null;
    dayMode: string;
    dayCoefOverride: number | null;
    catalogItemId: string | null;
    kitId: string | null;
    zoneId: string | null;
  }>;
};

type QuoteBody = {
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
  requestContact?: string;
  managerName: string;
  ownerId: string;
  cashless: boolean;
  cashlessPercent: number;
  durationDays: number;
  notes: string[];
  brief: string;
  discountPercent: number;
  lifecycle: string;
  zones: Array<{
    id: string;
    name: string;
    sortOrder: number;
    active?: boolean;
    workingDayIndexes?: number[];
  }>;
  blocks: Array<{
    id: string;
    type: string;
    sortOrder: number;
    title?: string | null;
    name?: string | null;
    qty?: number | null;
    unitPrice?: number | null;
    cashlessOverride?: number | null;
    dayMode?: string | null;
    dayCoefOverride?: number | null;
    catalogItemId?: string | null;
    kitId?: string | null;
    zoneId?: string | null;
  }>;
};

export function buildQuoteSnapshotPayload(quote: QuoteBody): QuoteSnapshotPayload {
  return {
    meta: {
      proposalNumber: quote.proposalNumber,
      eventName: quote.eventName,
      date: quote.date,
      mountDate: quote.mountDate,
      mountDurationDays: quote.mountDurationDays,
      demountDate: quote.demountDate,
      demountDurationDays: quote.demountDurationDays,
      time: quote.time,
      place: quote.place,
      venueId: quote.venueId,
      client: quote.client,
      clientId: quote.clientId,
      requestContact: quote.requestContact || "",
      managerName: quote.managerName,
      ownerId: quote.ownerId,
      cashless: quote.cashless,
      cashlessPercent: quote.cashlessPercent,
      durationDays: quote.durationDays,
      notes: quote.notes,
      brief: quote.brief,
      discountPercent: quote.discountPercent,
      lifecycle: quote.lifecycle,
    },
    zones: [...quote.zones]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((z) => ({
        id: z.id,
        name: z.name,
        sortOrder: z.sortOrder,
        active: z.active !== false,
        workingDayIndexes: Array.isArray(z.workingDayIndexes)
          ? z.workingDayIndexes
          : [],
      })),
    blocks: [...quote.blocks]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((b) => ({
        id: b.id,
        type: b.type,
        sortOrder: b.sortOrder,
        title: b.title ?? null,
        name: b.name ?? null,
        qty: Number(b.qty) || 0,
        unitPrice: Number(b.unitPrice) || 0,
        cashlessOverride:
          b.cashlessOverride == null ? null : Number(b.cashlessOverride),
        dayMode: String(b.dayMode || "HALF_EXTRA"),
        dayCoefOverride:
          b.dayCoefOverride == null ? null : Number(b.dayCoefOverride),
        catalogItemId: b.catalogItemId ?? null,
        kitId: b.kitId ?? null,
        zoneId: b.zoneId ?? null,
      })),
  };
}

export type QuotePatchAuditInput = {
  prevLifecycle: string;
  nextLifecycle: string;
  changedMetaKeys: string[];
  zonesChanged: boolean;
  zoneCount: number | null;
  blocksChanged: boolean;
  blockCount: number | null;
};

export function summarizeQuotePatch(input: QuotePatchAuditInput): {
  action: string;
  summary: string;
  diff: Prisma.InputJsonValue;
} {
  const parts: string[] = [];
  if (input.prevLifecycle !== input.nextLifecycle) {
    parts.push(`статус ${input.prevLifecycle} → ${input.nextLifecycle}`);
  }
  if (input.changedMetaKeys.length > 0) {
    parts.push(`мета: ${input.changedMetaKeys.join(", ")}`);
  }
  if (input.zonesChanged) {
    parts.push(
      input.zoneCount == null ? "зоны" : `зоны (${input.zoneCount})`,
    );
  }
  if (input.blocksChanged) {
    parts.push(
      input.blockCount == null ? "блоки" : `блоки (${input.blockCount})`,
    );
  }
  const summary = parts.length > 0 ? parts.join("; ") : "сохранение без видимых полей";
  let action = "UPDATE_META";
  if (input.prevLifecycle !== input.nextLifecycle) action = "LIFECYCLE";
  else if (input.blocksChanged) action = "UPDATE_BLOCKS";
  else if (input.zonesChanged) action = "UPDATE_ZONES";
  return {
    action,
    summary,
    diff: {
      lifecycle:
        input.prevLifecycle !== input.nextLifecycle
          ? { from: input.prevLifecycle, to: input.nextLifecycle }
          : undefined,
      metaKeys: input.changedMetaKeys,
      zonesChanged: input.zonesChanged,
      zoneCount: input.zoneCount,
      blocksChanged: input.blocksChanged,
      blockCount: input.blockCount,
    },
  };
}

const META_AUDIT_KEYS = [
  "proposalNumber",
  "eventName",
  "date",
  "mountDate",
  "mountDurationDays",
  "demountDate",
  "demountDurationDays",
  "time",
  "place",
  "venueId",
  "client",
  "clientId",
  "requestContact",
  "managerName",
  "ownerId",
  "cashless",
  "cashlessPercent",
  "durationDays",
  "notes",
  "brief",
  "discountPercent",
  "lifecycle",
  "invoiceRequired",
  "invoiceSent",
  "paid",
  "paymentComment",
] as const;

export function changedQuoteMetaKeys(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): string[] {
  const keys: string[] = [];
  for (const key of META_AUDIT_KEYS) {
    if (!(key in next) || next[key] === undefined) continue;
    if (key === "lifecycle") continue;
    const a = prev[key];
    const b = next[key];
    if (JSON.stringify(a) !== JSON.stringify(b)) keys.push(key);
  }
  return keys;
}

/** Newest-first ids; drop everything after the keep-limit. */
export function snapshotIdsToPrune(
  newestFirstIds: string[],
  keep = MAX_QUOTE_SNAPSHOTS,
): string[] {
  if (keep < 1) return [...newestFirstIds];
  return newestFirstIds.slice(keep);
}

const SNAPSHOT_BLOCK_TYPES = new Set([
  "SECTION",
  "ITEM",
  "NOTE",
  "KIT_HEADER",
]);

export function isQuoteSnapshotPayload(
  value: unknown,
): value is QuoteSnapshotPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (!v.meta || typeof v.meta !== "object") return false;
  if (!Array.isArray(v.zones) || !Array.isArray(v.blocks)) return false;
  return true;
}

export type QuoteSnapshotPatch = {
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
  brief: string;
  discountPercent: number;
  lifecycle: string;
  zones: Array<{
    id: string;
    name: string;
    sortOrder: number;
    active: boolean;
    workingDayIndexes?: number[];
  }>;
  blocks: Array<{
    type: "SECTION" | "ITEM" | "NOTE" | "KIT_HEADER";
    sortOrder: number;
    title: string | null;
    name: string | null;
    qty: number;
    unitPrice: number;
    cashlessOverride: number | null;
    dayMode: string;
    dayCoefOverride: number | null;
    catalogItemId: string | null;
    kitId: string | null;
    zoneId: string;
  }>;
};

export function snapshotToQuotePatch(
  payload: QuoteSnapshotPayload,
): QuoteSnapshotPatch {
  const fallbackZone = payload.zones[0]?.id || "";
  return {
    proposalNumber: payload.meta.proposalNumber,
    eventName: payload.meta.eventName,
    date: payload.meta.date,
    mountDate: payload.meta.mountDate,
    mountDurationDays: payload.meta.mountDurationDays,
    demountDate: payload.meta.demountDate,
    demountDurationDays: payload.meta.demountDurationDays,
    time: payload.meta.time,
    place: payload.meta.place,
    venueId: payload.meta.venueId,
    client: payload.meta.client,
    clientId: payload.meta.clientId,
    requestContact: payload.meta.requestContact || "",
    managerName: payload.meta.managerName,
    ownerId: payload.meta.ownerId,
    cashless: payload.meta.cashless,
    cashlessPercent: payload.meta.cashlessPercent,
    durationDays: payload.meta.durationDays,
    notes: payload.meta.notes,
    brief: payload.meta.brief,
    discountPercent: payload.meta.discountPercent,
    lifecycle: payload.meta.lifecycle,
    zones: payload.zones.map((z) => ({
      id: z.id,
      name: z.name,
      sortOrder: z.sortOrder,
      active: z.active !== false,
      workingDayIndexes: Array.isArray(z.workingDayIndexes)
        ? z.workingDayIndexes
        : [],
    })),
    blocks: payload.blocks
      .filter((b) => SNAPSHOT_BLOCK_TYPES.has(String(b.type)))
      .map((b) => ({
        type: b.type as QuoteSnapshotPatch["blocks"][number]["type"],
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
      }))
      .filter((b) => Boolean(b.zoneId)),
  };
}
