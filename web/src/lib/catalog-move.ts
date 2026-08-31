export type CatalogMoveCategory = {
  id: string;
  parentId: string | null;
  name: string;
  path: string;
};

export type CategoryMove = {
  id: string;
  parentId: string | null;
  oldPath: string;
  newPath: string;
};

function isUnderPath(path: string, rootPath: string) {
  return path === rootPath || path.startsWith(`${rootPath}/`);
}

/** Корни выделения: вложенные в другие выбранные разделы едут вместе с родителем. */
export function topLevelSelectedCategories(
  categories: CatalogMoveCategory[],
  selectedIds: Iterable<string>,
): CatalogMoveCategory[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const selected = new Set(
    [...selectedIds].filter((id) => byId.has(id)),
  );
  const ancestorSelected = (cat: CatalogMoveCategory) => {
    let pid = cat.parentId;
    while (pid) {
      if (selected.has(pid)) return true;
      pid = byId.get(pid)?.parentId ?? null;
    }
    return false;
  };
  return [...selected]
    .map((id) => byId.get(id)!)
    .filter((c) => !ancestorSelected(c));
}

export function rewriteDescendantPath(
  oldRootPath: string,
  newRootPath: string,
  descendantPath: string,
) {
  return newRootPath + descendantPath.slice(oldRootPath.length);
}

/** Позиции/комплекты внутри вырезанной папки не двигаем отдельно — они едут с разделом. */
export function filterIdsOutsideMovedFolders(
  rows: Array<{ id: string; categoryPath: string | null | undefined }>,
  movedRootPaths: string[],
) {
  if (movedRootPaths.length === 0) return rows.map((r) => r.id);
  return rows
    .filter((r) => {
      const path = r.categoryPath;
      if (!path) return true;
      return !movedRootPaths.some((root) => isUnderPath(path, root));
    })
    .map((r) => r.id);
}

export function planCategoryMoves(
  categories: CatalogMoveCategory[],
  selectedIds: Iterable<string>,
  targetParentId: string | null,
): { ok: true; moves: CategoryMove[] } | { ok: false; error: string } {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const roots = topLevelSelectedCategories(categories, selectedIds);
  if (roots.length === 0) return { ok: true, moves: [] };

  const target = targetParentId ? byId.get(targetParentId) : null;
  if (targetParentId && !target) {
    return { ok: false, error: "Раздел назначения не найден" };
  }

  const moves: CategoryMove[] = [];
  const usedNewPaths = new Set<string>();

  for (const root of roots) {
    if (
      target &&
      (target.id === root.id || isUnderPath(target.path, root.path))
    ) {
      return { ok: false, error: "Нельзя вставить раздел внутрь себя" };
    }

    const newPath = target ? `${target.path}/${root.name}` : root.name;
    const parentId = target?.id ?? null;
    if (parentId === root.parentId) continue;

    const conflict = categories.some(
      (c) => c.path === newPath && c.id !== root.id,
    );
    if (conflict || usedNewPaths.has(newPath)) {
      return { ok: false, error: `В разделе уже есть «${root.name}»` };
    }
    usedNewPaths.add(newPath);
    moves.push({
      id: root.id,
      parentId,
      oldPath: root.path,
      newPath,
    });
  }

  return { ok: true, moves };
}
