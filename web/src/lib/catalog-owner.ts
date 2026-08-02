export type CatalogOwnerValue = "SHOW_MASTER" | "DIAKOM" | "NE_EVENT";

export const CATALOG_OWNERS: Array<{
  value: CatalogOwnerValue;
  label: string;
  short: string;
}> = [
  { value: "SHOW_MASTER", label: "Шоу-Мастер", short: "ШМ" },
  { value: "DIAKOM", label: "Диаком", short: "ДК" },
  { value: "NE_EVENT", label: "НеИвент", short: "НИ" },
];

export function normalizeOwners(
  owners: CatalogOwnerValue[] | null | undefined,
  legacyOwner?: CatalogOwnerValue | null,
): CatalogOwnerValue[] {
  if (owners && owners.length > 0) {
    return CATALOG_OWNERS.map((o) => o.value).filter((v) =>
      owners.includes(v),
    );
  }
  if (legacyOwner) return [legacyOwner];
  return [];
}

export function ownerLabels(owners: CatalogOwnerValue[] | null | undefined) {
  const list = normalizeOwners(owners);
  if (list.length === 0) return "—";
  return list
    .map((v) => CATALOG_OWNERS.find((o) => o.value === v)?.label ?? v)
    .join(", ");
}

export function ownerShorts(owners: CatalogOwnerValue[] | null | undefined) {
  const list = normalizeOwners(owners);
  if (list.length === 0) return "—";
  return list
    .map((v) => CATALOG_OWNERS.find((o) => o.value === v)?.short ?? v)
    .join("+");
}

/** Делит сумму поровну между тегами фирм. Пустые owners → {}. */
export function splitAmongOwners(
  amount: number,
  owners: CatalogOwnerValue[] | null | undefined,
): Partial<Record<CatalogOwnerValue, number>> {
  const list = normalizeOwners(owners);
  const value = Math.max(0, Number(amount) || 0);
  if (list.length === 0 || value === 0) return {};
  const part = value / list.length;
  const out: Partial<Record<CatalogOwnerValue, number>> = {};
  for (const o of list) out[o] = part;
  return out;
}

/**
 * ЗП по назначениям → по фирмам сотрудников.
 * Без тегов у сотрудника — в untagged (для fallback по доле выручки).
 */
export function allocateLaborByEmployeeOwners(
  items: Array<{ pay: number; owners: CatalogOwnerValue[] | null | undefined }>,
): {
  byCompany: Record<CatalogOwnerValue, number>;
  untagged: number;
  total: number;
} {
  const byCompany: Record<CatalogOwnerValue, number> = {
    SHOW_MASTER: 0,
    DIAKOM: 0,
    NE_EVENT: 0,
  };
  let untagged = 0;
  let total = 0;
  for (const item of items) {
    const pay = Math.max(0, Number(item.pay) || 0);
    total += pay;
    const split = splitAmongOwners(pay, item.owners);
    const keys = Object.keys(split) as CatalogOwnerValue[];
    if (keys.length === 0) {
      untagged += pay;
      continue;
    }
    for (const k of keys) {
      byCompany[k] += split[k] ?? 0;
    }
  }
  return { byCompany, untagged, total };
}

/** Распределяет сумму пропорционально выручке фирм. */
export function allocateByRevenueShare(
  amount: number,
  revenueByCompany: Partial<Record<CatalogOwnerValue, number>>,
): Record<CatalogOwnerValue, number> {
  const out: Record<CatalogOwnerValue, number> = {
    SHOW_MASTER: 0,
    DIAKOM: 0,
    NE_EVENT: 0,
  };
  const value = Math.max(0, Number(amount) || 0);
  if (value === 0) return out;
  const sum = CATALOG_OWNERS.reduce(
    (s, c) => s + Math.max(0, revenueByCompany[c.value] ?? 0),
    0,
  );
  if (sum <= 0) return out;
  for (const c of CATALOG_OWNERS) {
    const rev = Math.max(0, revenueByCompany[c.value] ?? 0);
    out[c.value] = (value * rev) / sum;
  }
  return out;
}

/** Примерная разметка владельца по пути раздела / названию. */
export function inferCatalogOwners(
  catalogPath: string,
  itemName = "",
): CatalogOwnerValue[] {
  const path = catalogPath.trim();
  const pathLower = path.toLowerCase();
  const nameLower = itemName.toLowerCase();
  const hay = `${pathLower} ${nameLower}`;

  // НеИвент: прямые трансляции / IMAG
  if (
    pathLower.startsWith("трансляция") ||
    pathLower.includes("/imag") ||
    /(^|\/)imag(\/|$)/i.test(path)
  ) {
    return ["NE_EVENT"];
  }

  // Диаком: LED-экраны, явные ветки «Диаком», ферма Q30
  if (
    pathLower.startsWith("led экраны") ||
    pathLower.includes("диаком") ||
    hay.includes("q30") ||
    hay.includes("q 30")
  ) {
    return ["DIAKOM"];
  }

  // Шоу-Мастер: звук, микрофоны, свет, сценические комплексы
  if (
    pathLower.startsWith("звук") ||
    pathLower.startsWith("свет") ||
    pathLower.startsWith("сценический комплекс") ||
    pathLower.includes("микрофон") ||
    pathLower.includes("шоу мастер") ||
    pathLower.includes("шоу-мастер")
  ) {
    return ["SHOW_MASTER"];
  }

  return [];
}

/** @deprecated use inferCatalogOwners */
export function inferCatalogOwner(
  catalogPath: string,
  itemName = "",
): CatalogOwnerValue | null {
  return inferCatalogOwners(catalogPath, itemName)[0] ?? null;
}
