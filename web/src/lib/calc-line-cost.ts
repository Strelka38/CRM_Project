export function isServiceOrPersonnelKind(itemKind?: string | null): boolean {
  const k = String(itemKind || "").toUpperCase();
  return k === "SERVICE" || k === "PERSONNEL";
}

/** Расходники и лицензии по имени — без закупа вся сумма в расход. Ноутбук не лицензия, даже если в названии есть zoom. */
export function isPassthroughKind(
  itemKind?: string | null,
  name?: string | null,
): boolean {
  if (isServiceOrPersonnelKind(itemKind)) return false;
  const n = String(name || "").toLowerCase();
  if (/ноутбук|notebook|laptop/.test(n)) return false;
  const k = String(itemKind || "").toUpperCase();
  if (k === "CONSUMABLE") return true;
  return /zoom|лиценз|licence|license/.test(n);
}

/** Можно указать закуп: услуга, смена, расходник, Zoom/лицензия. */
export function isCostAwareKind(
  itemKind?: string | null,
  name?: string | null,
): boolean {
  return (
    isServiceOrPersonnelKind(itemKind) || isPassthroughKind(itemKind, name)
  );
}

export type LineCostSource = "override" | "catalog" | "passthrough" | "none";

export type LineEconomics = {
  client: number;
  cost: number;
  margin: number;
  costSource: LineCostSource;
};

/**
 * Клиент 3000, закуп 1800 → маржа 1200.
 * Услуга / смена без закупа: закуп 0, маржа = клиент (зарплата — отдельный расход).
 * Расходник / лицензия без закупа: вся сумма в закуп (passthrough).
 * Ноутбук без закупа: закуп 0, даже если в названии есть zoom.
 * Оборудование без закупа: закуп 0, маржа = клиент.
 */
export function resolveLineEconomics(input: {
  clientTotal: number;
  qty?: number | null;
  itemKind?: string | null;
  name?: string | null;
  catalogUnitCost?: number | null;
  costOverride?: number | null;
}): LineEconomics {
  const client = Math.max(0, Number(input.clientTotal) || 0);
  if (input.costOverride != null && Number.isFinite(Number(input.costOverride))) {
    const cost = Math.max(0, Number(input.costOverride));
    return {
      client,
      cost,
      margin: Math.max(0, client - cost),
      costSource: "override",
    };
  }
  if (
    input.catalogUnitCost != null &&
    Number.isFinite(Number(input.catalogUnitCost))
  ) {
    const qty = Math.max(0, Number(input.qty) || 0);
    const cost = Math.max(0, Number(input.catalogUnitCost) * qty);
    return {
      client,
      cost,
      margin: Math.max(0, client - cost),
      costSource: "catalog",
    };
  }
  if (isPassthroughKind(input.itemKind, input.name)) {
    return { client, cost: client, margin: 0, costSource: "passthrough" };
  }
  return { client, cost: 0, margin: client, costSource: "none" };
}
