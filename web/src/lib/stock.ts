import { prisma } from "./db";
import { rangesOverlap } from "./dates";

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
  quoteId: string;
  proposalNumber: string;
  eventName: string;
  client: string;
  date: string;
  lifecycle: string;
  qty: number;
};

/** Quotes that reserve this catalog item on overlapping dates. */
export async function getReservationDetails(
  catalogItemId: string,
  eventDate: Date | null,
  durationDays: number,
  excludeQuoteId?: string,
): Promise<ReservationRow[]> {
  if (!eventDate) return [];

  const quotes = await prisma.quote.findMany({
    where: {
      lifecycle: { in: ["CONFIRMED", "COMPLETED"] },
      eventDate: { not: null },
      ...(excludeQuoteId ? { id: { not: excludeQuoteId } } : {}),
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
    if (!q.eventDate) continue;
    if (
      !rangesOverlap(eventDate, durationDays, q.eventDate, q.durationDays)
    ) {
      continue;
    }
    const expanded = await expandBlocksToItemQty(q.blocks);
    const qty = expanded.get(catalogItemId)?.qty || 0;
    if (qty <= 0) continue;
    rows.push({
      quoteId: q.id,
      proposalNumber: q.proposalNumber,
      eventName: q.eventName,
      client: q.client,
      date: q.date,
      lifecycle: q.lifecycle,
      qty,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date, "ru"));
  return rows;
}

/** Reserved qty of catalog item on overlapping confirmed/completed events */
export async function getReservedQty(
  catalogItemId: string,
  eventDate: Date | null,
  durationDays: number,
  excludeQuoteId?: string,
): Promise<number> {
  const rows = await getReservationDetails(
    catalogItemId,
    eventDate,
    durationDays,
    excludeQuoteId,
  );
  return rows.reduce((sum, r) => sum + r.qty, 0);
}

export async function getAvailability(
  catalogItemId: string,
  eventDate: Date | null,
  durationDays: number,
  excludeQuoteId?: string,
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
    eventDate,
    durationDays,
    excludeQuoteId,
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
};

export async function validateQuoteStock(
  quoteId: string,
  blocks: StockBlock[],
  eventDate: Date | null,
  durationDays: number,
): Promise<StockIssue[]> {
  const needed = await expandBlocksToItemQty(blocks);

  const issues: StockIssue[] = [];
  for (const [itemId, { name, qty }] of needed) {
    const av = await getAvailability(itemId, eventDate, durationDays, quoteId);
    if (!av || av.unlimited) continue;
    if (qty > av.available) {
      issues.push({
        catalogItemId: itemId,
        name: name || av.name,
        needed: qty,
        available: av.available,
        stockQty: av.stockQty,
      });
    }
  }
  return issues;
}
