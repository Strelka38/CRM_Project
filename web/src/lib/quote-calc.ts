import type { DayMode as PrismaDayMode, BlockType } from "@prisma/client";
import { cashlessUnitPrice, dayCoefficient } from "./pricing";
import type { DayMode } from "./types";

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

  const unitCash = base;
  const unitCashless = cashlessUnitPrice(base, true, block.cashlessOverride);
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

export function calcDocument(
  blocks: QuoteBlockInput[],
  cashless: boolean,
  durationDays: number,
) {
  const calculated = [...blocks]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((b) => calcBlock(b, cashless, durationDays));

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
};

export type ZoneTotals = {
  zoneId: string;
  name: string;
  sortOrder: number;
  equipmentTotal: number;
  servicesTotal: number;
  consumablesTotal: number;
  subtotal: number;
  discount: number;
  payable: number;
  itemCount: number;
  doc: ReturnType<typeof calcDocument>;
};

export function calcByZones(
  zones: ZoneInput[],
  blocks: QuoteBlockInput[],
  cashless: boolean,
  durationDays: number,
  discountPercent: number,
): {
  zones: ZoneTotals[];
  equipmentTotal: number;
  servicesTotal: number;
  consumablesTotal: number;
  subtotal: number;
  discount: number;
  payable: number;
  itemCount: number;
} {
  const discountRate = Math.max(0, Number(discountPercent) || 0) / 100;
  const sortedZones = [...zones].sort((a, b) => a.sortOrder - b.sortOrder);

  const zoneRows: ZoneTotals[] = sortedZones.map((z) => {
    const zoneBlocks = blocks
      .filter((b) => b.zoneId === z.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    const doc = calcDocument(zoneBlocks, cashless, durationDays);

    let equipmentTotal = 0;
    let servicesTotal = 0;
    let consumablesTotal = 0;
    for (const item of doc.blocks) {
      if (item.type !== "ITEM" || (item.qty ?? 0) <= 0) continue;
      const kind = costKindOf(item);
      if (kind === "service") servicesTotal += item.lineTotal;
      else if (kind === "consumable") consumablesTotal += item.lineTotal;
      else equipmentTotal += item.lineTotal;
    }

    const subtotal = equipmentTotal + servicesTotal + consumablesTotal;
    const discount = subtotal * discountRate;
    return {
      zoneId: z.id,
      name: z.name,
      sortOrder: z.sortOrder,
      equipmentTotal,
      servicesTotal,
      consumablesTotal,
      subtotal,
      discount,
      payable: Math.max(0, subtotal - discount),
      itemCount: doc.itemCount,
      doc,
    };
  });

  const equipmentTotal = zoneRows.reduce((s, z) => s + z.equipmentTotal, 0);
  const servicesTotal = zoneRows.reduce((s, z) => s + z.servicesTotal, 0);
  const consumablesTotal = zoneRows.reduce((s, z) => s + z.consumablesTotal, 0);
  const subtotal = equipmentTotal + servicesTotal + consumablesTotal;
  const discount = subtotal * discountRate;

  return {
    zones: zoneRows,
    equipmentTotal,
    servicesTotal,
    consumablesTotal,
    subtotal,
    discount,
    payable: Math.max(0, subtotal - discount),
    itemCount: zoneRows.reduce((s, z) => s + z.itemCount, 0),
  };
}
