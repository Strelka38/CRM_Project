import { prisma } from "@/lib/db";

export const specialtyCatalogInclude = {
  catalogItems: {
    include: {
      catalogItem: {
        select: { id: true, name: true, itemKind: true, active: true },
      },
    },
  },
} as const;

export type CatalogServiceRef = {
  id: string;
  name: string;
  itemKind: string;
  active?: boolean;
};

export function serializeSpecialty<
  T extends {
    catalogItems?: Array<{ catalogItem: CatalogServiceRef | null }>;
  },
>(s: T) {
  const catalogItems = (s.catalogItems ?? [])
    .map((row) => row.catalogItem)
    .filter((item): item is CatalogServiceRef => Boolean(item));
  const rest = { ...s } as T & { catalogItems?: unknown };
  delete rest.catalogItems;
  return {
    ...rest,
    catalogItems,
    catalogItemIds: catalogItems.map((item) => item.id),
  };
}

export function parseCatalogItemIds(body: {
  catalogItemIds?: unknown;
  catalogItemId?: unknown;
}): string[] | undefined {
  if (body.catalogItemIds !== undefined) {
    if (!Array.isArray(body.catalogItemIds)) return [];
    return [
      ...new Set(
        body.catalogItemIds
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      ),
    ];
  }
  if (body.catalogItemId === undefined) return undefined;
  const id = body.catalogItemId == null ? "" : String(body.catalogItemId).trim();
  return id ? [id] : [];
}

export async function resolveCatalogServiceIds(
  ids: string[],
  exceptSpecialtyId: string | null,
): Promise<{ ids: string[] } | { error: string }> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return { ids: [] };
  const items = await prisma.catalogItem.findMany({
    where: { id: { in: unique } },
    select: { id: true, itemKind: true, name: true },
  });
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const id of unique) {
    const item = byId.get(id);
    if (!item) return { error: "Услуга не найдена" };
    const kind = String(item.itemKind || "").toUpperCase();
    if (kind !== "SERVICE" && kind !== "PERSONNEL") {
      return { error: "Связать можно только услугу или персонал из каталога" };
    }
  }
  const taken = await prisma.specialtyCatalogItem.findMany({
    where: {
      catalogItemId: { in: unique },
      ...(exceptSpecialtyId ? { specialtyId: { not: exceptSpecialtyId } } : {}),
    },
    include: {
      specialty: { select: { name: true } },
      catalogItem: { select: { name: true } },
    },
  });
  if (taken[0]) {
    return {
      error: `Услуга «${taken[0].catalogItem.name}» уже связана со специальностью «${taken[0].specialty.name}»`,
    };
  }
  return { ids: unique };
}

export async function replaceSpecialtyCatalogItems(
  specialtyId: string,
  catalogItemIds: string[],
) {
  await prisma.specialtyCatalogItem.deleteMany({ where: { specialtyId } });
  if (catalogItemIds.length === 0) return;
  await prisma.specialtyCatalogItem.createMany({
    data: catalogItemIds.map((catalogItemId) => ({
      specialtyId,
      catalogItemId,
    })),
  });
}

export function isUniqueCatalogLinkError(e: unknown): boolean {
  return (
    Boolean(e) &&
    typeof e === "object" &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}
