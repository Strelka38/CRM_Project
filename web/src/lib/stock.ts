import { prisma } from "./db";
import { blocksInActiveZones } from "./quote-calc";
import {
  dateRangesOverlap,
  quoteOccupancyRange,
  type QuoteScheduleFields,
} from "./quote-schedule";

type StockBlock = {
  type: string;
  catalogItemId?: string | null;
  kitId?: string | null;
  qty?: number | null;
  name?: string | null;
};

/** Expand quote blocks into catalog-item quantities (kits → components). */
export async function expandBlocksToItemQty(
  blocks: StockBlock[],
): Promise<Map<string, { name: string; qty: number }>> {
  const needed = new Map<string, { name: string; qty: number }>();

  const kitIds = [
    ...new Set(
      blocks
        .filter(
          (b) =>
            b.type === "ITEM" &&
            b.kitId &&
            !b.catalogItemId &&
            (Number(b.qty) || 0) > 0,
        )
        .map((b) => b.kitId!),
    ),
  ];

  const kits =
    kitIds.length > 0
      ? await prisma.kit.findMany({
          where: { id: { in: kitIds } },
          include: {
            components: {
              include: {
                catalogItem: { select: { id: true, name: true } },
              },
            },
          },
        })
      : [];
  const kitMap = new Map(kits.map((k) => [k.id, k]));

  for (const b of blocks) {
    if (b.type !== "ITEM") continue;
    const lineQty = Number(b.qty) || 0;
    if (lineQty <= 0) continue;

    if (b.kitId && !b.catalogItemId) {
      const kit = kitMap.get(b.kitId);
      if (!kit) continue;
      for (const c of kit.components) {
        const q = lineQty * (Number(c.qty) || 0);
        if (q <= 0) continue;
        const prev = needed.get(c.catalogItemId);
        needed.set(c.catalogItemId, {
          name: c.catalogItem.name || prev?.name || "",
          qty: (prev?.qty || 0) + q,
        });
      }
      continue;
    }

    if (!b.catalogItemId) continue;
    const prev = needed.get(b.catalogItemId);
    needed.set(b.catalogItemId, {
      name: b.name || prev?.name || "",
      qty: (prev?.qty || 0) + lineQty,
    });
  }

  return needed;
}

export type ReservationRow = {
  source: "quote" | "rental";
  quoteId: string;
  proposalNumber: string;
  eventName: string;
  client: string;
  date: string;
  lifecycle: string;
  qty: number;
};

export type StockExclude = {
  excludeQuoteId?: string;
  excludeRentalEntryId?: string;
};

/** Window used for availability: event + optional mount/demount. */
export type StockSchedule = QuoteScheduleFields;

export function occupancyOf(schedule: StockSchedule) {
  return quoteOccupancyRange(schedule);
}

function toExclude(opts?: string | StockExclude): StockExclude {
  return typeof opts === "string" ? { excludeQuoteId: opts } : opts || {};
}

function dateKeyFromDbDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Quotes + calendar rentals that reserve this catalog item on overlapping occupancy. */
export async function getReservationDetails(
  catalogItemId: string,
  schedule: StockSchedule,
  excludeQuoteIdOrOpts?: string | StockExclude,
): Promise<ReservationRow[]> {
  const window = occupancyOf(schedule);
  if (!window) return [];

  const opts = toExclude(excludeQuoteIdOrOpts);

  const quotes = await prisma.quote.findMany({
    where: {
      lifecycle: { in: ["CONFIRMED", "COMPLETED"] },
      eventDate: { not: null },
      ...(opts.excludeQuoteId ? { id: { not: opts.excludeQuoteId } } : {}),
      OR: [
        {
          blocks: {
            some: { catalogItemId, type: "ITEM", qty: { gt: 0 } },
          },
        },
        {
          blocks: {
            some: {
              type: "ITEM",
              kitId: { not: null },
              catalogItemId: null,
              qty: { gt: 0 },
            },
          },
        },
      ],
    },
    include: {
      zones: { select: { id: true, active: true } },
      blocks: {
        where: {
          type: "ITEM",
          qty: { gt: 0 },
          OR: [{ catalogItemId }, { kitId: { not: null }, catalogItemId: null }],
        },
      },
    },
  });

  const rows: ReservationRow[] = [];
  for (const q of quotes) {
    const other = occupancyOf({
      date: q.date,
      eventDate: q.eventDate,
      durationDays: q.durationDays,
      mountDate: q.mountDate,
      mountDurationDays: q.mountDurationDays,
      demountDate: q.demountDate,
      demountDurationDays: q.demountDurationDays,
    });
    if (!other || !dateRangesOverlap(window, other)) continue;
    const expanded = await expandBlocksToItemQty(
      blocksInActiveZones(q.zones, q.blocks),
    );
    const qty = expanded.get(catalogItemId)?.qty || 0;
    if (qty <= 0) continue;
    rows.push({
      source: "quote",
      quoteId: q.id,
      proposalNumber: q.proposalNumber,
      eventName: q.eventName,
      client: q.client,
      date: q.date,
      lifecycle: q.lifecycle,
      qty,
    });
  }

  const rentals = await prisma.calendarEntry.findMany({
    where: {
      kind: "RENTAL",
      ...(opts.excludeRentalEntryId
        ? { id: { not: opts.excludeRentalEntryId } }
        : {}),
      lines: { some: { catalogItemId, qty: { gt: 0 } } },
    },
    include: {
      lines: {
        where: { catalogItemId, qty: { gt: 0 } },
      },
      client: { select: { companyName: true } },
    },
  });

  for (const r of rentals) {
    const rentalDay = new Date(
      r.date.getUTCFullYear(),
      r.date.getUTCMonth(),
      r.date.getUTCDate(),
      12,
    );
    const rentalRange = { start: rentalDay, end: rentalDay };
    if (!dateRangesOverlap(window, rentalRange)) continue;
    const qty = r.lines.reduce((sum, l) => sum + (Number(l.qty) || 0), 0);
    if (qty <= 0) continue;
    rows.push({
      source: "rental",
      quoteId: r.id,
      proposalNumber: "Аренда",
      eventName: r.title || "Аренда оборудования",
      client: r.client?.companyName || "",
      date: dateKeyFromDbDate(r.date),
      lifecycle: "RENTAL",
      qty,
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date, "ru"));
  return rows;
}

/** Reserved qty of catalog item on overlapping confirmed/completed events */
export async function getReservedQty(
  catalogItemId: string,
  schedule: StockSchedule,
  excludeQuoteIdOrOpts?: string | StockExclude,
): Promise<number> {
  const rows = await getReservationDetails(
    catalogItemId,
    schedule,
    excludeQuoteIdOrOpts,
  );
  return rows.reduce((sum, r) => sum + r.qty, 0);
}

export async function getAvailability(
  catalogItemId: string,
  schedule: StockSchedule,
  excludeQuoteIdOrOpts?: string | StockExclude,
) {
  const item = await prisma.catalogItem.findUnique({
    where: { id: catalogItemId },
    select: {
      id: true,
      name: true,
      stockQty: true,
      itemKind: true,
      basePrice: true,
    },
  });
  if (!item) return null;

  // Services/personnel: soft check only
  if (item.itemKind === "SERVICE" || item.itemKind === "PERSONNEL") {
    return {
      ...item,
      reserved: 0,
      available: item.stockQty > 0 ? item.stockQty : 9999,
      unlimited: item.stockQty <= 0,
    };
  }

  const reserved = await getReservedQty(
    catalogItemId,
    schedule,
    excludeQuoteIdOrOpts,
  );
  return {
    ...item,
    reserved,
    available: Math.max(0, item.stockQty - reserved),
    unlimited: false,
  };
}

export type StockIssue = {
  catalogItemId: string;
  name: string;
  needed: number;
  available: number;
  stockQty: number;
  shortfall: number;
};

export async function validateQuoteStock(
  quoteId: string,
  blocks: StockBlock[],
  schedule: StockSchedule,
): Promise<StockIssue[]> {
  const needed = await expandBlocksToItemQty(blocks);

  const issues: StockIssue[] = [];
  for (const [itemId, { name, qty }] of needed) {
    const av = await getAvailability(itemId, schedule, quoteId);
    if (!av || av.unlimited) continue;
    if (qty > av.available) {
      issues.push({
        catalogItemId: itemId,
        name: name || av.name,
        needed: qty,
        available: av.available,
        stockQty: av.stockQty,
        shortfall: qty - av.available,
      });
    }
  }
  return issues;
}
