export const DEFAULT_TIMEZONE = "Asia/Irkutsk";

export const TIMEZONES: Array<{ id: string; label: string; offset: string }> = [
  { id: "Europe/Kaliningrad", label: "Калининград", offset: "UTC+2" },
  { id: "Europe/Moscow", label: "Москва", offset: "UTC+3" },
  { id: "Europe/Samara", label: "Самара", offset: "UTC+4" },
  { id: "Asia/Yekaterinburg", label: "Екатеринбург", offset: "UTC+5" },
  { id: "Asia/Omsk", label: "Омск", offset: "UTC+6" },
  { id: "Asia/Krasnoyarsk", label: "Красноярск", offset: "UTC+7" },
  { id: "Asia/Irkutsk", label: "Иркутск", offset: "UTC+8" },
  { id: "Asia/Yakutsk", label: "Якутск", offset: "UTC+9" },
  { id: "Asia/Vladivostok", label: "Владивосток", offset: "UTC+10" },
  { id: "Asia/Magadan", label: "Магадан", offset: "UTC+11" },
  { id: "Asia/Kamchatka", label: "Камчатка", offset: "UTC+12" },
];

export function isKnownTimezone(id: string | null | undefined): boolean {
  return Boolean(id && TIMEZONES.some((z) => z.id === id));
}

export function resolveTimezone(id: string | null | undefined): string {
  return isKnownTimezone(id) ? id! : DEFAULT_TIMEZONE;
}

export function hourInTimezone(date: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: resolveTimezone(timeZone),
    hour: "numeric",
    hourCycle: "h23",
  }).format(date);
  return Number(hour);
}

/** Добрый день / вечер / ночь (+ утро) по местному часу. */
export function greetingByHour(hour: number): string {
  if (hour >= 5 && hour < 12) return "Доброе утро";
  if (hour >= 12 && hour < 17) return "Добрый день";
  if (hour >= 17 && hour < 23) return "Добрый вечер";
  return "Доброй ночи";
}

export function greetingFor(date: Date, timeZone: string, firstName: string): string {
  const name = firstName.trim() || "коллега";
  return `${greetingByHour(hourInTimezone(date, timeZone))}, ${name}`;
}

export function formatLocalTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: resolveTimezone(timeZone),
    weekday: "short",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function timezoneOffsetLabel(timeZone: string): string {
  const found = TIMEZONES.find((z) => z.id === timeZone);
  return found ? found.offset : "UTC+8";
}
