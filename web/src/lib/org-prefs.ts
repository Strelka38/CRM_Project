export const CURRENCIES = [
  { id: "RUB", label: "Российский рубль" },
  { id: "BYN", label: "Белорусский рубль" },
  { id: "UAH", label: "Украинская гривна" },
  { id: "KZT", label: "Казахстанский тенге" },
  { id: "USD", label: "Доллар США" },
  { id: "EUR", label: "Евро" },
  { id: "AZN", label: "Азербайджанский манат" },
  { id: "AMD", label: "Армянский драм" },
  { id: "KGS", label: "Киргизский сом" },
  { id: "MDL", label: "Молдавский лей" },
  { id: "TJS", label: "Таджикский сомони" },
] as const;

export type CurrencyId = (typeof CURRENCIES)[number]["id"];
export type DeficitScope = "project" | "period";
