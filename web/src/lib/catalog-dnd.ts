import type { PickedCatalogItem } from "@/components/CatalogPicker";

export const CATALOG_DND_MIME = "application/x-baikal-catalog-item";

export type CatalogDragPayload = {
  item: PickedCatalogItem;
  qty: number;
};

let activeCatalogDrag: CatalogDragPayload | null = null;

export function beginCatalogDrag(
  item: PickedCatalogItem,
  qty = 1,
): CatalogDragPayload {
  const payload = {
    item,
    qty: Math.max(1, Math.round(qty) || 1),
  };
  activeCatalogDrag = payload;
  return payload;
}

export function endCatalogDrag() {
  activeCatalogDrag = null;
}

export function getCatalogDrag(): CatalogDragPayload | null {
  return activeCatalogDrag;
}

export function setCatalogDragData(
  dataTransfer: DataTransfer,
  payload: CatalogDragPayload,
) {
  const json = JSON.stringify(payload);
  try {
    dataTransfer.setData(CATALOG_DND_MIME, json);
  } catch {
    /* some browsers reject custom MIME types */
  }
  dataTransfer.setData("text/plain", payload.item.name);
  dataTransfer.effectAllowed = "copy";
}

export function isCatalogDrag(dataTransfer?: DataTransfer | null): boolean {
  if (activeCatalogDrag) return true;
  if (!dataTransfer) return false;
  return Array.from(dataTransfer.types).includes(CATALOG_DND_MIME);
}

export function parseCatalogDragPayloadJson(
  raw: string,
): CatalogDragPayload | null {
  try {
    const data = JSON.parse(raw) as Partial<CatalogDragPayload>;
    const item = data?.item;
    if (!item || typeof item !== "object") return null;
    if (typeof item.id !== "string" || typeof item.name !== "string") {
      return null;
    }
    return {
      item: item as PickedCatalogItem,
      qty: Math.max(1, Math.round(Number(data.qty) || 1)),
    };
  } catch {
    return null;
  }
}

export function parseCatalogDrag(
  dataTransfer?: DataTransfer | null,
): CatalogDragPayload | null {
  if (dataTransfer) {
    let raw = "";
    try {
      raw = dataTransfer.getData(CATALOG_DND_MIME);
    } catch {
      raw = "";
    }
    if (raw) {
      const parsed = parseCatalogDragPayloadJson(raw);
      if (parsed) return parsed;
    }
  }
  return activeCatalogDrag;
}

/** One nearest insert slot. Tied neighbor edges keep the current gap (never two lines). */
export function nearestInsertGap(
  rows: ArrayLike<{ getBoundingClientRect(): { top: number; bottom: number } }>,
  clientY: number,
  current: number | null,
): number {
  const TIE_PX = 1;
  let bestDist = Number.POSITIVE_INFINITY;
  const tied = new Set<number>();
  const consider = (index: number, dist: number) => {
    if (dist < bestDist - TIE_PX) {
      bestDist = dist;
      tied.clear();
      tied.add(index);
      return;
    }
    if (dist <= bestDist + TIE_PX) {
      tied.add(index);
      if (dist < bestDist) bestDist = dist;
    }
  };
  for (let i = 0; i < rows.length; i++) {
    const box = rows[i].getBoundingClientRect();
    consider(i, Math.abs(clientY - box.top));
    consider(i + 1, Math.abs(clientY - box.bottom));
  }
  if (tied.size === 0) return 0;
  if (current != null && tied.has(current)) return current;
  return Math.min(...tied);
}

export function relatedTargetStillInside(
  currentTarget: EventTarget,
  relatedTarget: EventTarget | null,
): boolean {
  if (!relatedTarget || !(currentTarget instanceof Element)) return false;
  return currentTarget.contains(relatedTarget as Node);
}
