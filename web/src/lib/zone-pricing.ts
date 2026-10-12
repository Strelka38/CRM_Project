export type TaxMode = "IN_TOTAL" | "ON_TOP";

type PriceKind = "equipment" | "service" | "consumable";

/** Параметры листа сметы: коэффициент, скидка и налоги по видам затрат. */
export type ZonePricing = {
  coefEquipment: number;
  coefConsumable: number;
  coefService: number;
  discountEquipment: number;
  discountConsumable: number;
  discountService: number;
  tax1Label: string;
  tax1Rate: number;
  tax1Mode: TaxMode;
  tax1Visible: boolean;
  tax2Label: string;
  tax2Rate: number;
  tax2Mode: TaxMode;
  tax2Visible: boolean;
  legalEntityId: string | null;
};

export type SheetTaxLine = {
  label: string;
  amount: number;
};

export function defaultZonePricing(): ZonePricing {
  return {
    coefEquipment: 1,
    coefConsumable: 1,
    coefService: 1,
    discountEquipment: 0,
    discountConsumable: 0,
    discountService: 0,
    tax1Label: "Налоги, банк",
    tax1Rate: 0,
    tax1Mode: "IN_TOTAL",
    tax1Visible: true,
    tax2Label: "",
    tax2Rate: 0,
    tax2Mode: "IN_TOTAL",
    tax2Visible: false,
    legalEntityId: null,
  };
}

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function taxMode(value: unknown): TaxMode {
  return value === "ON_TOP" ? "ON_TOP" : "IN_TOTAL";
}

export function parseZonePricing(raw: unknown): ZonePricing {
  const d = defaultZonePricing();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  const legal =
    typeof o.legalEntityId === "string" && o.legalEntityId.trim()
      ? o.legalEntityId.trim()
      : null;
  return {
    coefEquipment: clamp(o.coefEquipment, d.coefEquipment, 0, 100),
    coefConsumable: clamp(o.coefConsumable, d.coefConsumable, 0, 100),
    coefService: clamp(o.coefService, d.coefService, 0, 100),
    discountEquipment: clamp(o.discountEquipment, 0, 0, 100),
    discountConsumable: clamp(o.discountConsumable, 0, 0, 100),
    discountService: clamp(o.discountService, 0, 0, 100),
    tax1Label: typeof o.tax1Label === "string" ? o.tax1Label.slice(0, 80) : d.tax1Label,
    tax1Rate: clamp(o.tax1Rate, 0, 0, 100),
    tax1Mode: taxMode(o.tax1Mode),
    tax1Visible: o.tax1Visible === undefined ? d.tax1Visible : Boolean(o.tax1Visible),
    tax2Label: typeof o.tax2Label === "string" ? o.tax2Label.slice(0, 80) : "",
    tax2Rate: clamp(o.tax2Rate, 0, 0, 100),
    tax2Mode: taxMode(o.tax2Mode),
    tax2Visible: Boolean(o.tax2Visible),
    legalEntityId: legal,
  };
}

function kindNumbers(pricing: ZonePricing, kind: PriceKind) {
  if (kind === "service") {
    return { coef: pricing.coefService, discount: pricing.discountService };
  }
  if (kind === "consumable") {
    return { coef: pricing.coefConsumable, discount: pricing.discountConsumable };
  }
  return { coef: pricing.coefEquipment, discount: pricing.discountEquipment };
}

/** Множитель строки: коэффициент вида × (1 − скидка вида). */
export function kindMultiplier(pricing: ZonePricing | null | undefined, kind: PriceKind) {
  const p = parseZonePricing(pricing);
  const { coef, discount } = kindNumbers(p, kind);
  return coef * (1 - discount / 100);
}

export function sheetTaxLines(
  pricing: ZonePricing | null | undefined,
  base: number,
): SheetTaxLine[] {
  const p = parseZonePricing(pricing);
  const amount = Math.max(0, base);
  const rows: SheetTaxLine[] = [];
  const push = (visible: boolean, rate: number, label: string, fallback: string) => {
    if (!visible || rate <= 0 || amount <= 0) return;
    const name = label.trim() || fallback;
    rows.push({
      label: `${name} ${rate}%`,
      amount: amount * (rate / 100),
    });
  };
  push(p.tax1Visible, p.tax1Rate, p.tax1Label, "Налог 1");
  push(p.tax2Visible, p.tax2Rate, p.tax2Label, "Налог 2");
  return rows;
}

export function pricingHint(pricing: ZonePricing | null | undefined): string {
  const p = parseZonePricing(pricing);
  const bits: string[] = [];
  if (p.coefEquipment !== 1) bits.push(`аренда ×${p.coefEquipment}`);
  if (p.coefConsumable !== 1) bits.push(`расходники ×${p.coefConsumable}`);
  if (p.coefService !== 1) bits.push(`услуги ×${p.coefService}`);
  if (p.discountEquipment > 0) bits.push(`скидка аренды ${p.discountEquipment}%`);
  if (p.discountConsumable > 0) bits.push(`скидка расходников ${p.discountConsumable}%`);
  if (p.discountService > 0) bits.push(`скидка услуг ${p.discountService}%`);
  if (p.tax1Visible && p.tax1Rate > 0) {
    bits.push(`${p.tax1Label.trim() || "Налог 1"} ${p.tax1Rate}%`);
  }
  if (p.tax2Visible && p.tax2Rate > 0) {
    bits.push(`${p.tax2Label.trim() || "Налог 2"} ${p.tax2Rate}%`);
  }
  return bits.join(" · ");
}
