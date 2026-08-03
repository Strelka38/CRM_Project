import type { BlockType, DayMode } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseEventDate } from "@/lib/dates";
import { nextProposalNumber } from "@/lib/proposal-number";
import { toPrismaDayMode } from "@/lib/quote-calc";

export type CloneZone = {
  name: string;
  sortOrder: number;
};

export type CloneBlock = {
  type: BlockType | "SECTION" | "ITEM" | "NOTE" | "KIT_HEADER";
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
  /** Index into zones array (or zone sortOrder match) */
  zoneIndex: number;
};

export type QuoteStructurePayload = {
  zones: CloneZone[];
  blocks: CloneBlock[];
};

export type CreateQuoteFromStructureInput = {
  ownerId: string;
  managerName: string;
  date: string;
  durationDays: number;
  mountDate?: string;
  demountDate?: string;
  eventName?: string;
  time?: string;
  place?: string;
  client?: string;
  clientId?: string | null;
  venueId?: string | null;
  cashless?: boolean;
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

export function parseTemplatePayload(raw: unknown): QuoteStructurePayload {
  const data = raw as Partial<QuoteStructurePayload>;
  const zones = Array.isArray(data.zones)
    ? data.zones.map((z, i) => ({
        name: String(z?.name || "Зона").trim() || "Зона",
        sortOrder: Number.isFinite(z?.sortOrder) ? Number(z.sortOrder) : i,
      }))
    : [{ name: "Основное", sortOrder: 0 }];
  const blocks: CloneBlock[] = Array.isArray(data.blocks)
    ? data.blocks.map((b, i) => ({
        type: (b?.type || "ITEM") as CloneBlock["type"],
        sortOrder: Number.isFinite(b?.sortOrder) ? Number(b.sortOrder) : i,
        title: b?.title ?? null,
        name: b?.name ?? null,
        qty: b?.qty ?? 0,
        unitPrice: b?.unitPrice ?? 0,
        cashlessOverride: b?.cashlessOverride ?? null,
        dayMode: b?.dayMode ?? "HALF_EXTRA",
        dayCoefOverride: b?.dayCoefOverride ?? null,
        catalogItemId: b?.catalogItemId ?? null,
        kitId: b?.kitId ?? null,
        zoneIndex: Math.max(0, Number(b?.zoneIndex) || 0),
      }))
    : [];
  return { zones, blocks };
}

export async function createQuoteFromStructure(
  input: CreateQuoteFromStructureInput,
) {
  const proposalNumber = await nextProposalNumber();
  const date = input.date || "";
  const durationDays = Math.max(1, input.durationDays || 1);
  const zones =
    input.structure.zones.length > 0
      ? input.structure.zones
      : [{ name: "Основное", sortOrder: 0 }];

  const zoneIds = zones.map(() => newCuidLike());

  const quote = await prisma.quote.create({
    data: {
      ownerId: input.ownerId,
      proposalNumber,
      eventName: input.eventName || "",
      managerName: input.managerName || "",
      date,
      eventDate: parseEventDate(date),
      mountDate: input.mountDate || "",
      demountDate: input.demountDate || "",
      time: input.time || "",
      place: input.place || "",
      venueId: input.venueId ?? null,
      client: input.client || "",
      clientId: input.clientId ?? null,
      cashless: input.cashless ?? true,
      durationDays,
      discountPercent: input.discountPercent ?? 0,
      notes: input.notes?.length
        ? input.notes
        : [
            "Внимание: данное предложение не является офертой. Бронирование оборудования на вашу дату производится только после заключения договора или внесения предоплаты",
            "* Первый день - 100% стоимости оборудования, 2-й и последующий, а также отдельный день для репетиций тарифицируются по 50% от стоимости оборудования",
          ],
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
