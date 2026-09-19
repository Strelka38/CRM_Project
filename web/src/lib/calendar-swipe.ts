/** Свайп влево — следующий месяц, вправо — предыдущий. */
export function swipeMonthDelta(
  dx: number,
  width: number,
  vx: number,
  threshold = 0.22,
  flick = 0.45,
): -1 | 0 | 1 {
  if (width <= 0) return 0;
  if (vx <= -flick || dx <= -width * threshold) return 1;
  if (vx >= flick || dx >= width * threshold) return -1;
  return 0;
}
