import {
  normalizeOwners,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";

export const EVENT_COLOR_IDS = [
  "violet",
  "blue",
  "yellow",
  "green",
  "rose",
  "teal",
] as const;

export type EventColorId = (typeof EVENT_COLOR_IDS)[number];

export const EVENT_COLOR_PRESETS: Record<
  EventColorId,
  { label: string; fill: string; ink: string }
> = {
  violet: { label: "Фиолетовый", fill: "var(--cal-ne)", ink: "#fff" },
  blue: { label: "Голубой", fill: "var(--cal-dk)", ink: "var(--accent-ink)" },
  yellow: { label: "Жёлтый", fill: "var(--cal-shm)", ink: "#fff" },
  green: {
    label: "Зелёный",
    fill: "var(--cal-green)",
    ink: "#fff",
  },
  rose: { label: "Розовый", fill: "var(--cal-rose)", ink: "#fff" },
  teal: { label: "Бирюзовый", fill: "var(--cal-teal)", ink: "#fff" },
};

export function isEventColorId(value: string): value is EventColorId {
  return (EVENT_COLOR_IDS as readonly string[]).includes(value);
}

/** Пустой цвет в профиле: первая фирма менеджера. Без фирмы — null. */
export function defaultEventColorId(
  owners: CatalogOwnerValue[] | null | undefined,
): EventColorId | null {
  const first = normalizeOwners(owners)[0];
  if (first === "SHOW_MASTER") return "yellow";
  if (first === "DIAKOM") return "blue";
  if (first === "NE_EVENT") return "violet";
  return null;
}

export function resolveEventColor(
  eventColor: string | null | undefined,
  owners: CatalogOwnerValue[] | null | undefined,
): { id: EventColorId | null; fill: string; ink: string } {
  const explicit =
    eventColor && isEventColorId(eventColor) ? eventColor : null;
  const id = explicit ?? defaultEventColorId(owners);
  if (!id) return { id: null, fill: "", ink: "#fff" };
  const preset = EVENT_COLOR_PRESETS[id];
  return { id, fill: preset.fill, ink: preset.ink };
}
