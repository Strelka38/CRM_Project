import type { SpecOverride, SpecExtraBlock, QuoteBlock } from "@prisma/client";
import { prisma } from "@/lib/db";

export type SpecLine = {
  key: string;
  deriveKey: string | null;
  source: "derived" | "extra";
  type: "SECTION" | "ITEM";
  title: string | null;
  name: string | null;
  qty: number;
  kitName: string | null;
  catalogItemId: string | null;
  extraId: string | null;
  hidden: boolean;
  /** true for auto-inserted kit group headers */
  isKitHeader?: boolean;
};

type KitWithComponents = {
  id: string;
  name: string;
  components: Array<{
    qty: number;
    catalogItemId: string;
    catalogItem: { id: string; name: string };
  }>;
};

export function itemDeriveKey(quoteBlockId: string) {
  return `item:${quoteBlockId}`;
}

export function kitComponentDeriveKey(
  quoteBlockId: string,
  catalogItemId: string,
) {
  return `kit:${quoteBlockId}:${catalogItemId}`;
}

export function kitHeaderDeriveKey(quoteBlockId: string) {
  return `kitheader:${quoteBlockId}`;
}

export function sectionDeriveKey(quoteBlockId: string) {
  return `section:${quoteBlockId}`;
}

function applyName(
  deriveKey: string,
  fallback: string | null | undefined,
  nameByKey: Map<string, string>,
) {
  return nameByKey.get(deriveKey) ?? fallback ?? "";
}

/** Expand quote blocks into specification lines (kits → components + standalone items). */
export async function buildSpecLines(
  blocks: QuoteBlock[],
  overrides: SpecOverride[],
  extras: SpecExtraBlock[],
): Promise<SpecLine[]> {
  const kitIds = [
    ...new Set(
      blocks
        .filter((b) => b.type === "ITEM" && Boolean(b.kitId))
        .map((b) => b.kitId!),
    ),
  ];

  const kits: KitWithComponents[] =
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

  const hideKeys = new Set(
    overrides.filter((o) => o.action === "HIDE").map((o) => o.deriveKey),
  );
  const qtyByKey = new Map(
    overrides
      .filter((o) => o.action === "SET_QTY" && o.qty != null)
      .map((o) => [o.deriveKey, o.qty as number]),
  );
  const nameByKey = new Map(
    overrides
      .filter((o) => o.action === "RENAME" && o.name != null)
      .map((o) => [o.deriveKey, o.name as string]),
  );

  const lines: SpecLine[] = [];

  for (const b of blocks) {
    if (b.type === "SECTION") {
      const deriveKey = sectionDeriveKey(b.id);
      lines.push({
        key: deriveKey,
        deriveKey,
        source: "derived",
        type: "SECTION",
        title: applyName(deriveKey, b.title, nameByKey),
        name: null,
        qty: 0,
        kitName: null,
        catalogItemId: null,
        extraId: null,
        hidden: hideKeys.has(deriveKey),
      });
      continue;
    }

    if (b.type !== "ITEM") continue;

    const lineQty = Number(b.qty) || 0;

    // Kit line → header + components (also keep standalone catalog items from the estimate separately)
    if (b.kitId) {
      const kit = kitMap.get(b.kitId);
      const kitTitle = b.name || kit?.name || "Комплект";
      const headerKey = kitHeaderDeriveKey(b.id);

      lines.push({
        key: headerKey,
        deriveKey: headerKey,
        source: "derived",
        type: "SECTION",
        title: applyName(headerKey, `Комплект «${kitTitle}»`, nameByKey),
        name: null,
        qty: 0,
        kitName: kitTitle,
        catalogItemId: null,
        extraId: null,
        hidden: hideKeys.has(headerKey),
        isKitHeader: true,
      });

      if (!kit) {
        const missingKey = `kitmissing:${b.id}`;
        lines.push({
          key: missingKey,
          deriveKey: missingKey,
          source: "derived",
          type: "ITEM",
          title: null,
          name: applyName(
            missingKey,
            `${kitTitle} (комплект не найден в каталоге)`,
            nameByKey,
          ),
          qty: qtyByKey.has(missingKey) ? qtyByKey.get(missingKey)! : lineQty,
          kitName: kitTitle,
          catalogItemId: null,
          extraId: null,
          hidden: hideKeys.has(missingKey),
        });
        continue;
      }

      if (kit.components.length === 0) {
        const emptyKey = `kitempty:${b.id}`;
        lines.push({
          key: emptyKey,
          deriveKey: emptyKey,
          source: "derived",
          type: "ITEM",
          title: null,
          name: applyName(
            emptyKey,
            `${kitTitle} (в комплекте нет составляющих)`,
            nameByKey,
          ),
          qty: qtyByKey.has(emptyKey) ? qtyByKey.get(emptyKey)! : lineQty,
          kitName: kitTitle,
          catalogItemId: null,
          extraId: null,
          hidden: hideKeys.has(emptyKey),
        });
        continue;
      }

      for (const c of kit.components) {
        const deriveKey = kitComponentDeriveKey(b.id, c.catalogItemId);
        const baseQty = lineQty * (Number(c.qty) || 0);
        lines.push({
          key: deriveKey,
          deriveKey,
          source: "derived",
          type: "ITEM",
          title: null,
          name: applyName(deriveKey, c.catalogItem.name, nameByKey),
          qty: qtyByKey.has(deriveKey) ? qtyByKey.get(deriveKey)! : baseQty,
          kitName: kitTitle,
          catalogItemId: c.catalogItemId,
          extraId: null,
          hidden: hideKeys.has(deriveKey),
        });
      }
      continue;
    }

    // Standalone catalog / custom item from the estimate
    const deriveKey = itemDeriveKey(b.id);
    lines.push({
      key: deriveKey,
      deriveKey,
      source: "derived",
      type: "ITEM",
      title: null,
      name: applyName(deriveKey, b.name, nameByKey),
      qty: qtyByKey.has(deriveKey) ? qtyByKey.get(deriveKey)! : lineQty,
      kitName: null,
      catalogItemId: b.catalogItemId,
      extraId: null,
      hidden: hideKeys.has(deriveKey),
    });
  }

  const sortedExtras = [...extras].sort((a, b) => a.sortOrder - b.sortOrder);
  for (const e of sortedExtras) {
    lines.push({
      key: `extra:${e.id}`,
      deriveKey: null,
      source: "extra",
      type: e.type,
      title: e.title,
      name: e.name,
      qty: Number(e.qty) || 0,
      kitName: null,
      catalogItemId: e.catalogItemId,
      extraId: e.id,
      hidden: false,
    });
  }

  return lines;
}

/** Soft-prune overrides whose deriveKey no longer exists in the base expansion. */
export function pruneStaleOverrideKeys(
  lines: SpecLine[],
  overrides: SpecOverride[],
): string[] {
  const live = new Set(
    lines.filter((l) => l.deriveKey).map((l) => l.deriveKey!),
  );
  return overrides
    .filter((o) => !live.has(o.deriveKey))
    .map((o) => o.id);
}
