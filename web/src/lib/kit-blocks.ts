import type { QuoteBlockInput } from "./quote-calc";

type BlockLike = QuoteBlockInput & { key?: string; id?: string };

/**
 * Collapse legacy kit expansions (KIT_HEADER + component ITEMs)
 * into a single priced ITEM per kitId group.
 */
export function collapseKitBlocks<T extends BlockLike>(blocks: T[]): T[] {
  const sorted = [...blocks].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  const result: T[] = [];
  const seenKitLines = new Set<string>();

  // Precompute totals for expanded kits (items with kitId + catalogItemId)
  const kitTotals = new Map<
    string,
    { name: string; unitPrice: number; dayMode: string | null | undefined }
  >();

  for (const b of sorted) {
    if (b.type === "ITEM" && b.kitId && b.catalogItemId) {
      const prev = kitTotals.get(b.kitId);
      const line =
        (Number(b.qty) || 0) * (Number(b.unitPrice) || 0);
      const header = sorted.find(
        (x) => x.type === "KIT_HEADER" && x.kitId === b.kitId,
      );
      const name =
        header?.title?.replace(/^Комплект:\s*/i, "") ||
        prev?.name ||
        "Комплект";
      kitTotals.set(b.kitId, {
        name,
        unitPrice: (prev?.unitPrice || 0) + line,
        dayMode: prev?.dayMode || b.dayMode || "FIXED1",
      });
    }
  }

  for (const b of sorted) {
    if (b.type === "KIT_HEADER" && b.kitId) {
      if (seenKitLines.has(b.kitId)) continue;
      const tot = kitTotals.get(b.kitId);
      seenKitLines.add(b.kitId);
      result.push({
        ...b,
        type: "ITEM",
        title: null,
        name: tot?.name || b.title?.replace(/^Комплект:\s*/i, "") || "Комплект",
        qty: 1,
        unitPrice: tot?.unitPrice ?? 0,
        dayMode: tot?.dayMode || "FIXED1",
        catalogItemId: null,
        kitId: b.kitId,
      });
      continue;
    }

    if (b.type === "ITEM" && b.kitId && b.catalogItemId) {
      if (seenKitLines.has(b.kitId)) continue;
      const tot = kitTotals.get(b.kitId);
      seenKitLines.add(b.kitId);
      result.push({
        ...b,
        type: "ITEM",
        name: tot?.name || "Комплект",
        qty: 1,
        unitPrice: tot?.unitPrice ?? 0,
        catalogItemId: null,
        kitId: b.kitId,
        dayMode: tot?.dayMode || b.dayMode || "FIXED1",
      });
      continue;
    }

    // Already a single kit line
    if (b.type === "ITEM" && b.kitId && !b.catalogItemId) {
      if (seenKitLines.has(b.kitId)) continue;
      seenKitLines.add(b.kitId);
      result.push(b);
      continue;
    }

    result.push(b);
  }

  return result.map((b, i) => ({ ...b, sortOrder: i }));
}
