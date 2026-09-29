/** Parse common RU date strings to Date at local noon */
export function parseEventDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), 12);
  }

  const ru = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (ru) {
    let year = Number(ru[3]);
    if (year < 100) year += 2000;
    return new Date(year, Number(ru[2]) - 1, Number(ru[1]), 12);
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function rangesOverlap(
  aStart: Date,
  aDays: number,
  bStart: Date,
  bDays: number,
): boolean {
  const aEnd = addDays(startOfDay(aStart), Math.max(1, aDays));
  const bEnd = addDays(startOfDay(bStart), Math.max(1, bDays));
  const a0 = startOfDay(aStart).getTime();
  const b0 = startOfDay(bStart).getTime();
  return a0 < bEnd.getTime() && b0 < aEnd.getTime();
}

export function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Format Date as ДД.ММ.ГГГГ */
export function formatRuDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}.${m}.${d.getFullYear()}`;
}

/** ISO / Date → ДД.ММ.ГГГГ, иначе «—». */
export function formatIsoRuDate(raw: string | Date | null | undefined): string {
  if (raw == null || raw === "") return "—";
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return formatRuDate(d);
}

/** «26 авг» */
export function formatDayMonth(d: Date): string {
  return d
    .toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    .replace(/\./g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

/** Inclusive day count between two dates (same day = 1). */
export function daysInclusive(start: Date, end: Date): number {
  const a = startOfDay(start).getTime();
  const b = startOfDay(end).getTime();
  const diff = Math.round(Math.abs(b - a) / 86_400_000);
  return diff + 1;
}

export function endDateFromDuration(start: Date, durationDays: number): Date {
  return addDays(startOfDay(start), Math.max(1, durationDays) - 1);
}

/** ISO-8601 номер недели (пн–вс), как в TimeTree. */
export function isoWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
