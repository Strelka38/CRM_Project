import ExcelJS from "exceljs";
import { formatRuDate, parseEventDate } from "./dates";
import {
  cashlessUnitPrice,
  DEFAULT_CASHLESS_PERCENT,
  normalizeCashlessPercent,
} from "./pricing";
import {
  DEFAULT_QUOTE_ZONE_NAMES,
  defaultQuoteZones,
} from "./quote-defaults";
import type { CloneBlock, QuoteStructurePayload } from "./quote-structure";

export type ExcelQuoteMeta = {
  eventName: string;
  date: string;
  durationDays: number;
  time: string;
  place: string;
  client: string;
  managerName: string;
  cashless: boolean;
};

export type ParsedExcelQuote = {
  meta: ExcelQuoteMeta;
  structure: QuoteStructurePayload;
  warnings: string[];
  itemCount: number;
};

type ColMap = {
  name: number;
  qty: number;
  price: number;
  priceCashless: number | null;
  dayCoef: number | null;
  comment: number | null;
};

type ParseSheetOpts = {
  priceIsCash?: boolean;
  forceDayCoef?: number;
};

type SheetItem = {
  name: string;
  qty: number;
  unitPrice: number;
  cashlessOverride: number | null;
  dayCoefOverride: number | null;
  sectionTitle: string;
};

type ParsedSheet = {
  sheetName: string;
  meta: ExcelQuoteMeta;
  items: SheetItem[];
  hasTwoPrices: boolean;
};

const SKIP_SHEET_RE = /^(смены|настройки|bnju|сводн|общая информация)/i;
const PREFIX_MATCH_MIN = 10;

const MONTHS: Record<string, number> = {
  января: 0,
  январь: 0,
  янв: 0,
  февраля: 1,
  февраль: 1,
  фев: 1,
  марта: 2,
  март: 2,
  мар: 2,
  апреля: 3,
  апрель: 3,
  апр: 3,
  мая: 4,
  май: 4,
  июня: 5,
  июнь: 5,
  июн: 5,
  июля: 6,
  июль: 6,
  июл: 6,
  августа: 7,
  август: 7,
  авг: 7,
  сентября: 8,
  сентябрь: 8,
  сент: 8,
  сен: 8,
  октября: 9,
  октябрь: 9,
  окт: 9,
  ноября: 10,
  ноябрь: 10,
  нояб: 10,
  ноя: 10,
  декабря: 11,
  декабрь: 11,
  дек: 11,
};

const SECTION_TO_ZONE: Array<{ re: RegExp; zone: (typeof DEFAULT_QUOTE_ZONE_NAMES)[number] }> = [
  { re: /звук/i, zone: "Звук" },
  { re: /свет/i, zone: "Свет" },
  { re: /видео/i, zone: "Видео" },
  { re: /трансляц/i, zone: "Трансляция" },
  { re: /разн/i, zone: "Разное" },
  { re: /услуг/i, zone: "Разное" },
  { re: /сцен|подиум|ферм/i, zone: "Разное" },
  { re: /эффект/i, zone: "Свет" },
  { re: /электро/i, zone: "Разное" },
];

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

export function cellText(value: unknown): string {
  if (value == null || value === "") return "";
  if (typeof value === "string") return value.replace(/\s+/g, " ").trim();
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : formatRuDate(value);
  }
  const obj = asRecord(value);
  if (!obj) return String(value).trim();
  if (Array.isArray(obj.richText)) {
    return cellText(
      (obj.richText as Array<{ text?: unknown }>).map((t) => t.text ?? "").join(""),
    );
  }
  if ("result" in obj && obj.result != null) return cellText(obj.result);
  if (typeof obj.text === "string") return cellText(obj.text);
  if (typeof obj.hyperlink === "string" && obj.text == null) {
    return cellText(obj.hyperlink);
  }
  return "";
}

export function cellNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const obj = asRecord(value);
  if (obj && "result" in obj) return cellNumber(obj.result);
  const s = cellText(value)
    .replace(/\s/g, "")
    .replace(",", ".")
    .replace(/[^\d.+-]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function excelSerialToDate(n: number): Date | null {
  if (!Number.isFinite(n) || n < 20000 || n > 80000) return null;
  const utc = Date.UTC(1899, 11, 30) + Math.round(n) * 86_400_000;
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
}

function monthIndex(raw: string): number | null {
  const key = raw.toLowerCase().replace(/ё/g, "е").replace(/\./g, "");
  return key in MONTHS ? MONTHS[key] : null;
}

/** «9-10 сентября 2025», «9 сентября 2025», ДД.ММ.ГГГГ, Excel serial. */
export function parseExcelDateRange(raw: unknown): {
  date: string;
  durationDays: number;
} | null {
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    return { date: formatRuDate(raw), durationDays: 1 };
  }
  if (typeof raw === "number") {
    const d = excelSerialToDate(raw);
    return d ? { date: formatRuDate(d), durationDays: 1 } : null;
  }
  const obj = asRecord(raw);
  if (obj && "result" in obj) return parseExcelDateRange(obj.result);

  const s = cellText(raw)
    .replace(/^дата\s*:?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return null;

  const fromEvent = parseEventDate(s);
  if (fromEvent) {
    const rangeNumeric = s.match(
      /^(\d{1,2})[./](\d{1,2})[./](\d{2,4})\s*[-–—]\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/,
    );
    if (rangeNumeric) {
      let y1 = Number(rangeNumeric[3]);
      let y2 = Number(rangeNumeric[6]);
      if (y1 < 100) y1 += 2000;
      if (y2 < 100) y2 += 2000;
      const start = new Date(y1, Number(rangeNumeric[2]) - 1, Number(rangeNumeric[1]), 12);
      const end = new Date(y2, Number(rangeNumeric[5]) - 1, Number(rangeNumeric[4]), 12);
      const days =
        Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
      return { date: formatRuDate(start), durationDays: Math.max(1, days) };
    }
    return { date: formatRuDate(fromEvent), durationDays: 1 };
  }

  const ruRange = s.match(
    /^(\d{1,2})\s*[-–—]\s*(\d{1,2})\s+([а-яё.]+)\s+(\d{4})$/i,
  );
  if (ruRange) {
    const month = monthIndex(ruRange[3]);
    if (month != null) {
      const start = new Date(Number(ruRange[4]), month, Number(ruRange[1]), 12);
      const endDay = Number(ruRange[2]);
      const days = Math.max(1, endDay - Number(ruRange[1]) + 1);
      return { date: formatRuDate(start), durationDays: days };
    }
  }

  const ruSingle = s.match(/^(\d{1,2})\s+([а-яё.]+)\s+(\d{4})$/i);
  if (ruSingle) {
    const month = monthIndex(ruSingle[2]);
    if (month != null) {
      const start = new Date(Number(ruSingle[3]), month, Number(ruSingle[1]), 12);
      return { date: formatRuDate(start), durationDays: 1 };
    }
  }

  return null;
}

export function guessCashFromCashless(
  cashlessPrice: number,
  percent: number = DEFAULT_CASHLESS_PERCENT,
): number {
  const p = normalizeCashlessPercent(percent);
  const keep = (100 - p) / 100;
  if (keep <= 0 || !Number.isFinite(cashlessPrice) || cashlessPrice <= 0) {
    return cashlessPrice;
  }
  const approx = Math.floor((cashlessPrice * keep) / 10 + 1e-9) * 10;
  for (const delta of [0, -10, 10, -20, 20, -30, 30, -40, 40, -50, 50]) {
    const candidate = approx + delta;
    if (candidate <= 0) continue;
    if (cashlessUnitPrice(candidate, true, null, p) === cashlessPrice) {
      return candidate;
    }
  }
  const raw = Math.round(cashlessPrice * keep);
  if (raw > 0 && cashlessUnitPrice(raw, true, null, p) === cashlessPrice) {
    return raw;
  }
  return approx > 0 ? approx : cashlessPrice;
}

export function normalizeItemName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[«»„“”"'`]/g, "")
    .replace(/[–—−]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:]+$/g, "");
}

export function matchCatalogItem(
  name: string,
  catalog: Array<{ id: string; name: string }>,
): string | null {
  const n = normalizeItemName(name);
  if (!n) return null;
  const exact = catalog.filter((c) => normalizeItemName(c.name) === n);
  if (exact.length >= 1) return exact[0].id;

  const prefixHits = catalog.filter((c) => {
    const cn = normalizeItemName(c.name);
    if (cn.length < PREFIX_MATCH_MIN && n.length < PREFIX_MATCH_MIN) {
      return false;
    }
    const minLen = Math.min(cn.length, n.length);
    if (minLen < PREFIX_MATCH_MIN) return false;
    return n.startsWith(cn) || cn.startsWith(n);
  });
  if (prefixHits.length === 0) return null;
  prefixHits.sort(
    (a, b) =>
      normalizeItemName(b.name).length - normalizeItemName(a.name).length,
  );
  return prefixHits[0].id;
}

export function applyCatalogMatches(
  structure: QuoteStructurePayload,
  catalog: Array<{ id: string; name: string }>,
): { structure: QuoteStructurePayload; unmatched: string[] } {
  const unmatched: string[] = [];
  const blocks = structure.blocks.map((b) => {
    if (b.type !== "ITEM") return b;
    const name = String(b.name || "").trim();
    if (!name) return b;
    const catalogItemId = matchCatalogItem(name, catalog);
    if (!catalogItemId) unmatched.push(name);
    return { ...b, catalogItemId };
  });
  return { structure: { ...structure, blocks }, unmatched };
}

export function eventNameFromFilename(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() || fileName;
  let s = base.replace(/\.(xlsx|xlsm)$/i, "");
  s = s.replace(/^\d{4}[_-]\d{2}[_-]\d{2}\s*/, "");
  s = s.replace(/_(\d{2})-(\d{2})-(\d{4})$/, "");
  s = s.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/[.\s]+$/g, "");
  return s;
}

function dateFromFilename(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() || fileName;
  const m = base.match(/_(\d{2})-(\d{2})-(\d{4})(?:\.\w+)?$/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : "";
}

function isUtilitySheet(name: string): boolean {
  return SKIP_SHEET_RE.test(name.trim());
}

function isTotalsName(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  return /^итог/i.test(t) || /^к оплате/i.test(t) || /^налог/i.test(t);
}

function isHeaderLabelName(s: string): boolean {
  const t = s.trim();
  return (
    /^(№|#|оборудование|услуги|кол-?во|цена|сумма|комментарий)$/i.test(t) ||
    /^состав работ/i.test(t)
  );
}

function zoneForSection(title: string): string | null {
  for (const row of SECTION_TO_ZONE) {
    if (row.re.test(title)) return row.zone;
  }
  return null;
}

function afterColon(text: string): string {
  const i = text.indexOf(":");
  if (i < 0) return "";
  return text.slice(i + 1).trim();
}

function looksLikeLabel(text: string): boolean {
  return /мероприятие|проект|дата|время|место|заказчик|менеджер|безнал|продолжитель|сумма/i.test(
    text,
  );
}

function firstInt(raw: string): number | null {
  const m = raw.match(/(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function parseCashlessFlag(raw: unknown): boolean | null {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  const s = cellText(raw).toLowerCase();
  if (!s) return null;
  if (/^(1|да|yes|true|безнал)/i.test(s)) return true;
  if (/^(0|нет|no|false)/i.test(s)) return false;
  const n = firstInt(s);
  if (n != null) return n !== 0;
  return null;
}

function pricesForItem(
  cash: number | null,
  cashless: number | null,
  hasTwoPrices: boolean,
  quoteCashless: boolean,
  priceIsCash = false,
): { unitPrice: number; cashlessOverride: number | null } {
  if (priceIsCash) {
    return { unitPrice: cash ?? cashless ?? 0, cashlessOverride: null };
  }
  if (hasTwoPrices) {
    const unitPrice = cash ?? 0;
    if (cashless == null) return { unitPrice, cashlessOverride: null };
    const computed = cashlessUnitPrice(
      unitPrice,
      true,
      null,
      DEFAULT_CASHLESS_PERCENT,
    );
    const override =
      Math.round(cashless) !== Math.round(computed) ? cashless : null;
    return { unitPrice, cashlessOverride: override };
  }
  const displayed = cash ?? cashless ?? 0;
  if (!quoteCashless) {
    return { unitPrice: displayed, cashlessOverride: null };
  }
  const unitPrice = guessCashFromCashless(displayed);
  const computed = cashlessUnitPrice(
    unitPrice,
    true,
    null,
    DEFAULT_CASHLESS_PERCENT,
  );
  return {
    unitPrice,
    cashlessOverride:
      Math.round(computed) !== Math.round(displayed) ? displayed : null,
  };
}

function readCell(ws: ExcelJS.Worksheet, row: number, col: number): unknown {
  return ws.getRow(row).getCell(col).value;
}

function findHeaderRow(ws: ExcelJS.Worksheet): { row: number; cols: ColMap } | null {
  const maxRow = Math.min(ws.rowCount || 30, 40);
  for (let r = 1; r <= maxRow; r++) {
    const labels: Array<{ col: number; text: string }> = [];
    for (let c = 1; c <= 16; c++) {
      const text = cellText(readCell(ws, r, c));
      if (text) labels.push({ col: c, text });
    }
    const name =
      labels.find((l) => /оборудование/i.test(l.text)) ||
      labels.find((l) => /^услуги$/i.test(l.text));
    const qty = labels.find((l) => /кол-?во/i.test(l.text));
    if (!name || !qty) continue;
    const priceHits = labels.filter((l) => /цена/i.test(l.text));
    const day = labels.find((l) => /день|коэф/i.test(l.text));
    const comment =
      labels.find((l) => /^комментар/i.test(l.text)) ||
      labels.find((l) => /состав работ/i.test(l.text));
    return {
      row: r,
      cols: {
        name: name.col,
        qty: qty.col,
        price: priceHits[0]?.col ?? qty.col + 1,
        priceCashless: priceHits[1]?.col ?? null,
        dayCoef: day?.col ?? null,
        comment: comment?.col ?? null,
      },
    };
  }
  return null;
}

function headerValueToTheRight(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
): unknown {
  for (let c = col + 1; c <= col + 4; c++) {
    const v = readCell(ws, row, c);
    const text = cellText(v);
    if (!text) continue;
    if (looksLikeLabel(text) && !afterColon(text)) continue;
    return v;
  }
  return null;
}

function emptyMeta(): ExcelQuoteMeta {
  return {
    eventName: "",
    date: "",
    durationDays: 1,
    time: "",
    place: "",
    client: "",
    managerName: "",
    cashless: true,
  };
}

function parseSheetMeta(
  ws: ExcelJS.Worksheet,
  headerRow: number,
): ExcelQuoteMeta {
  const meta = emptyMeta();
  const maxRow = Math.max(1, headerRow - 1);
  let headerDuration: number | null = null;
  let dateDuration = 1;

  for (let r = 1; r <= maxRow; r++) {
    for (let c = 1; c <= 8; c++) {
      const raw = readCell(ws, r, c);
      const text = cellText(raw);
      if (!text) continue;
      const fromColon = afterColon(text);
      const right = headerValueToTheRight(ws, r, c);

      if (/^мероприятие/i.test(text)) {
        meta.eventName = fromColon || cellText(right);
      } else if (/^дата/i.test(text)) {
        const parsed = parseExcelDateRange(fromColon || right);
        if (parsed) {
          meta.date = parsed.date;
          dateDuration = parsed.durationDays;
        } else if (fromColon) {
          meta.date = fromColon;
        } else {
          meta.date = cellText(right);
        }
      } else if (/^время/i.test(text)) {
        meta.time = fromColon || cellText(right);
      } else if (/^место/i.test(text)) {
        meta.place = fromColon || cellText(right);
      } else if (/^заказчик/i.test(text)) {
        meta.client = fromColon || cellText(right);
      } else if (/^менеджер/i.test(text)) {
        meta.managerName = fromColon || cellText(right);
      } else if (/безнал/i.test(text)) {
        const flag = parseCashlessFlag(fromColon || right);
        if (flag != null) meta.cashless = flag;
      } else if (/продолжитель/i.test(text)) {
        const n =
          firstInt(fromColon) ??
          cellNumber(right) ??
          firstInt(cellText(right));
        if (n != null && n > 0) headerDuration = n;
      }
    }
  }

  meta.durationDays = Math.max(1, headerDuration ?? 1, dateDuration);
  return meta;
}

function isSectionRow(
  colA: string,
  name: string,
  qty: number | null,
  price: number | null,
): boolean {
  if (name && qty != null && qty > 0) return false;
  const title = name || colA;
  if (!title || isTotalsName(title)) return false;
  if (zoneForSection(title)) return true;
  if (/^\d+$/.test(title)) return false;
  if (price != null) return false;
  if (qty != null && qty > 0) return false;
  if (colA && name && colA === name && !/^\d+$/.test(colA)) return true;
  if (colA && !name && !/^\d+$/.test(colA) && colA.length > 2) return true;
  return false;
}

function sectionAboveHeader(ws: ExcelJS.Worksheet, headerRow: number): string {
  if (headerRow <= 1) return "";
  const title =
    cellText(readCell(ws, headerRow - 1, 1)) ||
    cellText(readCell(ws, headerRow - 1, 2));
  const t = title.trim();
  if (!t || isTotalsName(t) || isHeaderLabelName(t) || looksLikeLabel(t)) {
    return "";
  }
  if (/^\d+$/.test(t)) return "";
  return t;
}

function parseSheet(
  ws: ExcelJS.Worksheet,
  opts?: ParseSheetOpts,
): ParsedSheet | null {
  if (isUtilitySheet(ws.name)) return null;
  const header = findHeaderRow(ws);
  if (!header) return null;

  const meta = parseSheetMeta(ws, header.row);
  const { cols } = header;
  const hasTwoPrices = cols.priceCashless != null;
  const items: SheetItem[] = [];
  let currentSection = sectionAboveHeader(ws, header.row);
  const lastRow = Math.min(ws.rowCount || header.row, header.row + 800);

  for (let r = header.row + 1; r <= lastRow; r++) {
    const colA = cellText(readCell(ws, r, 1));
    const name = cellText(readCell(ws, r, cols.name));
    const qty = cellNumber(readCell(ws, r, cols.qty));
    const cash = cellNumber(readCell(ws, r, cols.price));
    const cashless =
      cols.priceCashless != null
        ? cellNumber(readCell(ws, r, cols.priceCashless))
        : null;
    const dayCoef =
      cols.dayCoef != null
        ? cellNumber(readCell(ws, r, cols.dayCoef))
        : null;
    const comment =
      cols.comment != null ? cellText(readCell(ws, r, cols.comment)) : "";
    const price = cash ?? cashless;
    const displayName = name || colA;

    if (isTotalsName(displayName) || isTotalsName(colA) || isTotalsName(name)) {
      continue;
    }

    if (isSectionRow(colA, name, qty, price)) {
      currentSection = (name && name !== colA ? name : displayName).trim();
      continue;
    }

    const rawName = name.trim();
    if (!rawName || /^\d+$/.test(rawName) || isHeaderLabelName(rawName)) {
      continue;
    }
    if (qty == null || qty <= 0) continue;

    const itemName =
      comment && comment !== rawName ? `${rawName} (${comment})` : rawName;

    const { unitPrice, cashlessOverride } = pricesForItem(
      cash,
      cashless,
      hasTwoPrices,
      meta.cashless,
      opts?.priceIsCash,
    );
    items.push({
      name: itemName,
      qty,
      unitPrice,
      cashlessOverride,
      dayCoefOverride:
        opts?.forceDayCoef != null
          ? opts.forceDayCoef
          : dayCoef != null && Number.isFinite(dayCoef)
            ? dayCoef
            : null,
      sectionTitle: currentSection,
    });
  }

  return { sheetName: ws.name, meta, items, hasTwoPrices };
}

function clusterKey(meta: ExcelQuoteMeta): string {
  return `${normalizeItemName(meta.eventName)}|${meta.date}`;
}

function pickPrimarySheets(sheets: ParsedSheet[]): {
  sheets: ParsedSheet[];
  warnings: string[];
} {
  const populated = sheets.filter((s) => s.items.length > 0);
  if (populated.length <= 1) return { sheets: populated, warnings: [] };

  const groups = new Map<string, ParsedSheet[]>();
  for (const s of populated) {
    const key = clusterKey(s.meta);
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  let best: ParsedSheet[] = populated;
  let bestScore = -1;
  for (const list of groups.values()) {
    const items = list.reduce((n, s) => n + s.items.length, 0);
    const named = list.some((s) => s.meta.eventName.trim()) ? 1 : 0;
    const score = named * 1_000_000 + items;
    if (score > bestScore) {
      bestScore = score;
      best = list;
    }
  }

  const warnings: string[] = [];
  const bestSet = new Set(best);
  for (const s of populated) {
    if (bestSet.has(s)) continue;
    const label = s.meta.eventName.trim() || "без названия";
    warnings.push(`Лист «${s.sheetName}» пропущен: другое мероприятие «${label}»`);
  }
  return { sheets: best, warnings };
}

function metaFromSheets(sheets: ParsedSheet[], fileName?: string): ExcelQuoteMeta {
  const meta = emptyMeta();
  for (const s of sheets) {
    if (!meta.eventName && s.meta.eventName) meta.eventName = s.meta.eventName;
    if (!meta.date && s.meta.date) meta.date = s.meta.date;
    if (!meta.time && s.meta.time) meta.time = s.meta.time;
    if (!meta.place && s.meta.place) meta.place = s.meta.place;
    if (!meta.client && s.meta.client) meta.client = s.meta.client;
    if (!meta.managerName && s.meta.managerName) {
      meta.managerName = s.meta.managerName;
    }
    meta.cashless = s.meta.cashless;
    meta.durationDays = Math.max(meta.durationDays, s.meta.durationDays);
  }
  if (!meta.eventName && fileName) {
    meta.eventName = eventNameFromFilename(fileName);
  }
  if (!meta.date && fileName) {
    meta.date = dateFromFilename(fileName);
  }
  return meta;
}

function itemBlock(
  item: SheetItem,
  sortOrder: number,
  zoneIndex: number,
): CloneBlock {
  return {
    type: "ITEM",
    sortOrder,
    name: item.name,
    qty: item.qty,
    unitPrice: item.unitPrice,
    cashlessOverride: item.cashlessOverride,
    dayMode: "HALF_EXTRA",
    dayCoefOverride: item.dayCoefOverride,
    catalogItemId: null,
    kitId: null,
    zoneIndex,
  };
}

function genericSheetName(name: string): boolean {
  return /^(кп(\s|$|\()|лист\s*\d*|смета\s*\d*|все вкладки)/i.test(name.trim());
}

function structureFromSingleSheet(sheet: ParsedSheet): QuoteStructurePayload {
  const raw = sheet.sheetName.trim();
  const zoneName = !raw || genericSheetName(raw) ? "Зона 1" : raw;
  const zones = [{ name: zoneName, sortOrder: 0 }];
  const blocks: CloneBlock[] = [];
  let sort = 0;
  let lastSection = "";
  for (const item of sheet.items) {
    if (item.sectionTitle && item.sectionTitle !== lastSection) {
      lastSection = item.sectionTitle;
      blocks.push({
        type: "SECTION",
        sortOrder: sort++,
        title: item.sectionTitle,
        zoneIndex: 0,
      });
    }
    blocks.push(itemBlock(item, sort++, 0));
  }
  return { zones, blocks };
}

function structureFromHallSheets(sheets: ParsedSheet[]): QuoteStructurePayload {
  const zones = sheets.map((s, i) => ({
    name: s.sheetName.trim() || `Зона ${i + 1}`,
    sortOrder: i,
  }));
  const blocks: CloneBlock[] = [];
  let sort = 0;
  sheets.forEach((sheet, zoneIndex) => {
    let lastSection = "";
    for (const item of sheet.items) {
      if (item.sectionTitle && item.sectionTitle !== lastSection) {
        lastSection = item.sectionTitle;
        blocks.push({
          type: "SECTION",
          sortOrder: sort++,
          title: item.sectionTitle,
          zoneIndex,
        });
      }
      blocks.push(itemBlock(item, sort++, zoneIndex));
    }
  });
  return { zones, blocks };
}

function worksheetLooksGolova(ws: ExcelJS.Worksheet): boolean {
  if (/^\d+\.\s/.test(ws.name.trim())) return true;
  if (!/все вкладки|общая информация/i.test(ws.name)) return false;
  const maxR = Math.min(ws.rowCount || 20, 25);
  for (let r = 1; r <= maxR; r++) {
    for (let c = 1; c <= 8; c++) {
      const t = cellText(readCell(ws, r, c));
      if (
        /^проект\s*:/i.test(t) ||
        /дата\/время/i.test(t) ||
        /^комментар/i.test(t)
      ) {
        return true;
      }
    }
  }
  return false;
}

function isGolovaWorkbook(wb: ExcelJS.Workbook): boolean {
  return wb.worksheets.some((ws) => worksheetLooksGolova(ws));
}

function golovaSheetZoneName(name: string): string {
  let s = name.replace(/^\d+\.\s*/, "").trim();
  s = s.replace(/\s+\d+$/, "").trim();
  return s || name;
}

function parseGolovaInfoSheet(ws: ExcelJS.Worksheet): ExcelQuoteMeta {
  const meta = emptyMeta();
  meta.cashless = true;
  const maxRow = Math.min(ws.rowCount || 8, 15);
  for (let r = 1; r <= maxRow; r++) {
    for (let c = 1; c <= 4; c++) {
      const text = cellText(readCell(ws, r, c));
      if (!text) continue;
      const fromColon = afterColon(text);
      const right = headerValueToTheRight(ws, r, c);
      if (/^проект/i.test(text)) {
        const v = fromColon || cellText(right);
        if (v) {
          meta.eventName = v.replace(/_/g, " ").replace(/\s+/g, " ").trim();
        }
      } else if (/^дата/i.test(text)) {
        const parsed = parseExcelDateRange(fromColon || right);
        if (parsed) {
          meta.date = parsed.date;
          meta.durationDays = parsed.durationDays;
        }
      }
    }
  }
  return meta;
}

function parseGolovaWorkbook(
  wb: ExcelJS.Workbook,
  opts?: { fileName?: string },
): ParsedExcelQuote {
  const info = wb.worksheets.find((ws) => /общая информация/i.test(ws.name));
  const infoMeta = info ? parseGolovaInfoSheet(info) : emptyMeta();
  infoMeta.cashless = true;

  const parseOpts: ParseSheetOpts = { priceIsCash: true, forceDayCoef: 1 };
  let combined: ParsedSheet | null = null;
  const tabs: ParsedSheet[] = [];
  for (const ws of wb.worksheets) {
    if (isUtilitySheet(ws.name)) continue;
    const sheet = parseSheet(ws, parseOpts);
    if (!sheet || sheet.items.length === 0) continue;
    if (/все вкладки/i.test(ws.name)) combined = sheet;
    else {
      tabs.push({ ...sheet, sheetName: golovaSheetZoneName(ws.name) });
    }
  }

  const parsed = combined ? [combined] : tabs;
  const { sheets, warnings } = pickPrimarySheets(parsed);
  const fromSheets = metaFromSheets(sheets, opts?.fileName);
  const meta = emptyMeta();
  meta.cashless = true;
  meta.eventName = infoMeta.eventName || fromSheets.eventName;
  meta.date = infoMeta.date || fromSheets.date;
  meta.time = infoMeta.time || fromSheets.time;
  meta.place = infoMeta.place || fromSheets.place;
  meta.client = infoMeta.client || fromSheets.client;
  meta.managerName = infoMeta.managerName || fromSheets.managerName;
  meta.durationDays = Math.max(infoMeta.durationDays, fromSheets.durationDays);
  if (!meta.eventName && opts?.fileName) {
    meta.eventName = eventNameFromFilename(opts.fileName);
  }
  if (!meta.date && opts?.fileName) {
    meta.date = dateFromFilename(opts.fileName);
  }

  const structure =
    sheets.length > 1
      ? structureFromHallSheets(sheets)
      : sheets[0]
        ? structureFromSingleSheet(sheets[0])
        : { zones: defaultQuoteZones(), blocks: [] };
  const itemCount = sheets.reduce((n, s) => n + s.items.length, 0);
  return { meta, structure, warnings, itemCount };
}

export async function parseArtemWorkbook(
  input: Buffer | ArrayBuffer | Uint8Array,
  opts?: { fileName?: string },
): Promise<ParsedExcelQuote> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(input));
  if (isGolovaWorkbook(wb)) {
    return parseGolovaWorkbook(wb, opts);
  }
  const parsed: ParsedSheet[] = [];
  for (const ws of wb.worksheets) {
    const sheet = parseSheet(ws);
    if (sheet) parsed.push(sheet);
  }
  const { sheets, warnings } = pickPrimarySheets(parsed);
  const meta = metaFromSheets(sheets, opts?.fileName);
  const structure =
    sheets.length > 1
      ? structureFromHallSheets(sheets)
      : sheets[0]
        ? structureFromSingleSheet(sheets[0])
        : { zones: defaultQuoteZones(), blocks: [] };
  const itemCount = sheets.reduce((n, s) => n + s.items.length, 0);
  return { meta, structure, warnings, itemCount };
}
