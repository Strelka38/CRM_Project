export type WeatherPlaceId = "IRKUTSK" | "IRKUTSK_OBLAST";

export const WEATHER_PLACES: Record<
  WeatherPlaceId,
  { label: string; lat: number; lon: number }
> = {
  IRKUTSK: { label: "Иркутск", lat: 52.2864, lon: 104.2807 },
  IRKUTSK_OBLAST: { label: "Иркутская область", lat: 53.1667, lon: 103.7 },
};

const WMO: Record<number, string> = {
  0: "ясно",
  1: "малооблачно",
  2: "переменная облачность",
  3: "пасмурно",
  45: "туман",
  48: "туман",
  51: "морось",
  53: "морось",
  55: "морось",
  61: "небольшой дождь",
  63: "дождь",
  65: "сильный дождь",
  71: "небольшой снег",
  73: "снег",
  75: "сильный снег",
  80: "ливень",
  81: "ливень",
  82: "сильный ливень",
  95: "гроза",
  96: "гроза",
  99: "гроза",
};

export type WeatherSnapshot = {
  place: WeatherPlaceId;
  placeLabel: string;
  tempC: number;
  description: string;
};

type CacheEntry = { at: number; data: WeatherSnapshot };

const cache = new Map<WeatherPlaceId, CacheEntry>();
const TTL_MS = 20 * 60 * 1000;

function describeCode(code: number): string {
  return WMO[code] || "переменная погода";
}

export async function fetchWeather(
  place: WeatherPlaceId,
): Promise<WeatherSnapshot | null> {
  const hit = cache.get(place);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const loc = WEATHER_PLACES[place] ?? WEATHER_PLACES.IRKUTSK;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}` +
    `&longitude=${loc.lon}&current=temperature_2m,weather_code` +
    `&timezone=Asia/Irkutsk`;
  try {
    const res = await fetch(url);
    if (!res.ok) return hit?.data ?? null;
    const json = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number };
    };
    const temp = json.current?.temperature_2m;
    const code = json.current?.weather_code;
    if (typeof temp !== "number") return hit?.data ?? null;
    const data: WeatherSnapshot = {
      place,
      placeLabel: loc.label,
      tempC: Math.round(temp),
      description: describeCode(typeof code === "number" ? code : 1),
    };
    cache.set(place, { at: Date.now(), data });
    return data;
  } catch {
    return hit?.data ?? null;
  }
}
