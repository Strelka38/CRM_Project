export type DayMode = "half_extra" | "full_days" | "fixed1" | "fixed2";

export type CatalogItem = {
  id: string;
  name: string;
  price: number;
  priceCashlessOverride: number | null;
  dayMode: DayMode;
};

export type CatalogCategory = {
  id: string;
  name: string;
  subtotalLabel: string;
  items: CatalogItem[];
};

export type Catalog = {
  version: number;
  source: string;
  defaultManager: string;
  notes: string[];
  categories: CatalogCategory[];
};

export type QuoteMeta = {
  proposalNumber: string;
  eventName: string;
  date: string;
  time: string;
  place: string;
  client: string;
  manager: string;
  cashless: boolean;
  durationDays: number;
};

export type LineCalc = {
  item: CatalogItem;
  qty: number;
  unitPrice: number;
  unitPriceCash: number;
  unitPriceCashless: number;
  dayCoef: number;
  sum: number;
  sumCash: number;
  sumCashless: number;
};

export type CategoryCalc = {
  category: CatalogCategory;
  lines: LineCalc[];
  subtotal: number;
  subtotalCash: number;
  subtotalCashless: number;
};

export type QuoteCalc = {
  categories: CategoryCalc[];
  total: number;
  totalCash: number;
  totalCashless: number;
  selectedCount: number;
};
