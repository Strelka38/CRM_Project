import type { CatalogOwner, DayMode, ItemKind } from "@prisma/client";
import {
  formatOwnersCsv,
  inferCatalogOwners,
  parseOwnersCsv,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";

/** Заголовки CSV (русский, как в seed XLSX). */
export const CATALOG_CSV_HEADERS = [
  "ID",
  "Тип",
  "Название",
  "Модель",
  "Производитель",
  "Путь",
  "Цена",
  "Безнал",
  "Оценочная стоимость",
  "Кол-во",
  "Ширина",
  "Высота",
  "Глубина",
  "Мощность",
  "Вес",
  "Комментарий",
  "Режим дней",
  "Владельцы",
  "Код оборудования",
  "Активна",
  "В каталоге",
  "Порядок",
] as const;

export type CatalogCsvRow = {
  id: string | null;
  itemKind: ItemKind;
  name: string;
  model: string | null;
  manufacturer: string | null;
  categoryPath: string;
  basePrice: number;
  cashlessOverride: number | null;
  estimatedValue: number | null;
  stockQty: number;
  width: number | null;
  height: number | null;
  depth: number | null;
  power: number | null;
  weight: number | null;
  comment: string | null;
  dayMode: DayMode;
  owners: CatalogOwnerValue[];
  equipmentCode: number | null;
  active: boolean;
  showInCatalog: boolean;
  sortOrder: number;
};

const ITEM_KINDS = new Set<string>([
  "EQUIPMENT",
  "PERSONNEL",
  "SERVICE",
  "CONSUMABLE",
  "COMPONENT",
  "OTHER",
]);

const DAY_MODES = new Set<string>([
  "HALF_EXTRA",
  "FULL_DAYS",
  "FIXED1",
  "FIXED2",
]);

export function mapItemKind(typeRaw: string): ItemKind {
  const t = typeRaw.toLowerCase().trim();
  if (!t) return "EQUIPMENT";
  if (ITEM_KINDS.has(typeRaw.trim().toUpperCase())) {
    return typeRaw.trim().toUpperCase() as ItemKind;
  }
  if (t.includes("услуг") || t.includes("service")) return "SERVICE";
  if (t.includes("расход") || t.includes("consumable")) return "CONSUMABLE";
  if (t.includes("комплект") || t.includes("component")) return "COMPONENT";
  if (t.includes("персонал") || t.includes("personnel")) return "PERSONNEL";
  if (t.includes("проч") || t.includes("other")) return "OTHER";
  return "EQUIPMENT";
}

export function defaultDayMode(itemKind: ItemKind): DayMode {
  return itemKind === "PERSONNEL" || itemKind === "SERVICE"
    ? "FULL_DAYS"
    : "HALF_EXTRA";
}

function num(v: string | undefined): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(String(v).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

function bool(v: string | undefined, fallback = true): boolean {
  if (v == null || v.trim() === "") return fallback;
  const t = v.trim().toLowerCase();
  if (["0", "false", "нет", "no", "n", "off"].includes(t)) return false;
  if (["1", "true", "да", "yes", "y", "on"].includes(t)) return true;
  return fallback;
}

/** RFC4180-ish CSV encode. */
export function toCsv(rows: string[][]): string {
  const esc = (cell: string) => {
    if (/[",\n\r]/.test(cell)) {
      return `"${cell.replace(/"/g, '""')}"`;
    }
    return cell;
  };
  return rows.map((r) => r.map((c) => esc(c ?? "")).join(",")).join("\r\n") + "\r\n";
}

/** Parse CSV with quoted fields. */
export function parseCsv(text: string): string[][] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  while (i < normalized.length) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function headerIndex(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, idx) => {
    map.set(h.trim().toLowerCase(), idx);
  });
  return map;
}

function cell(map: Map<string, number>, row: string[], ...names: string[]) {
  for (const name of names) {
    const idx = map.get(name.toLowerCase());
    if (idx != null && row[idx] != null) return row[idx];
  }
  return "";
}

export function catalogItemToCsvCells(item: {
  id: string;
  itemKind: ItemKind;
  name: string;
  model: string | null;
  manufacturer: string | null;
  basePrice: number;
  cashlessOverride: number | null;
  estimatedValue: number | null;
  stockQty: number;
  width: number | null;
  height: number | null;
  depth: number | null;
  power: number | null;
  weight: number | null;
  comment: string | null;
  dayMode: DayMode;
  owners: CatalogOwner[];
  equipmentCode: number | null;
  active: boolean;
  showInCatalog?: boolean;
  sortOrder: number;
  category: { path: string };
}): string[] {
  return [
    item.id,
    item.itemKind,
    item.name,
    item.model ?? "",
    item.manufacturer ?? "",
    item.category.path,
    String(item.basePrice ?? 0),
    item.cashlessOverride == null ? "" : String(item.cashlessOverride),
    item.estimatedValue == null ? "" : String(item.estimatedValue),
    String(item.stockQty ?? 0),
    item.width == null ? "" : String(item.width),
    item.height == null ? "" : String(item.height),
    item.depth == null ? "" : String(item.depth),
    item.power == null ? "" : String(item.power),
    item.weight == null ? "" : String(item.weight),
    item.comment ?? "",
    item.dayMode,
    formatOwnersCsv(item.owners),
    item.equipmentCode == null ? "" : String(item.equipmentCode),
    item.active ? "1" : "0",
    item.showInCatalog !== false ? "1" : "0",
    String(item.sortOrder ?? 0),
  ];
}

export function parseCatalogCsv(text: string): {
  rows: CatalogCsvRow[];
  errors: string[];
} {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (table.length === 0) {
    return { rows: [], errors: ["Файл пуст"] };
  }

  const headers = table[0].map((h) => h.trim());
  const map = headerIndex(headers);
  if (!map.has("название") && !map.has("name") && !map.has("товар")) {
    return {
      rows: [],
      errors: ["Нет колонки «Название» (или Name / Товар)"],
    };
  }
  if (!map.has("путь") && !map.has("path") && !map.has("categorypath")) {
    return {
      rows: [],
      errors: ["Нет колонки «Путь» (или Path)"],
    };
  }

  const rows: CatalogCsvRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    const lineNo = r + 1;
    const name = cell(map, line, "Название", "Name", "Товар").trim();
    const categoryPath = cell(map, line, "Путь", "Path", "categoryPath")
      .trim()
      .replace(/\\/g, "/");
    if (!name) {
      errors.push(`Строка ${lineNo}: пустое название`);
      continue;
    }
    if (!categoryPath) {
      errors.push(`Строка ${lineNo}: пустой путь`);
      continue;
    }

    const typeRaw = cell(map, line, "Тип", "itemKind", "Kind", "Type");
    const itemKind = mapItemKind(typeRaw);
    const dayRaw = cell(map, line, "Режим дней", "dayMode").trim().toUpperCase();
    const dayMode = (
      DAY_MODES.has(dayRaw) ? dayRaw : defaultDayMode(itemKind)
    ) as DayMode;

    const ownersRaw = cell(map, line, "Владельцы", "owners");
    let owners = parseOwnersCsv(ownersRaw);
    if (owners.length === 0) {
      owners = inferCatalogOwners(categoryPath, name);
    }

    const idRaw = cell(map, line, "ID", "id").trim();
    const codeRaw = num(cell(map, line, "Код оборудования", "equipmentCode"));

    rows.push({
      id: idRaw || null,
      itemKind,
      name,
      model: cell(map, line, "Модель", "model").trim() || null,
      manufacturer:
        cell(map, line, "Производитель", "manufacturer").trim() || null,
      categoryPath,
      basePrice: num(cell(map, line, "Цена", "basePrice", "Цена аренды")) ?? 0,
      cashlessOverride: num(cell(map, line, "Безнал", "cashlessOverride")),
      estimatedValue: num(
        cell(map, line, "Оценочная стоимость", "estimatedValue"),
      ),
      stockQty: Math.max(
        0,
        Math.floor(num(cell(map, line, "Кол-во", "stockQty", "Количество")) ?? 0),
      ),
      width: num(cell(map, line, "Ширина", "width")),
      height: num(cell(map, line, "Высота", "height")),
      depth: num(cell(map, line, "Глубина", "depth")),
      power: num(cell(map, line, "Мощность", "power")),
      weight: num(cell(map, line, "Вес", "weight")),
      comment: cell(map, line, "Комментарий", "comment").trim() || null,
      dayMode,
      owners,
      equipmentCode: codeRaw != null ? Math.floor(codeRaw) : null,
      active: bool(cell(map, line, "Активна", "active"), true),
      showInCatalog: bool(
        cell(map, line, "В каталоге", "showInCatalog", "В каталог"),
        true,
      ),
      sortOrder: Math.max(
        0,
        Math.floor(num(cell(map, line, "Порядок", "sortOrder")) ?? 0),
      ),
    });
  }

  return { rows, errors };
}
