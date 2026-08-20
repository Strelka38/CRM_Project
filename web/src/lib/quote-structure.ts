import { defaultQuoteZones } from "@/lib/quote-defaults";

export type CloneZone = {
  name: string;
  sortOrder: number;
};

export type CloneBlock = {
  type: "SECTION" | "ITEM" | "NOTE" | "KIT_HEADER" | string;
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
  /** Index into zones array */
  zoneIndex: number;
};

export type QuoteStructurePayload = {
  zones: CloneZone[];
  blocks: CloneBlock[];
};

export function parseTemplatePayload(raw: unknown): QuoteStructurePayload {
  const data = raw as Partial<QuoteStructurePayload>;
  const zones =
    Array.isArray(data.zones) && data.zones.length > 0
      ? data.zones.map((z, i) => ({
          name: String(z?.name || "Зона").trim() || "Зона",
          sortOrder: Number.isFinite(z?.sortOrder) ? Number(z.sortOrder) : i,
        }))
      : defaultQuoteZones();
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
