import { addDays, startOfDay } from "./dates";

/** TimeTree month grid: five week rows on desktop and mobile. */
export const CALENDAR_WEEK_ROWS = 5;

export function buildWeeks(year: number, month: number): Date[][] {
  const first = startOfDay(new Date(year, month, 1));
  const firstDow = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -firstDow);
  const weeks: Date[][] = [];
  for (let w = 0; w < CALENDAR_WEEK_ROWS; w++) {
    weeks.push(
      [0, 1, 2, 3, 4, 5, 6].map((d) => addDays(gridStart, w * 7 + d)),
    );
  }
  return weeks;
}
