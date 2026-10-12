import { randomBytes } from "crypto";
import type { ExportFilters } from "@/lib/export/quote-zones";
import {
  STANDARD_PRINT_OPTIONS,
  type QuotePrintOptions,
} from "@/lib/export/print-options";

/** Ссылка живёт, пока мероприятие не завершено. */
export function shareClearedByLifecycle(lifecycle: string): boolean {
  return lifecycle === "COMPLETED";
}

export function newShareToken(): string {
  return randomBytes(24).toString("base64url");
}

export function publicQuotePath(token: string): string {
  return `/kp/${token}`;
}

const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{20,80}$/;

export function isShareToken(token: string): boolean {
  return SHARE_TOKEN_RE.test(token);
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function standardFilters(zoneIds: string[]): ExportFilters {
  return {
    includeSummary: false,
    allTabsOneSheet: true,
    showEquipmentPrice: true,
    showConsumablePrice: true,
    showServicePrice: true,
    zoneIds: [...zoneIds],
    print: { ...STANDARD_PRINT_OPTIONS },
  };
}

/** Фильтры, сохранённые вместе со ссылкой. Чужие зоны отбрасываются. */
export function parseShareFilters(raw: unknown, zoneIds: string[]): ExportFilters {
  const base = standardFilters(zoneIds);
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return base;
  const row = raw as Record<string, unknown>;
  const allowed = new Set(zoneIds);
  const picked = Array.isArray(row.zoneIds)
    ? row.zoneIds.filter(
        (id): id is string => typeof id === "string" && allowed.has(id),
      )
    : [];
  const printRaw =
    row.print && typeof row.print === "object" && !Array.isArray(row.print)
      ? (row.print as Record<string, unknown>)
      : {};
  const print: QuotePrintOptions = { ...STANDARD_PRINT_OPTIONS };
  for (const key of Object.keys(STANDARD_PRINT_OPTIONS) as Array<
    keyof QuotePrintOptions
  >) {
    if (typeof printRaw[key] === "boolean") print[key] = printRaw[key];
  }
  return {
    includeSummary: bool(row.includeSummary, base.includeSummary),
    allTabsOneSheet: bool(row.allTabsOneSheet, base.allTabsOneSheet),
    showEquipmentPrice: bool(row.showEquipmentPrice, base.showEquipmentPrice),
    showConsumablePrice: bool(
      row.showConsumablePrice,
      base.showConsumablePrice,
    ),
    showServicePrice: bool(row.showServicePrice, base.showServicePrice),
    zoneIds: picked.length ? picked : [...zoneIds],
    print,
  };
}

/** Тело кнопки «Ссылка». null — нет ни одной зоны этой сметы. */
export function readShareFilters(
  raw: unknown,
  zoneIds: string[],
): ExportFilters | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const requested = (raw as { zoneIds?: unknown }).zoneIds;
  if (!Array.isArray(requested) || requested.length === 0) return null;
  const filters = parseShareFilters(raw, zoneIds);
  if (
    !filters.zoneIds.some((id) =>
      requested.some((item) => item === id),
    )
  ) {
    return null;
  }
  return filters;
}
