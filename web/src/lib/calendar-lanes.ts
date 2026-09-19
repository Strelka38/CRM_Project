export type LaneFitDensity = {
  laneHeight: number;
  laneGap: number;
  dayNumHeight: number;
  overflowRow: number;
};

/** Сколько полос событий влезает в ячейку дня при текущей высоте (масштаб / зум). */
export function lanesThatFit(
  cellHeight: number,
  d: LaneFitDensity,
  limits?: { min?: number; max?: number },
): number {
  const min = limits?.min ?? 1;
  const max = limits?.max ?? 16;
  const pitch = d.laneHeight + d.laneGap;
  if (
    pitch <= 0 ||
    !Number.isFinite(cellHeight) ||
    cellHeight <= 0
  ) {
    return min;
  }
  const usable = cellHeight - d.dayNumHeight - d.overflowRow;
  if (usable < pitch) return min;
  return Math.min(max, Math.max(min, Math.floor(usable / pitch)));
}

/**
 * Высота полоски, чтобы в ячейке гарантированно влезло `lanes` дорожек.
 * На iPhone 15 Pro Max цель — 6 событий в дне.
 */
export function laneHeightToFit(
  cellHeight: number,
  d: Pick<LaneFitDensity, "laneGap" | "dayNumHeight" | "overflowRow">,
  lanes: number,
  limits?: { min?: number; max?: number },
): number {
  const min = limits?.min ?? 12;
  const max = limits?.max ?? 22;
  if (
    lanes <= 0 ||
    !Number.isFinite(cellHeight) ||
    cellHeight <= 0
  ) {
    return min;
  }
  const usable = cellHeight - d.dayNumHeight - d.overflowRow;
  const pitch = Math.floor(usable / lanes);
  return Math.min(max, Math.max(min, pitch - d.laneGap));
}
