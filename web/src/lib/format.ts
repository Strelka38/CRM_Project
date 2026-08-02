export function formatMoney(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
  }).format(value);
}

export function todayLabel(): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date());
}

export function proposalTitle(number: string, date = todayLabel()): string {
  return `Коммерческое предложение № ${number || "—"} от ${date}`;
}

export function safeFilename(parts: string[]): string {
  const raw = parts.filter(Boolean).join("_").replace(/\s+/g, "_");
  return raw.replace(/[^\w\-а-яА-ЯёЁ]+/gi, "").slice(0, 80) || "KP";
}
