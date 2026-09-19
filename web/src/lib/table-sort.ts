import { parseEventDate } from "@/lib/dates";

export type SortDir = "asc" | "desc";

export type SortState = {
  key: string;
  dir: SortDir;
};

export function nextSortState(
  current: SortState | null,
  key: string,
): SortState | null {
  if (!current || current.key !== key) return { key, dir: "asc" };
  if (current.dir === "asc") return { key, dir: "desc" };
  return null;
}

function isEmpty(value: unknown): boolean {
  return (
    value == null ||
    value === "" ||
    (typeof value === "number" && Number.isNaN(value))
  );
}

export function compareSortValues(
  a: unknown,
  b: unknown,
  dir: SortDir,
): number {
  if (isEmpty(a) && isEmpty(b)) return 0;
  if (isEmpty(a)) return 1;
  if (isEmpty(b)) return -1;

  let cmp = 0;
  if (typeof a === "number" && typeof b === "number") {
    cmp = a - b;
  } else if (typeof a === "boolean" && typeof b === "boolean") {
    cmp = Number(a) - Number(b);
  } else {
    cmp = String(a).localeCompare(String(b), "ru", {
      numeric: true,
      sensitivity: "base",
    });
  }
  return dir === "asc" ? cmp : -cmp;
}

export function sortRows<T>(
  rows: T[],
  state: SortState | null,
  getValue: (row: T, key: string) => unknown,
): T[] {
  if (!state) return rows;
  return [...rows].sort((a, b) =>
    compareSortValues(getValue(a, state.key), getValue(b, state.key), state.dir),
  );
}

/** Timestamp for ISO, RU (`ДД.ММ.ГГГГ`) or Date. Empty / invalid → null. */
export function dateSortValue(
  raw: string | Date | null | undefined,
): number | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) {
    const t = raw.getTime();
    return Number.isNaN(t) ? null : t;
  }
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) || /Z$/.test(s)) {
    const iso = Date.parse(s);
    if (!Number.isNaN(iso)) return iso;
  }
  const parsed = parseEventDate(s);
  return parsed ? parsed.getTime() : null;
}
