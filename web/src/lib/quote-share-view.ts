import type { Prisma } from "@prisma/client";
import { resolveEstimateDisclaimer } from "@/lib/commercial-terms";
import { prisma } from "@/lib/db";
import {
  EXPORT_TEMPLATES_KEY,
  STANDARD_TEMPLATE_ID,
  baseTemplateNote,
  parseExportTemplates,
} from "@/lib/export/export-templates";
import { buildExportPreviewHtml, type ExportMeta } from "@/lib/export/quote-zones";
import { getOrgSettings } from "@/lib/org-settings";
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
  const org = await getOrgSettings();
  const row = await prisma.appSetting.findUnique({
    where: { key: EXPORT_TEMPLATES_KEY },
  });
  const templates = parseExportTemplates(row?.value);
  const defaultId = org.kpDefaultTemplateId;
  const fromDefault =
    defaultId && defaultId !== STANDARD_TEMPLATE_ID
      ? templates.find((item) => item.id === defaultId)?.note || ""
      : "";
  const templateNote = fromDefault || baseTemplateNote(templates);
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
    estimateDisclaimer: resolveEstimateDisclaimer(quote.estimateDisclaimer, templateNote),
  };
  const filters = parseShareFilters(
    share.filters,
    zones.map((zone) => zone.id),
  );
  const html = await buildExportPreviewHtml(meta, zones, blocks, filters, origin);
  return { html };
}
