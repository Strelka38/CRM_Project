export function categoryPathChain(fullPath: string): string[] {
  const parts = fullPath
    .split("/")
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  let built = "";
  for (const name of parts) {
    built = built ? `${built}/${name}` : name;
    out.push(built);
  }
  return out;
}

/** Пустое дерево при живых позициях — массовое скрытие разделов, не точечное. */
export function shouldRepairHiddenCatalogTree(
  activeRootCount: number,
  activeItemCount: number,
): boolean {
  return activeRootCount === 0 && activeItemCount > 0;
}
