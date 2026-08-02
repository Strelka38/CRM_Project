export type GroupableBlock = {
  key: string;
  type: string;
  zoneId: string;
  sortOrder: number;
};

export type BlockGroup<T extends GroupableBlock> = {
  /** Key of SECTION/KIT_HEADER, or null for leading orphan items */
  headerKey: string | null;
  blocks: T[];
};

export function isGroupHeader(type: string) {
  return type === "SECTION" || type === "KIT_HEADER";
}

/** Split ordered zone blocks into section groups (header + following items). */
export function buildBlockGroups<T extends GroupableBlock>(
  zoneBlocks: T[],
): BlockGroup<T>[] {
  const groups: BlockGroup<T>[] = [];
  let current: BlockGroup<T> | null = null;

  for (const b of zoneBlocks) {
    if (isGroupHeader(b.type)) {
      if (current) groups.push(current);
      current = { headerKey: b.key, blocks: [b] };
    } else {
      if (!current) {
        current = { headerKey: null, blocks: [] };
      }
      current.blocks.push(b);
    }
  }
  if (current) groups.push(current);
  return groups;
}

export function flattenGroups<T extends GroupableBlock>(
  groups: BlockGroup<T>[],
): T[] {
  return groups.flatMap((g) => g.blocks);
}

function findGroupIndex<T extends GroupableBlock>(
  groups: BlockGroup<T>[],
  key: string,
): { gi: number; bi: number } {
  for (let gi = 0; gi < groups.length; gi++) {
    const bi = groups[gi].blocks.findIndex((b) => b.key === key);
    if (bi >= 0) return { gi, bi };
  }
  return { gi: -1, bi: -1 };
}

/**
 * Move a block relative to another within the same zone.
 * SECTION/KIT_HEADER moves with all items until the next header.
 */
export function reorderBlocksByDrop<T extends GroupableBlock>(
  zoneBlocks: T[],
  fromKey: string,
  toKey: string,
): T[] | null {
  if (fromKey === toKey) return null;
  const groups = buildBlockGroups(zoneBlocks.map((b) => ({ ...b })));
  const from = findGroupIndex(groups, fromKey);
  const to = findGroupIndex(groups, toKey);
  if (from.gi < 0 || to.gi < 0) return null;

  const fromBlock = groups[from.gi].blocks[from.bi];

  // Move whole section/kit group before the group that contains toKey
  if (isGroupHeader(fromBlock.type) && from.bi === 0) {
    const moved = groups[from.gi];
    const remaining = groups.filter((_, i) => i !== from.gi);
    let insertAt = remaining.findIndex((g) =>
      g.blocks.some((b) => b.key === toKey),
    );
    if (insertAt < 0) insertAt = remaining.length;
    remaining.splice(insertAt, 0, moved);
    return flattenGroups(remaining);
  }

  // Move single non-header row
  if (isGroupHeader(fromBlock.type)) return null;

  const [item] = groups[from.gi].blocks.splice(from.bi, 1);
  if (
    groups[from.gi].blocks.length === 0 &&
    groups[from.gi].headerKey === null
  ) {
    groups.splice(from.gi, 1);
  }

  const target = findGroupIndex(groups, toKey);
  if (target.gi < 0) {
    groups.push({ headerKey: null, blocks: [item] });
    return flattenGroups(groups);
  }

  const targetBlock = groups[target.gi].blocks[target.bi];
  if (isGroupHeader(targetBlock.type) && target.bi === 0) {
    // Drop on section → first item under that section
    groups[target.gi].blocks.splice(1, 0, item);
  } else {
    const idx = groups[target.gi].blocks.findIndex((b) => b.key === toKey);
    groups[target.gi].blocks.splice(idx < 0 ? groups[target.gi].blocks.length : idx, 0, item);
  }

  return flattenGroups(groups);
}

/** Arrow move: section moves as a group; items reorder relative to next/prev item. */
export function moveBlockInGroups<T extends GroupableBlock>(
  zoneBlocks: T[],
  key: string,
  dir: -1 | 1,
): T[] | null {
  const groups = buildBlockGroups(zoneBlocks);
  const { gi, bi } = findGroupIndex(groups, key);
  if (gi < 0) return null;

  const block = groups[gi].blocks[bi];
  if (isGroupHeader(block.type) && bi === 0) {
    const next = gi + dir;
    if (next < 0 || next >= groups.length) return null;
    const copy = [...groups];
    [copy[gi], copy[next]] = [copy[next], copy[gi]];
    return flattenGroups(copy);
  }

  const flatItems = groups.flatMap((g) =>
    g.blocks.filter((b) => !isGroupHeader(b.type)),
  );
  const itemIdx = flatItems.findIndex((b) => b.key === key);
  if (itemIdx < 0) return null;
  const neighbor = flatItems[itemIdx + dir];
  if (!neighbor) return null;
  return reorderBlocksByDrop(zoneBlocks, key, neighbor.key);
}
