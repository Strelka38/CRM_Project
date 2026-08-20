import { csvCell, csvHeaderIndex, csvNum } from "@/lib/csv";
import { parseCsv, toCsv } from "@/lib/catalog-csv";
import {
  CATALOG_OWNERS,
  normalizeOwners,
  type CatalogOwnerValue,
} from "@/lib/catalog-owner";
import { formatOwnersCsv, parseOwnersCsv } from "@/lib/directory-csv";
import type { LineAmountSplit } from "@/lib/quote-calculation";

export const CALC_LINE_CSV_HEADERS = [
  "ID",
  "Зона",
  "Тип",
  "Название",
  "Кол-во",
  "Цена",
  "Режим дня",
  "Коэф",
  "Клиенту",
  "Закуп",
  "Владельцы",
  "Режим",
  "ШМ",
  "ДК",
  "NE",
] as const;

export const CALC_STAFF_CSV_HEADERS = [
  "ID",
  "Сотрудник",
  "Тип",
  "Должность",
  "Фирма",
  "Режим",
  "База",
  "Премия",
  "Монтажные",
  "Итого ЗП",
] as const;

export const DAY_MODE_LABELS: Record<string, string> = {
  HALF_EXTRA: "1-й 100%",
  FULL_DAYS: "Полные дни",
  FIXED1: "Фикс 1",
  FIXED2: "Фикс 2",
};

export function dayModeLabel(mode: string | null | undefined): string {
  if (!mode) return "—";
  return DAY_MODE_LABELS[mode] ?? mode;
}

export type CalcLineCsvSource = {
  id: string;
  zoneName?: string;
  type: string;
  name: string;
  qty?: number | null;
  unitPrice?: number | null;
  dayMode?: string | null;
  dayCoef?: number | null;
  lineTotal: number;
  costOverride: number | null;
  costTotal: number;
  owners: CatalogOwnerValue[];
  mode: "SHARE" | "AMOUNT";
  amounts: LineAmountSplit;
};

export type CalcLineCsvRow = {
  blockId: string;
  costOverride: number | null;
  hasCost: boolean;
  owners: CatalogOwnerValue[];
  hasOwners: boolean;
  mode: "SHARE" | "AMOUNT" | null;
  amounts: LineAmountSplit | null;
};

export type CalcStaffCsvSource = {
  id: string;
  userName: string;
  kind?: "EVENT" | "MOUNT";
  specialtyName: string;
  owners: CatalogOwnerValue[];
  payMode: "SHIFT" | "HOURLY";
  hours: number | null;
  isFreelancer?: boolean;
  basePay: number;
  bonus: number;
  montageAmount: number;
};

export type CalcStaffCsvRow = {
  id: string;
  bonus: number | null;
  montageAmount: number | null;
};

function modeLabel(mode: "SHARE" | "AMOUNT"): string {
  return mode === "AMOUNT" ? "Суммы" : "Доли";
}

function parseMode(raw: string): "SHARE" | "AMOUNT" | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (["суммы", "сумма", "amount", "amounts"].includes(t)) return "AMOUNT";
  if (["доли", "доля", "share", "shares"].includes(t)) return "SHARE";
  return null;
}

export function calcLineToCsvCells(row: CalcLineCsvSource): string[] {
  const cost = row.costOverride != null ? row.costOverride : row.costTotal;
  return [
    row.id,
    row.zoneName ?? "",
    row.type,
    row.name,
    row.qty == null ? "" : String(row.qty),
    row.unitPrice == null ? "" : String(row.unitPrice),
    dayModeLabel(row.dayMode),
    row.dayCoef == null ? "" : String(row.dayCoef),
    String(Math.round(row.lineTotal)),
    String(Math.round(cost)),
    formatOwnersCsv(row.owners),
    modeLabel(row.mode),
    String(Math.round(row.amounts.SHOW_MASTER || 0)),
    String(Math.round(row.amounts.DIAKOM || 0)),
    String(Math.round(row.amounts.NE_EVENT || 0)),
  ];
}

export function calcStaffToCsvCells(row: CalcStaffCsvSource): string[] {
  const kind =
    row.kind === "MOUNT" ? "монтаж" : row.isFreelancer ? "фриланс" : "шоу";
  const payMode =
    row.payMode === "HOURLY" ? `${row.hours ?? 0} ч` : "Смена";
  return [
    row.id,
    row.userName,
    kind,
    row.specialtyName,
    formatOwnersCsv(row.owners),
    payMode,
    String(Math.round(row.basePay)),
    String(Math.round(row.bonus)),
    String(Math.round(row.montageAmount)),
    String(Math.round(row.basePay + row.bonus)),
  ];
}

export function parseCalcLineCsv(text: string): {
  rows: CalcLineCsvRow[];
  errors: string[];
} {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], errors: ["Файл пуст"] };
  }
  const map = csvHeaderIndex(table[0]);
  if (!map.has("id")) {
    return { rows: [], errors: ["Нет колонки «ID»"] };
  }
  const errors: string[] = [];
  const rows: CalcLineCsvRow[] = [];
  table.slice(1).forEach((row, i) => {
    const blockId = csvCell(map, row, "ID").trim();
    if (!blockId) {
      errors.push(`Строка ${i + 2}: пустой ID`);
      return;
    }
    const costRaw = csvCell(map, row, "Закуп", "cost", "costOverride");
    const ownersRaw = csvCell(map, row, "Владельцы", "owners");
    const mode = parseMode(csvCell(map, row, "Режим", "mode"));
    const sm = csvNum(csvCell(map, row, "ШМ", "SHOW_MASTER"));
    const dk = csvNum(csvCell(map, row, "ДК", "DIAKOM"));
    const ne = csvNum(csvCell(map, row, "NE", "NE_EVENT"));
    const hasAmounts = sm != null || dk != null || ne != null;
    rows.push({
      blockId,
      hasCost: costRaw.trim() !== "",
      costOverride: csvNum(costRaw),
      hasOwners: ownersRaw.trim() !== "",
      owners: parseOwnersCsv(ownersRaw),
      mode,
      amounts: hasAmounts
        ? {
            SHOW_MASTER: Math.max(0, sm ?? 0),
            DIAKOM: Math.max(0, dk ?? 0),
            NE_EVENT: Math.max(0, ne ?? 0),
          }
        : null,
    });
  });
  return { rows, errors };
}

export function parseCalcStaffCsv(text: string): {
  rows: CalcStaffCsvRow[];
  errors: string[];
} {
  const table = parseCsv(text);
  if (table.length === 0) {
    return { rows: [], errors: ["Файл пуст"] };
  }
  const map = csvHeaderIndex(table[0]);
  if (!map.has("id")) {
    return { rows: [], errors: ["Нет колонки «ID»"] };
  }
  const errors: string[] = [];
  const rows: CalcStaffCsvRow[] = [];
  table.slice(1).forEach((row, i) => {
    const id = csvCell(map, row, "ID").trim();
    if (!id) {
      errors.push(`Строка ${i + 2}: пустой ID`);
      return;
    }
    const bonusRaw = csvCell(map, row, "Премия", "bonus");
    const montageRaw = csvCell(map, row, "Монтажные", "montage", "montageAmount");
    rows.push({
      id,
      bonus: bonusRaw.trim() === "" ? null : Math.max(0, csvNum(bonusRaw) ?? 0),
      montageAmount:
        montageRaw.trim() === ""
          ? null
          : Math.max(0, csvNum(montageRaw) ?? 0),
    });
  });
  return { rows, errors };
}

export function calcLineCsvFile(rows: CalcLineCsvSource[]): string {
  return `\uFEFF${toCsv([
    [...CALC_LINE_CSV_HEADERS],
    ...rows.map(calcLineToCsvCells),
  ])}`;
}

export function calcStaffCsvFile(rows: CalcStaffCsvSource[]): string {
  return `\uFEFF${toCsv([
    [...CALC_STAFF_CSV_HEADERS],
    ...rows.map(calcStaffToCsvCells),
  ])}`;
}

export function ownerShortList(owners: CatalogOwnerValue[]): string {
  const list = normalizeOwners(owners);
  return list
    .map((v) => CATALOG_OWNERS.find((o) => o.value === v)?.short ?? v)
    .join("+");
}

export type CalcStatsCsvRow = {
  kind: string;
  name: string;
  extra?: string;
  company?: string;
  base?: number | null;
  extraAmount?: number | null;
  montage?: number | null;
  total: number;
};

export const CALC_STATS_CSV_HEADERS = [
  "Тип",
  "Название",
  "Должность / статья",
  "Фирма",
  "База / выручка",
  "Премия / закуп",
  "Монтажные",
  "Итого",
] as const;

export function calcStatsToCsvCells(row: CalcStatsCsvRow): string[] {
  return [
    row.kind,
    row.name,
    row.extra ?? "",
    row.company ?? "",
    row.base == null ? "" : String(Math.round(row.base)),
    row.extraAmount == null ? "" : String(Math.round(row.extraAmount)),
    row.montage == null ? "" : String(Math.round(row.montage)),
    String(Math.round(row.total)),
  ];
}

export function calcStatsCsvFile(rows: CalcStatsCsvRow[]): string {
  return `\uFEFF${toCsv([
    [...CALC_STATS_CSV_HEADERS],
    ...rows.map(calcStatsToCsvCells),
  ])}`;
}
