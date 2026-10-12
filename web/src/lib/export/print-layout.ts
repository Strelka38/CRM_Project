import {
  calcBlock,
  costKindOf,
  type CalcBlock,
  type CostKind,
  type QuoteBlockInput,
} from "../quote-calc";
import { DEFAULT_CASHLESS_PERCENT } from "../pricing";
import { cashlessTaxSeparate, type QuotePrintOptions } from "./print-options";

export type PrintLine = {
  kind: "item";
  num: number;
  name: string;
  qty: number;
  coef: number;
  price: number;
  discount: number;
  sum: number;
  costKind: CostKind;
};

export type PrintBand = { kind: "subhead" | "note"; text: string };

export type PrintSection = {
  title: string;
  nameHeader: string;
  rows: Array<PrintLine | PrintBand>;
  total: number | null;
};

type Raw =
  | { kind: "sub"; title: string }
  | { kind: "note"; text: string }
  | { kind: "item"; item: CalcBlock };

type Bucket = { title: string; rental: Raw[]; services: Raw[] };

function lineSum(item: CalcBlock, separate: boolean) {
  return separate ? item.lineTotalCash : item.lineTotal;
}

function lineUnit(item: CalcBlock, separate: boolean) {
  const qty = Number(item.qty) || 0;
  const coef = Number(item.dayCoef) || 1;
  if (separate && qty > 0 && coef > 0) return item.lineTotalCash / (qty * coef);
  return item.displayUnitPrice;
}

function project(
  raw: Raw[],
  options: QuotePrintOptions,
  separate: boolean,
  discountRate: number,
): { rows: Array<PrintLine | PrintBand>; total: number } {
  const rows: Array<PrintLine | PrintBand> = [];
  let pendingSub: string | null = null;
  let num = 0;
  let total = 0;
  for (const row of raw) {
    if (row.kind === "sub") {
      pendingSub = row.title;
      continue;
    }
    if (row.kind === "note") {
      if (options.showNote && row.text.trim()) rows.push({ kind: "note", text: row.text });
      continue;
    }
    if (pendingSub && options.showSubsectionHeader) {
      rows.push({ kind: "subhead", text: pendingSub });
    }
    pendingSub = null;
    num += 1;
    const sum = lineSum(row.item, separate);
    total += sum;
    rows.push({
      kind: "item",
      num,
      name: row.item.name || "",
      qty: Number(row.item.qty) || 0,
      coef: Number(row.item.dayCoef) || 0,
      price: lineUnit(row.item, separate),
      discount: sum * discountRate,
      sum,
      costKind: costKindOf(row.item),
    });
  }
  return { rows, total };
}

function sectionOf(
  title: string,
  nameHeader: string,
  raw: Raw[],
  options: QuotePrintOptions,
  separate: boolean,
  discountRate: number,
): PrintSection | null {
  const { rows, total } = project(raw, options, separate, discountRate);
  if (!rows.some((row) => row.kind === "item")) return null;
  return {
    title,
    nameHeader,
    rows,
    total: options.showSectionTotal ? total : null,
  };
}

export function buildPrintGroups(args: {
  docSections: Array<{ title: string; items: CalcBlock[] }>;
  blocks: QuoteBlockInput[];
  cashless: boolean;
  durationDays: number;
  cashlessPercent?: number;
  discountPercent: number;
  options: QuotePrintOptions;
}): PrintSection[] {
  const options = args.options;
  const separate = cashlessTaxSeparate(args.cashless, options);
  const percent = args.cashlessPercent ?? DEFAULT_CASHLESS_PERCENT;
  const discountRate = Math.max(0, Number(args.discountPercent) || 0) / 100;
  const byId = new Map<string, CalcBlock>();
  for (const section of args.docSections) {
    for (const item of section.items) {
      if (item.id) byId.set(item.id, item);
    }
  }
  const used = new Set<CalcBlock>();
  const take = (block: QuoteBlockInput): CalcBlock | null => {
    if (block.id) {
      const hit = byId.get(block.id);
      if (hit && !used.has(hit)) {
        used.add(hit);
        return hit;
      }
    }
    for (const section of args.docSections) {
      for (const item of section.items) {
        if (used.has(item)) continue;
        if (
          (item.name || "") === (block.name || "") &&
          item.sortOrder === block.sortOrder
        ) {
          used.add(item);
          return item;
        }
      }
    }
    return null;
  };

  const buckets: Bucket[] = [];
  let current: Bucket | null = null;
  let pendingSub: string | null = null;
  let pendingNotes: string[] = [];

  const open = (title: string) => {
    flushPending();
    current = { title, rental: [], services: [] };
    buckets.push(current);
  };
  const flushPending = () => {
    if (!current) return;
    const target = current.rental.length ? current.rental : current.services;
    if (!target.length && !pendingSub && pendingNotes.length === 0) return;
    if (!target.length) return;
    if (pendingSub) target.push({ kind: "sub", title: pendingSub });
    for (const text of pendingNotes) target.push({ kind: "note", text });
    pendingSub = null;
    pendingNotes = [];
  };
  const rememberPending = (pick: Raw[]) => {
    if (pendingSub) pick.push({ kind: "sub", title: pendingSub });
    for (const text of pendingNotes) pick.push({ kind: "note", text });
    pendingSub = null;
    pendingNotes = [];
  };

  for (const block of [...args.blocks].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (block.type === "SECTION") {
      open(block.title || "Раздел");
      continue;
    }
    if (block.type === "KIT_HEADER") {
      if (options.showSubsectionHeader) {
        pendingSub = block.title || block.name || "Подраздел";
      }
      continue;
    }
    if (block.type === "NOTE") {
      const text = block.title || block.name || "";
      if (options.showNote && text.trim()) pendingNotes.push(text);
      continue;
    }
    if (block.type !== "ITEM") continue;
    const qty = Number(block.qty) || 0;
    if (qty <= 0 && !options.showZeroLines) continue;
    const priced =
      qty > 0
        ? take(block)
        : calcBlock(block, args.cashless, args.durationDays, percent);
    if (!priced) continue;
    if (!current) open("Позиции");
    const pick = costKindOf(priced) === "service" ? current!.services : current!.rental;
    rememberPending(pick);
    pick.push({ kind: "item", item: priced });
  }
  flushPending();

  for (const section of args.docSections) {
    const missed = section.items.filter((item) => !used.has(item));
    if (!missed.length) continue;
    let bucket = buckets.find((b) => b.title === section.title);
    if (!bucket) {
      bucket = { title: section.title, rental: [], services: [] };
      buckets.push(bucket);
    }
    for (const item of missed) {
      used.add(item);
      const pick = costKindOf(item) === "service" ? bucket.services : bucket.rental;
      pick.push({ kind: "item", item });
    }
  }

  const out: PrintSection[] = [];
  for (const bucket of buckets) {
    const rental = sectionOf(
      bucket.title,
      "Оборудование",
      bucket.rental,
      options,
      separate,
      discountRate,
    );
    const services = sectionOf(
      bucket.title,
      "Услуги",
      bucket.services,
      options,
      separate,
      discountRate,
    );
    if (rental) out.push(rental);
    if (services) out.push(services);
  }
  return out;
}
