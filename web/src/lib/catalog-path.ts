import type { CategoryKind, ItemKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  categoryPathChain,
  shouldRepairHiddenCatalogTree,
} from "@/lib/catalog-path-logic";

export { categoryPathChain, shouldRepairHiddenCatalogTree };

export function mapCategoryKind(top: string, itemKind: ItemKind): CategoryKind {
  if (itemKind === "PERSONNEL" || top === "Услуги") return "PERSONNEL";
  if (top === "Разное") return "OTHER";
  return "EQUIPMENT";
}

/** Включить раздел и всех предков (после импорта в скрытую ветку). */
export async function reactivateCategoryPaths(paths: Iterable<string>) {
  const all = new Set<string>();
  for (const p of paths) {
    for (const x of categoryPathChain(p)) all.add(x);
  }
  if (all.size === 0) return;
  await prisma.catalogCategory.updateMany({
    where: { path: { in: [...all] } },
    data: { active: true },
  });
}

/**
 * Если все корневые разделы скрыты, а позиции на месте — включить папки
 * с живыми позициями и услуги, которые складской импорт пропускал.
 */
export async function repairHiddenCatalogTree(): Promise<boolean> {
  const [activeRoots, liveItems] = await Promise.all([
    prisma.catalogCategory.count({
      where: { active: true, parentId: null },
    }),
    prisma.catalogItem.count({ where: { active: true } }),
  ]);
  if (!shouldRepairHiddenCatalogTree(activeRoots, liveItems)) return false;

  const withLiveItems = await prisma.catalogCategory.findMany({
    where: { items: { some: { active: true } } },
    select: { path: true },
  });
  await reactivateCategoryPaths(withLiveItems.map((c) => c.path));

  await prisma.catalogItem.updateMany({
    where: {
      active: false,
      itemKind: { in: ["SERVICE", "CONSUMABLE", "PERSONNEL", "OTHER"] },
    },
    data: { active: true },
  });
  return true;
}

/** Загрузить кэш path → id из БД. */
export async function loadCategoryPathCache() {
  const cats = await prisma.catalogCategory.findMany({
    select: { id: true, path: true },
  });
  return new Map(cats.map((c) => [c.path, c.id]));
}

/** Создать недостающие уровни пути категории, вернуть id листа. */
export async function ensureCategoryPath(
  fullPath: string,
  cache: Map<string, string>,
  defaultKind: CategoryKind,
): Promise<string> {
  const parts = fullPath
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new Error("Пустой путь категории");
  }

  let parentId: string | null = null;
  let built = "";

  for (let i = 0; i < parts.length; i++) {
    const name = parts[i];
    built = built ? `${built}/${name}` : name;

    if (cache.has(built)) {
      parentId = cache.get(built)!;
      continue;
    }

    const existing = await prisma.catalogCategory.findUnique({
      where: { path: built },
      select: { id: true, active: true },
    });
    if (existing) {
      cache.set(built, existing.id);
      parentId = existing.id;
      if (!existing.active) {
        await prisma.catalogCategory.update({
          where: { id: existing.id },
          data: { active: true },
        });
      }
      continue;
    }

    const kind = i === 0 ? mapCategoryKind(name, "EQUIPMENT") : defaultKind;
    const created: { id: string } = await prisma.catalogCategory.create({
      data: {
        name,
        path: built,
        parentId,
        kind,
        subtotalLabel: `Итого ${name}:`,
        sortOrder: cache.size,
        active: true,
      },
      select: { id: true },
    });
    cache.set(built, created.id);
    parentId = created.id;
  }

  return parentId!;
}
