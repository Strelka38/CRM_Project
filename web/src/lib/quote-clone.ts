import type { BlockType, DayMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseEventDate } from "@/lib/dates";
import { nextProposalNumber } from "@/lib/proposal-number";
import { toPrismaDayMode } from "@/lib/quote-calc";
import { DEFAULT_QUOTE_NOTES } from "@/lib/commercial-terms";
import { DEFAULT_CASHLESS_PERCENT } from "@/lib/pricing";
import { defaultQuoteZones } from "@/lib/quote-defaults";
import {
  defaultDemountDate,
  defaultMountDate,
} from "@/lib/quote-schedule";
import { ensureQuoteSchemaColumns } from "@/lib/ensure-schema";
import type { CloneBlock, QuoteStructurePayload } from "@/lib/quote-structure";

export type {
  CloneBlock,
  CloneZone,
  QuoteStructurePayload,
} from "@/lib/quote-structure";
export { parseTemplatePayload } from "@/lib/quote-structure";

export type CreateQuoteFromStructureInput = {
  ownerId: string;
  managerName: string;
  date: string;
  durationDays: number;
  mountDate?: string;
  mountDurationDays?: number;
  demountDate?: string;
  demountDurationDays?: number;
  eventName?: string;
  time?: string;
  place?: string;
  client?: string;
  clientId?: string | null;
  requestContact?: string;
  venueId?: string | null;
  cashless?: boolean;
  cashlessPercent?: number;
  discountPercent?: number;
  notes?: string[];
  structure: QuoteStructurePayload;
};

function newCuidLike() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 24);
  }
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function extractStructure(quote: {
  zones: Array<{ id: string; name: string; sortOrder: number }>;
  blocks: Array<{
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
}): QuoteStructurePayload {
  const zones = [...quote.zones]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((z, i) => ({ name: z.name, sortOrder: i }));
  const zoneIndexById = new Map(
    [...quote.zones]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((z, i) => [z.id, i]),
  );
  const blocks: CloneBlock[] = quote.blocks.map((b) => ({
    type: b.type as CloneBlock["type"],
    sortOrder: b.sortOrder,
    title: b.title ?? null,
    name: b.name ?? null,
    qty: b.qty ?? 0,
    unitPrice: b.unitPrice ?? 0,
    cashlessOverride: b.cashlessOverride ?? null,
    dayMode: b.dayMode ?? "HALF_EXTRA",
    dayCoefOverride: b.dayCoefOverride ?? null,
    catalogItemId: b.catalogItemId ?? null,
    kitId: b.kitId ?? null,
    zoneIndex: zoneIndexById.get(b.zoneId || "") ?? 0,
  }));
  return { zones, blocks };
}

export async function createQuoteFromStructure(
  input: CreateQuoteFromStructureInput,
) {
  await ensureQuoteSchemaColumns();
  const proposalNumber = await nextProposalNumber();
  const date = input.date || "";
  const durationDays = Math.max(1, input.durationDays || 1);
  const zones =
    input.structure.zones.length > 0
      ? input.structure.zones
      : defaultQuoteZones();

  const zoneIds = zones.map(() => newCuidLike());
  const mountDate =
    input.mountDate || (date ? defaultMountDate(date) : "");
  const demountDate =
    input.demountDate ||
    (date ? defaultDemountDate(date, durationDays) : "");

  const quote = await prisma.quote.create({
    data: {
      ownerId: input.ownerId,
      proposalNumber,
      eventName: input.eventName || "",
      managerName: input.managerName || "",
      date,
      eventDate: parseEventDate(date),
      mountDate,
      mountDurationDays: Math.max(1, input.mountDurationDays || 1),
      demountDate,
      demountDurationDays: Math.max(1, input.demountDurationDays || 1),
      time: input.time || "",
      place: input.place || "",
      venueId: input.venueId ?? null,
      client: input.client || "",
      clientId: input.clientId ?? null,
      requestContact: input.requestContact || "",
      cashless: input.cashless ?? true,
      cashlessPercent: input.cashlessPercent ?? DEFAULT_CASHLESS_PERCENT,
      durationDays,
      discountPercent: input.discountPercent ?? 0,
      notes: input.notes?.length ? input.notes : [...DEFAULT_QUOTE_NOTES],
      lifecycle: "CALCULATED",
      zones: {
        create: zones.map((z, i) => ({
          id: zoneIds[i],
          name: z.name,
          sortOrder: z.sortOrder ?? i,
        })),
      },
      blocks: {
        create: input.structure.blocks.map((b, index) => {
          const zi = Math.min(
            Math.max(0, b.zoneIndex),
            zoneIds.length - 1,
          );
          return {
            zoneId: zoneIds[zi],
            type: b.type as BlockType,
            sortOrder: b.sortOrder ?? index,
            title: b.title ?? null,
            name: b.name ?? null,
            qty: b.qty ?? 0,
            unitPrice: b.unitPrice ?? 0,
            cashlessOverride: b.cashlessOverride ?? null,
            dayMode: toPrismaDayMode(b.dayMode ?? "HALF_EXTRA") as DayMode,
            dayCoefOverride: b.dayCoefOverride ?? null,
            catalogItemId: b.catalogItemId ?? null,
            kitId: b.kitId ?? null,
          };
        }),
      },
    },
    include: {
      zones: true,
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  return quote;
}
