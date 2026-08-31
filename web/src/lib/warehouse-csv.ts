import {
  catalogItemToCsvCells,
  parseCatalogCsv,
  parseCsv,
  toCsv,
} from "@/lib/catalog-csv";
import {
  CATALOG_OWNERS,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { parseOwnerCsv } from "@/lib/directory-csv";
import { newQrToken } from "@/lib/uploads";

export { catalogItemToCsvCells, parseCatalogCsv, toCsv };

export const WAREHOUSE_UNIT_HEADERS = [
  "ID",
  "ID позиции",
  "Код оборудования",
  "Название",
  "№",
  "Метка",
  "Склад",
  "QR-токен",
  "Активна",
  "В ремонте",
  "Списание",
  "Комментарий списания",
  "Дата списания",
] as const;

export type WarehouseUnitCsvRow = {
  id: string | null;
  catalogItemId: string | null;
  equipmentCode: number | null;
  itemName: string;
  unitNumber: number;
  label: string | null;
  owner: CatalogOwnerValue | null;
  qrToken: string | null;
  active: boolean;
  inRepair: boolean;
  writeOffReason: "DAMAGED" | "LOST" | null;
  writeOffComment: string;
  writeOffAt: string | null;
};

function headerIndex(headers: string[]) {
  const map = new Map<string, number>();
  headers.forEach((h, idx) => map.set(h.trim().toLowerCase(), idx));
  return map;
}

function cell(map: Map<string, number>, row: string[], ...names: string[]) {
  for (const name of names) {
    const idx = map.get(name.toLowerCase());
    if (idx != null && row[idx] != null) return row[idx];
  }
  return "";
}

function num(v: string): number | null {
  if (!v.trim()) return null;
  const n = Number(v.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

function bool(v: string, fallback = true): boolean {
  if (!v.trim()) return fallback;
  const t = v.trim().toLowerCase();
  if (["0", "false", "нет", "no", "n", "off"].includes(t)) return false;
  if (["1", "true", "да", "yes", "y", "on"].includes(t)) return true;
  return fallback;
}

export function detectWarehouseCsvKind(
  text: string,
): "items" | "units" | "unknown" {
  const table = parseCsv(text);
  if (table.length === 0) return "unknown";
  const headers = table[0].map((h) => h.trim().toLowerCase());
  const has = (name: string) => headers.includes(name.toLowerCase());
  if (has("qr-токен") || has("qrtoken") || has("qr_token")) return "units";
  if (
    (has("название") || has("name")) &&
    (has("путь") || has("path") || has("categorypath"))
  ) {
    return "items";
  }
  return "unknown";
}

function formatOwnerCsv(owner: CatalogOwnerValue | null | undefined) {
  if (!owner) return "";
  return CATALOG_OWNERS.find((o) => o.value === owner)?.short ?? owner;
}

export function warehouseUnitToCsvCells(unit: {
  id: string;
  catalogItemId: string;
  unitNumber: number;
  label: string | null;
  owner?: CatalogOwnerValue | null;
  qrToken: string;
  active: boolean;
  inRepair: boolean;
  writeOffReason: string | null;
  writeOffComment: string;
  writeOffAt: Date | null;
  catalogItem: { name: string; equipmentCode: number | null };
}): string[] {
  return [
    unit.id,
    unit.catalogItemId,
    unit.catalogItem.equipmentCode == null
      ? ""
      : String(unit.catalogItem.equipmentCode),
    unit.catalogItem.name,
    String(unit.unitNumber),
    unit.label ?? "",
    formatOwnerCsv(unit.owner),
    unit.qrToken,
    unit.active ? "1" : "0",
    unit.inRepair ? "1" : "0",
    unit.writeOffReason ?? "",
    unit.writeOffComment ?? "",
    unit.writeOffAt ? unit.writeOffAt.toISOString() : "",
  ];
}

export function parseWarehouseUnitsCsv(text: string): {
  rows: WarehouseUnitCsvRow[];
  errors: string[];
} {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (table.length === 0) {
    return { rows: [], errors: ["Файл пуст"] };
  }

  const headers = table[0].map((h) => h.trim());
  const map = headerIndex(headers);
  if (!map.has("№") && !map.has("unitnumber") && !map.has("номер")) {
    return { rows: [], errors: ["Нет колонки «№» (номер единицы)"] };
  }

  const rows: WarehouseUnitCsvRow[] = [];
  for (let r = 1; r < table.length; r++) {
    const line = table[r];
    const lineNo = r + 1;
    const unitNumber = Math.floor(
      num(cell(map, line, "№", "unitNumber", "Номер")) ?? 0,
    );
    if (unitNumber <= 0) {
      errors.push(`Строка ${lineNo}: некорректный номер единицы`);
      continue;
    }

    const reasonRaw = cell(
      map,
      line,
      "Списание",
      "writeOffReason",
    )
      .trim()
      .toUpperCase();
    const writeOffReason =
      reasonRaw === "LOST" || reasonRaw === "УТЕРЯНО"
        ? "LOST"
        : reasonRaw === "DAMAGED" || reasonRaw === "ПОВРЕЖДЕНО"
          ? "DAMAGED"
          : null;

    const qrRaw = cell(map, line, "QR-токен", "qrToken", "QR").trim();
    rows.push({
      id: cell(map, line, "ID", "id").trim() || null,
      catalogItemId:
        cell(map, line, "ID позиции", "catalogItemId", "itemId").trim() || null,
      equipmentCode: num(
        cell(map, line, "Код оборудования", "equipmentCode"),
      ),
      itemName: cell(map, line, "Название", "name").trim(),
      unitNumber,
      label: cell(map, line, "Метка", "label").trim() || null,
      owner: parseOwnerCsv(cell(map, line, "Склад", "owner", "owners")),
      qrToken: qrRaw || null,
      active: bool(cell(map, line, "Активна", "active"), true),
      inRepair: bool(cell(map, line, "В ремонте", "inRepair"), false),
      writeOffReason,
      writeOffComment: cell(
        map,
        line,
        "Комментарий списания",
        "writeOffComment",
      ).trim(),
      writeOffAt:
        cell(map, line, "Дата списания", "writeOffAt").trim() || null,
    });
  }

  return { rows, errors };
}

export function nextQrToken() {
  return newQrToken();
}
