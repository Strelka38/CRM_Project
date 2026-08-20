export const DEFAULT_QUOTE_ZONE_NAMES = [
  "Звук",
  "Свет",
  "Видео",
  "Трансляция",
  "Разное",
] as const;

export const SERVICES_SECTION_TITLE = "Услуги";

export type DefaultQuoteZone = { name: string; sortOrder: number };

export function defaultQuoteZones(): DefaultQuoteZone[] {
  return DEFAULT_QUOTE_ZONE_NAMES.map((name, sortOrder) => ({
    name,
    sortOrder,
  }));
}

export function isPersonnelOrServiceKind(
  itemKind: string | null | undefined,
): boolean {
  const kind = String(itemKind || "").toUpperCase();
  return kind === "PERSONNEL" || kind === "SERVICE";
}
