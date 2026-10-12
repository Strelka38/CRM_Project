import type { DayMode as PrismaDayMode, BlockType } from "@prisma/client";
import {
  cashlessUnitPrice,
  dayCoefficient,
  DEFAULT_CASHLESS_PERCENT,
  normalizeCashlessPercent,
} from "./pricing";
import type { DayMode } from "./types";
import { zoneDurationDays } from "./quote-assignment-days";
import {
  kindMultiplier,
  parseZonePricing,
  sheetTaxLines,
  type SheetTaxLine,
  type ZonePricing,
} from "./zone-pricing";

export type CostKind = "equipment" | "service" | "consumable";

export type QuoteBlockInput = {
  id?: string;
  type: BlockType | "SECTION" | "ITEM" | "NOTE" | "KIT_HEADER";
  sortOrder: number;
  title?: string | null;
  name?: string | null;
  qty?: number | null;
  unitPrice?: number | null;
  cashlessOverride?: number | null;
  dayMode?: PrismaDayMode | DayMode | string | null;
  dayCoefOverride?: number | null;
  catalogItemId?: string | null;
  kitId?: string | null;
  zoneId?: string | null;
  /** From CatalogItem.itemKind when available */
  itemKind?: string | null;
};

export function costKindOf(block: QuoteBlockInput): CostKind {
  const kind = String(block.itemKind || "").toUpperCase();
  if (kind === "SERVICE" || kind === "PERSONNEL") return "service";
  if (kind === "CONSUMABLE") return "consumable";
  return "equipment";
}

export function toAppDayMode(mode: string | null | undefined): DayMode {
  switch (mode) {
    case "FULL_DAYS":
    case "full_days":
      return "full_days";
    case "FIXED1":
    case "fixed1":
      return "fixed1";
    case "FIXED2":
    case "fixed2":
      return "fixed2";
    case "HALF_EXTRA":
    case "half_extra":
    default:
      return "half_extra";
  }
}

export function toPrismaDayMode(mode: DayMode | string): PrismaDayMode {
  switch (mode) {
    case "full_days":
    case "FULL_DAYS":
      return "FULL_DAYS";
    case "fixed1":
    case "FIXED1":
      return "FIXED1";
    case "fixed2":
    case "FIXED2":
      return "FIXED2";
    default:
      return "HALF_EXTRA";
  }
}

export type CalcBlock = QuoteBlockInput & {
  dayCoef: number;
  displayUnitPrice: number;
  lineTotal: number;
  lineTotalCash: number;
  lineTotalCashless: number;
};

export function calcBlock(
  block: QuoteBlockInput,
  cashless: boolean,
  durationDays: number,
  cashlessPercent: number = DEFAULT_CASHLESS_PERCENT,
): CalcBlock {
  if (block.type !== "ITEM") {
    return {
      ...block,
      dayCoef: 0,
      displayUnitPrice: 0,
      lineTotal: 0,
      lineTotalCash: 0,
      lineTotalCashless: 0,
    };
  }

  const qty = Math.max(0, Number(block.qty) || 0);
  const base = Number(block.unitPrice) || 0;
  const mode = toAppDayMode(block.dayMode ?? undefined);
  const dayCoef =
    block.dayCoefOverride != null && !Number.isNaN(Number(block.dayCoefOverride))
      ? Number(block.dayCoefOverride)
      : dayCoefficient(mode, durationDays);

  const percent = normalizeCashlessPercent(cashlessPercent);
  const unitCash = base;
  const unitCashless = cashlessUnitPrice(
    base,
    true,
    block.cashlessOverride,
    percent,
  );
  const displayUnitPrice = cashless ? unitCashless : unitCash;
  const lineTotalCash = dayCoef * unitCash * qty;
  const lineTotalCashless = dayCoef * unitCashless * qty;
  const lineTotal = cashless ? lineTotalCashless : lineTotalCash;

  return {
    ...block,
    dayCoef,
    displayUnitPrice,
    lineTotal,
    lineTotalCash,
    lineTotalCashless,
  };
}

function withSheetPricing(block: CalcBlock, pricing?: ZonePricing | null): CalcBlock {
  if (block.type !== "ITEM" || !pricing) return block;
  const factor = kindMultiplier(pricing, costKindOf(block));
  if (factor === 1) return block;
  return {
    ...block,
    displayUnitPrice: block.displayUnitPrice * factor,
    lineTotal: block.lineTotal * factor,
    lineTotalCash: block.lineTotalCash * factor,
    lineTotalCashless: block.lineTotalCashless * factor,
  };
}

export function calcDocument(
  blocks: QuoteBlockInput[],
  cashless: boolean,
  durationDays: number,
  cashlessPercent: number = DEFAULT_CASHLESS_PERCENT,
  pricing?: ZonePricing | null,
) {
  const calculated = [...blocks]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((b) =>
      withSheetPricing(calcBlock(b, cashless, durationDays, cashlessPercent), pricing),
    );

  let totalCash = 0;
  let totalCashless = 0;
  let itemCount = 0;

  type Section = {
    title: string;
    items: CalcBlock[];
    subtotal: number;
    subtotalCash: number;
    subtotalCashless: number;
  };

  const sections: Section[] = [];
  let current: Section | null = null;

  for (const block of calculated) {
    if (block.type === "SECTION") {
      current = {
        title: block.title || "Раздел",
        items: [],
        subtotal: 0,
        subtotalCash: 0,
        subtotalCashless: 0,
      };
      sections.push(current);
      continue;
    }
    if (block.type === "ITEM" && (block.qty ?? 0) > 0) {
      if (!current) {
        current = {
          title: "Позиции",
          items: [],
          subtotal: 0,
          subtotalCash: 0,
          subtotalCashless: 0,
        };
        sections.push(current);
      }
      current.items.push(block);
      current.subtotal += block.lineTotal;
      current.subtotalCash += block.lineTotalCash;
      current.subtotalCashless += block.lineTotalCashless;
      totalCash += block.lineTotalCash;
      totalCashless += block.lineTotalCashless;
      itemCount += 1;
    }
  }

  return {
    blocks: calculated,
    sections,
    itemCount,
    total: cashless ? totalCashless : totalCash,
    totalCash,
    totalCashless,
  };
}

export type ZoneInput = {
  id: string;
  name: string;
  sortOrder: number;
  /** false = выключена: не в сумме и не в резерве */
  active?: boolean;
  workingDayIndexes?: number[] | null;
  /** Сырой JSON листа. Нормализуется в calcByZones. */
  pricing?: unknown;
};

export function isZoneActive(zone: { active?: boolean | null }): boolean {
  return zone.active !== false;
}

export function blocksInActiveZones<T>(
  zones: Array<{ id: string; active?: boolean | null }>,
  blocks: T[],
): T[] {
  const ids = new Set(zones.filter(isZoneActive).map((z) => z.id));
  return blocks.filter((b) => {
    const zoneId = (b as { zoneId?: string | null }).zoneId;
    return !zoneId || ids.has(zoneId);
  });
}

export type ZoneTotals = {
  zoneId: string;
  name: string;
  sortOrder: number;
  active: boolean;
  equipmentTotal: number;
  servicesTotal: number;
  consumablesTotal: number;
  subtotal: number;
  discount: number;
  payable: number;
  tax: number;
  taxLines: SheetTaxLine[];
  itemCount: number;
  doc: ReturnType<typeof calcDocument>;
};

export function calcByZones(
  zones: ZoneInput[],
  blocks: QuoteBlockInput[],
  cashless: boolean,
  durationDays: number,
  discountPercent: number,
  cashlessPercent: number = DEFAULT_CASHLESS_PERCENT,
): {
  zones: ZoneTotals[];
  equipmentTotal: number;
  servicesTotal: number;
  consumablesTotal: number;
  subtotal: number;
  discount: number;
  payable: number;
  itemCount: number;
  tax: number;
} {
  const discountRate = Math.max(0, Number(discountPercent) || 0) / 100;
  const percent = normalizeCashlessPercent(cashlessPercent);
  const sortedZones = [...zones].sort((a, b) => a.sortOrder - b.sortOrder);

  const zoneRows: ZoneTotals[] = sortedZones.map((z) => {
    const active = isZoneActive(z);
    const zoneBlocks = blocks
      .filter((b) => b.zoneId === z.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const pricing = parseZonePricing(z.pricing);
    const doc = calcDocument(
      zoneBlocks,
      cashless,
      zoneDurationDays(z.id, durationDays, zones),
      percent,
      pricing,
    );

    let equipmentTotal = 0;
    let servicesTotal = 0;
    let consumablesTotal = 0;
    if (active) {
      for (const item of doc.blocks) {
        if (item.type !== "ITEM" || (item.qty ?? 0) <= 0) continue;
        const kind = costKindOf(item);
        if (kind === "service") servicesTotal += item.lineTotal;
        else if (kind === "consumable") consumablesTotal += item.lineTotal;
        else equipmentTotal += item.lineTotal;
      }
    }

    const subtotal = equipmentTotal + servicesTotal + consumablesTotal;
    const discount = subtotal * discountRate;
    const taxBase = Math.max(0, subtotal - discount);
    const taxLines = active ? sheetTaxLines(pricing, taxBase) : [];
    const tax = taxLines.reduce((s, line) => s + line.amount, 0);
    return {
      zoneId: z.id,
      name: z.name,
      sortOrder: z.sortOrder,
      active,
      equipmentTotal,
      servicesTotal,
      consumablesTotal,
      subtotal,
      discount,
      tax,
      taxLines,
      payable: Math.max(0, taxBase + tax),
      itemCount: active ? doc.itemCount : 0,
      doc,
    };
  });

  const live = zoneRows.filter((z) => z.active);
  const equipmentTotal = live.reduce((s, z) => s + z.equipmentTotal, 0);
  const servicesTotal = live.reduce((s, z) => s + z.servicesTotal, 0);
  const consumablesTotal = live.reduce((s, z) => s + z.consumablesTotal, 0);
  const subtotal = equipmentTotal + servicesTotal + consumablesTotal;
  const discount = subtotal * discountRate;
  const tax = live.reduce((s, z) => s + z.tax, 0);

  return {
    zones: zoneRows,
    equipmentTotal,
    servicesTotal,
    consumablesTotal,
    subtotal,
    discount,
    tax,
    payable: Math.max(0, subtotal - discount + tax),
    itemCount: live.reduce((s, z) => s + z.itemCount, 0),
  };
}
