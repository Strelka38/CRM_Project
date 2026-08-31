import { prisma } from "./db";
import { blocksInActiveZones } from "./quote-calc";
import { addDays, formatDateKey, parseEventDate, startOfDay } from "./dates";
import { zoneWorkingDays, type ZoneWorkingDays } from "./quote-assignment-days";
import {
  dateRangesOverlap,
  quoteOccupancyRange,
  type QuoteScheduleFields,
} from "./quote-schedule";

type StockBlock = {
  type: string;
  catalogItemId?: string | null;
  kitId?: string | null;
  zoneId?: string | null;
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

type DailyItemDemand = {
  name: string;
  byDay: Map<number, number>;
};

/** Equipment demand for each event day, grouped by zone working dates. */
export async function expandBlocksToDailyItemQty(
  blocks: StockBlock[],
  zones: ZoneWorkingDays[] | null | undefined,
  eventDays: number,
): Promise<Map<string, DailyItemDemand>> {
  const byZone = new Map<string, StockBlock[]>();
  for (const block of blocks) {
    const key = block.zoneId || "";
    const list = byZone.get(key) || [];
    list.push(block);
    byZone.set(key, list);
  }

  const result = new Map<string, DailyItemDemand>();
  for (const [zoneId, zoneBlocks] of byZone) {
    const expanded = await expandBlocksToItemQty(zoneBlocks);
    const days = zoneWorkingDays(zoneId || null, eventDays, zones);
    for (const [itemId, demand] of expanded) {
      let item = result.get(itemId);
      if (!item) {
        item = { name: demand.name, byDay: new Map<number, number>() };
        result.set(itemId, item);
      } else if (!item.name && demand.name) {
        item.name = demand.name;
      }
      for (const day of days) {
        item.byDay.set(day, (item.byDay.get(day) || 0) + demand.qty);
      }
    }
  }
  return result;
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
  dailyQty: Record<string, number>;
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
      zones: {
        select: { id: true, active: true, workingDayIndexes: true },
      },
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
    const eventStart = parseEventDate(q.date);
    if (!eventStart) continue;
    const activeBlocks = blocksInActiveZones(q.zones, q.blocks);
    const expanded = await expandBlocksToDailyItemQty(
      activeBlocks,
      q.zones.filter((zone) => zone.active !== false),
      q.durationDays,
    );
    const itemDemand = expanded.get(catalogItemId);
    if (!itemDemand) continue;
    const dailyQty: Record<string, number> = {};
    for (const [dayIndex, qty] of itemDemand.byDay) {
      const day = addDays(eventStart, dayIndex - 1);
      if (!dateRangesOverlap(window, { start: day, end: day })) continue;
      dailyQty[formatDateKey(day)] = qty;
    }
    const qty = Math.max(0, ...Object.values(dailyQty));
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
      dailyQty,
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
      dailyQty: { [dateKeyFromDbDate(r.date)]: qty },
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
  return peakReservedQty(rows);
}

export function peakReservedQty(
  rows: Array<Pick<ReservationRow, "dailyQty">>,
): number {
  const byDay = new Map<string, number>();
  for (const row of rows) {
    for (const [day, qty] of Object.entries(row.dailyQty)) {
      byDay.set(day, (byDay.get(day) || 0) + qty);
    }
  }
  return Math.max(0, ...byDay.values());
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
      reservations: [] as ReservationRow[],
    };
  }

  const reservations = await getReservationDetails(
    catalogItemId,
    schedule,
    excludeQuoteIdOrOpts,
  );
  const reserved = peakReservedQty(reservations);
  return {
    ...item,
    reserved,
    available: Math.max(0, item.stockQty - reserved),
    unlimited: false,
    reservations,
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
  zones?: ZoneWorkingDays[] | null,
): Promise<StockIssue[]> {
  const needed = await expandBlocksToDailyItemQty(
    blocks,
    zones,
    schedule.durationDays,
  );
  const eventStart = schedule.eventDate
    ? startOfDay(schedule.eventDate)
    : parseEventDate(schedule.date);

  const issues: StockIssue[] = [];
  for (const [itemId, { name, byDay }] of needed) {
    const av = await getAvailability(itemId, schedule, quoteId);
    if (!av || av.unlimited) continue;
    const reservations = av.reservations;
    let worst:
      | { needed: number; available: number; shortfall: number }
      | undefined;
    for (const [dayIndex, qty] of byDay) {
      const dayKey = eventStart
        ? formatDateKey(addDays(eventStart, dayIndex - 1))
        : "";
      const reserved = dayKey
        ? reservations.reduce(
            (sum, row) => sum + (row.dailyQty[dayKey] || 0),
            0,
          )
        : av.reserved;
      const available = Math.max(0, av.stockQty - reserved);
      const shortfall = Math.max(0, qty - available);
      if (!worst || shortfall > worst.shortfall) {
        worst = { needed: qty, available, shortfall };
      }
    }
    if (worst && worst.shortfall > 0) {
      issues.push({
        catalogItemId: itemId,
        name: name || av.name,
        needed: worst.needed,
        available: worst.available,
        stockQty: av.stockQty,
        shortfall: worst.shortfall,
      });
    }
  }
  return issues;
}
