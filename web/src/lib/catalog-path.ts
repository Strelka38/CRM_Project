import type { CategoryKind, ItemKind } from "@prisma/client";
import { prisma } from "@/lib/db";

export function mapCategoryKind(top: string, itemKind: ItemKind): CategoryKind {
  if (itemKind === "PERSONNEL" || top === "Услуги") return "PERSONNEL";
  if (top === "Разное") return "OTHER";
  return "EQUIPMENT";
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
      select: { id: true },
    });
    if (existing) {
      cache.set(built, existing.id);
      parentId = existing.id;
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
