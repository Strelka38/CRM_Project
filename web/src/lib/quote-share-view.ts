import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildExportPreviewHtml, type ExportMeta } from "@/lib/export/quote-zones";
import type { QuoteBlockInput, ZoneInput } from "@/lib/quote-calc";
import {
  isShareToken,
  parseShareFilters,
  shareClearedByLifecycle,
} from "@/lib/quote-share";

const shareInclude = {
  zones: { orderBy: { sortOrder: "asc" as const } },
  blocks: {
    orderBy: { sortOrder: "asc" as const },
    include: { catalogItem: { select: { itemKind: true } } },
  },
  owner: { select: { name: true, phone: true } },
  clientRef: { select: { phone: true } },
  venueRef: { select: { address: true } },
} satisfies Prisma.QuoteInclude;

export async function renderPublicQuoteHtml(
  token: string,
  origin: string,
): Promise<{ html: string } | null> {
  if (!isShareToken(token)) return null;

  const share = await prisma.quoteShare.findUnique({
    where: { token },
    include: { quote: { include: shareInclude } },
  });
  if (!share) return null;

  if (shareClearedByLifecycle(share.quote.lifecycle)) {
    await prisma.quoteShare.deleteMany({ where: { quoteId: share.quoteId } });
    return null;
  }

  const quote = share.quote;
  const zones: ZoneInput[] = quote.zones.map((zone) => ({
    id: zone.id,
    name: zone.name,
    sortOrder: zone.sortOrder,
    active: zone.active,
    workingDayIndexes: zone.workingDayIndexes,
    pricing: zone.pricing,
  }));
  const blocks: QuoteBlockInput[] = quote.blocks.map((block) => ({
    type: block.type,
    sortOrder: block.sortOrder,
    title: block.title,
    name: block.name,
    qty: block.qty,
    unitPrice: block.unitPrice,
    cashlessOverride: block.cashlessOverride,
    dayMode: block.dayMode,
    dayCoefOverride: block.dayCoefOverride,
    zoneId: block.zoneId,
    itemKind: block.catalogItem?.itemKind ?? null,
  }));
  const notes = quote.notes.map((note) => note.trim()).filter(Boolean);
  const meta: ExportMeta = {
    proposalNumber: quote.proposalNumber,
    eventName: quote.eventName,
    date: quote.date,
    time: quote.time,
    place: quote.place,
    client: quote.client,
    requestContact: quote.requestContact,
    managerName: quote.owner.name.trim() || quote.managerName,
    managerPhone: quote.owner.phone,
    cashless: quote.cashless,
    cashlessPercent: quote.cashlessPercent,
    durationDays: quote.durationDays,
    discountPercent: quote.discountPercent,
    notes: quote.notes,
    clientPhone: quote.clientRef?.phone?.trim() || "",
    address: quote.venueRef?.address?.trim() || "",
    comment: quote.paymentComment.trim() || notes.join("\n"),
  };
  const filters = parseShareFilters(
    share.filters,
    zones.map((zone) => zone.id),
  );
  const html = await buildExportPreviewHtml(meta, zones, blocks, filters, origin);
  return { html };
}
