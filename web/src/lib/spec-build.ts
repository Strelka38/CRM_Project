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
  comment: string;
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
    catalogItem: { id: string; name: string; itemKind: string };
  }>;
};

const SKIP_ITEM_KINDS = new Set(["PERSONNEL", "SERVICE"]);

function isPersonnelOrService(itemKind: string | null | undefined) {
  return SKIP_ITEM_KINDS.has(String(itemKind || "").toUpperCase());
}

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

  const standaloneItemIds = [
    ...new Set(
      blocks
        .filter((b) => b.type === "ITEM" && !b.kitId && b.catalogItemId)
        .map((b) => b.catalogItemId!),
    ),
  ];

  const [kits, standaloneItems] = await Promise.all([
    kitIds.length > 0
      ? prisma.kit.findMany({
          where: { id: { in: kitIds } },
          include: {
            components: {
              include: {
                catalogItem: {
                  select: { id: true, name: true, itemKind: true },
                },
              },
            },
          },
        })
      : Promise.resolve([] as KitWithComponents[]),
    standaloneItemIds.length > 0
      ? prisma.catalogItem.findMany({
          where: { id: { in: standaloneItemIds } },
          select: { id: true, itemKind: true },
        })
      : Promise.resolve([] as Array<{ id: string; itemKind: string }>),
  ]);

  const kitMap = new Map(kits.map((k) => [k.id, k]));
  const itemKindById = new Map(
    standaloneItems.map((i) => [i.id, i.itemKind]),
  );

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
  const commentByKey = new Map(
    overrides
      .filter((o) => o.action === "SET_COMMENT" && o.name != null)
      .map((o) => [o.deriveKey, o.name as string]),
  );
  const replaceByKey = new Map(
    overrides
      .filter((o) => o.action === "REPLACE")
      .map((o) => [
        o.deriveKey,
        {
          catalogItemId: o.catalogItemId ?? null,
          name: o.name ?? null,
        },
      ]),
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
        comment: commentByKey.get(deriveKey) ?? "",
        kitName: null,
        catalogItemId: null,
        extraId: null,
        hidden: hideKeys.has(deriveKey),
      });
      continue;
    }

    if (b.type !== "ITEM") continue;

    // Skip billable personnel/service catalog lines — staff shown via assignments
    if (
      !b.kitId &&
      b.catalogItemId &&
      isPersonnelOrService(itemKindById.get(b.catalogItemId))
    ) {
      continue;
    }

    const lineQty = Number(b.qty) || 0;

    // Kit line → header + components (also keep standalone catalog items from the estimate separately)
    if (b.kitId) {
      const kit = kitMap.get(b.kitId);
      const kitTitle = b.name || kit?.name || "Комплект";
      const headerKey = kitHeaderDeriveKey(b.id);

      const equipmentComponents = (kit?.components || []).filter(
        (c) => !isPersonnelOrService(c.catalogItem.itemKind),
      );

      if (!kit) {
        lines.push({
          key: headerKey,
          deriveKey: headerKey,
          source: "derived",
          type: "SECTION",
          title: applyName(headerKey, `Комплект «${kitTitle}»`, nameByKey),
          name: null,
          qty: 0,
          comment: commentByKey.get(headerKey) ?? "",
          kitName: kitTitle,
          catalogItemId: null,
          extraId: null,
          hidden: hideKeys.has(headerKey),
          isKitHeader: true,
        });
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
          comment: commentByKey.get(missingKey) ?? "",
          kitName: kitTitle,
          catalogItemId: null,
          extraId: null,
          hidden: hideKeys.has(missingKey),
        });
        continue;
      }

      if (equipmentComponents.length === 0) {
        // Kit was only personnel/service, or empty — omit from packing list
        if (kit.components.length === 0) {
          lines.push({
            key: headerKey,
            deriveKey: headerKey,
            source: "derived",
            type: "SECTION",
            title: applyName(headerKey, `Комплект «${kitTitle}»`, nameByKey),
            name: null,
            qty: 0,
            comment: commentByKey.get(headerKey) ?? "",
            kitName: kitTitle,
            catalogItemId: null,
            extraId: null,
            hidden: hideKeys.has(headerKey),
            isKitHeader: true,
          });
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
            comment: commentByKey.get(emptyKey) ?? "",
            kitName: kitTitle,
            catalogItemId: null,
            extraId: null,
            hidden: hideKeys.has(emptyKey),
          });
        }
        continue;
      }

      lines.push({
        key: headerKey,
        deriveKey: headerKey,
        source: "derived",
        type: "SECTION",
        title: applyName(headerKey, `Комплект «${kitTitle}»`, nameByKey),
        name: null,
        qty: 0,
        comment: commentByKey.get(headerKey) ?? "",
        kitName: kitTitle,
        catalogItemId: null,
        extraId: null,
        hidden: hideKeys.has(headerKey),
        isKitHeader: true,
      });

      for (const c of equipmentComponents) {
        const deriveKey = kitComponentDeriveKey(b.id, c.catalogItemId);
        const baseQty = lineQty * (Number(c.qty) || 0);
        const replaced = replaceByKey.get(deriveKey);
        const catalogItemId =
          replaced?.catalogItemId ?? c.catalogItemId;
        const baseName = replaced?.name ?? c.catalogItem.name;
        lines.push({
          key: deriveKey,
          deriveKey,
          source: "derived",
          type: "ITEM",
          title: null,
          name: applyName(deriveKey, baseName, nameByKey),
          qty: qtyByKey.has(deriveKey) ? qtyByKey.get(deriveKey)! : baseQty,
          comment: commentByKey.get(deriveKey) ?? "",
          kitName: kitTitle,
          catalogItemId,
          extraId: null,
          hidden: hideKeys.has(deriveKey),
        });
      }
      continue;
    }

    // Standalone catalog / custom item from the estimate
    const deriveKey = itemDeriveKey(b.id);
    const replaced = replaceByKey.get(deriveKey);
    const catalogItemId = replaced?.catalogItemId ?? b.catalogItemId;
    const baseName = replaced?.name ?? b.name;
    lines.push({
      key: deriveKey,
      deriveKey,
      source: "derived",
      type: "ITEM",
      title: null,
      name: applyName(deriveKey, baseName, nameByKey),
      qty: qtyByKey.has(deriveKey) ? qtyByKey.get(deriveKey)! : lineQty,
      comment: commentByKey.get(deriveKey) ?? "",
      kitName: null,
      catalogItemId,
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
      comment: e.comment ?? "",
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

/** Apply saved packing-list order; unknown keys ignored, new keys appended. */
export function applySpecLineOrder(
  lines: SpecLine[],
  order: string[] | null | undefined,
): SpecLine[] {
  if (!order || order.length === 0) return lines;
  const byKey = new Map(lines.map((l) => [l.key, l]));
  const result: SpecLine[] = [];
  for (const key of order) {
    const line = byKey.get(key);
    if (line) {
      result.push(line);
      byKey.delete(key);
    }
  }
  for (const line of lines) {
    if (byKey.has(line.key)) result.push(line);
  }
  return result;
}

/** Drop keys that no longer exist in the built line set. */
export function sanitizeSpecLineOrder(
  lines: SpecLine[],
  order: string[] | null | undefined,
): string[] {
  if (!order || order.length === 0) {
    return lines.map((l) => l.key);
  }
  const live = new Set(lines.map((l) => l.key));
  const kept = order.filter((k) => live.has(k));
  for (const l of lines) {
    if (!kept.includes(l.key)) kept.push(l.key);
  }
  return kept;
}
